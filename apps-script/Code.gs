// ============================================================
//  Cross-Platform Attribution Dashboard
//  Google Apps Script — Code.gs
//  Northwind Consulting — Creator & Ecommerce
// ============================================================

const DATA_SHEET_ID = '1c86yKsvHafajJSLYiHDrFQ6Evgx9rxGJTalRSEI46l0';
const TRAFFIC_TAB   = 'db_traffic';
const CACHE_KEY     = 'xplat_v1';
const CACHE_TTL     = 1200; // 20 min — trigger every 10 min keeps it always warm


// ── Entry point ────────────────────────────────────────────────────────────────
function doGet() {
  try {
    return ContentService
      .createTextOutput(JSON.stringify(getCrossPlatformData()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Called from client via google.script.run ──────────────────────────────────
function getCrossPlatformData() {
  const cache  = CacheService.getScriptCache();
  const cached = _getChunks(cache);
  if (cached) return JSON.parse(cached);

  const ss    = SpreadsheetApp.openById(DATA_SHEET_ID);
  const sheet = ss.getSheetByName(TRAFFIC_TAB);
  if (!sheet) throw new Error('Tab not found: ' + TRAFFIC_TAB);

  const vals    = sheet.getDataRange().getValues();
  const headers = vals[0].map(String);
  function col(n) { return headers.indexOf(n); }

  const iPlatform  = col('platform');
  const iUtmSource = col('utm_source');
  const iDate      = col('session_date');
  const iCampaign  = col('utm_campaign');
  const iSessions  = col('sessions');
  const iOrders    = col('orders');
  const iRevenue   = col('revenue');
  const iBounces   = col('bounces');
  const iSessionId = col('session_id');

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

  const rows      = [];
  const years     = new Set();
  const months    = new Set();
  const campaigns = new Set();
  const platforms = new Set();

  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (!row[iSessionId]) continue;

    // Prefer 'platform' field, fall back to utm_source, then 'direct'
    const rawPlatform  = String(row[iPlatform]  || '').trim().toLowerCase();
    const rawUtmSource = String(row[iUtmSource] || '').trim().toLowerCase();
    const platform     = rawPlatform || rawUtmSource || 'direct';

    const rawDate = row[iDate];
    const d       = rawDate ? new Date(rawDate) : null;
    const yr      = d ? String(d.getFullYear())                   : '';
    const mo      = d ? String(d.getMonth() + 1).padStart(2,'0') : '';
    const mKey    = yr && mo ? `${yr}-${mo}` : '';
    const mLabel  = d ? `${MONTH_NAMES[d.getMonth()]} ${yr}`     : '';

    const campaign = String(row[iCampaign] || '').trim() || '(none)';
    const sessions = parseFloat(row[iSessions]) || 0;
    const orders   = parseFloat(row[iOrders])   || 0;
    const revenue  = parseFloat(row[iRevenue])  || 0;
    const bounces  = parseFloat(row[iBounces])  || 0;

    rows.push({ platform, yr, mo, mKey, mLabel, campaign,
                sessions, orders, revenue, bounces });

    if (yr)                    years.add(yr);
    if (mo)                    months.add(mo);
    if (campaign !== '(none)') campaigns.add(campaign);
    platforms.add(platform);
  }

  const MONTH_ORDER = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  const result = {
    rows,
    fo: {
      years:     [...years].sort().reverse(),
      months:    MONTH_ORDER.filter(m => months.has(m))
                   .map(m => ({ value: m, label: MONTH_NAMES[parseInt(m) - 1] })),
      campaigns: [...campaigns].sort(),
      platforms: [...platforms].sort(),
    },
  };

  _putChunks(cache, JSON.stringify(result));
  return result;
}


// ── Cache helpers ──────────────────────────────────────────────────────────────
function _putChunks(cache, json) {
  try {
    const CHUNK = 90000;
    const total = Math.ceil(json.length / CHUNK);
    const pairs = { '__xplat_chunks__': String(total) };
    for (let i = 0; i < total; i++) {
      pairs[CACHE_KEY + '_' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    }
    cache.putAll(pairs, CACHE_TTL);
  } catch(e) { console.log('Cache write failed:', e); }
}

function _getChunks(cache) {
  try {
    const meta = cache.get('__xplat_chunks__');
    if (!meta) return null;
    const total  = parseInt(meta);
    const keys   = Array.from({ length: total }, (_, i) => CACHE_KEY + '_' + i);
    const stored = cache.getAll(keys);
    if (Object.keys(stored).length !== total) return null;
    return keys.map(k => stored[k]).join('');
  } catch(e) { return null; }
}


// ── Utilities ──────────────────────────────────────────────────────────────────
function clearCache() {
  CacheService.getScriptCache().remove('__xplat_chunks__');
  Logger.log('Cache cleared.');
}

function warmCache() {
  clearCache();
  getCrossPlatformData();
  Logger.log('Cache warmed at ' + new Date().toLocaleString());
}

function createWarmCacheTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'warmCache')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('warmCache').timeBased().everyMinutes(10).create();
  Logger.log('Trigger created — fires every 10 min, cache TTL 20 min.');
}

function testDataAccess() {
  clearCache();
  const data = getCrossPlatformData();
  Logger.log('Total rows: ' + data.rows.length);
  Logger.log('Platforms: ' + JSON.stringify(data.fo.platforms));
  Logger.log('Filter options: ' + JSON.stringify(data.fo));
}
