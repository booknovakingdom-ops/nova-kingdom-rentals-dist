/**
 * ConfigLoader — RentalOps Core Library
 *
 * Reads all Config_* tabs from the tenant's spreadsheet and returns
 * typed, validated config objects. All business logic reads from here;
 * no hardcoded values anywhere else in the library.
 *
 * Cache: configs are cached in memory per execution (script lifetime).
 * Call ConfigLoader.clearCache() in tests to reset between cases.
 */

var ConfigLoader = (function () {
  var _cache = {};

  function _getSheet(spreadsheetId, tabName) {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) throw new Error('ConfigLoader: tab not found: ' + tabName);
    return sheet;
  }

  function _sheetToObjects(sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0].map(function (h) { return String(h).trim(); });
    return data.slice(1).map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
  }

  function _activeRows(rows) {
    return rows.filter(function (r) {
      return !r.status || r.status === 'active' || r.status === 'coming_soon';
    });
  }

  /**
   * Returns the single active business profile row for a tenant.
   * Throws if not found.
   */
  function getBusinessProfile(spreadsheetId, tenantId) {
    var key = 'bp_' + tenantId;
    if (_cache[key]) return _cache[key];
    var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_BusinessProfile'));
    var match = rows.filter(function (r) {
      return r.tenant_id === tenantId && r.status === 'active' && !r.effective_to;
    });
    if (!match.length) throw new Error('ConfigLoader: no active business profile for ' + tenantId);
    var profile = match[0];
    // Parse numeric fields
    ['deposit_rate', 'free_travel_km', 'travel_fee_per_km', 'card_surcharge_rate',
     'attendant_rate_hr', 'wind_limit_kmh', 'silly_string_fee', 'extension_fee',
     'min_discount_approval'].forEach(function (f) {
      if (profile[f] !== '' && profile[f] !== null) profile[f] = Number(profile[f]);
    });
    profile.hst_registered = profile.hst_registered === true || profile.hst_registered === 'TRUE';
    _cache[key] = profile;
    return profile;
  }

  /**
   * Returns all active inventory units for a tenant, keyed by unit_id.
   */
  function getInventoryUnits(spreadsheetId, tenantId) {
    var key = 'units_' + tenantId;
    if (_cache[key]) return _cache[key];
    var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_InventoryUnits'));
    var result = {};
    _activeRows(rows.filter(function (r) { return r.tenant_id === tenantId; }))
      .forEach(function (r) {
        r.base_price = Number(r.base_price);
        r.default_hours = Number(r.default_hours);
        result[r.unit_id] = r;
      });
    _cache[key] = result;
    return result;
  }

  /**
   * Returns all active pricing rules for a tenant, sorted by priority ascending.
   */
  function getPricingRules(spreadsheetId, tenantId) {
    var key = 'pricing_' + tenantId;
    if (_cache[key]) return _cache[key];
    var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_PricingRules'));
    var active = _activeRows(rows.filter(function (r) { return r.tenant_id === tenantId; }));
    active.forEach(function (r) {
      r.calc_value = r.calc_value !== '' ? Number(r.calc_value) : null;
      r.threshold_value = r.threshold_value !== '' ? Number(r.threshold_value) : null;
      r.priority = Number(r.priority);
      r.requires_approval = r.requires_approval === true || r.requires_approval === 'TRUE';
    });
    active.sort(function (a, b) { return a.priority - b.priority; });
    _cache[key] = active;
    return active;
  }

  /**
   * Returns all active message templates for a tenant.
   * Optionally filtered by trigger_event and/or reply_mode.
   */
  function getMessageTemplates(spreadsheetId, tenantId, filterEvent, filterMode) {
    var key = 'templates_' + tenantId;
    if (!_cache[key]) {
      var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_MessageTemplates'));
      _cache[key] = _activeRows(rows.filter(function (r) { return r.tenant_id === tenantId; }));
    }
    var results = _cache[key];
    if (filterEvent) results = results.filter(function (r) { return r.trigger_event === filterEvent; });
    if (filterMode)  results = results.filter(function (r) { return r.reply_mode === filterMode; });
    return results;
  }

  /**
   * Returns all active risk rules for a tenant.
   */
  function getRiskRules(spreadsheetId, tenantId) {
    var key = 'risk_' + tenantId;
    if (_cache[key]) return _cache[key];
    var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_RiskRules'));
    var active = _activeRows(rows.filter(function (r) { return r.tenant_id === tenantId; }));
    active.forEach(function (r) {
      r.notify_owner = r.notify_owner === true || r.notify_owner === 'TRUE';
    });
    _cache[key] = active;
    return active;
  }

  /**
   * Returns all active ops controls for a tenant as a key→value map.
   * Values are parsed to their declared data_type.
   */
  function getOpsControls(spreadsheetId, tenantId) {
    var key = 'controls_' + tenantId;
    if (_cache[key]) return _cache[key];
    var rows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_OpsControls'));
    var result = {};
    rows.filter(function (r) { return r.tenant_id === tenantId && r.status === 'active'; })
      .forEach(function (r) {
        var v = String(r.control_value);
        switch (r.data_type) {
          case 'boolean': result[r.control_key] = v === 'true' || v === 'TRUE'; break;
          case 'number':  result[r.control_key] = Number(v); break;
          case 'json':    try { result[r.control_key] = JSON.parse(v); } catch (e) { result[r.control_key] = v; } break;
          default:        result[r.control_key] = v;
        }
      });
    _cache[key] = result;
    return result;
  }

  /**
   * Returns all active packages for a tenant, with components attached.
   */
  function getPackages(spreadsheetId, tenantId) {
    var key = 'packages_' + tenantId;
    if (_cache[key]) return _cache[key];
    var pkgRows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_Packages'));
    var compRows = _sheetToObjects(_getSheet(spreadsheetId, 'Config_PackageComponents'));
    var active = _activeRows(pkgRows.filter(function (r) { return r.tenant_id === tenantId; }));
    active.forEach(function (pkg) {
      pkg.base_price = Number(pkg.base_price);
      pkg.default_hours = Number(pkg.default_hours);
      pkg.components = compRows.filter(function (c) { return c.package_id === pkg.package_id; });
    });
    _cache[key] = active;
    return active;
  }

  function clearCache() {
    _cache = {};
  }

  return {
    getBusinessProfile:  getBusinessProfile,
    getInventoryUnits:   getInventoryUnits,
    getPricingRules:     getPricingRules,
    getMessageTemplates: getMessageTemplates,
    getRiskRules:        getRiskRules,
    getOpsControls:      getOpsControls,
    getPackages:         getPackages,
    clearCache:          clearCache
  };
})();
