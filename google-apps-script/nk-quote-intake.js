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
 *   1. Open the "AI Lead Engine CRM — Nova Kingdom Rentals" Google Sheet.
 *   2. Extensions → Apps Script → paste this file.
 *   3. Run setupTriggers() once to install the 5-minute trigger.
 *   4. Authorize all required scopes when prompted.
 *   5. Run testQuoteIntake() to verify end-to-end with sample data.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  GMAIL_SUBJECT:    "New Nova Kingdom Rentals Quote Request",
  PROCESSED_LABEL:  "NK/Intake-Processed",
  CRM_SHEET_NAME:   "AI Lead Engine CRM — Nova Kingdom Rentals",
  LEADS_TAB:        "Leads",
  QUEUE_TAB:        "Automation Queue",
  FROM_NAME:        "Nova Kingdom Rentals",
  FROM_EMAIL:       "booknovakingdom@gmail.com",
  BUSINESS_PHONE:   "902-990-0005",
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
  const label      = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const query      = `subject:"${CONFIG.GMAIL_SUBJECT}" is:unread -label:${CONFIG.PROCESSED_LABEL}`;
  const threads    = GmailApp.search(query, 0, 20);
  const ss         = SpreadsheetApp.openByUrl(getCrmUrl_());
  const leadsSheet = ss.getSheetByName(CONFIG.LEADS_TAB);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_TAB);

  if (!leadsSheet || !queueSheet) {
    console.error("Required tabs not found. Check CRM sheet name and tab names.");
    return;
  }

  threads.forEach(thread => {
    try {
      const message   = thread.getMessages()[thread.getMessageCount() - 1];
      const plainBody = message.getPlainBody();
      const data      = parseEmailBody_(plainBody);
      data._messageId = message.getId();
      data._received  = message.getDate();

      const bookingId = writeToLeads_(leadsSheet, data);
      writeToAutomationQueue_(queueSheet, data, bookingId);
      createQuoteDraft_(data, bookingId);
      if (data.eventDate) createCalendarHold_(data, bookingId);

      // Mark processed
      thread.addLabel(label);
      message.markRead();
    } catch (err) {
      console.error("Error processing thread " + thread.getId() + ": " + err.message);
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
 */
function writeToLeads_(sheet, data) {
  const headers   = getOrCreateHeaders_(sheet, LEADS_COLUMNS_);
  const allValues = sheet.getDataRange().getValues();
  const emailCol  = headers.indexOf("Email");
  const dateCol   = headers.indexOf("Event Date");
  const idCol     = headers.indexOf("Booking ID");

  const emailKey  = (data.email || "").toLowerCase().trim();
  const dateKey   = normalizeDate_(data.eventDate);

  // Check for existing row to upsert
  for (let r = 1; r < allValues.length; r++) {
    const rowEmail = String(allValues[r][emailCol] || "").toLowerCase().trim();
    const rowDate  = normalizeDate_(String(allValues[r][dateCol] || ""));
    if (rowEmail === emailKey && rowDate === dateKey && emailKey !== "") {
      const existingId = String(allValues[r][idCol] || "").trim();
      updateLeadRow_(sheet, r + 1, headers, data);
      return existingId || generateBookingId_(sheet, idCol);
    }
  }

  // New row
  const bookingId = generateBookingId_(sheet, idCol);
  appendLeadRow_(sheet, headers, data, bookingId);
  return bookingId;
}

function appendLeadRow_(sheet, headers, data, bookingId) {
  const deposit    = calcDeposit_(data.estimatedTotal);
  const row        = buildLeadRow_(headers, data, bookingId, deposit);
  sheet.appendRow(row);
}

function updateLeadRow_(sheet, rowNum, headers, data) {
  // Only update fields that are non-empty in the new submission
  const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const deposit    = calcDeposit_(data.estimatedTotal);
  const updated    = buildLeadRow_(headers, data, currentRow[headers.indexOf("Booking ID")], deposit);
  updated.forEach((val, i) => {
    if (val !== "" && val !== null) {
      sheet.getRange(rowNum, i + 1).setValue(val);
    }
  });
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
  if (data.setupSurface)           parts.push("Surface: " + data.setupSurface);
  if (data.guests)                 parts.push("Guests: " + data.guests);
  if (data.waterAccess)            parts.push("Water: " + data.waterAccess);
  if (data.powerNeedsReview === "true") parts.push("⚠ Power outlet review needed");
  if (data.sandbagManualReview === "true") parts.push("⚠ Anchoring manual review needed");
  if (data.notes)                  parts.push("Notes: " + data.notes);
  if (data.deliveryLookupSource)   parts.push("Delivery source: " + data.deliveryLookupSource);
  return parts.join(" | ");
}

// ─── Automation Queue Writer ──────────────────────────────────────────────────

function writeToAutomationQueue_(sheet, data, bookingId) {
  const headers = getOrCreateHeaders_(sheet, QUEUE_COLUMNS_);
  const row     = buildQueueRow_(headers, data, bookingId);
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
  if (data.sandbagManualReview === "true")   flags.push("Anchoring review needed");
  if (data.powerNeedsReview    === "true")   flags.push("Power outlet review needed");
  if (data.deliveryLookupSource === "manual" ||
      data.deliveryLookupSource === "fallback") flags.push("Delivery quote manual");
  if (data.attendantsRequired  === "true")   flags.push("Attendants required");
  return flags.length ? flags.join("; ") : "Standard review";
}

// ─── Gmail Draft Creator ──────────────────────────────────────────────────────

/**
 * Creates a Gmail DRAFT addressed to the customer.
 * NEVER calls GmailApp.sendEmail() — draft only.
 */
function createQuoteDraft_(data, bookingId) {
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
    "Re: Nova Kingdom Rentals Quote — " + bookingId,
    body
  );
}

function buildFullQuoteDraft_(firstName, bookingId, data, depositFmt) {
  const lines = [
    "DRAFT — REVIEW BEFORE SENDING",
    "─────────────────────────────────────────────",
    "",
    "Hi " + firstName + ",",
    "",
    "Thanks so much for reaching out to Nova Kingdom Rentals! We'd love to make your event amazing.",
    "",
    "Here's a summary of your quote request:",
    "",
    "  Booking Reference: " + bookingId,
    "  Event Date:        " + (data.eventDate  || "—"),
    "  Event Time:        " + ([data.startTime, data.endTime].filter(Boolean).join(" – ") || "—"),
    "  Event Address:     " + ([data.eventAddress, data.city, data.province].filter(Boolean).join(", ") || "—"),
    "  Setup Surface:     " + (data.setupSurface || "—"),
    "  Guests:            " + (data.guests       || "—"),
    "",
    "── Items Requested ──────────────────────────",
    (data.selectedItems || "—"),
    "",
    "── Estimate Breakdown ───────────────────────",
  ];

  const subtotal  = parseMoney_(data.subtotal);
  const delivery  = parseMoney_(data.combinedDeliveryEstimate);
  const attendant = parseMoney_(data.attendantEstimate);
  const total     = parseMoney_(data.estimatedTotal);

  lines.push("  Rental subtotal:  $" + fmtAmt_(subtotal));
  if (delivery > 0) {
    lines.push("  Delivery & setup: $" + fmtAmt_(delivery));
    if (data.deliveryDistanceKm) lines.push("    (" + data.deliveryDistanceKm + " km one-way)");
  } else if (data.combinedDeliveryEstimate && data.combinedDeliveryEstimate.toLowerCase().includes("manual")) {
    lines.push("  Delivery & setup: To be confirmed after address review");
  }
  if (attendant > 0) {
    lines.push("  Event attendants: $" + fmtAmt_(attendant) +
      (data.attendantCount ? " (" + data.attendantCount + " staff × " + (data.attendantHours || "?") + " hr)" : ""));
  }
  if (data.sandbagManualReview === "true") {
    lines.push("  Anchoring:        To be confirmed after surface review");
  } else if (parseMoney_(data.sandbagEstimate) > 0) {
    lines.push("  Anchoring:        $" + fmtAmt_(parseMoney_(data.sandbagEstimate)));
  }
  lines.push("  ──────────────────────────────────────");
  lines.push("  Estimated Total:  $" + fmtAmt_(total));
  lines.push("");

  const manualItems = [];
  if (data.sandbagManualReview === "true")   manualItems.push("anchoring (surface review)");
  if (data.powerNeedsReview    === "true")   manualItems.push("power outlet distance");
  if (data.deliveryLookupSource === "manual" ||
      data.deliveryLookupSource === "fallback") manualItems.push("delivery (address review)");
  if (manualItems.length > 0) {
    lines.push("⚠ The following items need manual confirmation before your final quote is locked in:");
    manualItems.forEach(item => lines.push("   • " + item.charAt(0).toUpperCase() + item.slice(1)));
    lines.push("");
  }

  lines.push(
    "── Next Steps ───────────────────────────────",
    "",
    "To hold this date we require a " + depositFmt + " deposit.",
    "We accept e-transfer to " + CONFIG.FROM_EMAIL + ".",
    "",
    "Once we confirm availability and finalize the quote, we'll send over the rental agreement",
    "and a deposit link. Your booking is not confirmed until the deposit is received.",
    "",
    "Feel free to reply to this email or call/text us at " + CONFIG.BUSINESS_PHONE + " with any questions!",
    "",
    "We look forward to hearing from you,",
    "",
    CONFIG.FROM_NAME,
    CONFIG.BUSINESS_PHONE,
    CONFIG.FROM_EMAIL,
    "",
    "─────────────────────────────────────────────",
    "DRAFT — REVIEW BEFORE SENDING",
  );

  return lines.join("\n");
}

function buildMissingInfoDraft_(firstName, bookingId, data, missingInfo) {
  const lines = [
    "DRAFT — REVIEW BEFORE SENDING",
    "─────────────────────────────────────────────",
    "",
    "Hi " + firstName + ",",
    "",
    "Thanks for your quote request! We just need a couple more details to put together an accurate estimate for you.",
    "",
    "  Booking Reference: " + bookingId,
    "  Event Date:        " + (data.eventDate || "—"),
    "",
    "To complete your quote, could you please provide:",
    "",
  ];
  missingInfo.forEach(item => lines.push("   • " + item));
  lines.push(
    "",
    "Once we have those details we'll send over a full estimate right away!",
    "",
    "You can reply here or reach us at " + CONFIG.BUSINESS_PHONE + ".",
    "",
    CONFIG.FROM_NAME,
    CONFIG.BUSINESS_PHONE,
    CONFIG.FROM_EMAIL,
    "",
    "─────────────────────────────────────────────",
    "DRAFT — REVIEW BEFORE SENDING",
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
  const dateStr  = data.eventDate;
  if (!dateStr) return;

  const start    = parseDateTime_(dateStr, data.startTime);
  const end      = parseDateTime_(dateStr, data.endTime   || data.startTime);
  if (!start || !end) return;
  if (end <= start) end.setHours(start.getHours() + 4); // fallback 4-hr block

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
    "Guests: "    + (data.guests    || "—"),
    "Surface: "   + (data.setupSurface || "—"),
  ].join("\n");

  CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).createEvent(title, start, end, {
    location:    location,
    description: desc,
    status:      "tentative",
  });
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
  console.log("Trigger installed: processNewQuoteEmails every " + CONFIG.TRIGGER_MINUTES + " min.");
}

// ─── Test Case ────────────────────────────────────────────────────────────────

/**
 * Run manually to verify the full pipeline without waiting for a real email.
 * Creates one Leads row, one Queue row, one Gmail draft, one Calendar hold.
 * Look for: booking ID in Leads + Queue, draft in Gmail Drafts, tentative Calendar event.
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

  const ss         = SpreadsheetApp.openByUrl(getCrmUrl_());
  const leadsSheet = ss.getSheetByName(CONFIG.LEADS_TAB);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_TAB);

  if (!leadsSheet || !queueSheet) {
    console.error("Cannot find Leads or Automation Queue tab. Check CRM sheet name.");
    return;
  }

  const bookingId = writeToLeads_(leadsSheet, data);
  writeToAutomationQueue_(queueSheet, data, bookingId);
  createQuoteDraft_(data, bookingId);
  if (data.eventDate) createCalendarHold_(data, bookingId);

  console.log("testQuoteIntake complete. Booking ID: " + bookingId);
  console.log("Check: Leads tab, Automation Queue tab, Gmail Drafts, Google Calendar (tentative).");
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

function getCrmUrl_() {
  // Look for the CRM spreadsheet by name among files the script can access.
  const files = DriveApp.getFilesByName(CONFIG.CRM_SHEET_NAME);
  if (files.hasNext()) return files.next().getUrl();
  // Fallback: if this script is bound to the sheet, use the active spreadsheet.
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function getOrCreateHeaders_(sheet, expectedHeaders) {
  const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const existing = firstRow.filter(String);
  if (existing.length === 0) {
    // Write headers if row 1 is blank
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return expectedHeaders;
  }
  return existing;
}

function generateBookingId_(sheet, idColIndex) {
  const year      = new Date().getFullYear();
  const allValues = sheet.getDataRange().getValues();
  let   maxNum    = 0;
  for (let r = 1; r < allValues.length; r++) {
    const id = String(allValues[r][idColIndex] || "");
    const m  = id.match(new RegExp("^" + CONFIG.BOOKING_ID_PREFIX + "-" + year + "-(\\d+)$"));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return CONFIG.BOOKING_ID_PREFIX + "-" + year + "-" + String(maxNum + 1).padStart(3, "0");
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
  // Accept "June 28, 2026", "2026-06-28", "06/28/2026"
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
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const mer = (m[3] || "").toLowerCase();
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
