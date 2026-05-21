/**
 * SetupSchema.gs — RentalOps One-Time Setup Helper
 *
 * Run setupRentalOpsSchema() once from the Apps Script editor to create all
 * Config_*, Ops_*, and Sim_* tabs with correct headers and NKR seed data.
 *
 * Idempotent guarantees:
 *   - Tabs already present are left unchanged.
 *   - Headers are validated against the expected list (mismatch → warning only, no overwrite).
 *   - Seed rows already present (matched by first-column ID) are never re-inserted.
 *   - Tabs listed in PROTECTED_TABS are never created or modified.
 *   - Ops_ tabs start empty — no seed rows are inserted.
 *   - Sim_ tabs start empty — no seed rows are inserted.
 *
 * After running, confirm in Config_OpsControls:
 *   simulation_mode     = true    (nkr-OC-001)
 *   auto_draft_enabled  = false   (nkr-OC-002)
 * Never change these until all simulation testing passes.
 */

// ─── Protected Tabs (never touched by this script) ───────────────────────────

var PROTECTED_TABS = [
  'Website Quote Leads', 'Automation Queue', 'Booked Customers',
  'System', 'Processing Log', 'Error Log', 'Contact/Customer Log', 'DNC'
];

// ─── Entry Point ──────────────────────────────────────────────────────────────

function setupRentalOpsSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = { created: [], existed: [], seeded: [], warnings: [] };

  var schemas = _buildSchemas();

  schemas.forEach(function (schema) {
    var tabName = schema.tabName;

    if (PROTECTED_TABS.indexOf(tabName) !== -1) {
      results.warnings.push('SKIPPED (protected): ' + tabName);
      return;
    }

    var outcome = _ensureTab(ss, tabName, schema.headers);
    if (outcome.created) {
      results.created.push(tabName);
      console.log('SetupSchema: CREATED ' + tabName);
    } else {
      results.existed.push(tabName);
      console.log('SetupSchema: EXISTS  ' + tabName);
    }

    if (outcome.headerWarning) {
      results.warnings.push('HEADER MISMATCH (not modified): ' + tabName);
      console.warn('SetupSchema: WARNING — header mismatch on ' + tabName + '. Tab unchanged.');
    }

    if (schema.rows && schema.rows.length) {
      var inserted = _ensureSeedRows(outcome.sheet, schema.rows);
      if (inserted > 0) {
        results.seeded.push(tabName + ' (' + inserted + ' rows)');
        console.log('SetupSchema: SEEDED  ' + tabName + ' — ' + inserted + ' row(s) inserted');
      } else {
        console.log('SetupSchema: SEED OK ' + tabName + ' — all rows already present');
      }
    }
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('══ SetupSchema Complete ══════════════════════════════════');
  console.log('  Tabs created  : ' + (results.created.length  || 0) + ' — ' + results.created.join(', '));
  console.log('  Tabs existed  : ' + (results.existed.length  || 0));
  console.log('  Tabs seeded   : ' + results.seeded.join(', '));
  if (results.warnings.length) {
    console.log('  WARNINGS      : ' + results.warnings.join(' | '));
  }
  console.log('');
  console.log('  Next: verify Config_OpsControls — simulation_mode=true, auto_draft_enabled=false');
  console.log('  Next: verify Config_RiskRules   — nkr-RR-007 blocklist entry is correct');
  console.log('  Next: run TestHarness.testAll() before any simulation run');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _ensureTab(ss, tabName, headers) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return { sheet: sheet, created: true, headerWarning: false };
  }

  // Tab exists — validate headers (read only, never overwrite)
  var existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  var mismatch = headers.some(function (h, i) { return existingHeaders[i] !== h; });
  return { sheet: sheet, created: false, headerWarning: mismatch };
}

function _ensureSeedRows(sheet, rows) {
  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow > 1) {
    var idCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    idCol.forEach(function (r) { if (r[0] !== '') existingIds[String(r[0])] = true; });
  }
  var inserted = 0;
  rows.forEach(function (row) {
    var id = String(row[0]);
    if (!existingIds[id]) {
      sheet.appendRow(row.map(function (v) { return v === null || v === undefined ? '' : v; }));
      existingIds[id] = true;
      inserted++;
    }
  });
  return inserted;
}

// ─── Schema Definitions ───────────────────────────────────────────────────────

function _buildSchemas() {
  return [

    // ── Config_BusinessProfile ────────────────────────────────────────────────
    {
      tabName: 'Config_BusinessProfile',
      headers: [
        'tenant_id', 'business_name', 'owner_name', 'phone', 'email',
        'city', 'province', 'country', 'timezone', 'currency',
        'deposit_rate', 'free_travel_km', 'travel_fee_per_km', 'card_surcharge_rate',
        'attendant_rate_hr', 'wind_limit_kmh', 'silly_string_fee', 'extension_fee',
        'min_discount_approval', 'hst_registered', 'season_start_month', 'season_end_month',
        'google_review_url', 'service_area_km', 'status', 'version',
        'effective_from', 'effective_to', 'changed_by', 'changed_at'
      ],
      rows: [
        [
          'nkr', 'Nova Kingdom Rentals', 'Harkirat Singh', '902-990-0005', 'booknovakingdom@gmail.com',
          'Bridgewater', 'NS', 'CA', 'America/Halifax', 'CAD',
          0.30, 15, 0.72, 0.05,
          35, 38, 500, 60,
          0.10, false, 4, 9,
          'https://g.page/r/CZXOs7GUjxR5EBI/review', null, 'active', 1,
          '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ]
      ]
    },

    // ── Config_InventoryUnits ─────────────────────────────────────────────────
    {
      tabName: 'Config_InventoryUnits',
      headers: [
        'unit_id', 'tenant_id', 'unit_name', 'unit_type', 'base_price', 'default_hours',
        'min_age', 'max_age', 'space_length_ft', 'space_width_ft', 'space_height_ft',
        'power_required', 'setup_time_min', 'teardown_time_min', 'description', 'tags',
        'availability_note', 'status', 'version', 'effective_from', 'effective_to',
        'changed_by', 'changed_at'
      ],
      rows: [
        ['nkr-U-001', 'nkr', 'Crown Rush 42',      'combo',    450, 4,  3, 15, 42,   18,   20,   true,  20, 15, '42 ft combo with slide and bounce area — biggest unit in the fleet', 'combo,slide,large',     'Arriving June 2026', 'coming_soon', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-002', 'nkr', 'Crown Quest',         'combo',    240, 4,  3, 12, null, null, null, true,  20, 15, 'Classic combo bouncer with slide',                                   'combo,slide',           null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-003', 'nkr', 'Crown Cascade',       'slide',    260, 4,  4, 15, null, null, null, true,  20, 15, 'Large water or dry slide',                                           'slide,water',           null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-004', 'nkr', 'Crown Climber',       'obstacle', 280, 4,  4, 15, null, null, null, true,  20, 15, 'Obstacle course with climbing elements',                             'obstacle,climbing',     null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-005', 'nkr', 'Crown Dino Combo',    'combo',    210, 4,  2,  8, null, null, null, true,  15, 15, 'Dinosaur-themed combo — best for toddlers and young kids',           'combo,toddler,dino',    null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-006', 'nkr', 'Crown Island Combo',  'combo',    310, 4,  3, 12, null, null, null, true,  20, 15, 'Tropical island theme combo with slide',                             'combo,slide,tropical',  null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-007', 'nkr', 'Crown Axe Challenge', 'axe',      180, 4, 10, null,null, null, null, false, 10, 10, 'Inflatable axe throwing game — adult and teen events',             'axe,teen,adult,game',   null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-008', 'nkr', 'Crown Kick Darts',    'game',     160, 4,  5, null,null, null, null, false, 10, 10, 'Inflatable kick darts game — all ages',                            'game,soccer,darts',     null,                 'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-U-009', 'nkr', 'Lawn Games Full Set', 'game',     250, 4, null,null,null, null, null, false, 20, 20, 'Full set of 12 lawn games — cornhole, bocce, giant Jenga, and more','lawn,games,all-ages,set',null,                'active',      1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Config_PhysicalAssets ─────────────────────────────────────────────────
    {
      tabName: 'Config_PhysicalAssets',
      headers: [
        'asset_id', 'tenant_id', 'unit_id', 'unit_name', 'serial_number',
        'purchase_date', 'condition', 'last_inspection_date', 'next_inspection_date',
        'storage_location', 'notes', 'status', 'changed_by', 'changed_at'
      ],
      rows: [
        ['nkr-A-001', 'nkr', 'nkr-U-001', 'Crown Rush 42',       null, null, 'excellent', null,         '2026-06-01', 'Garage', 'Arriving June 2026', 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-002', 'nkr', 'nkr-U-002', 'Crown Quest',          null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-003', 'nkr', 'nkr-U-003', 'Crown Cascade',        null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-004', 'nkr', 'nkr-U-004', 'Crown Climber',        null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-005', 'nkr', 'nkr-U-005', 'Crown Dino Combo',     null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-006', 'nkr', 'nkr-U-006', 'Crown Island Combo',   null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-007', 'nkr', 'nkr-U-007', 'Crown Axe Challenge',  null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-008', 'nkr', 'nkr-U-008', 'Crown Kick Darts',     null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', null,                 'available', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-A-009', 'nkr', 'nkr-U-009', 'Lawn Games Full Set',  null, null, 'good',      '2026-04-01', '2026-09-30', 'Garage', '12 games in set',    'available', 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Config_Packages ───────────────────────────────────────────────────────
    {
      tabName: 'Config_Packages',
      headers: [
        'package_id', 'tenant_id', 'package_name', 'package_type', 'base_price',
        'default_hours', 'description', 'tags', 'status', 'version',
        'effective_from', 'effective_to', 'changed_by', 'changed_at'
      ],
      rows: [
        ['nkr-PKG-001', 'nkr', 'Field Day Bundle — Standard',  'school', 880, 5, 'Crown Rush 42 + Crown Axe Challenge + Lawn Games Full Set. Ideal for school field days 150–300 students.',           'school,field-day,large',  'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PKG-002', 'nkr', 'Birthday Starter',             'bundle', 210, 4, 'Crown Dino Combo — perfect starter for birthday parties with younger kids.',                                        'birthday,toddler,starter','active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PKG-003', 'nkr', 'Ultimate Party Bundle',        'bundle', 620, 4, 'Crown Island Combo + Crown Axe Challenge + Crown Kick Darts. Mix of inflatables and games for mixed-age crowds.', 'birthday,mixed-age,bundle','active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Config_PackageComponents ──────────────────────────────────────────────
    {
      tabName: 'Config_PackageComponents',
      headers: ['component_id', 'package_id', 'tenant_id', 'unit_id', 'unit_name', 'quantity', 'notes'],
      rows: [
        ['nkr-PKG-001-C-001', 'nkr-PKG-001', 'nkr', 'nkr-U-001', 'Crown Rush 42',       1, null],
        ['nkr-PKG-001-C-002', 'nkr-PKG-001', 'nkr', 'nkr-U-007', 'Crown Axe Challenge', 1, null],
        ['nkr-PKG-001-C-003', 'nkr-PKG-001', 'nkr', 'nkr-U-009', 'Lawn Games Full Set', 1, null],
        ['nkr-PKG-002-C-001', 'nkr-PKG-002', 'nkr', 'nkr-U-005', 'Crown Dino Combo',    1, null],
        ['nkr-PKG-003-C-001', 'nkr-PKG-003', 'nkr', 'nkr-U-006', 'Crown Island Combo',  1, null],
        ['nkr-PKG-003-C-002', 'nkr-PKG-003', 'nkr', 'nkr-U-007', 'Crown Axe Challenge', 1, null],
        ['nkr-PKG-003-C-003', 'nkr-PKG-003', 'nkr', 'nkr-U-008', 'Crown Kick Darts',    1, null]
      ]
    },

    // ── Config_PricingRules ───────────────────────────────────────────────────
    {
      tabName: 'Config_PricingRules',
      headers: [
        'rule_id', 'tenant_id', 'rule_type', 'rule_name',
        'trigger_field', 'trigger_operator', 'trigger_value',
        'calc_type', 'calc_value', 'calc_basis', 'threshold_value',
        'applies_to', 'requires_approval', 'priority', 'status', 'version',
        'effective_from', 'effective_to', 'changed_by', 'changed_at'
      ],
      rows: [
        // nkr-PR-007 calc_value is intentionally null — discount_pct is passed at runtime
        ['nkr-PR-001', 'nkr', 'travel',    'Travel Fee — Per km over 15',                    'distance_km',         'gt',     '15',   'per_unit_over_threshold', 0.72, 'chargeable_km',       15,   null, false, 10, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-002', 'nkr', 'extension', 'Booking Extension Fee',                          'extension_requested', 'eq',     'true', 'flat',                    60,   null,                  null, null, false, 20, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-003', 'nkr', 'surcharge', 'Credit Card Processing Surcharge',               'payment_method',      'in',     'credit_card,card', 'percent',    0.05, 'quote_total',         null, null, false, 30, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-004', 'nkr', 'deposit',   'Standard Deposit — 30%',                         null,                  'always', null,   'percent',                 0.30, 'quote_total_with_fees',null, null, false, 40, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-005', 'nkr', 'attendant', 'Event Attendant — Per Hour',                     'attendant_hours',     'gt',     '0',    'per_unit_over_threshold', 35,   'attendant_hours',     0,    null, false, 50, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-006', 'nkr', 'damage',    'Silly String Damage Fee',                        'silly_string_damage', 'eq',     'true', 'flat',                    500,  null,                  null, null, false, 60, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-PR-007', 'nkr', 'discount',  'Owner-Approved Discount — Max 10% Before Approval','discount_pct',      'gt',     '0',    'percent',                 null, 'quote_subtotal',      null, null, true,  70, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Config_MessageTemplates ───────────────────────────────────────────────
    {
      tabName: 'Config_MessageTemplates',
      headers: [
        'template_id', 'tenant_id', 'template_name', 'trigger_event', 'reply_mode',
        'channel', 'subject_template', 'body_template', 'tags', 'status', 'version',
        'effective_from', 'effective_to', 'changed_by', 'changed_at'
      ],
      rows: [
        [
          'nkr-MT-001', 'nkr', 'Quote — Full Quote Response', 'quote_or_availability', 'quote', 'email',
          'Nova Kingdom Rentals Quote — {{booking_id}}',
          'Hi {{first_name}},\n\nThanks for reaching out — happy to put this together for you.\n\nHere\'s your quote for {{event_date}}:\n\n{{quote_line_items}}\n\nTravel fee: {{travel_fee}}\n{{attendant_line}}\nSubtotal: {{subtotal}}\n{{card_surcharge_line}}\nTotal: {{quote_total}}\nDeposit to confirm (30%): {{deposit_amount}}\n\nTo lock in your date, I just need the deposit — {{payment_instructions}}.\n\nLet me know if you have any questions.\n— Harkirat | Nova Kingdom Rentals | 902-990-0005',
          'quote,email', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-002', 'nkr', 'Acknowledge — Missing Info, Single Question', 'quote_or_availability', 'ask_once', 'email',
          'Re: Nova Kingdom Rentals',
          'Hi {{first_name}},\n\nThanks for reaching out!\n\nTo get you an accurate quote, I just need one thing: {{missing_field_question}}\n\nOnce I have that I\'ll get your quote over right away.\n— Harkirat | Nova Kingdom Rentals | 902-990-0005',
          'ask,missing-info', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-003', 'nkr', 'Acknowledge — General Inquiry', 'customer_inquiry', 'acknowledge', 'email',
          'Re: Nova Kingdom Rentals',
          'Hi {{first_name}},\n\nThanks for getting in touch! I got your message and will follow up shortly.\n\nIf you need anything urgently, feel free to call or text: 902-990-0005.\n— Harkirat | Nova Kingdom Rentals',
          'acknowledge', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-004', 'nkr', 'Deposit Chase — Follow-Up', 'deposit_overdue', 'deposit_chase', 'email',
          'Your Nova Kingdom Booking — Deposit Needed to Confirm',
          'Hi {{first_name}},\n\nJust following up on your booking for {{event_date}} — I still have your date held but need the deposit to lock it in.\n\nDeposit amount: {{deposit_amount}}\n{{payment_instructions}}\n\nIf your plans have changed, no worries — just let me know so I can release the date.\n— Harkirat | Nova Kingdom Rentals | 902-990-0005',
          'deposit,follow-up', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-005', 'nkr', 'Post-Event — Satisfaction + Google Review Request', 'event_completed', 'post_event', 'email',
          'Thanks for booking with Nova Kingdom Rentals!',
          'Hi {{first_name}},\n\nHope {{event_date}} was a fantastic time! It was great being part of it.\n\nIf you have a moment, a Google review would mean a lot — it\'s the best way to help other families find us:\n{{google_review_url}}\n\nHope to see you again next season!\n— Harkirat | Nova Kingdom Rentals | 902-990-0005',
          'post-event,review', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-006', 'nkr', 'School — Field Day Quote Email', 'school_or_community_event', 'quote', 'email',
          'Nova Kingdom Rentals — Inflatables for {{school_name}} Field Day',
          'Dear {{first_name}},\n\nI\'m Harkirat with Nova Kingdom Rentals in Bridgewater — we provide inflatable entertainment and lawn games for school events across the South Shore, with full delivery, setup, and teardown. We carry commercial general liability insurance ($2M) and can provide a COI listing {{school_name}}.\n\nPROPOSED SETUP — {{event_date}}\n{{quote_line_items}}\nTravel fee: {{travel_fee}}\nTOTAL: {{quote_total}}\n\nDeposit to confirm: {{deposit_amount}}\nDuration: {{duration_hours}} hours\n\nHappy to adjust based on student count or budget. COI and rental agreement available on request.\n— Harkirat Singh | Nova Kingdom Rentals | 902-990-0005 | booknovakingdom@gmail.com',
          'school,coi,email', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ],
        [
          'nkr-MT-007', 'nkr', 'Mass Cancellation — Weather or Safety', 'mass_cancellation', 'none', 'sms',
          null,
          '{{first_name}}, Harkirat here. Due to {{cancellation_reason}}, I can\'t safely deliver this weekend. Your deposit carries forward to any new date — priority pick guaranteed. I\'ll reach out personally to reschedule. — 902-990-0005',
          'cancellation,weather,sms', 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'
        ]
      ]
    },

    // ── Config_RiskRules ──────────────────────────────────────────────────────
    {
      tabName: 'Config_RiskRules',
      headers: [
        'rule_id', 'tenant_id', 'rule_name', 'condition_field', 'condition_operator',
        'condition_value', 'risk_action', 'severity', 'reason', 'notify_owner',
        'status', 'version', 'effective_from', 'effective_to', 'changed_by', 'changed_at'
      ],
      rows: [
        ['nkr-RR-001', 'nkr', 'Injury Incident Detected',          'intent',                      'eq',      'injury_incident',                      'escalate',      'critical', 'Injury incident — Harkirat must respond personally. Insurance must be notified within 24 hrs.',                     true,  'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-002', 'nkr', 'Legal Threat Detected',             'intent',                      'eq',      'legal_threat',                         'escalate',      'critical', 'Legal language detected — no automated response. Harkirat only. Do not admit fault in writing.',                true,  'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-003', 'nkr', 'Abusive Message',                   'intent',                      'eq',      'abusive',                              'manual_review', 'high',     'Abusive language — Harkirat reviews before any response.',                                                          true,  'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-004', 'nkr', 'Cancellation Request',              'intent',                      'eq',      'cancellation_request',                 'manual_review', 'high',     'Cancellation — deposit policy and owner decision required before responding.',                                    true,  'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-005', 'nkr', 'Discount Negotiation',              'intent',                      'eq',      'negotiation_or_discount',              'manual_review', 'medium',   'Discount request — any discount over 10% requires owner approval.',                                              false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-006', 'nkr', 'Low AI Confidence',                 'confidence',                  'lt',      '0.75',                                 'manual_review', 'medium',   'AI classification confidence below threshold — human review required.',                                           false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-007', 'nkr', 'Blocklisted Sender',                'sender_email',                'in',      'smilesandchucklesbrookfield@gmail.com','no_draft',      'critical', 'Sender is on permanent blocklist — no contact, no draft, no response.',                                          false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-008', 'nkr', 'Out-of-Office Autoreply',           'intent',                      'eq',      'out_of_office_autoreply',              'no_draft',      'low',      'Autoreply detected — no response needed.',                                                                        false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-009', 'nkr', 'Last Sender Is Business',           'last_sender_is_business',     'is_true', null,                                   'no_draft',      'low',      'Last message in thread was sent by Harkirat — no reply needed.',                                                 false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-010', 'nkr', 'Draft Contains Ungrounded Price',   'draft_contains_unlisted_price','is_true', null,                                  'manual_review', 'high',     'Draft contains a $ amount not in the approved Price Block — possible AI price hallucination.',                 false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-RR-011', 'nkr', 'Do Not Contact Flag',               'customer_do_not_contact',     'is_true', null,                                   'no_draft',      'critical', 'Customer is marked Do Not Contact in CRM — no response of any kind.',                                            false, 'active', 1, '2026-05-20', null, 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Config_OpsControls ────────────────────────────────────────────────────
    // CRITICAL: simulation_mode (nkr-OC-001) = true
    //           auto_draft_enabled (nkr-OC-002) = false
    // Never change either until full simulation testing passes.
    {
      tabName: 'Config_OpsControls',
      headers: [
        'control_id', 'tenant_id', 'control_key', 'control_value',
        'data_type', 'description', 'status', 'changed_by', 'changed_at'
      ],
      rows: [
        ['nkr-OC-001', 'nkr', 'simulation_mode',           'true',                   'boolean', 'When true: all writes go to Sim_ prefixed tabs, no Gmail drafts created, no Calendar events. Set to false only after full simulation testing passes.',                                  'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-002', 'nkr', 'auto_draft_enabled',        'false',                  'boolean', 'Master switch for AI draft creation. false = system classifies and logs only, no drafts created. NEVER set auto_send_enabled — drafts only.',                                         'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-003', 'nkr', 'ai_provider',               'anthropic',              'string',  'AI provider used by worker scripts. Only "anthropic" is supported. Never "openai" — old system broke due to OpenAI JSON output failures.',                                             'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-004', 'nkr', 'ai_model_classify',         'claude-haiku-4-5-20251001','string','Claude model for AI Call #1 (intent classification + readiness). Use Haiku for speed and cost.',                                                                                       'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-005', 'nkr', 'ai_model_draft',            'claude-sonnet-4-6',      'string',  'Claude model for AI Call #2 (reply draft generation). Use Sonnet for quality.',                                                                                                        'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-006', 'nkr', 'confidence_threshold',      '0.75',                   'number',  'Minimum AI confidence score to allow draft creation. Below this → MANUAL_REVIEW. Adjust up if too many incorrect drafts.',                                                             'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-007', 'nkr', 'max_drafts_per_thread_per_day','1',                   'number',  'Maximum number of drafts the system will create for a single thread within a 24-hour window. Prevents reply storms.',                                                                  'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-008', 'nkr', 'blocklist_enforced',        'true',                   'boolean', 'When true, Config_RiskRules blocklist rule (nkr-RR-007) is enforced. Never set to false.',                                                                                             'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-009', 'nkr', 'intake_script_enabled',     'true',                   'boolean', 'NK Quote Intake (Web3Forms processing) is live. Do not disable unless instructed by Harkirat.',                                                                                        'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-010', 'nkr', 'inbox_ai_enabled',          'false',                  'boolean', 'AI inbox processing (old bound script replacement). false = not yet deployed. Set true only after Phase 1b testing complete.',                                                         'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-011', 'nkr', 'booking_id_counter_tab',    'System',                 'string',  'Tab name where booking ID counter is stored (cell B2). Default: System. Must match live CRM.',                                                                                         'active', 'Harkirat Singh', '2026-05-20T00:00:00'],
        ['nkr-OC-012', 'nkr', 'booking_id_prefix',         'NK',                     'string',  'Prefix for booking IDs (e.g. NK → NK-2026-016). Format: {prefix}-{YYYY}-{NNN}.',                                                                                                      'active', 'Harkirat Singh', '2026-05-20T00:00:00']
      ]
    },

    // ── Ops_IdempotencyLog — starts empty ────────────────────────────────────
    {
      tabName: 'Ops_IdempotencyLog',
      headers: [
        'idempotency_key', 'tenant_id', 'status', 'worker_script',
        'started_at', 'completed_at', 'result_type', 'booking_id',
        'customer_id', 'draft_id', 'skip_reason', 'error_message', 'trace_id'
      ],
      rows: []
    },

    // ── Ops_Metrics — starts empty ────────────────────────────────────────────
    {
      tabName: 'Ops_Metrics',
      headers: [
        'metric_id', 'tenant_id', 'event_type', 'booking_id', 'customer_id',
        'worker_script', 'value', 'unit', 'metadata', 'trace_id', 'timestamp'
      ],
      rows: []
    },

    // ── Ops_BookingLifecycleLog — starts empty ────────────────────────────────
    {
      tabName: 'Ops_BookingLifecycleLog',
      headers: [
        'log_id', 'tenant_id', 'booking_id', 'customer_id', 'entity_type',
        'entity_id', 'from_state', 'to_state', 'transition_event', 'triggered_by',
        'notes', 'trace_id', 'timestamp'
      ],
      rows: []
    },

    // ── Sim_Actions — starts empty (runtime-written by ExecutionEnv) ──────────
    {
      tabName: 'Sim_Actions',
      headers: [
        'timestamp', 'action_type', 'summary', 'payload_json',
        'trace_id', 'simulation_run_id', 'tenant_id', 'environment'
      ],
      rows: []
    },

    // ── Sim_Drafts — starts empty ─────────────────────────────────────────────
    {
      tabName: 'Sim_Drafts',
      headers: [
        'timestamp', 'to_email', 'subject', 'full_body',
        'trace_id', 'simulation_run_id', 'tenant_id', 'environment'
      ],
      rows: []
    },

    // ── Sim_AutomationQueue — starts empty ────────────────────────────────────
    {
      tabName: 'Sim_AutomationQueue',
      headers: [
        'timestamp', 'task_id', 'message_id', 'customer_id', 'email',
        'intent', 'readiness', 'decision', 'mode', 'confidence',
        'event_date', 'rental_item', 'status', 'trace_id',
        'simulation_run_id', 'tenant_id', 'environment'
      ],
      rows: []
    },

    // ── Sim_ManualReview — starts empty ───────────────────────────────────────
    {
      tabName: 'Sim_ManualReview',
      headers: [
        'manual_review_id', 'timestamp', 'customer_email', 'thread_link',
        'risk_reason', 'severity', 'recommended_owner_action', 'urgency', 'trace_id',
        'simulation_run_id', 'tenant_id', 'environment'
      ],
      rows: []
    }

  ]; // end schemas
}
