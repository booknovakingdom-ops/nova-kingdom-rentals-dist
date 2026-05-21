# Phase 0 — Manual CRM Tab Setup Instructions

These tabs must be created manually in the live CRM spreadsheet:
**"AI Lead Engine CRM — Nova Kingdom Rentals"**

Do this BEFORE deploying any RentalOps Core library code.
Do NOT modify any existing tabs (Website Quote Leads, Automation Queue, Booked Customers, System, etc.).

---

## Pre-Flight Checklist

- [ ] Open the live CRM spreadsheet
- [ ] Confirm existing tabs are intact: Website Quote Leads, Automation Queue, Booked Customers, System, Processing Log, Error Log, Contact/Customer Log, DNC
- [ ] Do NOT rename, delete, or reorder existing tabs
- [ ] Create each new tab in the order listed below

---

## Tab Creation Order

Create tabs in this exact order (order matters for script dependency resolution):

1. `Config_BusinessProfile`
2. `Config_InventoryUnits`
3. `Config_PhysicalAssets`
4. `Config_Packages`
5. `Config_PackageComponents`
6. `Config_PricingRules`
7. `Config_MessageTemplates`
8. `Config_RiskRules`
9. `Config_OpsControls`
10. `Ops_IdempotencyLog`
11. `Ops_Metrics`
12. `Ops_BookingLifecycleLog`

---

## How to Create Each Tab

For each tab:

1. Right-click any existing tab → **Insert sheet**
2. Name it exactly as shown (case-sensitive, underscores not spaces)
3. In Row 1, enter the column headers from the JSON schema file for that tab (the `columns[].name` values, in order)
4. Enter the seed data rows from `nkr_seed_data` in the JSON schema file
5. Freeze Row 1 (View → Freeze → 1 row)
6. Format Row 1 as bold

---

## Column Headers by Tab

### Config_BusinessProfile
`tenant_id` | `business_name` | `owner_name` | `phone` | `email` | `city` | `province` | `country` | `timezone` | `currency` | `deposit_rate` | `free_travel_km` | `travel_fee_per_km` | `card_surcharge_rate` | `attendant_rate_hr` | `wind_limit_kmh` | `silly_string_fee` | `extension_fee` | `min_discount_approval` | `hst_registered` | `season_start_month` | `season_end_month` | `google_review_url` | `service_area_km` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed row:** See `00_business_profile.json` → `nkr_seed_data[0]`

---

### Config_InventoryUnits
`unit_id` | `tenant_id` | `unit_name` | `unit_type` | `base_price` | `default_hours` | `min_age` | `max_age` | `space_length_ft` | `space_width_ft` | `space_height_ft` | `power_required` | `setup_time_min` | `teardown_time_min` | `description` | `tags` | `availability_note` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed rows:** 9 rows (nkr-U-001 through nkr-U-009). See `01_inventory_units.json` → `nkr_seed_data`

**Note:** Crown Rush 42 (nkr-U-001) status = `coming_soon` and availability_note = `Arriving June 2026`

---

### Config_PhysicalAssets
`asset_id` | `tenant_id` | `unit_id` | `unit_name` | `serial_number` | `purchase_date` | `condition` | `last_inspection_date` | `next_inspection_date` | `storage_location` | `notes` | `status` | `changed_by` | `changed_at`

**Seed rows:** 9 rows (nkr-A-001 through nkr-A-009). See `02_physical_assets.json` → `nkr_seed_data`

---

### Config_Packages
`package_id` | `tenant_id` | `package_name` | `package_type` | `base_price` | `default_hours` | `description` | `tags` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed rows:** 3 rows (nkr-PKG-001 through nkr-PKG-003). See `03_packages.json` → `nkr_seed_data`

---

### Config_PackageComponents
`component_id` | `package_id` | `tenant_id` | `unit_id` | `unit_name` | `quantity` | `notes`

**Seed rows:** 7 rows. See `04_package_components.json` → `nkr_seed_data`

---

### Config_PricingRules
`rule_id` | `tenant_id` | `rule_type` | `rule_name` | `trigger_field` | `trigger_operator` | `trigger_value` | `calc_type` | `calc_value` | `calc_basis` | `threshold_value` | `applies_to` | `requires_approval` | `priority` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed rows:** 7 rows (nkr-PR-001 through nkr-PR-007). See `05_pricing_rules.json` → `nkr_seed_data`

**Important:** nkr-PR-007 (discount rule) has `calc_value` = blank — this is intentional.

---

### Config_MessageTemplates
`template_id` | `tenant_id` | `template_name` | `trigger_event` | `reply_mode` | `channel` | `subject_template` | `body_template` | `tags` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed rows:** 7 rows (nkr-MT-001 through nkr-MT-007). See `06_message_templates.json` → `nkr_seed_data`

**Note:** body_template cells contain multi-line text with `\n` line breaks. In Google Sheets, use Ctrl+Enter to insert line breaks inside a cell.

---

### Config_RiskRules
`rule_id` | `tenant_id` | `rule_name` | `condition_field` | `condition_operator` | `condition_value` | `risk_action` | `severity` | `reason` | `notify_owner` | `status` | `version` | `effective_from` | `effective_to` | `changed_by` | `changed_at`

**Seed rows:** 11 rows (nkr-RR-001 through nkr-RR-011). See `07_risk_rules.json` → `nkr_seed_data`

---

### Config_OpsControls
`control_id` | `tenant_id` | `control_key` | `control_value` | `data_type` | `description` | `status` | `changed_by` | `changed_at`

**Seed rows:** 12 rows (nkr-OC-001 through nkr-OC-012). See `08_ops_controls.json` → `nkr_seed_data`

**CRITICAL:** `simulation_mode` (nkr-OC-001) must be set to `true` on initial setup.
`auto_draft_enabled` (nkr-OC-002) must be `false`.
Do not change either until full simulation testing passes.

---

### Ops_IdempotencyLog
`idempotency_key` | `tenant_id` | `status` | `worker_script` | `started_at` | `completed_at` | `result_type` | `booking_id` | `customer_id` | `draft_id` | `skip_reason` | `error_message` | `trace_id`

**Seed rows:** None. Tab starts empty. Written by code at runtime.

---

### Ops_Metrics
`metric_id` | `tenant_id` | `event_type` | `booking_id` | `customer_id` | `worker_script` | `value` | `unit` | `metadata` | `trace_id` | `timestamp`

**Seed rows:** None. Tab starts empty. Written by code at runtime.

---

### Ops_BookingLifecycleLog
`log_id` | `tenant_id` | `booking_id` | `customer_id` | `entity_type` | `entity_id` | `from_state` | `to_state` | `transition_event` | `triggered_by` | `notes` | `trace_id` | `timestamp`

**Seed rows:** None. Tab starts empty. Written by code at runtime.

---

## Post-Setup Verification

After creating all tabs and entering seed data, verify:

- [ ] All 12 new tabs exist with correct names (no typos, no extra spaces)
- [ ] Config_BusinessProfile has 1 data row — tenant_id = `nkr`, hst_registered = FALSE
- [ ] Config_InventoryUnits has 9 data rows — base prices match nk-source-of-truth.md exactly
- [ ] Config_PricingRules — attendant_rate row shows $35 (NOT $30 — old CRM value was stale)
- [ ] Config_OpsControls — simulation_mode = TRUE, auto_draft_enabled = FALSE
- [ ] Config_RiskRules — nkr-RR-007 blocklist entry = `smilesandchucklesbrookfield@gmail.com`
- [ ] Ops_ tabs are empty (no data rows yet)
- [ ] Existing tabs (Website Quote Leads, Automation Queue, etc.) are UNCHANGED

---

## What NOT to Touch

- DO NOT create triggers — none yet
- DO NOT deploy any Apps Script — library not yet published
- DO NOT modify nk-quote-intake.js — it continues running unchanged
- DO NOT rename any existing tabs
- DO NOT change System tab B2 (booking ID counter)
