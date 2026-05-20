/**
 * Nova Kingdom Rentals — Quote Intake Automation
 *
 * Triggered every 5 minutes. Reads unread "New Nova Kingdom Rentals Quote Request"
 * emails from Web3Forms, writes leads to the CRM, queues a review task, creates a
 * Gmail DRAFT (never auto-sends), and creates a tentative Calendar hold when an
 * event date is present.
 *
 * IMPORTANT:
 *   - This script NEVER auto-sends email. It creates drafts only.
 *   - It NEVER confirms a booking without a deposit received.
 *   - All monetary values are CAD.
 *
 * Setup:
 *   1. Deploy as a standalone Apps Script project (not bound to the CRM sheet).
 *   2. Paste this file into the editor and save.
 *   3. Run verifyIntakeSystem() first to confirm tabs, headers, and labels are ready.
 *   4. Run testQuoteIntake() to verify end-to-end with sample data.
 *   5. Run setupTriggers() once to install the 5-minute trigger.
 *   6. Authorize all required scopes when prompted.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  GMAIL_SUBJECT:    "New Nova Kingdom Rentals Quote Request",
  PROCESSED_LABEL:  "NK/Intake-Processed",
  CRM_SHEET_NAME:   "AI Lead Engine CRM — Nova Kingdom Rentals",
  LEADS_TAB:        "Leads",
  QUEUE_TAB:        "Automation Queue",
  // Additional tabs scanned as a secondary validation when generating booking IDs.
  EXTRA_ID_TABS:    ["Booked Customers", "Payment Tracker"],
  // Persistent counter tab. The script reads/writes B2 on this tab to maintain
  // booking ID sequence across deletions, test cleanups, and CRM resets.
  SEQUENCE_SHEET:   "System",
  // Fallback starting number when the System tab counter is 0 or missing.
  // Set to the next number you want to use before first live run.
  NEXT_BOOKING_NUMBER_FALLBACK: 14,
  FROM_NAME:        "Nova Kingdom Rentals",
  FROM_EMAIL:       "booknovakingdom@gmail.com",
  BUSINESS_PHONE:   "902-990-0005",
  WEBSITE:          "https://novakingdomrentals.com",
  DEPOSIT_RATE:     0.30,
  BOOKING_ID_PREFIX: "NK",
  CALENDAR_ID:      "primary",  // change to a specific calendar ID if preferred
  TRIGGER_MINUTES:  5,
};

// ─── Entry Point ─────────────────────────────────────────────────────────────

/**
 * Main function — install as a time-based trigger (every 5 minutes).
 * Searches Gmail for unread quote request emails and processes each one.
 */
function processNewQuoteEmails() {
  const label   = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const query   = `subject:"${CONFIG.GMAIL_SUBJECT}" is:unread -label:${CONFIG.PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);

  Logger.log("processNewQuoteEmails: found " + threads.length + " unread thread(s).");

  const ss = getCrmSpreadsheet_();
  if (!ss) {
    Logger.log("FATAL: Cannot open CRM spreadsheet \"" + CONFIG.CRM_SHEET_NAME + "\". Aborting run.");
    return;
  }

  const leadsSheet = ss.getSheetByName(CONFIG.LEADS_TAB);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_TAB);

  if (!leadsSheet) {
    Logger.log("FATAL: Tab \"" + CONFIG.LEADS_TAB + "\" not found in CRM. Aborting run.");
    writeToErrorLog_(ss, null, null, "Required tab missing: " + CONFIG.LEADS_TAB);
    return;
  }
  if (!queueSheet) {
    Logger.log("FATAL: Tab \"" + CONFIG.QUEUE_TAB + "\" not found in CRM. Aborting run.");
    writeToErrorLog_(ss, null, null, "Required tab missing: " + CONFIG.QUEUE_TAB);
    return;
  }

  threads.forEach(thread => {
    const result = { leadWritten: false, queueWritten: false, draftCreated: false, calendarHeld: false, bookingId: null };

    try {
      const message   = thread.getMessages()[thread.getMessageCount() - 1];
      const plainBody = message.getPlainBody();
      const data      = parseEmailBody_(plainBody);
      data._messageId = message.getId();
      data._received  = message.getDate();

      Logger.log(
        "Processing thread " + thread.getId() +
        " | Customer: " + (data.name  || "(no name)") +
        " | Email: "    + (data.email || "(no email)")
      );

      if (!data.email) {
        Logger.log("WARNING: No email address parsed from thread " + thread.getId() + ".");
        writeToErrorLog_(ss, null, data, "No email address in parsed data — upsert key unavailable");
      }

      // ── Lead write ────────────────────────────────────────────────
      let bookingId;
      try {
        bookingId = writeToLeads_(leadsSheet, data, ss);
        result.bookingId  = bookingId;
        result.leadWritten = true;
        Logger.log("Lead written. Booking ID: " + bookingId);
      } catch (lErr) {
        Logger.log("ERROR writing to Leads for thread " + thread.getId() + ": " + lErr.message);
        writeToErrorLog_(ss, null, data, "Leads write failed: " + lErr.message);
      }

      if (!bookingId) {
        Logger.log("ERROR: No booking ID obtained. Skipping queue, draft, and calendar for thread " + thread.getId() + ".");
      } else {
        // ── Queue write ───────────────────────────────────────────────
        try {
          writeToAutomationQueue_(queueSheet, data, bookingId);
          result.queueWritten = true;
          Logger.log("Queue row written for " + bookingId);
        } catch (qErr) {
          Logger.log("ERROR writing to Automation Queue for " + bookingId + ": " + qErr.message);
          writeToErrorLog_(ss, bookingId, data, "Queue write failed: " + qErr.message);
        }

        // ── Draft ─────────────────────────────────────────────────────
        try {
          createQuoteDraft_(data, bookingId);
          result.draftCreated = true;
          Logger.log("Draft created for " + bookingId + " → " + (data.email || "(no email)"));
        } catch (dErr) {
          Logger.log("ERROR creating draft for " + bookingId + ": " + dErr.message);
          writeToErrorLog_(ss, bookingId, data, "Draft creation failed: " + dErr.message);
        }

        // ── Calendar hold ─────────────────────────────────────────────
        if (data.eventDate) {
          try {
            createCalendarHold_(data, bookingId);
            result.calendarHeld = true;
            Logger.log("Calendar hold created for " + bookingId + " on " + data.eventDate);
          } catch (cErr) {
            Logger.log("ERROR creating calendar hold for " + bookingId + ": " + cErr.message);
            writeToErrorLog_(ss, bookingId, data, "Calendar hold failed: " + cErr.message);
          }
        } else {
          Logger.log("No event date — skipping calendar hold for " + bookingId);
        }
      }

      // Mark processed only when lead was written
      if (result.leadWritten) {
        thread.addLabel(label);
        message.markRead();
      }

    } catch (err) {
      Logger.log("UNHANDLED ERROR processing thread " + thread.getId() + ": " + err.message);
      writeToErrorLog_(ss, result.bookingId, null, "Unhandled error: " + err.message);
    } finally {
      Logger.log(
        "── Run summary for thread " + thread.getId() + " ──\n" +
        "  Booking ID:    " + (result.bookingId  || "NONE") + "\n" +
        "  Lead written:  " + (result.leadWritten  ? "YES" : "NO") + "\n" +
        "  Queue written: " + (result.queueWritten ? "YES" : "NO") + "\n" +
        "  Draft created: " + (result.draftCreated ? "YES" : "NO") + "\n" +
        "  Calendar hold: " + (result.calendarHeld ? "YES" : "NO")
      );
    }
  });
}

// ─── Email Parser ─────────────────────────────────────────────────────────────

/**
 * Parses a Web3Forms email body (plain text, "Key: Value\n" format) into an object.
 * Web3Forms renders camelCase field names as "Camel Case: value".
 */
function parseEmailBody_(plainBody) {
  const data    = {};
  const lines   = plainBody.split(/\r?\n/);
  const keyMap  = {
    "name":                    "name",
    "email":                   "email",
    "phone":                   "phone",
    "eventdate":               "eventDate",
    "starttime":               "startTime",
    "endtime":                 "endTime",
    "eventaddress":            "eventAddress",
    "city":                    "city",
    "province":                "province",
    "postalcode":              "postalCode",
    "setupsurface":            "setupSurface",
    "powerdistancetooutlet":   "powerDistanceToOutlet",
    "powerneedsreview":        "powerNeedsReview",
    "wateraccess":             "waterAccess",
    "guests":                  "guests",
    "notes":                   "notes",
    "selecteditems":           "selectedItems",
    "subtotal":                "subtotal",
    "deliverylookupsource":    "deliveryLookupSource",
    "deliverydistancekm":      "deliveryDistanceKm",
    "deliverydurationoneway":  "deliveryDurationOneWay",
    "distancefeeestimate":     "distanceFeeEstimate",
    "stafftravelfeeestimate":  "staffTravelFeeEstimate",
    "combineddeliveryestimate":"combinedDeliveryEstimate",
    "sandbagunitcount":        "sandbagUnitCount",
    "sanbagestimate":          "sandbagEstimate",
    "sandbagestimates":        "sandbagEstimate",   // tolerates typo variant
    "sandbagmanualreview":     "sandbagManualReview",
    "attendantsrequired":      "attendantsRequired",
    "attendantcount":          "attendantCount",
    "attendanthours":          "attendantHours",
    "attendantestimate":       "attendantEstimate",
    "estimatedtotal":          "estimatedTotal",
    "disclaimer":              "disclaimer",
  };

  // Collapse continuation lines (indented) back onto their key
  const collapsed = [];
  lines.forEach(line => {
    if (/^\s+/.test(line) && collapsed.length > 0) {
      collapsed[collapsed.length - 1] += " " + line.trim();
    } else {
      collapsed.push(line);
    }
  });

  collapsed.forEach(line => {
    const idx = line.indexOf(":");
    if (idx < 1) return;
    const rawKey  = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, "");
    const rawVal  = line.slice(idx + 1).trim();
    const mapped  = keyMap[rawKey];
    if (mapped) data[mapped] = rawVal;
  });

  return data;
}

// ─── Leads Tab Writer ─────────────────────────────────────────────────────────

/**
 * Upserts a lead row in the Leads tab.
 * Upsert key: email (lowercase) + eventDate.
 * Returns the booking ID (existing or newly generated).
 * Throws on column mismatch so the caller can log to Error Log.
 */
function writeToLeads_(sheet, data, ss) {
  const headers  = getOrCreateHeaders_(sheet, LEADS_COLUMNS_);
  const emailCol = headers.indexOf("Email");
  const dateCol  = headers.indexOf("Event Date");
  const idCol    = headers.indexOf("Booking ID");

  if (emailCol < 0 || dateCol < 0 || idCol < 0) {
    throw new Error(
      "Leads tab column mismatch — Email:" + emailCol +
      " EventDate:" + dateCol +
      " BookingID:" + idCol +
      ". Actual headers: [" + headers.join(", ") + "]"
    );
  }

  const allValues = sheet.getDataRange().getValues();
  const emailKey  = (data.email || "").toLowerCase().trim();
  const dateKey   = normalizeDate_(data.eventDate);

  // Check for existing row to upsert
  for (let r = 1; r < allValues.length; r++) {
    const rowEmail = String(allValues[r][emailCol] || "").toLowerCase().trim();
    const rowDate  = normalizeDate_(String(allValues[r][dateCol] || ""));
    if (rowEmail === emailKey && rowDate === dateKey && emailKey !== "") {
      const existingId = String(allValues[r][idCol] || "").trim();
      Logger.log("Leads upsert: match at row " + (r + 1) + " — existing ID: " + (existingId || "(none)"));
      updateLeadRow_(sheet, r + 1, headers, data);
      return existingId || generateBookingId_(ss);
    }
  }

  // New row
  const bookingId = generateBookingId_(ss);
  Logger.log(
    "Leads: appending new row — ID: " + bookingId +
    " | Customer: " + (data.name  || "") +
    " | Email: "    + (data.email || "")
  );
  appendLeadRow_(sheet, headers, data, bookingId);

  // Post-write verification: confirm the booking ID landed in the correct cell
  const newLastRow = sheet.getLastRow();
  try {
    const writtenId = String(sheet.getRange(newLastRow, idCol + 1).getValue()).trim();
    if (writtenId !== bookingId) {
      Logger.log(
        "WARNING: Post-write check — expected \"" + bookingId +
        "\" at row " + newLastRow + " col " + (idCol + 1) +
        ", found \"" + writtenId + "\""
      );
    } else {
      Logger.log("Post-write check OK — row " + newLastRow + " Booking ID: " + writtenId);
    }
  } catch (e) {
    Logger.log("Post-write check failed (non-critical): " + e.message);
  }

  return bookingId;
}

function appendLeadRow_(sheet, headers, data, bookingId) {
  const deposit = calcDeposit_(data.estimatedTotal);
  const row     = buildLeadRow_(headers, data, bookingId, deposit);
  sheet.appendRow(row);
}

function updateLeadRow_(sheet, rowNum, headers, data) {
  const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const deposit    = calcDeposit_(data.estimatedTotal);
  const updated    = buildLeadRow_(headers, data, currentRow[headers.indexOf("Booking ID")], deposit);
  updated.forEach((val, i) => {
    if (val !== "" && val !== null) {
      sheet.getRange(rowNum, i + 1).setValue(val);
    }
  });
  Logger.log("Leads: updated existing row " + rowNum);
}

function buildLeadRow_(headers, data, bookingId, deposit) {
  const fullAddress = [data.eventAddress, data.city, data.province, data.postalCode]
    .filter(Boolean).join(", ");
  const timeRange   = [data.startTime, data.endTime].filter(Boolean).join(" – ");
  const map         = {
    "Booking ID":           bookingId,
    "Customer":             data.name       || "",
    "Phone":                data.phone      || "",
    "Email":                data.email      || "",
    "Address":              fullAddress     || "",
    "Event Date":           data.eventDate  || "",
    "Event Time":           timeRange       || "",
    "Rental Item":          data.selectedItems || "",
    "Quote Total":          parseMoney_(data.estimatedTotal),
    "Deposit Required":     deposit,
    "Deposit Received":     "",
    "Balance":              "",
    "Payment Method":       "",
    "Status":               "1 - New Lead",
    "Next Action":          "Review quote, send deposit link",
    "Next Action Date":     formatDate_(new Date()),
    "Agreement Sent":       "No",
    "Waiver Signed":        "No",
    "Insurance Requested":  "No",
    "Staff Needed":         data.attendantsRequired === "true" ? (data.attendantCount || "") : "No",
    "Lead Source":          "Website Quote Cart",
    "Notes":                buildLeadNotes_(data),
  };
  return headers.map(h => (h in map ? map[h] : ""));
}

function buildLeadNotes_(data) {
  const parts = [];
  if (data.setupSurface)                parts.push("Surface: " + data.setupSurface);
  if (data.guests)                      parts.push("Guests: " + data.guests);
  if (data.waterAccess)                 parts.push("Water: " + data.waterAccess);
  if (data.powerNeedsReview === "true") parts.push("⚠ Power outlet review needed");
  if (data.sandbagManualReview === "true") parts.push("⚠ Anchoring manual review needed");
  if (data.notes)                       parts.push("Notes: " + data.notes);
  if (data.deliveryLookupSource)        parts.push("Delivery source: " + data.deliveryLookupSource);
  return parts.join(" | ");
}

// ─── Automation Queue Writer ──────────────────────────────────────────────────

function writeToAutomationQueue_(sheet, data, bookingId) {
  if (!bookingId) {
    throw new Error("writeToAutomationQueue_ called with empty bookingId — cannot write.");
  }
  if (!data.email) {
    Logger.log("WARNING: writeToAutomationQueue_ — no customer email for booking " + bookingId);
  }
  const headers = getOrCreateHeaders_(sheet, QUEUE_COLUMNS_);
  Logger.log("Queue: appending row for " + bookingId + " | Task: New Quote Review | Customer: " + (data.name || ""));
  const row = buildQueueRow_(headers, data, bookingId);
  sheet.appendRow(row);
}

function buildQueueRow_(headers, data, bookingId) {
  const map = {
    "Task ID":        bookingId + "-Q" + Date.now().toString().slice(-4),
    "Booking ID":     bookingId,
    "Task Type":      "New Quote Review",
    "Status":         "Pending Review",
    "Priority":       "High",
    "Channel":        "Email",
    "Action":         "Create Gmail draft reply",
    "Customer":       data.name  || "",
    "Email":          data.email || "",
    "Phone":          data.phone || "",
    "Event Date":     data.eventDate || "",
    "Quote Total":    parseMoney_(data.estimatedTotal),
    "Notes":          buildQueueNotes_(data),
    "Created":        formatDate_(new Date()),
    "Assigned To":    "Harkirat",
    "Completed":      "",
  };
  return headers.map(h => (h in map ? map[h] : ""));
}

function buildQueueNotes_(data) {
  const flags = [];
  if (data.sandbagManualReview === "true")    flags.push("Anchoring review needed");
  if (data.powerNeedsReview    === "true")    flags.push("Power outlet review needed");
  if (data.deliveryLookupSource === "manual" ||
      data.deliveryLookupSource === "fallback") flags.push("Delivery quote manual");
  if (data.attendantsRequired  === "true")    flags.push("Attendants required");
  return flags.length ? flags.join("; ") : "Standard review";
}

// ─── Gmail Draft Creator ──────────────────────────────────────────────────────

/**
 * Creates a Gmail DRAFT addressed to the customer.
 * NEVER calls GmailApp.sendEmail() — draft only.
 */
function createQuoteDraft_(data, bookingId) {
  if (!data.email) {
    Logger.log("WARNING: createQuoteDraft_ — no customer email for " + bookingId + ". Draft To: field will be blank.");
  }
  const firstName  = (data.name || "there").split(/\s+/)[0];
  const deposit    = calcDeposit_(data.estimatedTotal);
  const depositFmt = deposit > 0 ? "$" + deposit.toFixed(2) : "30% of quoted total";
  const missingInfo = detectMissingInfo_(data);

  let body;
  if (missingInfo.length > 0) {
    body = buildMissingInfoDraft_(firstName, bookingId, data, missingInfo);
  } else {
    body = buildFullQuoteDraft_(firstName, bookingId, data, depositFmt);
  }

  GmailApp.createDraft(
    data.email || "",
    "Nova Kingdom Rentals Quote — " + bookingId,
    body
  );
}

function buildFullQuoteDraft_(firstName, bookingId, data, depositFmt) {
  const eventDate = data.eventDate || "—";
  const timeRange = [data.startTime, data.endTime].filter(Boolean).join(" – ") || "—";
  const address   = [data.eventAddress, data.city, data.province].filter(Boolean).join(", ") || "—";
  const items     = data.selectedItems || "—";

  const subtotal  = parseMoney_(data.subtotal);
  const delivery  = parseMoney_(data.combinedDeliveryEstimate);
  const attendant = parseMoney_(data.attendantEstimate);
  const total     = parseMoney_(data.estimatedTotal);

  const lines = [
    "Hi " + firstName + ",",
    "",
    "Thanks for reaching out to Nova Kingdom Rentals! Here is your preliminary quote estimate.",
    "",
    "Booking reference: " + bookingId,
    "",
    "Event details",
    "  Date:     " + eventDate,
    "  Time:     " + timeRange,
    "  Location: " + address,
  ];

  if (data.guests) lines.push("  Guests:   " + data.guests);
  lines.push("");

  lines.push("Items requested");
  lines.push("  " + items);
  lines.push("");

  lines.push("Estimate");
  lines.push("  Rentals:   $" + fmtAmt_(subtotal));

  if (delivery > 0) {
    lines.push("  Delivery:  $" + fmtAmt_(delivery));
  } else if (data.combinedDeliveryEstimate && data.combinedDeliveryEstimate.toLowerCase().includes("manual")) {
    lines.push("  Delivery:  To be confirmed after address review");
  }
  if (parseMoney_(data.sandbagEstimate) > 0) {
    lines.push("  Anchoring: $" + fmtAmt_(parseMoney_(data.sandbagEstimate)));
  } else if (data.sandbagManualReview === "true") {
    lines.push("  Anchoring: To be confirmed after setup review");
  }
  if (attendant > 0) {
    lines.push("  Attendants: $" + fmtAmt_(attendant));
  }
  lines.push("  Total est: $" + fmtAmt_(total));
  lines.push("");

  const manualItems = [];
  if (data.sandbagManualReview === "true")   manualItems.push("Anchoring (surface review required)");
  if (data.powerNeedsReview    === "true")   manualItems.push("Power outlet distance");
  if (data.deliveryLookupSource === "manual" ||
      data.deliveryLookupSource === "fallback") manualItems.push("Delivery (address review required)");
  if (manualItems.length > 0) {
    lines.push("Please note — the following need a quick confirmation before your quote is finalized:");
    manualItems.forEach(item => lines.push("  • " + item));
    lines.push("");
  }

  lines.push(
    "Next step",
    "  We'll review availability and reach out with deposit and payment details.",
    "  A " + depositFmt + " deposit is required to hold your date.",
    "",
    "Questions? Reply here or call/text us at " + CONFIG.BUSINESS_PHONE + ".",
    "",
    "Nova Kingdom Rentals",
    CONFIG.WEBSITE,
  );

  return lines.join("\n");
}

function buildMissingInfoDraft_(firstName, bookingId, data, missingInfo) {
  const lines = [
    "Hi " + firstName + ",",
    "",
    "Thanks for reaching out to Nova Kingdom Rentals! We just need a couple more details to get your quote ready.",
    "",
    "Booking reference: " + bookingId,
  ];
  if (data.eventDate) lines.push("Event date: " + data.eventDate);
  lines.push(
    "",
    "Could you please confirm:",
  );
  missingInfo.forEach(item => lines.push("  • " + item));
  lines.push(
    "",
    "Once we have those details we'll send over a full estimate right away.",
    "",
    "Reply here or call/text us at " + CONFIG.BUSINESS_PHONE + ".",
    "",
    "Nova Kingdom Rentals",
    CONFIG.WEBSITE,
  );
  return lines.join("\n");
}

function detectMissingInfo_(data) {
  const missing = [];
  if (!data.eventDate)     missing.push("Your event date");
  if (!data.eventAddress)  missing.push("Your event address (city and postal code are enough to estimate delivery)");
  if (!data.selectedItems) missing.push("Which rentals you're interested in");
  return missing;
}

// ─── Calendar Hold Creator ─────────────────────────────────────────────────────

function createCalendarHold_(data, bookingId) {
  const dateStr = data.eventDate;
  if (!dateStr) return;

  const start = parseDateTime_(dateStr, data.startTime);
  const end   = parseDateTime_(dateStr, data.endTime || data.startTime);
  if (!start || !end) {
    Logger.log("WARNING: createCalendarHold_ — could not parse start/end times for " + bookingId + ". Skipping.");
    return;
  }
  if (end <= start) end.setHours(start.getHours() + 4);

  const title    = "🎪 TENTATIVE — " + bookingId + " — " + (data.name || "Quote Lead");
  const location = [data.eventAddress, data.city, data.province, data.postalCode]
    .filter(Boolean).join(", ");
  const desc     = [
    "TENTATIVE HOLD — not a confirmed booking.",
    "No deposit received. Do not commit staff until deposit confirmed.",
    "",
    "Booking ID: " + bookingId,
    "Customer: "  + (data.name  || "—"),
    "Phone: "     + (data.phone || "—"),
    "Email: "     + (data.email || "—"),
    "Items: "     + (data.selectedItems || "—"),
    "Estimated Total: " + (data.estimatedTotal || "—"),
    "Guests: "    + (data.guests       || "—"),
    "Surface: "   + (data.setupSurface || "—"),
  ].join("\n");

  CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).createEvent(title, start, end, {
    location:    location,
    description: desc,
    status:      "tentative",
  });
  Logger.log("Calendar hold created: \"" + title + "\"");
}

// ─── Error Log ────────────────────────────────────────────────────────────────

/**
 * Appends a row to the "Error Log" tab in the CRM sheet.
 * Creates the tab if it does not exist. Never throws — errors here are logged only.
 */
function writeToErrorLog_(ss, bookingId, data, reason) {
  try {
    let sheet = ss.getSheetByName("Error Log");
    if (!sheet) {
      sheet = ss.insertSheet("Error Log");
      sheet.getRange(1, 1, 1, 6).setValues([["Timestamp", "Booking ID", "Customer", "Email", "Event Date", "Error"]]);
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(6, 400);
      Logger.log("Created Error Log tab.");
    }
    sheet.appendRow([
      new Date(),
      bookingId           || "",
      (data && data.name)      || "",
      (data && data.email)     || "",
      (data && data.eventDate) || "",
      reason              || "",
    ]);
  } catch (e) {
    Logger.log("writeToErrorLog_ itself failed: " + e.message);
  }
}

// ─── System Verification ──────────────────────────────────────────────────────

/**
 * Run manually before going live to verify all required tabs, headers, counters,
 * and Gmail labels are in place. Results are printed to the Execution Log.
 *
 * Expected output: all lines show ✓. Any ✗ line must be resolved before using
 * the script in production.
 */
function verifyIntakeSystem() {
  const results = [];
  const pass = msg => { Logger.log("  ✓ " + msg); results.push("PASS: " + msg); };
  const fail = msg => { Logger.log("  ✗ " + msg); results.push("FAIL: " + msg); };

  Logger.log("=== verifyIntakeSystem ===");

  // 1. CRM spreadsheet
  let ss;
  try {
    ss = getCrmSpreadsheet_();
    if (!ss) throw new Error("getCrmSpreadsheet_ returned null");
    pass("CRM spreadsheet found: \"" + ss.getName() + "\"");
  } catch (e) {
    fail("Cannot open CRM spreadsheet: " + e.message);
    Logger.log("\n=== Summary ===");
    results.forEach(r => Logger.log(r));
    Logger.log("=== verifyIntakeSystem done ===");
    return;
  }

  // 2. Required tabs
  [CONFIG.LEADS_TAB, CONFIG.QUEUE_TAB, CONFIG.SEQUENCE_SHEET].forEach(tabName => {
    ss.getSheetByName(tabName)
      ? pass("Tab exists: \"" + tabName + "\"")
      : fail("Tab MISSING: \"" + tabName + "\" — script will fail or auto-create on first run");
  });

  // 3. Leads headers
  const leadsSheet = ss.getSheetByName(CONFIG.LEADS_TAB);
  if (leadsSheet) {
    const lastCol = leadsSheet.getLastColumn();
    const headers = lastCol > 0
      ? leadsSheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String)
      : [];
    if (headers.length === 0) {
      fail("Leads tab has no headers in row 1 — will be auto-written on first run");
    } else {
      ["Booking ID", "Customer", "Email", "Event Date", "Quote Total", "Status"].forEach(col => {
        const idx = headers.indexOf(col);
        idx >= 0
          ? pass("Leads header \"" + col + "\" at col " + (idx + 1))
          : fail("Leads header MISSING: \"" + col + "\"");
      });
    }
  }

  // 4. Automation Queue headers
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_TAB);
  if (queueSheet) {
    const lastCol = queueSheet.getLastColumn();
    const headers = lastCol > 0
      ? queueSheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String)
      : [];
    if (headers.length === 0) {
      fail("Automation Queue tab has no headers in row 1 — will be auto-written on first run");
    } else {
      ["Task ID", "Booking ID", "Task Type", "Status", "Customer", "Email"].forEach(col => {
        const idx = headers.indexOf(col);
        idx >= 0
          ? pass("Queue header \"" + col + "\" at col " + (idx + 1))
          : fail("Queue header MISSING: \"" + col + "\"");
      });
    }
  }

  // 5. System tab counter
  const sysSheet = ss.getSheetByName(CONFIG.SEQUENCE_SHEET);
  if (sysSheet) {
    const counter = sysSheet.getRange("B2").getValue();
    counter
      ? pass("System tab counter: " + counter)
      : fail("System tab counter B2 is empty — booking IDs will fall back to scanner + constant");
  }

  // 6. Gmail label
  const label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  label
    ? pass("Gmail label exists: \"" + CONFIG.PROCESSED_LABEL + "\"")
    : fail("Gmail label \"" + CONFIG.PROCESSED_LABEL + "\" not found — will be auto-created on first run");

  // 7. EXTRA_ID_TABS (non-fatal)
  (CONFIG.EXTRA_ID_TABS || []).forEach(tabName => {
    ss.getSheetByName(tabName)
      ? pass("Extra ID tab exists: \"" + tabName + "\"")
      : fail("Extra ID tab \"" + tabName + "\" not found — will be skipped in ID scan (non-critical)");
  });

  Logger.log("\n=== Summary ===");
  const failures = results.filter(r => r.startsWith("FAIL:"));
  if (failures.length === 0) {
    Logger.log("All checks passed. System is ready.");
  } else {
    Logger.log(failures.length + " check(s) failed:");
    failures.forEach(f => Logger.log("  " + f));
  }
  Logger.log("=== verifyIntakeSystem done ===");
}

// ─── Trigger Setup ────────────────────────────────────────────────────────────

/**
 * Run once to install the time-based trigger.
 * Safe to re-run — removes any existing processNewQuoteEmails triggers first.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "processNewQuoteEmails") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("processNewQuoteEmails")
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_MINUTES)
    .create();
  Logger.log("Trigger installed: processNewQuoteEmails every " + CONFIG.TRIGGER_MINUTES + " min.");
}

// ─── Test Case ────────────────────────────────────────────────────────────────

/**
 * Run manually to verify the full pipeline without waiting for a real email.
 * Creates one Leads row, one Queue row, one Gmail draft, one Calendar hold.
 *
 * AFTER the test — clean up before going live:
 *   1. Delete the Sarah MacLean row from the Leads tab.
 *   2. Delete the corresponding row from the Automation Queue tab.
 *   3. Delete the draft to sarah.test@example.com from Gmail Drafts.
 *   4. Delete the tentative calendar event.
 * The System tab counter is intentionally NOT rolled back — this is correct behaviour.
 */
function testQuoteIntake() {
  const sampleBody = [
    "Name: Sarah MacLean",
    "Email: sarah.test@example.com",
    "Phone: 902-555-0199",
    "Event Date: June 28, 2026",
    "Start Time: 1:00 PM",
    "End Time: 5:00 PM",
    "Event Address: 45 Maple Street",
    "City: Bridgewater",
    "Province: NS",
    "Postal Code: B4V 1V8",
    "Setup Surface: Grass",
    "Power Distance To Outlet: Under 50 ft",
    "Power Needs Review: false",
    "Water Access: Yes",
    "Guests: 75",
    "Notes: Birthday party for my daughter. Please bring the big castle!",
    "Selected Items: Ultimate Kingdom Combo (Crown Rush 42 + Cascade Splash + Quest Tower) — $650",
    "Subtotal: $650.00",
    "Delivery Lookup Source: api",
    "Delivery Distance Km: 8.2",
    "Delivery Duration One Way: 12",
    "Distance Fee Estimate: $0.00",
    "Staff Travel Fee Estimate: $12.50",
    "Combined Delivery Estimate: $12.50",
    "Sandbag Unit Count: 0",
    "Sandbag Estimate: $0.00",
    "Sandbag Manual Review: false",
    "Attendants Required: false",
    "Attendant Count: 0",
    "Attendant Hours: 0",
    "Attendant Estimate: $0.00",
    "Estimated Total: $662.50",
    "Disclaimer: This is an availability request only.",
  ].join("\n");

  const data = parseEmailBody_(sampleBody);
  data._received = new Date();

  const ss = getCrmSpreadsheet_();
  if (!ss) {
    Logger.log("FATAL: Cannot open CRM spreadsheet. Aborting test.");
    return;
  }

  const leadsSheet = ss.getSheetByName(CONFIG.LEADS_TAB);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_TAB);

  if (!leadsSheet || !queueSheet) {
    Logger.log("FATAL: Cannot find Leads or Automation Queue tab. Check CRM sheet name and tab names.");
    return;
  }

  const result = { leadWritten: false, queueWritten: false, draftCreated: false, calendarHeld: false, bookingId: null };

  try {
    const bookingId = writeToLeads_(leadsSheet, data, ss);
    result.bookingId  = bookingId;
    result.leadWritten = true;

    writeToAutomationQueue_(queueSheet, data, bookingId);
    result.queueWritten = true;

    createQuoteDraft_(data, bookingId);
    result.draftCreated = true;

    if (data.eventDate) {
      createCalendarHold_(data, bookingId);
      result.calendarHeld = true;
    }
  } catch (e) {
    Logger.log("testQuoteIntake ERROR: " + e.message);
  }

  Logger.log(
    "── testQuoteIntake complete ──\n" +
    "  Booking ID:    " + (result.bookingId  || "NONE") + "\n" +
    "  Lead written:  " + (result.leadWritten  ? "YES" : "NO") + "\n" +
    "  Queue written: " + (result.queueWritten ? "YES" : "NO") + "\n" +
    "  Draft created: " + (result.draftCreated ? "YES" : "NO") + "\n" +
    "  Calendar hold: " + (result.calendarHeld ? "YES" : "NO") + "\n" +
    "\nVerify in:\n" +
    "  • Leads tab — row for Sarah MacLean with Booking ID " + (result.bookingId || "?") + "\n" +
    "  • Automation Queue tab — Task Type: New Quote Review\n" +
    "  • Gmail Drafts — email to sarah.test@example.com\n" +
    "  • Google Calendar — 🎪 TENTATIVE event on June 28, 2026"
  );
}

// ─── Column Schemas ───────────────────────────────────────────────────────────

const LEADS_COLUMNS_ = [
  "Booking ID", "Customer", "Phone", "Email", "Address",
  "Event Date", "Event Time", "Rental Item", "Quote Total",
  "Deposit Required", "Deposit Received", "Balance", "Payment Method",
  "Status", "Next Action", "Next Action Date",
  "Agreement Sent", "Waiver Signed", "Insurance Requested",
  "Staff Needed", "Lead Source", "Notes",
];

const QUEUE_COLUMNS_ = [
  "Task ID", "Booking ID", "Task Type", "Status", "Priority",
  "Channel", "Action", "Customer", "Email", "Phone",
  "Event Date", "Quote Total", "Notes", "Created", "Assigned To", "Completed",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Finds the CRM spreadsheet by name in Drive. Throws a clear error if not found.
 * Does NOT fall back to getActiveSpreadsheet() — this is a standalone project.
 */
function getCrmUrl_() {
  const files = DriveApp.getFilesByName(CONFIG.CRM_SHEET_NAME);
  if (files.hasNext()) return files.next().getUrl();
  throw new Error(
    "CRM spreadsheet not found in Drive: \"" + CONFIG.CRM_SHEET_NAME + "\". " +
    "Check CONFIG.CRM_SHEET_NAME and confirm the sheet is accessible to this Google account."
  );
}

/**
 * Returns the CRM SpreadsheetApp object, or null on failure.
 */
function getCrmSpreadsheet_() {
  try {
    return SpreadsheetApp.openByUrl(getCrmUrl_());
  } catch (e) {
    Logger.log("getCrmSpreadsheet_ failed: " + e.message);
    return null;
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/**
 * Returns existing headers from row 1 of the sheet, or writes expectedHeaders
 * if row 1 is blank. Handles the case where getLastColumn() returns 0 (empty sheet).
 */
function getOrCreateHeaders_(sheet, expectedHeaders) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    Logger.log("Headers written to empty tab \"" + sheet.getName() + "\"");
    return expectedHeaders;
  }
  const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existing = firstRow.filter(String);
  if (existing.length === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    Logger.log("Headers written to tab with blank row 1: \"" + sheet.getName() + "\"");
    return expectedHeaders;
  }
  return existing;
}

/**
 * Generates the next booking ID with a three-source sequence strategy:
 *   1. Persistent counter  — System tab B2 (survives deletions and cleanups)
 *   2. Tab scanner         — highest NK-YYYY-### found across all CRM tabs
 *   3. Fallback constant   — NEXT_BOOKING_NUMBER_FALLBACK (only when both above are 0)
 *
 * Takes the maximum of all three, increments by 1, writes back to System!B2
 * immediately so the next call always sees the updated value.
 */
function generateBookingId_(ss) {
  const year = new Date().getFullYear();

  // 1. Read persistent counter
  const persistedNum = readSequenceCounter_(ss, year);
  Logger.log("generateBookingId_: persistedNum=" + persistedNum);

  // 2. Scan CRM tabs as secondary validation
  const pattern  = new RegExp("^" + CONFIG.BOOKING_ID_PREFIX + "-" + year + "-(\\d+)$");
  const tabNames = [CONFIG.LEADS_TAB, CONFIG.QUEUE_TAB].concat(CONFIG.EXTRA_ID_TABS || []);
  let scannedMax = 0;

  tabNames.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Logger.log("generateBookingId_: tab \"" + tabName + "\" not found — skipping scan");
      return;
    }
    const lastRow = sheet.getLastRow();
    const lastCol = Math.min(sheet.getLastColumn(), 5);
    if (lastRow < 2 || lastCol < 1) return;
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    values.forEach(row => {
      row.forEach(cell => {
        const m = String(cell || "").match(pattern);
        if (m) scannedMax = Math.max(scannedMax, parseInt(m[1], 10));
      });
    });
  });
  Logger.log("generateBookingId_: scannedMax=" + scannedMax);

  // 3. Determine next number
  const fallback = (CONFIG.NEXT_BOOKING_NUMBER_FALLBACK || 1) - 1;
  Logger.log("generateBookingId_: fallback=" + fallback);
  const next = Math.max(persistedNum, scannedMax, fallback) + 1;
  Logger.log("generateBookingId_: next=" + next);

  // 4. Persist immediately before returning
  writeSequenceCounter_(ss, year, next);

  const id = CONFIG.BOOKING_ID_PREFIX + "-" + year + "-" + String(next).padStart(3, "0");
  Logger.log("generateBookingId_: generated " + id);
  return id;
}

/**
 * Reads the persisted booking sequence number from the System tab.
 * Returns the stored number for the current year, or 0 if not found.
 * Creates the System tab with labels if it does not exist.
 */
function readSequenceCounter_(ss, year) {
  const sheet  = getOrCreateSystemSheet_(ss);
  const stored = sheet.getRange("B2").getValue();
  const m = String(stored || "").match(new RegExp("^" + CONFIG.BOOKING_ID_PREFIX + "-" + year + ":(\\d+)$"));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Writes the latest booking number back to System!B2 immediately.
 * Format: "NK-YYYY:NNN" (colon separator so it's visually distinct from a booking ID).
 */
function writeSequenceCounter_(ss, year, num) {
  const sheet = getOrCreateSystemSheet_(ss);
  sheet.getRange("B2").setValue(CONFIG.BOOKING_ID_PREFIX + "-" + year + ":" + String(num).padStart(3, "0"));
  sheet.getRange("B3").setValue(new Date());
}

/**
 * Returns the System sheet, creating it with labelled rows if absent.
 */
function getOrCreateSystemSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SEQUENCE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SEQUENCE_SHEET);
    sheet.getRange("A1").setValue("Nova Kingdom Rentals — Automation Settings");
    sheet.getRange("A1").setFontWeight("bold");
    sheet.getRange("A2").setValue("Booking ID sequence (do not edit)");
    sheet.getRange("B2").setValue(CONFIG.BOOKING_ID_PREFIX + "-" + new Date().getFullYear() + ":000");
    sheet.getRange("A3").setValue("Last updated");
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 160);
    Logger.log("Created System tab for booking ID persistence.");
  }
  return sheet;
}

function calcDeposit_(estimatedTotalStr) {
  const total = parseMoney_(estimatedTotalStr);
  return total > 0 ? Math.round(total * CONFIG.DEPOSIT_RATE * 100) / 100 : 0;
}

function parseMoney_(str) {
  if (!str && str !== 0) return 0;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function fmtAmt_(num) {
  return (Math.round(num * 100) / 100).toFixed(2);
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function normalizeDate_(str) {
  if (!str) return "";
  try {
    const d = new Date(str);
    if (!isNaN(d)) return formatDate_(d);
  } catch (_) {}
  return str.trim().toLowerCase();
}

function parseDateTime_(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const base = new Date(dateStr);
    if (isNaN(base)) return null;
    if (timeStr) {
      const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (m) {
        let h      = parseInt(m[1], 10);
        const min  = parseInt(m[2], 10);
        const mer  = (m[3] || "").toLowerCase();
        if (mer === "pm" && h < 12) h += 12;
        if (mer === "am" && h === 12) h = 0;
        base.setHours(h, min, 0, 0);
      }
    }
    return base;
  } catch (_) {
    return null;
  }
}
