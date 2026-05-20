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
  // Additional tabs scanned when generating the next booking ID.
  // Add or rename to match your actual sheet tab names.
  EXTRA_ID_TABS:    ["Booked Customers", "Payment Tracker"],
  // If no NK-YYYY-### IDs are found in any tab (e.g. existing bookings use a
  // different format like B001/B002), the next ID starts from this number.
  // Set this to the next number you want to use before going live.
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

      const bookingId = writeToLeads_(leadsSheet, data, ss);
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
 * ss — the full SpreadsheetApp spreadsheet, used to scan all tabs for the next booking ID.
 */
function writeToLeads_(sheet, data, ss) {
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
      return existingId || generateBookingId_(ss);
    }
  }

  // New row
  const bookingId = generateBookingId_(ss);
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
    "Nova Kingdom Rentals Quote — " + bookingId,
    body
  );
}

function buildFullQuoteDraft_(firstName, bookingId, data, depositFmt) {
  const eventDate  = data.eventDate || "—";
  const timeRange  = [data.startTime, data.endTime].filter(Boolean).join(" – ") || "—";
  const address    = [data.eventAddress, data.city, data.province].filter(Boolean).join(", ") || "—";
  const items      = data.selectedItems || "—";

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

  const bookingId = writeToLeads_(leadsSheet, data, ss);
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

/**
 * Generates the next booking ID by scanning ALL configured CRM tabs for existing
 * NK-YYYY-NNN IDs and returning the next number in sequence.
 * Tabs scanned: Leads, Automation Queue, and any names listed in CONFIG.EXTRA_ID_TABS.
 * Cells are matched against the pattern in every column to handle varying column layouts.
 */
function generateBookingId_(ss) {
  const year    = new Date().getFullYear();
  const pattern = new RegExp("^" + CONFIG.BOOKING_ID_PREFIX + "-" + year + "-(\\d+)$");
  const tabNames = [CONFIG.LEADS_TAB, CONFIG.QUEUE_TAB].concat(CONFIG.EXTRA_ID_TABS || []);
  let maxNum = 0;

  tabNames.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const lastCol = Math.min(sheet.getLastColumn(), 5); // check first 5 columns — IDs are always near the left
    if (lastRow < 2 || lastCol < 1) return;
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    values.forEach(row => {
      row.forEach(cell => {
        const m = String(cell || "").match(pattern);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
    });
  });

  const next = Math.max(maxNum, (CONFIG.NEXT_BOOKING_NUMBER_FALLBACK || 1) - 1) + 1;
  return CONFIG.BOOKING_ID_PREFIX + "-" + year + "-" + String(next).padStart(3, "0");
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
