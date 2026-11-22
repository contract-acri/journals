/** Minimal table layer over Google Sheets. Rows are plain objects keyed by header. */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(prop_('SHEET_ID')); }
function sh_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Missing sheet "' + name + '". Run setup() once.');
  return s;
}
const JSON_COLS = { authors: 1, affiliations: 1, declarations: 1, roles: 1, scores: 1, json: 1, flags: 1, keywords: 1, subject: 1, subjects: 1, journals: 1, content: 1, audience: 1, stats: 1, config: 1, tags: 1, signMeta: 1 };

function decode_(k, v) {
  if (v === '' || v === null) return JSON_COLS[k] ? null : '';
  if (JSON_COLS[k] && typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
  if (v instanceof Date) return v.toISOString();
  return v;
}
function encode_(k, v) {
  if (v === undefined || v === null) return '';
  if (JSON_COLS[k] && typeof v !== 'string') return JSON.stringify(v);
  return v;
}

function all_(table) {
  const s = sh_(table), v = s.getDataRange().getValues();
  const h = v.shift();
  return v.filter(r => r.some(c => c !== '')).map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => { o[k] = decode_(k, r[j]); });
    return o;
  });
}
function where_(table, fn) { return all_(table).filter(fn); }
function find_(table, key, val) { return all_(table).find(r => String(r[key]) === String(val)) || null; }

function insert_(table, obj) {
  const s = sh_(table), h = SCHEMA[table];
  s.appendRow(h.map(k => encode_(k, obj[k])));
  return obj;
}
function update_(table, key, val, patch) {
  const s = sh_(table), h = SCHEMA[table];
  const col = h.indexOf(key) + 1;
  const keys = s.getRange(2, col, Math.max(s.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]));
  const idx = keys.indexOf(String(val));
  if (idx < 0) throw new Error(table + ' ' + val + ' not found');
  const row = idx + 2;
  const cur = s.getRange(row, 1, 1, h.length).getValues()[0];
  h.forEach((k, j) => { if (patch.hasOwnProperty(k)) cur[j] = encode_(k, patch[k]); });
  s.getRange(row, 1, 1, h.length).setValues([cur]);
  const o = {}; h.forEach((k, j) => o[k] = decode_(k, cur[j])); return o;
}
function remove_(table, key, val) {
  const s = sh_(table), h = SCHEMA[table], col = h.indexOf(key) + 1;
  const keys = s.getRange(2, col, Math.max(s.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]));
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i] === String(val)) s.deleteRow(i + 2);
}

function uid_(prefix) { return (prefix || '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function token_() { return Utilities.base64EncodeWebSafe(Utilities.getUuid() + Utilities.getUuid()).replace(/=+$/, '').slice(0, 48); }
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'); }
function addDays_(n) { const d = new Date(); d.setDate(d.getDate() + n); return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd'); }

function withLock_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}

function log_(subId, userId, action, detail, authorVisible) {
  insert_('Activity', { ts: now_(), subId: subId, userId: userId || 'system', action: action, detail: detail || '', author: authorVisible ? 'yes' : '' });
}
