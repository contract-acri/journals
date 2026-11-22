/**
 * ACRI Journals — Editorial Management System (Google Apps Script)
 * ONE FILE: paste into Code.gs (replace everything). Manifest: appsscript.json. Run setup() once,
 * set the Script Properties, then run syncJournalsFromRepo() and selfTest().
 */

// ======================================================================
// 00_Config.gs
// ======================================================================
/**
 * ACRI Journals — Editorial Management System (Apps Script backend)
 * ------------------------------------------------------------------
 * Bound to the "ACRI Journals — EMS" Google Sheet. Deployed as a Web App
 * (Execute as: Me, Who has access: Anyone). The static site and portal call it
 * with fetch(POST, text/plain JSON). Secrets live in Script Properties, never in code.
 *
 * Script Properties (Project Settings → Script properties):
 *   GITHUB_TOKEN      fine-grained PAT with Contents: Read & write on the repo
 *   GITHUB_REPO       e.g.  acri-india/acri-journals
 *   GITHUB_BRANCH     main
 *   ZEPTO_TOKEN       ZeptoMail "Send Mail" token (with or without the "Zoho-enczapikey " prefix)
 *   ZEPTO_HOST        api.zeptomail.in   (India data centre; use api.zeptomail.com for US)
 *   ZENODO_TOKEN      Zenodo personal access token (scopes: deposit:write, deposit:actions)
 *   ZENODO_SANDBOX    true while testing (uses sandbox.zenodo.org), false in production
 *   SITE_URL          https://acriindia.org.in
 *   DRIVE_ROOT_ID     ID of the Drive folder that stores manuscript files
 *   MAIL_DOMAIN       journals.acriindia.org   (verified in ZeptoMail AND the campaign provider)
 *   SYSTEM_FROM       no.reply@journals.acriindia.org
 *   CAMPAIGN_PROVIDER zepto | brevo             (zepto: campaigns via ZeptoMail. Note ZeptoMail's terms bar bulk/marketing mail)
 *   ZEPTO_CAMPAIGN_TOKEN  optional Send Mail token of a SEPARATE ZeptoMail agent for campaigns (else ZEPTO_TOKEN)
 *   BREVO_KEY         Brevo API key (v3), only if CAMPAIGN_PROVIDER = brevo
 */

const CFG = {
  APP: 'ACRI Journals',
  PUBLISHER: 'ACRI Journals',
  LEGAL_ENTITY: 'Ahmedabad Centre for Research and Innovation',
  SESSION_HOURS: 12,
  REVIEW_DAYS: 21,
  INVITE_DAYS: 5,
  PROOF_DAYS: 3,
  MAX_UPLOAD_MB: 25,
  PBKDF_ROUNDS: 2000,
};

function prop_(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v === null || v === '' ? (d === undefined ? '' : d) : v; }
function siteUrl_() { return prop_('SITE_URL', 'https://acriindia.org.in').replace(/\/$/, ''); }
function mailDomain_() { return prop_('MAIL_DOMAIN', 'journals.acriindia.org'); }
function editorsEmail_() { return prop_('EDITORS_EMAIL', 'editor@' + mailDomain_()); }
function controllerEmail_() { return prop_('CONTROLLER_EMAIL', 'controller@' + mailDomain_()); }
function systemFrom_() { return prop_('SYSTEM_FROM', 'no.reply@' + mailDomain_()); }
function portalUrl_(hash) { return siteUrl_() + '/portal/' + (hash ? '#/' + hash : ''); }

/** Sheet schema. Columns are created by setup(); add new columns at the END only. */
const SCHEMA = {
  Users: ['id', 'email', 'given', 'family', 'degrees', 'affiliation', 'country', 'orcid', 'phone', 'passHash', 'salt', 'verified', 'verifyToken', 'resetToken', 'resetExpires', 'reviewer', 'subjects', 'roles', 'status', 'created', 'lastLogin', 'designation', 'department', 'instAddress', 'profileUrl', 'instEmail'],
  Sessions: ['token', 'userId', 'expires', 'created'],
  Journals: ['slug', 'code', 'name', 'fromEmail', 'fromName', 'eicEmail', 'active', 'json', 'updated'],
  Submissions: ['id', 'journal', 'year', 'serial', 'status', 'type', 'subject', 'title', 'subtitle', 'abstract', 'keywords', 'authors', 'affiliations', 'declarations', 'coverLetter', 'submitterId', 'editorId', 'version', 'created', 'updated', 'submittedAt', 'decision', 'decisionAt', 'acceptedAt', 'doi', 'zenodoId', 'previewToken', 'volume', 'issue', 'published', 'flags'],
  Files: ['id', 'subId', 'version', 'kind', 'name', 'mime', 'size', 'driveId', 'pdfId', 'uploadedBy', 'created', 'active'],
  Reviews: ['id', 'subId', 'version', 'reviewerId', 'number', 'status', 'invitedBy', 'invitedAt', 'respondedAt', 'due', 'submittedAt', 'scores', 'recommendation', 'toAuthor', 'toEditor', 'reminders', 'token'],
  Activity: ['ts', 'subId', 'userId', 'action', 'detail', 'author'],
  Issues: ['journal', 'volume', 'issue', 'year', 'label', 'title', 'status', 'pdf'],
  Subscribers: ['email', 'status', 'token', 'journals', 'created'],
  EmailLog: ['ts', 'to', 'subject', 'status', 'detail'],
  Appointments: ['id', 'userId', 'journal', 'role', 'title', 'start', 'end', 'status', 'token', 'agreementVersion', 'signedAt', 'signedName', 'signMeta', 'agreementFileId', 'showOnSite', 'order', 'reminded', 'endedAt', 'endReason', 'certificateFileId', 'renewalOf', 'createdBy', 'created'],
  Contacts: ['email', 'name', 'list', 'status', 'token', 'source', 'consent', 'tags', 'created', 'updated', 'lastSent', 'sentCount'],
  Campaigns: ['id', 'journal', 'name', 'subject', 'preheader', 'preset', 'content', 'sender', 'audience', 'status', 'scheduledAt', 'createdBy', 'created', 'updated', 'stats', 'sentAt'],
  Queue: ['id', 'campaignId', 'email', 'name', 'token', 'status', 'error', 'ts'],
  Automations: ['id', 'journal', 'type', 'name', 'enabled', 'everyDays', 'campaignId', 'endDate', 'nextRun', 'lastRun', 'config', 'updated'],
  Signatories: ['id', 'name', 'designation', 'org', 'fileId', 'order', 'active', 'created'],
  Letters: ['id', 'ref', 'type', 'journal', 'to', 'subject', 'body', 'signatory', 'date', 'fileId', 'createdBy', 'created'],
  Certificates: ['id', 'articleId', 'journal', 'author', 'name', 'ref', 'fileId', 'created'],
  SentMail: ['id', 'ts', 'by', 'from', 'to', 'cc', 'bcc', 'subject', 'body', 'attachments', 'status', 'detail'],
  Messages: ['id', 'journal', 'to', 'name', 'email', 'role', 'msId', 'subject', 'body', 'status', 'created', 'readAt', 'readBy', 'reply', 'repliedAt', 'repliedBy', 'note', 'meta'],
  Partners: ['id', 'name', 'type', 'url', 'logoUrl', 'country', 'description', 'contactName', 'contactEmail', 'contactPhone', 'journals', 'message', 'status', 'showOnSite', 'order', 'created', 'decidedAt', 'decidedBy', 'note'],
};

/** Submission statuses and who sees what. */
const STATUS = {
  draft: 'Draft',
  submitted: 'Submitted — technical check',
  returned: 'Returned to author for corrections',
  with_editor: 'With Editor-in-Chief',
  under_review: 'Under peer review',
  reviews_complete: 'Reviews complete — awaiting decision',
  revision: 'Revision requested',
  accepted: 'Accepted — awaiting final files',
  production: 'In production',
  proof: 'Proofs ready for author',
  proof_approved: 'Proofs approved — scheduled',
  published: 'Published',
  rejected: 'Rejected',
  desk_rejected: 'Declined without review',
  withdrawn: 'Withdrawn',
};
/** What the AUTHOR sees (hides internal steps). */
const AUTHOR_STATUS = {
  submitted: 'Submitted', with_editor: 'With editor', under_review: 'Under review', reviews_complete: 'Under review',
};

/** Editorial roles, in display order. Permissions: eic > senior > editor > board. */
const ROLES = {
  eic: { label: 'Editor-in-Chief', plural: 'Editors-in-Chief', rank: 1 },
  senior: { label: 'Senior Editor', plural: 'Senior Editors', rank: 2 },
  editor: { label: 'Editor', plural: 'Editors', rank: 3 },
  board: { label: 'Editorial Board Member', plural: 'Editorial Board', rank: 4 },
};
const AGREEMENT_VERSION = '1.0';

const FILE_KINDS = {
  manuscript: 'Anonymised manuscript', titlepage: 'Title page', figure: 'Figure', supplementary: 'Supplementary file',
  cover: 'Cover letter', response: 'Response to reviewers', final: 'Final manuscript (non-anonymised)', final_figure: 'Final figure',
  proof_corrections: 'Proof corrections',
};

// ======================================================================
// 01_Db.gs
// ======================================================================
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

// ======================================================================
// 02_Auth.gs
// ======================================================================
/** Accounts, sessions and roles. One account works across all journals.
 *  roles JSON: { admin: true, eic: ["ijbmrs"], board: ["ijbmrs","ijelf"] }  (author is implicit) */

function hashPw_(pw, salt) {
  let bytes = Utilities.newBlob(salt + '::' + pw).getBytes();
  for (let i = 0; i < 1000; i++) bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  return Utilities.base64Encode(bytes);
}
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function publicUser_(u) {
  if (!u) return null;
  if (u.roles && !Array.isArray(u.roles.senior)) { try { u = Object.assign({}, u, { roles: effectiveRoles_(u) }); } catch (e) { } }
  return { id: u.id, email: u.email, given: u.given, family: u.family, name: (u.given + ' ' + u.family).trim(), degrees: u.degrees, affiliation: u.affiliation, country: u.country, orcid: u.orcid, phone: u.phone, reviewer: String(u.reviewer) === 'true' || u.reviewer === true, subjects: u.subjects || [], designation: u.designation || '', department: u.department || '', instAddress: u.instAddress || '', profileUrl: u.profileUrl || '', instEmail: u.instEmail || '', roles: u.roles || {}, verified: String(u.verified) === 'true' || u.verified === true };
}
function nameOf_(u) { return u ? (u.given + ' ' + u.family).trim() : ''; }

function auth_register(p) {
  const email = normEmail_(p.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (!p.password || p.password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (!p.given || !p.family) throw new Error('Please enter your first and last name.');
  return withLock_(() => {
    if (find_('Users', 'email', email)) throw new Error('An account with this email already exists. Sign in or reset your password.');
    const salt = token_().slice(0, 16), vt = token_();
    const admins = prop_('ADMIN_EMAILS', '').split(',').map(normEmail_);
    const u = {
      id: uid_('U'), email: email, given: p.given.trim(), family: p.family.trim(), degrees: p.degrees || '', affiliation: p.affiliation || '', country: p.country || 'India', orcid: (p.orcid || '').replace(/^https?:\/\/orcid.org\//, ''),
      phone: p.phone || '', passHash: hashPw_(p.password, salt), salt: salt, verified: false, verifyToken: vt, reviewer: !!p.reviewer, subjects: p.subjects || [],
      roles: admins.indexOf(email) >= 0 ? { admin: true } : {}, status: 'active', created: now_(),
    };
    insert_('Users', u);
    mailTemplate_('verify', u.email, { name: u.given, link: portalUrl_('verify?token=' + vt) });
    return { ok: true, message: 'Account created. We have sent a verification link to ' + email + '.' };
  });
}

function auth_verify(p) {
  const u = find_('Users', 'verifyToken', p.token);
  if (!u || !p.token) throw new Error('This verification link is invalid or has already been used.');
  update_('Users', 'id', u.id, { verified: true, verifyToken: '' });
  return { ok: true, message: 'Email verified. You can now sign in.' };
}

function auth_login(p) {
  const u = find_('Users', 'email', normEmail_(p.email));
  if (!u || hashPw_(p.password || '', u.salt) !== u.passHash) throw new Error('Incorrect email or password.');
  if (u.status === 'disabled') throw new Error('This account has been disabled. Contact the editorial office.');
  if (!(String(u.verified) === 'true' || u.verified === true)) {
    mailTemplate_('verify', u.email, { name: u.given, link: portalUrl_('verify?token=' + (u.verifyToken || '')) });
    throw new Error('Please verify your email first. We have sent the link again.');
  }
  const t = token_();
  const exp = new Date(Date.now() + CFG.SESSION_HOURS * 3600e3).toISOString();
  insert_('Sessions', { token: t, userId: u.id, expires: exp, created: now_() });
  CacheService.getScriptCache().put('S:' + t, u.id, 21600);
  update_('Users', 'id', u.id, { lastLogin: now_() });
  return { ok: true, token: t, user: publicUser_(u) };
}

function auth_logout(p) {
  CacheService.getScriptCache().remove('S:' + p.token);
  try { remove_('Sessions', 'token', p.token); } catch (e) { }
  return { ok: true };
}

function auth_forgot(p) {
  const u = find_('Users', 'email', normEmail_(p.email));
  if (u) {
    const t = token_();
    update_('Users', 'id', u.id, { resetToken: t, resetExpires: new Date(Date.now() + 3600e3).toISOString() });
    mailTemplate_('reset', u.email, { name: u.given, link: portalUrl_('reset?token=' + t) });
  }
  return { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
}

function auth_reset(p) {
  const u = find_('Users', 'resetToken', p.token);
  if (!u || !p.token || new Date(u.resetExpires) < new Date()) throw new Error('This reset link has expired. Request a new one.');
  if (!p.password || p.password.length < 8) throw new Error('Password must be at least 8 characters.');
  const salt = token_().slice(0, 16);
  update_('Users', 'id', u.id, { passHash: hashPw_(p.password, salt), salt: salt, resetToken: '', resetExpires: '', verified: true });
  return { ok: true, message: 'Password updated. Please sign in.' };
}

/** Resolve the session token → user row, or throw. */
function session_(token) {
  if (!token) throw new Error('AUTH');
  const c = CacheService.getScriptCache();
  let uid = c.get('S:' + token);
  if (!uid) {
    const s = find_('Sessions', 'token', token);
    if (!s || new Date(s.expires) < new Date()) throw new Error('AUTH');
    uid = s.userId; c.put('S:' + token, uid, 21600);
  }
  const u = find_('Users', 'id', uid);
  if (!u || u.status === 'disabled') throw new Error('AUTH');
  u.roles = effectiveRoles_(u);
  return u;
}

/** Editorial roles come ONLY from active, signed, in-term appointments. Admin is a user flag. */
function effectiveRoles_(u) {
  const r = { admin: !!(u.roles && u.roles.admin), eic: [], senior: [], editor: [], board: [] };
  const today = today_();
  all_('Appointments').forEach(a => {
    if (a.userId !== u.id || a.status !== 'active') return;
    if (a.start && String(a.start).slice(0, 10) > today) return;
    if (a.end && String(a.end).slice(0, 10) < today) return;
    if (r[a.role] && r[a.role].indexOf(a.journal) < 0) r[a.role].push(a.journal);
  });
  return r;
}
function isAdmin_(u) { return !!(u.roles && u.roles.admin); }
function isEic_(u, j) { return isAdmin_(u) || ((u.roles.eic || []).indexOf(j) >= 0); }
function isSenior_(u, j) { return isEic_(u, j) || ((u.roles.senior || []).indexOf(j) >= 0); }
function isBoard_(u, j) { return isSenior_(u, j) || ((u.roles.editor || []).indexOf(j) >= 0) || ((u.roles.board || []).indexOf(j) >= 0); }
function need_(cond, msg) { if (!cond) throw new Error(msg || 'You do not have permission to do this.'); }

function auth_me(p, u) {
  const out = publicUser_(u);
  out.pendingAgreements = where_('Appointments', a => a.userId === u.id && a.status === 'pending').map(a => ({ id: a.id, token: a.token, journal: a.journal, role: a.role }));
  return { ok: true, user: out };
}

function auth_profile(p, u) {
  const patch = {};
  ['given', 'family', 'degrees', 'affiliation', 'country', 'phone', 'designation', 'department', 'instAddress', 'profileUrl', 'instEmail'].forEach(k => { if (p[k] !== undefined) patch[k] = String(p[k]).trim(); });
  if (p.orcid !== undefined) patch.orcid = String(p.orcid).replace(/^https?:\/\/orcid.org\//, '').trim();
  if (p.reviewer !== undefined) patch.reviewer = !!p.reviewer;
  if (p.subjects !== undefined) patch.subjects = p.subjects;
  if (p.newPassword) {
    need_(hashPw_(p.currentPassword || '', u.salt) === u.passHash, 'Your current password is incorrect.');
    need_(p.newPassword.length >= 8, 'Password must be at least 8 characters.');
    patch.salt = token_().slice(0, 16); patch.passHash = hashPw_(p.newPassword, patch.salt);
  }
  return { ok: true, user: publicUser_(update_('Users', 'id', u.id, patch)) };
}

// ======================================================================
// 03_Integrations.gs
// ======================================================================
/** External services: Google Drive (files), GitHub (publishing), Zenodo (DOIs), ZeptoMail (email). */

// ============================== Drive ==============================
function rootFolder_() {
  const id = prop_('DRIVE_ROOT_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('ACRI Journals — Manuscript Files');
  PropertiesService.getScriptProperties().setProperty('DRIVE_ROOT_ID', f.getId());
  return f;
}
function subFolder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function submissionFolder_(sub) { return subFolder_(subFolder_(rootFolder_(), sub.journal.toUpperCase()), sub.id); }

/** Save a base64 upload into the submission folder. */
function saveUpload_(sub, version, kind, name, mime, b64, userId) {
  const bytes = Utilities.base64Decode(b64);
  need_(bytes.length <= CFG.MAX_UPLOAD_MB * 1024 * 1024, 'Files must be smaller than ' + CFG.MAX_UPLOAD_MB + ' MB.');
  const safe = String(name).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const folder = subFolder_(submissionFolder_(sub), 'v' + version);
  const file = folder.createFile(Utilities.newBlob(bytes, mime || 'application/octet-stream', safe));
  const rec = { id: uid_('F'), subId: sub.id, version: version, kind: kind, name: safe, mime: mime, size: bytes.length, driveId: file.getId(), pdfId: '', uploadedBy: userId, created: now_(), active: true };
  insert_('Files', rec);
  return rec;
}

/** Convert a .docx to PDF via Google Docs (needs the Drive API advanced service, v3). Removes author metadata. */
function toPdf_(fileRec) {
  if (fileRec.pdfId) return fileRec.pdfId;
  const src = DriveApp.getFileById(fileRec.driveId);
  let pdfBlob;
  if (/pdf$/i.test(fileRec.mime) || /\.pdf$/i.test(fileRec.name)) pdfBlob = src.getBlob();
  else {
    const gdoc = Drive.Files.create({ name: 'tmp-' + fileRec.id, mimeType: MimeType.GOOGLE_DOCS }, src.getBlob(), { supportsAllDrives: true });
    pdfBlob = DriveApp.getFileById(gdoc.id).getAs(MimeType.PDF);
    DriveApp.getFileById(gdoc.id).setTrashed(true);
  }
  pdfBlob.setName(fileRec.name.replace(/\.\w+$/, '') + '.pdf');
  const pdf = src.getParents().next().createFile(pdfBlob);
  update_('Files', 'id', fileRec.id, { pdfId: pdf.getId() });
  return pdf.getId();
}

// ============================== GitHub ==============================
function gh_(method, path, body) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + prop_('GITHUB_REPO') + path, {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop_('GITHUB_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: body ? JSON.stringify(body) : null,
  });
  const code = res.getResponseCode();
  if (code === 404 && method === 'get') return null;
  if (code >= 300) throw new Error('GitHub ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || '{}');
}
function ghRead_(path) {
  const r = gh_('get', '/contents/' + encodeURI(path) + '?ref=' + prop_('GITHUB_BRANCH', 'main'));
  if (!r) return null;
  return Utilities.newBlob(Utilities.base64Decode(r.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
}
/**
 * Commit several files in ONE commit (so the site builds once).
 * files: [{ path, text } | { path, bytes } | { path, delete: true }]
 */
function ghCommit_(files, message) {
  const br = prop_('GITHUB_BRANCH', 'main');
  const ref = gh_('get', '/git/ref/heads/' + br);
  const baseSha = ref.object.sha;
  const base = gh_('get', '/git/commits/' + baseSha);
  const tree = files.map(f => {
    if (f.delete) return { path: f.path, mode: '100644', type: 'blob', sha: null };
    const content = f.bytes ? Utilities.base64Encode(f.bytes) : Utilities.base64Encode(f.text, Utilities.Charset.UTF_8);
    const blob = gh_('post', '/git/blobs', { content: content, encoding: 'base64' });
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  });
  const t = gh_('post', '/git/trees', { base_tree: base.tree.sha, tree: tree });
  const c = gh_('post', '/git/commits', { message: message, tree: t.sha, parents: [baseSha], author: { name: 'ACRI Journals EMS', email: systemFrom_(), date: now_() } });
  gh_('patch', '/git/refs/heads/' + br, { sha: c.sha });
  return c.sha;
}
function ghLatestRun_() {
  const r = gh_('get', '/actions/runs?per_page=1&branch=' + prop_('GITHUB_BRANCH', 'main'));
  const run = r && r.workflow_runs && r.workflow_runs[0];
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, updated: run.updated_at, title: run.display_title } : null;
}

// ============================== Zenodo ==============================
function zenodoBase_() { return String(prop_('ZENODO_SANDBOX', 'true')) === 'true' ? 'https://sandbox.zenodo.org/api' : 'https://zenodo.org/api'; }
function zen_(method, path, body, raw) {
  const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + prop_('ZENODO_TOKEN') } };
  if (raw) { opt.payload = raw; opt.contentType = 'application/octet-stream'; }
  else if (body) { opt.payload = JSON.stringify(body); opt.contentType = 'application/json'; }
  const url = /^https?:/.test(path) ? path : zenodoBase_() + path;
  const res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode();
  if (code >= 300) throw new Error('Zenodo ' + code + ': ' + res.getContentText().slice(0, 400));
  return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}
/** Create an unpublished deposition and reserve its DOI (called at acceptance). */
function zenodoReserve_(sub, j) {
  const d = zen_('post', '/deposit/depositions', { metadata: zenodoMeta_(sub, j, true) });
  return { id: String(d.id), doi: d.metadata.prereserve_doi.doi };
}
function zenodoMeta_(sub, j, minimal) {
  const authors = sub.authors || [], affs = sub.affiliations || [];
  const m = {
    upload_type: 'publication', publication_type: 'article', prereserve_doi: true,
    title: sub.title + (sub.subtitle ? ': ' + sub.subtitle : ''),
    creators: authors.map(a => {
      const c = { name: a.family + ', ' + a.given };
      const af = (a.affiliations || []).map(id => (affs.find(f => f.id === id) || {}).name).filter(String)[0];
      if (af) c.affiliation = af; if (a.orcid) c.orcid = a.orcid; return c;
    }),
    description: abstractHtml_(sub) || sub.title,
    access_right: 'open', license: 'cc-by-4.0',
    keywords: sub.keywords || [],
    journal_title: j.name, journal_volume: String(sub.volume || ''), journal_issue: String(sub.issue || ''),
  };
  if (!minimal) {
    m.publication_date = sub.published || today_();
    m.related_identifiers = [{ identifier: articleUrl_(sub), relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'url' }];
    m.journal_pages = sub.elocator || ('e' + sub.id.split('-').slice(1).join(''));
    m.notes = 'Published in ' + j.name + ' by ' + CFG.PUBLISHER + '.';
    const comm = prop_('ZENODO_COMMUNITY', '');
    if (comm) m.communities = [{ identifier: comm }];
  }
  return m;
}
/** Upload the published PDF from the live site and publish the deposition (registers the DOI with DataCite). */
function zenodoRegister_(sub, j) {
  need_(sub.zenodoId, 'No Zenodo deposition for this article. Reserve a DOI first.');
  const pdfUrl = siteUrl_() + '/journals/' + sub.journal + '/articlepdf/' + sub.id.toLowerCase() + '.pdf';
  const pdf = UrlFetchApp.fetch(pdfUrl, { muteHttpExceptions: true });
  need_(pdf.getResponseCode() === 200, 'The PDF is not live yet (' + pdfUrl + '). Wait for the site build to finish and try again.');
  let dep = zen_('get', '/deposit/depositions/' + sub.zenodoId);
  if (dep.submitted) return { doi: dep.doi, url: dep.links.record_html || dep.links.html };
  (dep.files || []).forEach(f => zen_('delete', '/deposit/depositions/' + sub.zenodoId + '/files/' + f.id));
  zen_('put', dep.links.bucket + '/' + sub.id + '.pdf', null, pdf.getContent());
  zen_('put', '/deposit/depositions/' + sub.zenodoId, { metadata: zenodoMeta_(sub, j, false) });
  dep = zen_('post', '/deposit/depositions/' + sub.zenodoId + '/actions/publish');
  return { doi: dep.doi, url: (dep.links && (dep.links.record_html || dep.links.html)) || '' };
}
function abstractHtml_(sub) {
  const a = sub.abstract;
  if (!a) return '';
  if (typeof a === 'string') { try { const o = JSON.parse(a); return abstractHtml_({ abstract: o }); } catch (e) { return '<p>' + a + '</p>'; } }
  return (a.sections || []).map(s => '<p>' + (s.heading ? '<strong>' + s.heading + ':</strong> ' : '') + s.text + '</p>').join('');
}
function articleUrl_(sub) { return siteUrl_() + '/journals/' + sub.journal + '/fullarticle/' + sub.id.toLowerCase() + '/'; }

// ============================== ZeptoMail ==============================
/** Send a transactional email.
 *  MAIL_PROVIDER (script property): auto (default) | zepto | gmail
 *   auto  → ZeptoMail if ZEPTO_TOKEN is set; if it is missing or ZeptoMail fails, falls back to Gmail.
 *   gmail → always send from the Google account that owns the script (MailApp).
 *  Gmail fallback sends FROM the script owner's address (display name and Reply-To are kept), and has a
 *  daily quota (about 100/day on a free Gmail, 1,500/day on Google Workspace). */
function sendMail_(to, subject, html, opts) {
  opts = opts || {};
  const list = (Array.isArray(to) ? to : [to]).filter(String).map(e => ({ email_address: typeof e === 'string' ? { address: e } : { address: e.email, name: e.name } }));
  if (!list.length) return;
  const mode = String(prop_('MAIL_PROVIDER', 'auto')).toLowerCase();
  const tok = prop_('ZEPTO_TOKEN');
  let status = 'sent', detail = '', via = '';
  if (mode !== 'gmail' && tok) {
    via = 'zepto';
    const body = { from: { address: opts.from || systemFrom_(), name: opts.fromName || CFG.APP }, to: list, subject: subject, htmlbody: html };
    if (opts.attachments && opts.attachments.length) body.attachments = opts.attachments.map(a => ({ name: a.name, mime_type: a.mime || 'application/pdf', content: a.b64 }));
    if (opts.cc && [].concat(opts.cc).filter(String).length) body.cc = [].concat(opts.cc).filter(String).map(e => ({ email_address: { address: e } }));
    if (opts.bcc && [].concat(opts.bcc).filter(String).length) body.bcc = [].concat(opts.bcc).filter(String).map(e => ({ email_address: { address: e } }));
    if (opts.replyTo) body.reply_to = [{ address: opts.replyTo }];
    try {
      const res = UrlFetchApp.fetch('https://' + prop_('ZEPTO_HOST', 'api.zeptomail.in') + '/v1.1/email', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: /^Zoho-enczapikey/i.test(tok) ? tok : 'Zoho-enczapikey ' + tok, Accept: 'application/json' },
        payload: JSON.stringify(body),
      });
      if (res.getResponseCode() >= 300) { status = 'error'; detail = 'ZeptoMail ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 250); }
    } catch (e) { status = 'error'; detail = 'ZeptoMail: ' + String(e.message || e); }
  } else if (mode === 'zepto') { status = 'error'; detail = 'ZEPTO_TOKEN not set (MAIL_PROVIDER=zepto, so no Gmail fallback)'; }
  // Gmail fallback: when ZeptoMail is not connected, or failed in auto mode.
  if (mode === 'gmail' || (mode === 'auto' && (!tok || status === 'error'))) {
    const prev = detail; via = via ? via + '→gmail' : 'gmail';
    try {
      const o = { htmlBody: html, name: opts.fromName || CFG.APP, replyTo: opts.replyTo || opts.from || controllerEmail_() };
      if (opts.cc) o.cc = [].concat(opts.cc).filter(String).join(',');
      if (opts.bcc) o.bcc = [].concat(opts.bcc).filter(String).join(',');
      if (opts.attachments && opts.attachments.length) o.attachments = opts.attachments.map(a => Utilities.newBlob(Utilities.base64Decode(a.b64), a.mime || 'application/pdf', a.name));
      MailApp.sendEmail(list.map(x => x.email_address.address).join(','), subject, String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), o);
      status = 'sent'; detail = prev ? 'fallback after ' + prev : '';
    } catch (e) { status = 'error'; detail = (prev ? prev + ' | ' : '') + 'Gmail: ' + String(e.message || e); }
  }
  insert_('EmailLog', { ts: now_(), to: list.map(x => x.email_address.address).join(', '), subject: subject, status: status, detail: (via ? '[' + via + '] ' : '') + detail });
}

// ======================================================================
// 04_Emails.gs
// ======================================================================
/** Branded transactional emails, sent through ZeptoMail. Edit wording here. */

function emailShell_(accent, journalName, inner) {
  accent = accent || '#0B2545';
  return '<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#15191E">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F8;padding:28px 12px"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E2E5E9">' +
    '<tr><td style="background:#0B2545;padding:18px 28px"><table role="presentation" width="100%"><tr>' +
    '<td style="color:#fff;line-height:1"><span style="font-family:Georgia,\'Times New Roman\',serif;font-weight:700;font-size:21px;letter-spacing:.01em">ACRI</span><span style="display:inline-block;width:1px;height:16px;background:#6FCF97;margin:0 10px;vertical-align:-2px"></span><span style="font-family:Arial,sans-serif;font-weight:700;font-size:10px;letter-spacing:.34em">JOURNALS</span></td>' +
    '<td align="right" style="color:#C9D3E0;font-size:12px">' + (journalName || '') + '</td></tr></table></td></tr>' +
    '<tr><td style="height:4px;background:' + accent + '"></td></tr>' +
    '<tr><td style="padding:30px 28px 10px;font-size:15px;line-height:1.6">' + inner + '</td></tr>' +
    '<tr><td style="padding:18px 28px 26px;font-size:12px;color:#5E6875;border-top:1px solid #EEF0F3">' +
    'ACRI Journals · Part of ACRIVERSE · Ahmedabad, India<br><a href="' + siteUrl_() + '" style="color:#5E6875">' + siteUrl_().replace('https://', '') + '</a> · <a href="' + siteUrl_() + '/policies/privacy/" style="color:#5E6875">Privacy</a> · This message was sent by the ACRI Journals editorial system.</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function btn_(href, label, accent) { return '<p style="margin:22px 0"><a href="' + href + '" style="background:' + (accent || '#0B2545') + ';color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">' + label + '</a></p>'; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function quote_(s) { return '<div style="background:#F6F7F9;border-left:3px solid #C9CED5;padding:12px 16px;margin:14px 0;white-space:pre-wrap;font-size:14px">' + esc_(s) + '</div>'; }

const TEMPLATES = {
  verify: d => ['Verify your ACRI Journals account', `<p>Dear ${esc_(d.name)},</p><p>Welcome to ACRI Journals. Please confirm your email address to activate your account.</p>${btn_(d.link, 'Verify email')}<p style="color:#5E6875;font-size:13px">If you did not create this account, you can ignore this email.</p>`],
  reset: d => ['Reset your ACRI Journals password', `<p>Dear ${esc_(d.name)},</p><p>We received a request to reset your password. This link is valid for one hour.</p>${btn_(d.link, 'Choose a new password')}<p style="color:#5E6875;font-size:13px">If you did not ask for this, you can ignore this email.</p>`],
  submitted_author: d => [`Submission received: ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for submitting your manuscript to <b>${esc_(d.journal)}</b>.</p><p><b>Manuscript ID:</b> ${d.id}<br><b>Title:</b> ${esc_(d.title)}</p><p>The editorial office will run a technical check within about five working days. You can follow every stage in the author portal.</p>${btn_(d.link, 'View submission', d.accent)}<p>Please quote the manuscript ID in all correspondence.</p><p>Editorial Office<br>${esc_(d.journal)}</p>`],
  submitted_coauthor: d => [`You are listed as an author on ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>${esc_(d.submitter)} has submitted a manuscript to <b>${esc_(d.journal)}</b> listing you as a co-author.</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p>If you are not aware of this submission or did not agree to be an author, please reply to this email.</p>`],
  submitted_office: d => [`[${d.code}] New submission ${d.id}`, `<p>A new manuscript has been submitted to ${esc_(d.journal)}.</p><p><b>${d.id}</b> · ${esc_(d.type)}<br>${esc_(d.title)}<br>Submitted by ${esc_(d.name)}</p>${btn_(d.link, 'Open technical check', d.accent)}`],
  returned: d => [`Action needed: ${d.id} returned for corrections`, `<p>Dear ${esc_(d.name)},</p><p>The editorial office has checked your submission <b>${d.id}</b> and needs some corrections before it can go to the editor:</p>${quote_(d.note)}<p>Please make the changes and resubmit from the portal.</p>${btn_(d.link, 'Update submission', d.accent)}<p>Editorial Office<br>${esc_(d.journal)}</p>`],
  to_editor: d => [`[${d.code}] ${d.id} ready for editor screening`, `<p>Manuscript <b>${d.id}</b> has passed the technical check and is ready for screening.</p><p>${esc_(d.title)}</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  editor_assigned: d => [`[${d.code}] You are handling editor for ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>The Editor-in-Chief has assigned you as handling editor for:</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p>Please invite at least two reviewers from the portal.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  review_invite: d => [`Invitation to review for ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>You are invited to review the following manuscript for <b>${esc_(d.journal)}</b>:</p><p><b>${esc_(d.title)}</b><br><span style="color:#5E6875">${esc_(d.type)} · ${d.id}</span></p><p style="font-size:14px">${d.abstract}</p><p>If you accept, we ask for your report within <b>${CFG.REVIEW_DAYS} days</b>. The manuscript opens securely in the reviewer portal.</p>${btn_(d.accept, 'Accept invitation', d.accent)}<p><a href="${d.decline}" style="color:#5E6875">Decline invitation</a></p><p style="color:#5E6875;font-size:13px">Please decline if you have a conflict of interest. Manuscripts under review are confidential.</p>`],
  review_reminder: d => [`Reminder: review for ${d.id} is due ${d.due}`, `<p>Dear ${esc_(d.name)},</p><p>This is a friendly reminder that your review of <b>${esc_(d.title)}</b> (${d.id}) is due on <b>${d.due}</b>.</p>${btn_(d.link, 'Open review', d.accent)}<p>If you need more time, please reply to this email.</p>`],
  invite_reminder: d => [`Reminder: invitation to review ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>We have not yet heard whether you can review <b>${esc_(d.title)}</b> for ${esc_(d.journal)}.</p>${btn_(d.accept, 'Accept invitation', d.accent)}<p><a href="${d.decline}" style="color:#5E6875">Decline</a></p>`],
  review_thanks: d => [`Thank you for your review of ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for reviewing <b>${esc_(d.title)}</b> for ${esc_(d.journal)}. We are grateful for your time and expertise. We will let you know the editor's decision.</p>`],
  review_in: d => [`[${d.code}] Review received for ${d.id} (${d.count})`, `<p>A review has been submitted for <b>${d.id}</b>. ${d.count} received.</p><p>Recommendation: <b>${esc_(d.rec)}</b></p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  reviewer_status: d => [`[${d.code}] Reviewer ${d.what} for ${d.id}`, `<p>${esc_(d.reviewer)} has ${d.what} the invitation to review <b>${d.id}</b>.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  decision: d => [`Decision on your manuscript ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>The editors of <b>${esc_(d.journal)}</b> have reached a decision on your manuscript:</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p style="font-size:17px"><b>Decision: ${esc_(d.decision)}</b></p>${d.letter ? quote_(d.letter) : ''}${d.reviews || ''}${d.action ? btn_(d.link, d.action, d.accent) : btn_(d.link, 'View in portal', d.accent)}<p>${esc_(d.editor)}<br>${esc_(d.journal)}</p>`],
  decision_reviewer: d => [`Decision on ${d.id}, which you reviewed`, `<p>Dear ${esc_(d.name)},</p><p>Thank you again for reviewing <b>${esc_(d.title)}</b>. The editor's decision was: <b>${esc_(d.decision)}</b>. You can read the other reviewers' anonymised comments in the portal.</p>${btn_(d.link, 'View in portal', d.accent)}`],
  revision_in: d => [`[${d.code}] Revised manuscript received: ${d.id} (v${d.version})`, `<p>The authors have submitted revision ${d.version} of <b>${d.id}</b>.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  accepted: d => [`Accepted: ${d.id}. Please upload final files`, `<p>Dear ${esc_(d.name)},</p><p>Congratulations! Your manuscript <b>${esc_(d.title)}</b> has been accepted for publication in <b>${esc_(d.journal)}</b>.</p>${d.doi ? `<p>Your article's DOI has been reserved: <b>${d.doi}</b>. It will become active when the article is published.</p>` : ''}<p>Please upload your final files within 7 days: the non-anonymised manuscript (.docx, using the ACRI Journals template) and each figure as a separate high-resolution file.</p>${btn_(d.link, 'Upload final files', d.accent)}`],
  final_in: d => [`[${d.code}] Final files received: ${d.id}`, `<p>The authors have uploaded final files for <b>${d.id}</b>. It is ready to send to production.</p>${btn_(d.link, 'Open production', d.accent)}`],
  proof: d => [`Proofs ready: ${d.id}. Please check within ${CFG.PROOF_DAYS} days`, `<p>Dear ${esc_(d.name)},</p><p>The proofs of your article <b>${esc_(d.title)}</b> are ready. Please check the web version and the PDF carefully: author names, affiliations, figures, tables and references.</p>${btn_(d.link, 'Review proofs', d.accent)}<p>Approve the proofs, or list your corrections, in the portal within ${CFG.PROOF_DAYS} days. Only corrections of errors can be accepted at this stage.</p>`],
  proof_response: d => [`[${d.code}] Proofs ${d.what}: ${d.id}`, `<p>The author has ${d.what} the proofs for <b>${d.id}</b>.</p>${d.note ? quote_(d.note) : ''}${btn_(d.link, 'Open production', d.accent)}`],
  published: d => [`Published: ${d.title}`, `<p>Dear ${esc_(d.name)},</p><p>Your article is now published in <b>${esc_(d.journal)}</b> and free to read.</p><p><b>${esc_(d.title)}</b><br>${d.doi ? 'DOI: <a href="https://doi.org/' + d.doi + '">' + d.doi + '</a>' : ''}</p>${btn_(d.url, 'Read your article', d.accent)}<p>Please share it widely. The article page has ready-made citations in every major style.</p>${d.certs ? '<p>Your <b>Certificate' + (d.certs > 1 ? 's' : '') + ' of Publication</b> ' + (d.certs > 1 ? 'are' : 'is') + ' attached, one for each author. You can download them again at any time from the author portal.</p>' : ''}`],
  role_granted: d => [`You have been added to ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>You have been given the <b>${esc_(d.role)}</b> role for ${esc_(d.journal)} on ACRI Journals.</p>${btn_(d.link, 'Open the portal')}`],
  subscribe: d => ['Confirm your ACRI Journals subscription', `<p>Please confirm that you would like to receive new research from ACRI Journals.</p>${btn_(d.link, 'Confirm subscription')}<p style="color:#5E6875;font-size:13px">If you did not sign up, ignore this email.</p>`],
};

/** Which address each email comes from.
 *  system  → no.reply@journals.acriindia.org            (accounts, newsletter confirmations)
 *  journal → <slug>-no-reply@journals.acriindia.org     (notifications; replies go to controller@ — the journal office)
 *  editor  → editor@journals.acriindia.org              (decisions, reviewer correspondence, appointments; routed by the team) */
const SENDER = {
  verify: 'system', reset: 'system', subscribe: 'system', role_granted: 'system',
  returned: 'editor', review_invite: 'editor', review_reminder: 'editor', invite_reminder: 'editor', review_thanks: 'editor',
  decision: 'editor', decision_reviewer: 'editor', accepted: 'editor', editor_assigned: 'editor',
  appoint: 'editor', appoint_signed: 'editor', term_reminder: 'editor', term_ended: 'editor', appoint_declined: 'editor',
  partner_received: 'system', partner_approved: 'system', partner_rejected: 'system',
};
function senderFor_(key, j) {
  const cls = j ? (SENDER[key] || 'journal') : 'system';
  if (cls === 'editor') return { from: j.editorEmail, fromName: j.code + ' Editors', replyTo: j.editorEmail };
  if (cls === 'journal') return { from: j.noReplyEmail, fromName: j.code + ' · ' + j.name.slice(0, 40), replyTo: j.officeEmail };
  return { from: systemFrom_(), fromName: CFG.APP, replyTo: controllerEmail_() };
}
/** Render + send. ctx.journal (slug) picks the journal's sender addresses and accent colour. */
function mailTemplate_(key, to, data, ctx) {
  ctx = ctx || {};
  const j = ctx.journal ? journalRow_(ctx.journal) : null;
  data.accent = data.accent || (j ? j.accent : '#0B2545');
  const [subject, inner] = TEMPLATES[key](data);
  const snd = senderFor_(key, j);
  sendMail_(to, subject, emailShell_(data.accent, j ? j.name : '', inner), Object.assign(snd, { cc: ctx.cc, attachments: ctx.attachments }));
}

// ======================================================================
// 05_Workflow.gs
// ======================================================================
/** Editorial workflow: submission → technical check → editor → peer review → decision → production. */

// ------------------------------------------------------------ journals
function journalRow_(slug) {
  const c = CacheService.getScriptCache(), k = 'J:' + slug, hit = c.get(k);
  if (hit) return JSON.parse(hit);
  const r = find_('Journals', 'slug', slug);
  if (!r) throw new Error('Unknown journal: ' + slug);
  const j = Object.assign({}, r.json || {}, { slug: r.slug, code: r.code, name: r.name, eicEmail: r.eicEmail, active: String(r.active) !== 'false' });
  j.noReplyEmail = (r.json || {}).noReplyEmail || (r.slug + '-no-reply@' + mailDomain_());
  j.editorEmail = (r.json || {}).editorEmail || editorsEmail_();
  j.officeEmail = (r.json || {}).officeEmail || controllerEmail_();
  j.fromName = r.fromName || (r.code + ' Editorial Office');
  c.put(k, JSON.stringify(j), 600);
  return j;
}
function journalStaff_(slug, role) {
  const users = all_('Users');
  if (role === 'admin') return users.filter(u => u.roles && u.roles.admin);
  const ids = activeAppointments_(slug).filter(a => a.role === role).map(a => a.userId);
  return users.filter(u => ids.indexOf(u.id) >= 0);
}
function officeEmails_(slug) {
  const j = journalRow_(slug), out = [];
  out.push(j.officeEmail);
  journalStaff_(slug, 'admin').forEach(u => out.push(u.email));
  return out.filter((e, i, a) => a.indexOf(e) === i);
}
function eicEmails_(slug) {
  const j = journalRow_(slug);
  const l = journalStaff_(slug, 'eic').map(u => u.email);
  if (!l.length && j.eicEmail) l.push(j.eicEmail);
  return l.length ? l : officeEmails_(slug);
}

function public_journals() {
  return { ok: true, journals: all_('Journals').filter(r => String(r.active) !== 'false').map(r => { const j = journalRow_(r.slug); return { slug: j.slug, code: j.code, name: j.name, accent: j.accent, articleTypes: j.articleTypes || [], subjects: j.subjects || [] }; }) };
}

// ------------------------------------------------------------ helpers
function sub_(id) { const s = find_('Submissions', 'id', id); if (!s) throw new Error('Manuscript not found.'); return s; }
function link_(id) { return portalUrl_('ms/' + id); }
function corresponding_(s) { return (s.authors || []).find(a => a.corresponding) || (s.authors || [])[0] || {}; }
function submitter_(s) { return find_('Users', 'id', s.submitterId); }
function authorEmails_(s) {
  const out = []; const sub = submitter_(s); if (sub) out.push(sub.email);
  const c = corresponding_(s); if (c.email && out.indexOf(c.email.toLowerCase()) < 0) out.push(c.email);
  return out;
}
function roleFor_(s, u) {
  if (isAdmin_(u)) return 'admin';
  if (isEic_(u, s.journal)) return 'eic';
  if (isSenior_(u, s.journal)) return 'senior';
  if (s.editorId === u.id && isBoard_(u, s.journal)) return 'editor';
  if (s.submitterId === u.id) return 'author';
  if (isBoard_(u, s.journal)) return 'board';
  return null;
}
function nextId_(journal) {
  const j = journalRow_(journal), y = new Date().getFullYear();
  const used = where_('Submissions', r => r.journal === journal && String(r.year) === String(y)).map(r => Number(r.serial) || 0);
  const start = ((j.serialStart || {})[y] || 1) - 1;
  const n = Math.max(start, used.length ? Math.max.apply(null, used) : 0) + 1;
  return { id: j.code + '-' + y + '-' + ('00' + n).slice(-3), year: y, serial: n };
}
const DECISIONS = { accept: 'Accept', minor: 'Minor revision', major: 'Major revision', reject: 'Reject', desk_reject: 'Decline without review' };

// ------------------------------------------------------------ author
function sub_save(p, u) {
  return withLock_(() => {
    const f = p.sub || {};
    let s = p.id ? sub_(p.id) : null;
    if (s) need_(s.submitterId === u.id || isAdmin_(u), 'Not your submission.');
    if (s) need_(['draft', 'returned', 'revision'].indexOf(s.status) >= 0, 'This submission can no longer be edited.');
    const patch = {
      journal: f.journal, type: f.type, subject: f.subject || [], title: (f.title || '').trim(), subtitle: (f.subtitle || '').trim(),
      abstract: typeof f.abstract === 'string' ? f.abstract : JSON.stringify(f.abstract || ''), keywords: f.keywords || [], authors: f.authors || [], affiliations: f.affiliations || [],
      declarations: f.declarations || {}, coverLetter: f.coverLetter || '', updated: now_(),
    };
    if (s && s.status !== 'draft') delete patch.journal;
    if (!s) {
      need_(f.journal && journalRow_(f.journal).active, 'Choose a journal.');
      s = insert_('Submissions', Object.assign(patch, { id: 'DRAFT-' + uid_().slice(0, 10).toUpperCase(), status: 'draft', submitterId: u.id, version: 1, created: now_() }));
    } else s = update_('Submissions', 'id', s.id, patch);
    return { ok: true, id: s.id };
  });
}

function sub_upload(p, u) {
  const s = sub_(p.id), role = roleFor_(s, u);
  need_(role, 'Not allowed.');
  need_(FILE_KINDS[p.kind], 'Unknown file type.');
  if (role === 'author') {
    const allowed = { draft: 1, returned: 1, revision: 1, accepted: 1, proof: 1 };
    need_(allowed[s.status], 'Files cannot be changed at this stage.');
    if (['final', 'final_figure'].indexOf(p.kind) >= 0) need_(s.status === 'accepted', 'Final files are uploaded after acceptance.');
  }
  if (p.kind === 'manuscript' || p.kind === 'titlepage' || p.kind === 'final') need_(/\.docx$/i.test(p.name) || (p.kind === 'manuscript' && /\.pdf$/i.test(p.name) && role !== 'author'), 'Please upload a Word (.docx) file made from the ACRI Journals template.');
  if (p.kind === 'figure' || p.kind === 'final_figure') need_(/\.(png|jpe?g|tiff?|svg|pdf|eps)$/i.test(p.name), 'Figures must be PNG, JPG, TIFF, SVG, EPS or PDF.');
  // Single-file kinds replace the previous file of the same version.
  if (['manuscript', 'titlepage', 'cover', 'response', 'final'].indexOf(p.kind) >= 0)
    where_('Files', f => f.subId === s.id && String(f.version) === String(s.version) && f.kind === p.kind && String(f.active) !== 'false').forEach(f => update_('Files', 'id', f.id, { active: false }));
  const rec = saveUpload_(s, s.version, p.kind, p.name, p.mime, p.data, u.id);
  return { ok: true, file: fileView_(rec) };
}
function sub_removeFile(p, u) {
  const f = find_('Files', 'id', p.fileId); need_(f, 'File not found.');
  const s = sub_(f.subId), role = roleFor_(s, u);
  need_(role && (role !== 'author' || ['draft', 'returned', 'revision', 'accepted'].indexOf(s.status) >= 0), 'Not allowed.');
  update_('Files', 'id', f.id, { active: false });
  return { ok: true };
}
function fileView_(f) { return { id: f.id, kind: f.kind, kindLabel: FILE_KINDS[f.kind], name: f.name, size: f.size, version: f.version, created: f.created }; }

function sub_submit(p, u) {
  return withLock_(() => {
    let s = sub_(p.id);
    need_(s.submitterId === u.id, 'Not your submission.');
    need_(['draft', 'returned', 'revision'].indexOf(s.status) >= 0, 'Already submitted.');
    const files = where_('Files', f => f.subId === s.id && String(f.version) === String(s.version) && String(f.active) !== 'false');
    const has = k => files.some(f => f.kind === k);
    const errs = [];
    if (!s.title) errs.push('title');
    if (!s.abstract || s.abstract === '""') errs.push('abstract');
    if (!(s.authors || []).length) errs.push('at least one author');
    if (!(s.authors || []).some(a => a.corresponding && a.email)) errs.push('a corresponding author with an email address');
    if (!has('manuscript')) errs.push('the anonymised manuscript (.docx)');
    if (s.status === 'draft' && !has('titlepage')) errs.push('the title page (.docx)');
    if (s.status === 'revision' && !has('response')) errs.push('your response to reviewers');
    const d = s.declarations || {};
    if (s.status === 'draft' && !(d.original && d.ethics && d.consent && d.license)) errs.push('all required declarations');
    need_(!errs.length, 'Before submitting, please add: ' + errs.join(', ') + '.');
    const j = journalRow_(s.journal);
    if (s.status === 'draft') {
      const n = nextId_(s.journal);
      const old = s.id;
      where_('Files', f => f.subId === old).forEach(f => update_('Files', 'id', f.id, { subId: n.id }));
      try { const it = subFolder_(rootFolder_(), s.journal.toUpperCase()).getFoldersByName(old); if (it.hasNext()) it.next().setName(n.id); } catch (e) { }
      s = update_('Submissions', 'id', old, { id: n.id, year: n.year, serial: n.serial, status: 'submitted', submittedAt: now_(), updated: now_() });
      log_(s.id, u.id, 'submitted', 'Version 1 submitted', true);
      mailTemplate_('submitted_author', authorEmails_(s), { name: u.given, id: s.id, title: s.title, journal: j.name, link: link_(s.id) }, { journal: s.journal });
      (s.authors || []).filter(a => a.email && authorEmails_(s).indexOf(a.email.toLowerCase()) < 0).forEach(a =>
        mailTemplate_('submitted_coauthor', a.email, { name: a.given, submitter: nameOf_(u), id: s.id, title: s.title, journal: j.name }, { journal: s.journal }));
      mailTemplate_('submitted_office', officeEmails_(s.journal), { id: s.id, code: j.code, type: s.type, title: s.title, name: nameOf_(u), journal: j.name, link: link_(s.id) }, { journal: s.journal });
    } else if (s.status === 'returned') {
      s = update_('Submissions', 'id', s.id, { status: 'submitted', updated: now_() });
      log_(s.id, u.id, 'resubmitted', 'Corrections submitted after technical check', true);
      mailTemplate_('submitted_office', officeEmails_(s.journal), { id: s.id, code: j.code, type: s.type, title: s.title + ' (corrected)', name: nameOf_(u), journal: j.name, link: link_(s.id) }, { journal: s.journal });
    } else {
      s = update_('Submissions', 'id', s.id, { status: s.editorId ? 'under_review' : 'with_editor', updated: now_() });
      log_(s.id, u.id, 'revision_submitted', 'Revision ' + s.version + ' submitted', true);
      const to = s.editorId ? [find_('Users', 'id', s.editorId).email] : eicEmails_(s.journal);
      mailTemplate_('revision_in', to, { id: s.id, code: j.code, version: s.version, link: link_(s.id) }, { journal: s.journal });
    }
    return { ok: true, id: s.id };
  });
}

function sub_withdraw(p, u) {
  const s = sub_(p.id); need_(s.submitterId === u.id, 'Not your submission.');
  need_(['published', 'proof', 'production', 'proof_approved'].indexOf(s.status) < 0, 'Published or in-production articles cannot be withdrawn here. Contact the editorial office.');
  if (s.status === 'draft') { update_('Submissions', 'id', s.id, { status: 'withdrawn' }); return { ok: true }; }
  update_('Submissions', 'id', s.id, { status: 'withdrawn', updated: now_() });
  log_(s.id, u.id, 'withdrawn', p.reason || '', true);
  where_('Reviews', r => r.subId === s.id && ['invited', 'accepted'].indexOf(r.status) >= 0).forEach(r => update_('Reviews', 'id', r.id, { status: 'cancelled' }));
  sendMail_(officeEmails_(s.journal), '[' + s.journal.toUpperCase() + '] ' + s.id + ' withdrawn by author', emailShell_('', '', '<p>' + s.id + ' was withdrawn by the author.</p>' + quote_(p.reason || '')));
  return { ok: true };
}

function sub_finalSubmit(p, u) {
  const s = sub_(p.id); need_(s.submitterId === u.id && s.status === 'accepted', 'Not allowed.');
  const files = where_('Files', f => f.subId === s.id && String(f.active) !== 'false' && f.kind === 'final');
  need_(files.length, 'Please upload the final manuscript (.docx).');
  update_('Submissions', 'id', s.id, { flags: Object.assign({}, s.flags || {}, { finalReady: true }), updated: now_() });
  log_(s.id, u.id, 'final_files', 'Final files submitted', true);
  const j = journalRow_(s.journal);
  mailTemplate_('final_in', officeEmails_(s.journal), { id: s.id, code: j.code, link: link_(s.id) }, { journal: s.journal });
  return { ok: true };
}

function sub_proofRespond(p, u) {
  const s = sub_(p.id); need_(s.submitterId === u.id && s.status === 'proof', 'Not allowed.');
  const j = journalRow_(s.journal);
  if (p.approve) {
    update_('Submissions', 'id', s.id, { status: 'proof_approved', updated: now_() });
    log_(s.id, u.id, 'proof_approved', 'Author approved proofs', true);
  } else {
    need_(p.note && p.note.trim().length > 5, 'Please list your corrections.');
    log_(s.id, u.id, 'proof_corrections', p.note, true);
  }
  mailTemplate_('proof_response', officeEmails_(s.journal), { id: s.id, code: j.code, what: p.approve ? 'approved' : 'sent corrections for', note: p.note || '', link: link_(s.id) }, { journal: s.journal });
  return { ok: true };
}

// ------------------------------------------------------------ views
function sub_list(p, u) {
  return { ok: true, items: where_('Submissions', s => s.submitterId === u.id && s.status !== 'withdrawn' || (s.submitterId === u.id && p.all)).map(s => listItem_(s, 'author')).sort((a, b) => String(b.updated).localeCompare(String(a.updated))) };
}
function listItem_(s, role) {
  const st = role === 'author' ? (AUTHOR_STATUS[s.status] || STATUS[s.status]) : STATUS[s.status];
  return { id: s.id, journal: s.journal, title: s.title || '(untitled draft)', type: s.type, status: s.status, statusLabel: st, version: s.version, submittedAt: s.submittedAt, updated: s.updated, decision: s.decision, editorId: s.editorId, author: (corresponding_(s).family || ''), flags: s.flags || {} };
}

function sub_get(p, u) {
  const s = sub_(p.id), role = roleFor_(s, u);
  need_(role, 'You do not have access to this manuscript.');
  const j = journalRow_(s.journal);
  const files = where_('Files', f => f.subId === s.id && String(f.active) !== 'false').map(fileView_);
  const v = listItem_(s, role === 'author' ? 'author' : 'editor');
  Object.assign(v, {
    role: role, journalName: j.name, journalCode: j.code, accent: j.accent, articleTypes: j.articleTypes || [], subjects: j.subjects || [],
    subtitle: s.subtitle, subject: s.subject || [], abstract: tryJson_(s.abstract), keywords: s.keywords || [], authors: s.authors || [], affiliations: s.affiliations || [],
    declarations: s.declarations || {}, coverLetter: s.coverLetter, files: files, doi: s.doi, zenodoId: s.zenodoId, volume: s.volume, issue: s.issue, published: s.published,
    acceptedAt: s.acceptedAt, decisionAt: s.decisionAt,
  });
  if (['proof', 'proof_approved', 'production', 'published'].indexOf(s.status) >= 0 && s.previewToken) {
    v.proofUrl = siteUrl_() + '/proofs/' + s.previewToken + '/';
    v.proofPdf = siteUrl_() + '/proofs/' + s.previewToken + '/' + s.id.toLowerCase() + '.pdf';
  }
  if (s.status === 'published') v.articleUrl = articleUrl_(s);
  const reviews = where_('Reviews', r => r.subId === s.id);
  const acts = where_('Activity', a => a.subId === s.id);
  if (role === 'author') {
    v.history = acts.filter(a => a.author === 'yes').map(a => ({ ts: a.ts, action: a.action, detail: a.action === 'decision' ? a.detail : (['returned', 'proof_corrections'].indexOf(a.action) >= 0 ? a.detail : '') }));
    // Reviewer comments become visible once a decision exists for that version.
    v.reviews = reviews.filter(r => r.status === 'submitted' && decidedVersion_(acts, r.version)).map(r => ({ version: r.version, number: r.number, toAuthor: r.toAuthor }));
  } else {
    const users = {}; all_('Users').forEach(x => users[x.id] = x);
    v.submitter = publicUser_(users[s.submitterId]);
    v.editor = s.editorId ? publicUser_(users[s.editorId]) : null;
    v.history = acts.map(a => ({ ts: a.ts, action: a.action, detail: a.detail, by: users[a.userId] ? nameOf_(users[a.userId]) : a.userId }));
    v.reviews = reviews.map(r => ({ id: r.id, version: r.version, number: r.number, status: r.status, reviewer: users[r.reviewerId] ? { name: nameOf_(users[r.reviewerId]), email: users[r.reviewerId].email, affiliation: users[r.reviewerId].affiliation } : null, invitedAt: r.invitedAt, respondedAt: r.respondedAt, due: r.due, submittedAt: r.submittedAt, scores: r.scores, recommendation: r.recommendation, toAuthor: r.toAuthor, toEditor: r.toEditor, reminders: r.reminders }));
    v.boardMembers = ['eic', 'senior', 'editor', 'board'].reduce((a, r) => a.concat(journalStaff_(s.journal, r)), []).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).map(x => ({ id: x.id, name: nameOf_(x), email: x.email }));
    v.canDecide = role === 'admin' || role === 'eic';
  }
  return { ok: true, sub: v };
}
function decidedVersion_(acts, version) { return acts.some(a => a.action === 'decision' && String(a.detail).indexOf('[v' + version + ']') === 0); }
function tryJson_(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch (e) { return s; } }

function file_get(p, u) {
  const f = find_('Files', 'id', p.fileId); need_(f, 'File not found.');
  const s = sub_(f.subId), role = roleFor_(s, u); need_(role, 'Not allowed.');
  const blob = DriveApp.getFileById(p.pdf ? toPdf_(f) : f.driveId).getBlob();
  return { ok: true, name: p.pdf ? f.name.replace(/\.\w+$/, '.pdf') : f.name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// ------------------------------------------------------------ dashboard
function dash(p, u) {
  const subs = all_('Submissions').filter(s => s.status !== 'draft' || s.submitterId === u.id);
  const out = { ok: true, user: publicUser_(u), author: subs.filter(s => s.submitterId === u.id && s.status !== 'withdrawn').map(s => listItem_(s, 'author')) };
  out.reviews = where_('Reviews', r => r.reviewerId === u.id && r.status !== 'cancelled').map(r => { const s = subs.find(x => x.id === r.subId) || {}; return { id: r.id, token: r.token, subId: r.subId, title: s.title, journal: s.journal, status: r.status, due: r.due, invitedAt: r.invitedAt, submittedAt: r.submittedAt }; });
  const js = all_('Journals').map(j => j.slug);
  const eicJ = js.filter(j => isSenior_(u, j)), boardJ = js.filter(j => isBoard_(u, j));
  if (boardJ.length) out.editor = subs.filter(s => s.editorId === u.id && ['under_review', 'reviews_complete', 'with_editor', 'revision'].indexOf(s.status) >= 0).map(s => listItem_(s, 'editor'));
  if (eicJ.length) out.eic = subs.filter(s => eicJ.indexOf(s.journal) >= 0 && ['draft', 'withdrawn'].indexOf(s.status) < 0).map(s => listItem_(s, 'editor'));
  if (isAdmin_(u)) {
    out.office = subs.filter(s => s.status === 'submitted').map(s => listItem_(s, 'editor'));
    out.production = subs.filter(s => ['accepted', 'production', 'proof', 'proof_approved'].indexOf(s.status) >= 0 || (s.status === 'published' && !(s.flags || {}).doiRegistered)).map(s => listItem_(s, 'editor'));
  }
  out.journals = js.map(journalRow_).map(j => ({ slug: j.slug, code: j.code, name: j.name, accent: j.accent }));
  out.pendingAgreements = where_('Appointments', a => a.userId === u.id && a.status === 'pending').map(a => ({ token: a.token, journal: a.journal, role: roleLabel_(a) }));
  out.newMessages = msg_count_(u);
  return out;
}

// ------------------------------------------------------------ editorial office & editors
function ed_techCheck(p, u) {
  const s = sub_(p.id); need_(isAdmin_(u), 'Editorial office only.'); need_(s.status === 'submitted', 'Not awaiting technical check.');
  const j = journalRow_(s.journal);
  if (p.pass) {
    update_('Submissions', 'id', s.id, { status: 'with_editor', updated: now_() });
    log_(s.id, u.id, 'tech_passed', p.note || 'Passed technical check', true);
    mailTemplate_('to_editor', eicEmails_(s.journal), { id: s.id, code: j.code, title: s.title, link: link_(s.id) }, { journal: s.journal });
  } else {
    need_(p.note, 'Tell the author what to correct.');
    update_('Submissions', 'id', s.id, { status: 'returned', updated: now_() });
    log_(s.id, u.id, 'returned', p.note, true);
    mailTemplate_('returned', authorEmails_(s), { name: (submitter_(s) || {}).given, id: s.id, note: p.note, journal: j.name, link: link_(s.id) }, { journal: s.journal });
  }
  return { ok: true };
}

function ed_assign(p, u) {
  const s = sub_(p.id); need_(isSenior_(u, s.journal), 'Only the Editor-in-Chief or a Senior Editor can assign handling editors.');
  const ed = find_('Users', 'id', p.editorId); if (ed) ed.roles = effectiveRoles_(ed); need_(ed && isBoard_(ed, s.journal), 'Choose a member of this journal\'s editorial board.');
  update_('Submissions', 'id', s.id, { editorId: ed.id, status: s.status === 'with_editor' ? 'under_review' : s.status, updated: now_() });
  log_(s.id, u.id, 'editor_assigned', nameOf_(ed));
  const j = journalRow_(s.journal);
  if (ed.id !== u.id) mailTemplate_('editor_assigned', ed.email, { name: ed.given, id: s.id, code: j.code, title: s.title, link: link_(s.id) }, { journal: s.journal });
  return { ok: true };
}

function ed_inviteReviewer(p, u) {
  const s = sub_(p.id), role = roleFor_(s, u);
  need_(['admin', 'eic', 'senior', 'editor'].indexOf(role) >= 0, 'Only the handling editor, a Senior Editor or the Editor-in-Chief can invite reviewers.');
  need_(['with_editor', 'under_review', 'reviews_complete'].indexOf(s.status) >= 0, 'Reviewers can only be invited while the manuscript is with the editor.');
  const email = normEmail_(p.email); need_(/@/.test(email), 'Enter the reviewer\'s email.');
  // Conflict guard: reviewer cannot be an author.
  need_(!(s.authors || []).some(a => normEmail_(a.email) === email) && (submitter_(s) || {}).email !== email, 'This person is an author of the manuscript.');
  return withLock_(() => {
    let r = find_('Users', 'email', email);
    if (!r) {
      need_(p.given && p.family, 'Enter the reviewer\'s name.');
      r = insert_('Users', { id: uid_('U'), email: email, given: p.given, family: p.family, affiliation: p.affiliation || '', passHash: '', salt: token_().slice(0, 16), verified: true, reviewer: true, roles: {}, status: 'invited', created: now_() });
    }
    need_(!where_('Reviews', x => x.subId === s.id && x.reviewerId === r.id && String(x.version) === String(s.version) && x.status !== 'cancelled').length, 'This reviewer is already invited for this version.');
    const n = where_('Reviews', x => x.subId === s.id).reduce((m, x) => Math.max(m, Number(x.number) || 0), 0);
    const prev = where_('Reviews', x => x.subId === s.id && x.reviewerId === r.id)[0];
    const rv = insert_('Reviews', { id: uid_('R'), subId: s.id, version: s.version, reviewerId: r.id, number: prev ? prev.number : n + 1, status: 'invited', invitedBy: u.id, invitedAt: now_(), due: '', reminders: 0, token: token_() });
    if (s.status === 'with_editor') update_('Submissions', 'id', s.id, { status: 'under_review', editorId: s.editorId || u.id, updated: now_() });
    log_(s.id, u.id, 'reviewer_invited', nameOf_(r) + ' <' + email + '>');
    const j = journalRow_(s.journal);
    mailTemplate_('review_invite', email, { name: nameOf_(r), id: s.id, title: s.title, type: s.type, journal: j.name, abstract: abstractHtml_(s), accept: portalUrl_('review?token=' + rv.token + '&a=accept'), decline: portalUrl_('review?token=' + rv.token + '&a=decline') }, { journal: s.journal });
    return { ok: true };
  });
}
function ed_reviewAction(p, u) {
  const r = find_('Reviews', 'id', p.reviewId); need_(r, 'Review not found.');
  const s = sub_(r.subId), role = roleFor_(s, u); need_(['admin', 'eic', 'senior', 'editor'].indexOf(role) >= 0, 'Not allowed.');
  const rv = find_('Users', 'id', r.reviewerId), j = journalRow_(s.journal);
  if (p.op === 'cancel') { update_('Reviews', 'id', r.id, { status: 'cancelled' }); log_(s.id, u.id, 'reviewer_cancelled', nameOf_(rv)); }
  if (p.op === 'remind') {
    if (r.status === 'invited') mailTemplate_('invite_reminder', rv.email, { name: nameOf_(rv), id: s.id, title: s.title, journal: j.name, accept: portalUrl_('review?token=' + r.token + '&a=accept'), decline: portalUrl_('review?token=' + r.token + '&a=decline') }, { journal: s.journal });
    else mailTemplate_('review_reminder', rv.email, { name: nameOf_(rv), id: s.id, title: s.title, due: r.due, link: portalUrl_('review?token=' + r.token) }, { journal: s.journal });
    update_('Reviews', 'id', r.id, { reminders: (Number(r.reminders) || 0) + 1 });
  }
  if (p.op === 'extend') { update_('Reviews', 'id', r.id, { due: p.due }); log_(s.id, u.id, 'review_extended', nameOf_(rv) + ' → ' + p.due); }
  return { ok: true };
}

function ed_note(p, u) {
  const s = sub_(p.id), role = roleFor_(s, u); need_(role && role !== 'author', 'Not allowed.');
  log_(s.id, u.id, p.recommend ? 'recommendation' : 'note', (p.recommend ? 'Recommends: ' + DECISIONS[p.recommend] + '. ' : '') + (p.note || ''));
  if (p.recommend) sendMail_(eicEmails_(s.journal), '[' + s.journal.toUpperCase() + '] Recommendation for ' + s.id + ': ' + DECISIONS[p.recommend], emailShell_('', '', '<p>' + esc_(nameOf_(u)) + ' recommends <b>' + DECISIONS[p.recommend] + '</b> for ' + s.id + '.</p>' + quote_(p.note || '') + btn_(link_(s.id), 'Open manuscript')));
  return { ok: true };
}

function ed_decide(p, u) {
  const s = sub_(p.id); need_(isEic_(u, s.journal), 'Only the Editor-in-Chief can record decisions.');
  need_(DECISIONS[p.decision], 'Choose a decision.');
  need_(['with_editor', 'under_review', 'reviews_complete'].indexOf(s.status) >= 0, 'This manuscript is not awaiting a decision.');
  const j = journalRow_(s.journal);
  const label = DECISIONS[p.decision];
  const rv = where_('Reviews', r => r.subId === s.id && String(r.version) === String(s.version) && r.status === 'submitted');
  const patch = { decision: p.decision, decisionAt: now_(), updated: now_() };
  let action = '';
  if (p.decision === 'accept') {
    patch.status = 'accepted'; patch.acceptedAt = today_(); action = 'Upload final files';
    if (!s.zenodoId && prop_('ZENODO_TOKEN')) { try { const z = zenodoReserve_(Object.assign({}, s, { abstract: tryJson_(s.abstract) }), j); patch.zenodoId = z.id; patch.doi = z.doi; } catch (e) { log_(s.id, 'system', 'doi_error', String(e.message)); } }
  } else if (p.decision === 'minor' || p.decision === 'major') { patch.status = 'revision'; patch.version = Number(s.version) + 1; action = 'Submit your revision'; }
  else patch.status = p.decision === 'desk_reject' ? 'desk_rejected' : 'rejected';
  update_('Submissions', 'id', s.id, patch);
  log_(s.id, u.id, 'decision', '[v' + s.version + '] ' + label + (p.letter ? '\n\n' + p.letter : ''), true);
  const revHtml = p.includeReviews === false ? '' : rv.filter(r => r.toAuthor).map(r => '<p style="margin:18px 0 4px"><b>Reviewer ' + r.number + '</b></p>' + quote_(r.toAuthor)).join('');
  const sm = submitter_(s);
  mailTemplate_(p.decision === 'accept' ? 'accepted' : 'decision', authorEmails_(s), { name: sm ? sm.given : '', id: s.id, title: s.title, journal: j.name, decision: label, letter: p.letter, reviews: revHtml, editor: nameOf_(u) + ', Editor-in-Chief', action: action, link: link_(s.id), doi: patch.doi }, { journal: s.journal });
  rv.forEach(r => { const x = find_('Users', 'id', r.reviewerId); if (x) mailTemplate_('decision_reviewer', x.email, { name: x.given, id: s.id, title: s.title, decision: label, link: portalUrl_('review?token=' + r.token) }, { journal: s.journal }); });
  where_('Reviews', r => r.subId === s.id && String(r.version) === String(s.version) && ['invited', 'accepted'].indexOf(r.status) >= 0).forEach(r => update_('Reviews', 'id', r.id, { status: 'cancelled' }));
  return { ok: true };
}

// ------------------------------------------------------------ reviewer (token-based; no password needed)
function review_(token) { const r = find_('Reviews', 'token', token); need_(r && token, 'This review link is invalid.'); need_(r.status !== 'cancelled', 'This review invitation has been withdrawn. Thank you.'); return r; }
function rev_get(p) {
  const r = review_(p.token), s = sub_(r.subId), j = journalRow_(s.journal);
  const out = { id: r.id, status: r.status, number: r.number, due: r.due, version: r.version, scores: r.scores || {}, recommendation: r.recommendation, toAuthor: r.toAuthor, toEditor: r.toEditor, submittedAt: r.submittedAt,
    ms: { id: s.id, title: s.title, subtitle: s.subtitle, type: s.type, abstract: tryJson_(s.abstract), keywords: s.keywords || [], journal: j.name, code: j.code, accent: j.accent } };
  if (r.status === 'accepted' || r.status === 'submitted') {
    out.files = where_('Files', f => f.subId === s.id && String(f.version) === String(r.version) && String(f.active) !== 'false' && ['manuscript', 'response', 'supplementary', 'figure'].indexOf(f.kind) >= 0).map(fileView_);
    if (r.status === 'submitted' && s.decision) out.others = where_('Reviews', x => x.subId === s.id && x.id !== r.id && x.status === 'submitted' && String(x.version) === String(r.version)).map(x => ({ number: x.number, toAuthor: x.toAuthor, recommendation: x.recommendation }));
  }
  return { ok: true, review: out };
}
function rev_respond(p) {
  const r = review_(p.token); need_(r.status === 'invited', 'You have already responded to this invitation.');
  const s = sub_(r.subId), j = journalRow_(s.journal), rv = find_('Users', 'id', r.reviewerId);
  const patch = { status: p.accept ? 'accepted' : 'declined', respondedAt: now_() };
  if (p.accept) patch.due = addDays_(CFG.REVIEW_DAYS);
  update_('Reviews', 'id', r.id, patch);
  log_(s.id, r.reviewerId, p.accept ? 'review_accepted' : 'review_declined', (p.reason || '') + (p.suggest ? ' Suggested: ' + p.suggest : ''));
  const ed = s.editorId ? find_('Users', 'id', s.editorId) : null;
  mailTemplate_('reviewer_status', ed ? ed.email : eicEmails_(s.journal), { code: j.code, id: s.id, reviewer: nameOf_(rv), what: p.accept ? 'accepted' : 'declined', link: link_(s.id) }, { journal: s.journal });
  return { ok: true, due: patch.due };
}
function rev_file(p) {
  const r = review_(p.token); need_(['accepted', 'submitted'].indexOf(r.status) >= 0, 'Accept the invitation to open the manuscript.');
  const f = find_('Files', 'id', p.fileId); need_(f && f.subId === r.subId && ['manuscript', 'response', 'supplementary', 'figure'].indexOf(f.kind) >= 0, 'Not allowed.');
  const asPdf = /\.docx?$/i.test(f.name);
  const blob = DriveApp.getFileById(asPdf ? toPdf_(f) : f.driveId).getBlob();
  return { ok: true, name: f.name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}
function rev_save(p) {
  const r = review_(p.token); need_(r.status === 'accepted', 'This review can no longer be edited.');
  const patch = { scores: p.scores || {}, recommendation: p.recommendation || '', toAuthor: p.toAuthor || '', toEditor: p.toEditor || '' };
  if (p.submit) {
    need_(patch.recommendation, 'Choose a recommendation.');
    need_(String(patch.toAuthor).trim().length >= 100, 'Please write at least a short paragraph of comments for the authors (100+ characters).');
    patch.status = 'submitted'; patch.submittedAt = now_();
  }
  update_('Reviews', 'id', r.id, patch);
  if (p.submit) {
    const s = sub_(r.subId), j = journalRow_(s.journal), rv = find_('Users', 'id', r.reviewerId);
    log_(s.id, r.reviewerId, 'review_submitted', 'Reviewer ' + r.number + ': ' + DECISIONS[patch.recommendation]);
    const done = where_('Reviews', x => x.subId === s.id && String(x.version) === String(s.version) && x.status === 'submitted').length;
    const open = where_('Reviews', x => x.subId === s.id && String(x.version) === String(s.version) && ['invited', 'accepted'].indexOf(x.status) >= 0).length;
    if (done >= 2 && !open) update_('Submissions', 'id', s.id, { status: 'reviews_complete', updated: now_() });
    const ed = s.editorId ? find_('Users', 'id', s.editorId) : null;
    mailTemplate_('review_in', (ed ? [ed.email] : []).concat(eicEmails_(s.journal)), { code: j.code, id: s.id, count: done + ' of ' + (done + open), rec: DECISIONS[patch.recommendation], link: link_(s.id) }, { journal: s.journal });
    mailTemplate_('review_thanks', rv.email, { name: rv.given, id: s.id, title: s.title, journal: j.name }, { journal: s.journal });
  }
  return { ok: true };
}

// ------------------------------------------------------------ daily reminders (time-driven trigger)
function dailyReminders() {
  const today = today_();
  where_('Reviews', r => ['invited', 'accepted'].indexOf(r.status) >= 0).forEach(r => {
    try {
      const s = sub_(r.subId), j = journalRow_(s.journal), rv = find_('Users', 'id', r.reviewerId);
      if (!automationOn_(s.journal, 'review_reminders')) return;
      const days = (Date.now() - new Date(r.invitedAt).getTime()) / 864e5;
      const n = Number(r.reminders) || 0;
      if (r.status === 'invited') {
        if (days > CFG.INVITE_DAYS * 2) { update_('Reviews', 'id', r.id, { status: 'expired' }); log_(s.id, 'system', 'invite_expired', nameOf_(rv)); }
        else if (days > CFG.INVITE_DAYS && n < 1) { mailTemplate_('invite_reminder', rv.email, { name: nameOf_(rv), id: s.id, title: s.title, journal: j.name, accept: portalUrl_('review?token=' + r.token + '&a=accept'), decline: portalUrl_('review?token=' + r.token + '&a=decline') }, { journal: s.journal }); update_('Reviews', 'id', r.id, { reminders: n + 1 }); }
      } else if (r.due) {
        const left = (new Date(r.due).getTime() - new Date(today).getTime()) / 864e5;
        if ((left === 3 || (left < 0 && Math.abs(left) % 4 === 0)) && n < 4) { mailTemplate_('review_reminder', rv.email, { name: nameOf_(rv), id: s.id, title: s.title, due: r.due, link: portalUrl_('review?token=' + r.token) }, { journal: s.journal }); update_('Reviews', 'id', r.id, { reminders: n + 1 }); }
      }
    } catch (e) { console.error(e); }
  });
}
function normEmail(e) { return normEmail_(e); }

// ======================================================================
// 06_Production.gs
// ======================================================================
/** Production: send to GitHub → automatic conversion → proofs → publish → Zenodo DOI registration. */

function artPath_(s) { return 'content/articles/' + s.journal + '/' + s.id; }

/** Build the article metadata the converter needs (everything except the body). */
function articleMeta_(s) {
  const d = s.declarations || {};
  return {
    id: s.id, journal: s.journal, type: s.type, subject: s.subject || [], title: s.title, subtitle: s.subtitle || undefined,
    authors: (s.authors || []).map(a => ({ given: a.given, family: a.family, degrees: a.degrees || '', orcid: a.orcid || '', email: a.corresponding ? a.email : undefined, affiliations: a.affiliations || [], corresponding: !!a.corresponding })),
    affiliations: s.affiliations || [], abstract: tryJson_(s.abstract) || undefined, keywords: s.keywords || [],
    received: (s.submittedAt || '').slice(0, 10), accepted: s.acceptedAt || '', doi: s.doi || '', zenodo: s.zenodoId || '',
    volume: s.volume || '', issue: s.issue || '', license: d.licenseType || 'CC-BY-4.0', previewToken: s.previewToken,
    info: { contributions: d.contributions || '', conflicts: d.conflicts || 'None reported.', funding: d.funding || 'None reported.', ethics: d.ethicsStatement || '', dataSharing: d.dataSharing || '', aiUse: d.aiUse || '', acknowledgments: d.acknowledgments || '' },
  };
}

function prod_send(p, u) {
  need_(isAdmin_(u), 'Production is handled by the editorial office.');
  const s = sub_(p.id); need_(['accepted', 'production', 'proof'].indexOf(s.status) >= 0, 'Only accepted manuscripts can go to production.');
  const files = where_('Files', f => f.subId === s.id && String(f.active) !== 'false');
  const ms = files.filter(f => f.kind === 'final').pop() || files.filter(f => f.kind === 'manuscript').pop();
  need_(ms && /\.docx$/i.test(ms.name), 'No final .docx manuscript found.');
  const figs = files.filter(f => f.kind === 'final_figure');
  const useFigs = figs.length ? figs : files.filter(f => f.kind === 'figure' && String(f.version) === String(s.version));
  const token = s.previewToken || token_().slice(0, 24).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  s.previewToken = token;
  const meta = Object.assign(articleMeta_(s), p.meta || {});
  const base = 'content/incoming/' + s.id + '/';
  const commit = [
    { path: base + 'meta.json', text: JSON.stringify(meta, null, 2) },
    { path: base + 'manuscript.docx', bytes: DriveApp.getFileById(ms.driveId).getBlob().getBytes() },
  ].concat(useFigs.map(f => ({ path: base + 'figures/' + f.name, bytes: DriveApp.getFileById(f.driveId).getBlob().getBytes() })));
  ghCommit_(commit, 'Production: ' + s.id + ' (' + s.title.slice(0, 60) + ')');
  update_('Submissions', 'id', s.id, { status: 'production', previewToken: token, updated: now_() });
  log_(s.id, u.id, 'sent_to_production', ms.name + ', ' + useFigs.length + ' figures', true);
  return { ok: true, message: 'Sent. The site will build the proof in about 2–4 minutes.' };
}

/** Called by the portal (and a 10-minute trigger): when the converted article exists in the repo, notify the author. */
function prod_check(p, u) {
  if (u) need_(isAdmin_(u), 'Not allowed.');
  const list = p && p.id ? [sub_(p.id)] : where_('Submissions', s => s.status === 'production');
  const out = [];
  list.forEach(s => {
    if (s.status !== 'production') return;
    const a = ghRead_(artPath_(s) + '/article.json');
    if (!a) { out.push({ id: s.id, ready: false, stage: ghRead_('content/incoming/' + s.id + '/meta.json') ? 'Waiting for GitHub to convert the manuscript (check GitHub → Actions).' : 'The manuscript is not in GitHub. Click "Send to production" again.' }); return; }
    // Make sure the proof page is live before emailing.
    const live = UrlFetchApp.fetch(siteUrl_() + '/proofs/' + s.previewToken + '/', { muteHttpExceptions: true, followRedirects: true }).getResponseCode() === 200;
    if (!live) { out.push({ id: s.id, ready: false, building: true, stage: 'Converted. Waiting for the website to publish the proof page.' }); return; }
    update_('Submissions', 'id', s.id, { status: 'proof', updated: now_() });
    log_(s.id, 'system', 'proof_ready', 'Proofs sent to author', true);
    const sm = submitter_(s);
    mailTemplate_('proof', authorEmails_(s), { name: sm ? sm.given : '', id: s.id, title: s.title, link: link_(s.id) }, { journal: s.journal });
    out.push({ id: s.id, ready: true });
  });
  return { ok: true, items: out, build: u ? ghLatestRun_() : null };
}
function productionTick() { try { prod_check({}, null); } catch (e) { console.error(e); } }

/** Read / edit the converted article directly (fix a typo, a caption, an affiliation). */
function prod_source(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id);
  return { ok: true, article: ghRead_(artPath_(s) + '/article.json'), body: ghRead_(artPath_(s) + '/body.html') };
}
function prod_saveSource(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id);
  JSON.parse(p.article); // validate
  ghCommit_([{ path: artPath_(s) + '/article.json', text: p.article }, { path: artPath_(s) + '/body.html', text: p.body }], 'Edit: ' + s.id);
  log_(s.id, u.id, 'source_edited', p.note || 'Article source edited');
  return { ok: true };
}

function prod_publish(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(['proof', 'proof_approved'].indexOf(s.status) >= 0 || p.force, 'Publish after the author has approved the proofs.');
  const raw = ghRead_(artPath_(s) + '/article.json'); need_(raw, 'Converted article not found in the repository.');
  const a = JSON.parse(raw);
  a.status = 'published';
  a.published = p.published || today_();
  a.volume = String(p.volume || ''); a.issue = String(p.issue || '');
  if (p.elocator) a.elocator = p.elocator;
  if (p.featured !== undefined) a.featured = !!p.featured;
  a.doi = s.doi || a.doi || ''; a.zenodo = s.zenodoId || a.zenodo || '';
  delete a.previewToken;
  ghCommit_([{ path: artPath_(s) + '/article.json', text: JSON.stringify(a, null, 2) }], 'Publish: ' + s.id);
  update_('Submissions', 'id', s.id, { status: 'published', published: a.published, volume: a.volume, issue: a.issue, updated: now_() });
  log_(s.id, u.id, 'published', 'Published ' + a.published + (a.volume ? ' in Vol ' + a.volume + '(' + a.issue + ')' : ' (New Online)'), true);
  const sm = submitter_(s), j = journalRow_(s.journal);
  let certs = [];
  try { certs = certificatesFor_(s.journal, s.id, true).map(c => ({ name: c.file, b64: c.b64 })); } catch (e) { console.error('certificates', e); }
  mailTemplate_('published', authorEmails_(s), { name: sm ? sm.given : '', title: s.title, journal: j.name, doi: s.doi, url: articleUrl_(s), certs: certs.length }, { journal: s.journal, attachments: certs });
  try { onArticlePublished_(s); } catch (e) { console.error(e); }
  return { ok: true, message: 'Published. The article will be live in about 2–4 minutes. Then register the DOI.' };
}

function prod_registerDoi(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(s.status === 'published', 'Publish the article first.');
  const sub = Object.assign({}, s, { abstract: tryJson_(s.abstract) });
  const r = zenodoRegister_(sub, journalRow_(s.journal));
  update_('Submissions', 'id', s.id, { doi: r.doi || s.doi, flags: Object.assign({}, s.flags || {}, { doiRegistered: true, zenodoUrl: r.url }) });
  log_(s.id, u.id, 'doi_registered', (r.doi || s.doi) + ' ' + r.url);
  return { ok: true, doi: r.doi, url: r.url };
}
function prod_reserveDoi(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(!s.zenodoId, 'A DOI is already reserved: ' + s.doi);
  const z = zenodoReserve_(Object.assign({}, s, { abstract: tryJson_(s.abstract) }), journalRow_(s.journal));
  update_('Submissions', 'id', s.id, { zenodoId: z.id, doi: z.doi });
  log_(s.id, u.id, 'doi_reserved', z.doi);
  return { ok: true, doi: z.doi };
}

// ======================================================================
// 07_Admin.gs
// ======================================================================
/** Administration: journals, editorial boards, roles, issues, subscribers, diagnostics. */

function adm_overview(p, u) {
  need_(isAdmin_(u));
  const subs = all_('Submissions').filter(s => s.status !== 'draft');
  const by = {}; subs.forEach(s => { by[s.status] = (by[s.status] || 0) + 1; });
  return { ok: true, counts: by, total: subs.length, users: all_('Users').length, reviewers: all_('Users').filter(x => String(x.reviewer) === 'true').length,
    subscribers: where_('Contacts', x => x.status === 'subscribed').length, build: safe_(ghLatestRun_), mail: all_('EmailLog').slice(-15).reverse(),
    config: { github: !!prop_('GITHUB_TOKEN'), repo: prop_('GITHUB_REPO'), zepto: !!prop_('ZEPTO_TOKEN'), zenodo: !!prop_('ZENODO_TOKEN'), sandbox: prop_('ZENODO_SANDBOX', 'true'), site: siteUrl_() } };
}
function tint_(hex) { const n = parseInt(String(hex).replace('#', ''), 16), m = (c) => Math.round(c + (255 - c) * 0.94); return '#' + [m(n >> 16 & 255), m(n >> 8 & 255), m(n & 255)].map(x => ('0' + x.toString(16)).slice(-2)).join(''); }
function safe_(fn) { try { return fn(); } catch (e) { return { error: String(e.message) }; } }

function adm_allSubs(p, u) {
  need_(isAdmin_(u));
  return { ok: true, items: all_('Submissions').filter(s => s.status !== 'draft' && (!p.journal || s.journal === p.journal)).map(s => listItem_(s, 'editor')).sort((a, b) => String(b.updated).localeCompare(String(a.updated))) };
}

function adm_users(p, u) {
  need_(isAdmin_(u));
  const q = String(p.q || '').toLowerCase();
  return { ok: true, items: all_('Users').filter(x => !q || (x.email + ' ' + x.given + ' ' + x.family + ' ' + x.affiliation).toLowerCase().indexOf(q) >= 0).slice(0, 200).map(x => Object.assign(publicUser_(x), { status: x.status, created: x.created, lastLogin: x.lastLogin })) };
}
/** Admin flag and account status only. Editorial roles are given through appointments (Editorial team). */
function adm_setRoles(p, u) {
  need_(isAdmin_(u));
  const x = find_('Users', 'id', p.userId); need_(x, 'User not found.');
  const admin = x.id === u.id ? true : !!(p.roles && p.roles.admin);
  update_('Users', 'id', x.id, { roles: { admin: admin }, status: p.status || x.status });
  return { ok: true };
}

function adm_journals(p, u) {
  need_(isAdmin_(u));
  return { ok: true, items: all_('Journals').map(r => Object.assign(journalRow_(r.slug), { issues: where_('Issues', i => i.journal === r.slug) })) };
}
/** Save a journal (new or existing): updates the sheet AND commits journal.json so the website updates. */
function adm_saveJournal(p, u) {
  need_(isAdmin_(u));
  const j = p.journal;
  need_(/^[a-z0-9-]{2,20}$/.test(j.slug || ''), 'Slug must be 2–20 lowercase letters/numbers, e.g. "ijelf".');
  need_(j.code && j.name, 'Code and name are required.');
  const prev = (find_('Journals', 'slug', j.slug) || {}).json || {};
  const json = Object.assign({}, prev, {
    slug: j.slug, code: j.code.toUpperCase(), abbrev: j.abbrev || j.code, name: j.name, short: j.code.toUpperCase(), issn: j.issnOnline || j.issn || prev.issn || '', eissn: j.issnOnline || j.eissn || j.issn || prev.eissn || '',
    accent: j.accent || '#0B2545', accentTint: j.accentTint || tint_(j.accent || '#0B2545'), school: j.school || '', since: Number(j.since) || prev.since || new Date().getFullYear(), frequency: j.frequency || '',
    scope: j.scope || '', subjects: j.subjects || [], articleTypes: j.articleTypes || ['Original Research', 'Review Article', 'Research Letter', 'Case Study', 'Perspective', 'Editorial'],
    legacyUrl: j.legacyUrl || '', noReplyEmail: j.noReplyEmail || (j.slug + '-no-reply@' + mailDomain_()), editorEmail: j.editorEmail || editorsEmail_(), officeEmail: j.officeEmail || controllerEmail_(),
    boardExtra: j.boardExtra || prev.boardExtra || [], active: j.active !== false,
    scopeType: j.scopeType || prev.scopeType || 'international', startYear: Number(j.startYear) || prev.startYear || new Date().getFullYear(),
    languages: j.languages || prev.languages || ['English'], formats: j.formats || prev.formats || ['Online'], subjectArea: j.subjectArea || prev.subjectArea || '',
    issnOnline: j.issnOnline !== undefined ? j.issnOnline : (prev.issnOnline || ''), issnPrint: j.issnPrint !== undefined ? j.issnPrint : (prev.issnPrint || ''),
    issnStatus: Object.assign({ online: (j.issnOnline || prev.issnOnline) ? 'assigned' : 'not_applied', print: 'not_applicable' }, prev.issnStatus || {}, j.issnOnline && !prev.issnOnline ? { online: 'assigned' } : {}),
    logoColor: j.accent || prev.logoColor, order: Number(j.order) || prev.order || 99, serialStart: j.serialStart || prev.serialStart || {},
  });
  json.editorialEmail = json.officeEmail;
  json.board = boardFor_(json.slug, json.boardExtra);
  const row = { slug: json.slug, code: json.code, name: json.name, fromEmail: '', fromName: j.fromName || (json.code + ' Editorial Office'), eicEmail: j.eicEmail || '', active: json.active, json: json, updated: now_() };
  if (find_('Journals', 'slug', json.slug)) update_('Journals', 'slug', json.slug, row); else insert_('Journals', row);
  if (!automationsFor_(json.slug).length) seedAutomations_(json.slug);
  CacheService.getScriptCache().remove('J:' + json.slug);
  if (p.publish === false) return { ok: true, message: 'Saved in the sheet only.' };
  need_(prop_('GITHUB_TOKEN') && prop_('GITHUB_REPO'), 'Saved in the sheet, but NOT on the website: GITHUB_TOKEN / GITHUB_REPO are not set in Script properties, so the site cannot be updated.');
  ghCommit_([{ path: 'content/journals/' + json.slug + '/journal.json', text: JSON.stringify(json, null, 2) }], 'Journal settings: ' + json.code);
  return { ok: true, message: 'Saved and sent to GitHub. The website rebuilds in 2–4 minutes (check GitHub → Actions).' };
}

function adm_saveIssue(p, u) {
  need_(isAdmin_(u));
  const i = p.issue; need_(i.journal && i.volume && i.issue, 'Journal, volume and issue are required.');
  const ex = where_('Issues', x => x.journal === i.journal && String(x.volume) === String(i.volume) && String(x.issue) === String(i.issue))[0];
  const newlyPublished = i.status === 'published' && (!ex || ex.status !== 'published');
  const sh = sh_('Issues');
  if (ex) sh.getRange(ex._row, 1, 1, SCHEMA.Issues.length).setValues([SCHEMA.Issues.map(k => encode_(k, i[k]))]); else insert_('Issues', i);
  const list = where_('Issues', x => x.journal === i.journal).map(x => ({ volume: Number(x.volume), issue: Number(x.issue), year: x.year, label: x.label, title: x.title, pdf: x.pdf, published: x.status === 'published' }));
  ghCommit_([{ path: 'content/journals/' + i.journal + '/issues.json', text: JSON.stringify(list, null, 2) }], 'Issues: ' + i.journal + ' ' + i.volume + '(' + i.issue + ')');
  if (newlyPublished && !i.silent) try { onIssuePublished_(i.journal, i.volume, i.issue, i.label); } catch (e) { console.error(e); }
  if (newlyPublished) try { onIssueForIssn_(i.journal, i.volume, i.issue); } catch (e) { console.error(e); }
  return { ok: true };
}

function adm_testEmail(p, u) {
  need_(isAdmin_(u));
  mailTemplate_('role_granted', u.email, { name: u.given, role: 'Test recipient', journal: p.journal ? journalRow_(p.journal).name : 'ACRI Journals', link: portalUrl_('') }, p.journal ? { journal: p.journal } : {});
  const last = all_('EmailLog').pop();
  return { ok: true, result: last };
}

/** Rebuild the website without content changes (e.g. after a CSS change). */
function adm_rebuild(p, u) {
  need_(isAdmin_(u));
  ghCommit_([{ path: 'content/.rebuild', text: now_() }], 'Rebuild site');
  return { ok: true };
}

// ======================================================================
// 08_Api.gs
// ======================================================================
/** HTTP entry points. The portal sends POST with Content-Type text/plain (no CORS preflight). */

const PUBLIC = {
  'public.journals': public_journals, 'public.subscribe': public_subscribe,
  'auth.register': auth_register, 'auth.verify': auth_verify, 'auth.login': auth_login, 'auth.forgot': auth_forgot, 'auth.reset': auth_reset,
  // Reviewer actions are authorised by the secret token in their invitation link.
  'rev.get': rev_get, 'rev.respond': rev_respond, 'rev.file': rev_file, 'rev.save': rev_save,
  // Editors sign their agreement from the emailed link; email preference centre; partner applications.
  'agreement.get': agreement_get, 'agreement.sign': agreement_sign, 'agreement.decline': agreement_decline,
  'public.emailPrefs': public_emailPrefs, 'public.partnerApply': public_partnerApply, 'public.contact': public_contact,
};
const PRIVATE = {
  'auth.logout': (p, u) => auth_logout(p), 'auth.me': auth_me, 'auth.profile': auth_profile,
  'dash': dash,
  'sub.save': sub_save, 'sub.upload': sub_upload, 'sub.removeFile': sub_removeFile, 'sub.submit': sub_submit, 'sub.withdraw': sub_withdraw,
  'sub.final': sub_finalSubmit, 'sub.proof': sub_proofRespond, 'sub.list': sub_list, 'sub.get': sub_get, 'file.get': file_get,
  'ed.tech': ed_techCheck, 'ed.assign': ed_assign, 'ed.invite': ed_inviteReviewer, 'ed.review': ed_reviewAction, 'ed.note': ed_note, 'ed.decide': ed_decide,
  'prod.send': prod_send, 'prod.check': prod_check, 'prod.source': prod_source, 'prod.saveSource': prod_saveSource, 'prod.publish': prod_publish,
  'prod.doi': prod_registerDoi, 'prod.reserve': prod_reserveDoi,
  'adm.overview': adm_overview, 'adm.subs': adm_allSubs, 'adm.users': adm_users, 'adm.roles': adm_setRoles, 'adm.journals': adm_journals,
  'adm.saveJournal': adm_saveJournal, 'adm.saveIssue': adm_saveIssue, 'adm.testEmail': adm_testEmail, 'adm.rebuild': adm_rebuild,
  'team.list': team_list, 'team.appoint': team_appoint, 'team.resend': team_resend, 'team.update': team_update, 'team.end': team_end, 'team.renew': team_renew, 'team.file': team_file,
  'mail.lists': mail_lists, 'mail.contacts': mail_contacts, 'mail.import': mail_import, 'mail.setContact': mail_setContact,
  'mail.campaigns': mail_campaigns, 'mail.save': mail_saveCampaign, 'mail.preview': mail_preview, 'mail.test': mail_test, 'mail.audience': mail_audience,
  'mail.send': mail_send, 'mail.stop': mail_stop, 'mail.duplicate': mail_duplicate, 'mail.automations': mail_automations, 'mail.saveAutomation': mail_saveAutomation,
  'msg.list': msg_list, 'msg.update': msg_update, 'set.get': set_get, 'set.save': set_save, 'set.test': set_test,
  'sig.list': sig_list, 'sig.save': sig_save, 'letter.preview': letter_preview, 'letter.create': letter_create, 'letter.list': letter_list, 'letter.file': letter_file,
  'cert.get': cert_get, 'cert.reset': cert_reset, 'mail.compose': mail_compose, 'mail.sent': mail_sent,
  'partner.list': partner_list, 'partner.save': partner_save,
  'idx.readiness': idx_readiness, 'idx.tick': idx_tick, 'idx.pack': idx_issnPack, 'idx.stage': idx_issnStage, 'adm.logo': adm_logo,
  'bi.list': bi_list, 'bi.get': bi_get, 'bi.save': bi_save, 'bi.bulk': bi_bulk, 'bi.doi': bi_registerDoi,
};

function doPost(e) {
  let p = {};
  // RFC 8058 one-click unsubscribe from mail clients: POST <exec>?lu=<token>
  if (e && e.parameter && e.parameter.lu) { try { oneClickUnsub_(e.parameter.lu); } catch (x) { } return json_({ ok: true }); }
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const a = p.action;
    if (PUBLIC[a]) return json_(PUBLIC[a](p));
    if (PRIVATE[a]) { const u = session_(p.token); return json_(PRIVATE[a](p, u)); }
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    const m = String(err && err.message || err);
    if (m === 'AUTH') return json_({ ok: false, auth: false, error: 'Your session has expired. Please sign in again.' });
    console.error(p.action, m, err && err.stack);
    return json_({ ok: false, error: m });
  }
}
function doGet(e) {
  if (e && e.parameter && e.parameter.lu) { oneClickUnsub_(e.parameter.lu); return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">You have been unsubscribed. <a href="' + portalUrl_('email?t=' + encodeURIComponent(e.parameter.lu)) + '" target="_top">Manage email preferences</a></p>'); }
  return json_({ ok: true, service: CFG.APP + ' EMS', time: now_() });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ======================================================================
// 09_Setup.gs
// ======================================================================
/** One-time setup. Run setup() from the Apps Script editor after pasting all files. */

function setup() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(name => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    const h = SCHEMA[name];
    const cur = s.getLastColumn() ? s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0] : [];
    h.forEach((k, i) => { if (cur[i] !== k) s.getRange(1, i + 1).setValue(k); });
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, h.length).setFontWeight('bold').setBackground('#0B2545').setFontColor('#ffffff');
  });
  const def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  const P = PropertiesService.getScriptProperties();
  const defaults = { GITHUB_BRANCH: 'main', ZEPTO_HOST: 'api.zeptomail.in', ZENODO_SANDBOX: 'true', SITE_URL: 'https://acriindia.org.in', MAIL_DOMAIN: 'journals.acriindia.org', SYSTEM_FROM: 'no.reply@journals.acriindia.org', CAMPAIGN_PROVIDER: 'brevo', NEWSLETTER_FROM: 'newsletter@journals.acriindia.org', CONTROLLER_EMAIL: 'controller@journals.acriindia.org', EDITORS_EMAIL: 'editor@journals.acriindia.org', ADMIN_EMAILS: 'sfenilshah5283@gmail.com,president@acriindia.org', ZENODO_COMMUNITY: '', MAIL_PROVIDER: 'auto' };
  Object.keys(defaults).forEach(k => { if (!P.getProperty(k)) P.setProperty(k, defaults[k]); });
  rootFolder_();
  seedJournals_();
  // Triggers: daily reviewer reminders, production watcher every 10 minutes.
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyTick').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('productionTick').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('campaignTick').timeBased().everyMinutes(5).create();
  Logger.log('Setup complete. Now: set the secret Script Properties, then Deploy → New deployment → Web app.');
}

function seedJournals_() {
  const seed = [
    { slug: 'ijbmrs', code: 'IJBMRS', name: 'International Journal of Business and Management Research Studies', fromName: 'IJBMRS Editorial Office',
      json: { abbrev: 'Int J Bus Manag Res Stud', issn: '3139-115X', eissn: '3139-115X', accent: '#164470', accentTint: '#EEF3F8', logoColor: '#164470', issnOnline: '3139-115X', issnStatus: { online: 'assigned', print: 'not_applicable' }, scopeType: 'international', startYear: 2025, languages: ['English'], formats: ['Online'], subjectArea: 'Business, Management and Accounting', school: 'ACRI School of Business Management & Commerce (SBMC)', since: 2025, frequency: 'Bi-monthly',
        subjects: ['Entrepreneurship', 'Finance', 'Marketing', 'Organisational Behaviour', 'Strategy', 'Economics', 'Operations', 'Human Resources'],
        articleTypes: ['Original Research', 'Review Article', 'Research Letter', 'Case Study', 'Perspective', 'Editorial', 'Book Review'], legacyUrl: 'https://ijbmrs.org', serialStart: { '2026': 20 } } },
    { slug: 'ijelf', code: 'IJELF', name: 'International Journal of Education and Learning Futures', fromName: 'IJELF Editorial Office',
      json: { abbrev: 'Int J Educ Learn Futures', issn: '', accent: '#005028', accentTint: '#ECF5EF', logoColor: '#005028', issnOnline: '', issnStatus: { online: 'not_applied', print: 'not_applicable' }, scopeType: 'international', startYear: 2026, languages: ['English'], formats: ['Online'], subjectArea: 'Education', school: 'ACRI School of Education & Human Development (SEHD)', since: 2026, frequency: 'Biannual',
        subjects: ['Assessment', 'Pedagogy', 'Educational Technology', 'Education Policy', 'Higher Education', 'School Leadership', 'Teacher Development', 'Learning Sciences'],
        articleTypes: ['Original Research', 'Review Article', 'Research Letter', 'Case Study', 'Perspective', 'Editorial'], legacyUrl: 'https://ijelf.acriindia.org' } },
  ];
  seed.forEach(j => {
    if (find_('Journals', 'slug', j.slug)) return;
    j.json = Object.assign({ slug: j.slug, code: j.code, name: j.name }, j.json);
    j.json.noReplyEmail = j.slug + '-no-reply@' + mailDomain_(); j.json.editorEmail = editorsEmail_(); j.json.officeEmail = controllerEmail_();
    insert_('Journals', { slug: j.slug, code: j.code, name: j.name, fromEmail: '', fromName: j.fromName, eicEmail: '', active: true, json: j.json, updated: now_() });
    seedAutomations_(j.slug);
  });
}

/** Run once to check every integration and log what is missing. */
function selfTest() {
  const r = {};
  r.sheet = !!ss_().getSheetByName('Submissions');
  r.drive = safe_(() => rootFolder_().getName());
  r.github = safe_(() => gh_('get', '').full_name);
  r.zenodo = safe_(() => zen_('get', '/deposit/depositions?size=1') && 'ok (' + zenodoBase_() + ')');
  r.mail = safe_(() => prop_('ZEPTO_TOKEN') && prop_('MAIL_PROVIDER', 'auto') !== 'gmail' ? 'ZeptoMail (Gmail fallback on errors)' : 'Gmail fallback via ' + Session.getEffectiveUser().getEmail() + ' · quota left today: ' + MailApp.getRemainingDailyQuota());
  r.campaigns = safe_(() => campaignProvider_() === 'brevo' ? (prop_('BREVO_KEY') ? 'Brevo key set' : 'MISSING: set BREVO_KEY') : ((prop_('ZEPTO_CAMPAIGN_TOKEN') || prop_('ZEPTO_TOKEN')) ? 'ZeptoMail' + (prop_('ZEPTO_CAMPAIGN_TOKEN') ? ' (separate campaign agent)' : ' (same agent as workflow mail)') : 'MISSING: set ZEPTO_TOKEN'));
  r.driveApi = safe_(() => typeof Drive !== 'undefined' ? 'enabled' : 'MISSING: add the Drive API advanced service (v3)');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/** Runs every morning: reviewer reminders, editorial term reminders/endings, scheduled automations. */
function dailyTick() {
  [dailyReminders, termsTick, automationsTick, issnTick].forEach(fn => { try { fn(); } catch (e) { console.error(fn.name, e); } });
}

/** Copy each journal's settings from the website repository (content/journals/<slug>/journal.json) into the sheet.
 *  Run once after setup(), and whenever journal.json was edited directly in GitHub. */
function syncJournalsFromRepo() {
  all_('Journals').forEach(r => {
    const raw = ghRead_('content/journals/' + r.slug + '/journal.json'); if (!raw) return;
    const json = Object.assign({}, r.json || {}, JSON.parse(raw));
    update_('Journals', 'slug', r.slug, { json: json, code: json.code, name: json.name, updated: now_() });
    CacheService.getScriptCache().remove('J:' + r.slug);
    Logger.log('Synced ' + r.slug);
  });
}

/** Run from the editor: gives admin to every existing account whose email is in the ADMIN_EMAILS script property.
 *  (New accounts with those emails become admin automatically when they register.) */
function makeAdmin() {
  const admins = prop_('ADMIN_EMAILS', '').split(',').map(normEmail_).filter(String);
  if (!admins.length) throw new Error('Set the ADMIN_EMAILS script property first (comma-separated emails).');
  const done = [], missing = [];
  admins.forEach(function (e) {
    const u = find_('Users', 'email', e);
    if (!u) { missing.push(e); return; }
    const r = u.roles || {}; r.admin = true;
    update_('Users', 'id', u.id, { roles: r, status: 'active', verified: true });
    done.push(e);
  });
  Logger.log('Admin given to: ' + (done.join(', ') || 'none') + (missing.length ? '\nNo account yet (register first, or it will auto-apply on registration): ' + missing.join(', ') : ''));
}

/** Run from the editor to set (or reset) a password without email.
 *  1. Add script properties SETPW_EMAIL and SETPW_PASSWORD (8+ characters).  2. Run setPassword.
 *  Creates the account if it doesn't exist, marks it verified, and makes it admin if the email is in ADMIN_EMAILS.
 *  SETPW_PASSWORD is deleted automatically afterwards. */
function setPassword() {
  const P = PropertiesService.getScriptProperties();
  const email = normEmail_(P.getProperty('SETPW_EMAIL') || ''), pw = P.getProperty('SETPW_PASSWORD') || '';
  if (!email) throw new Error('Add the script property SETPW_EMAIL first.');
  if (pw.length < 8) throw new Error('Add the script property SETPW_PASSWORD (at least 8 characters).');
  const isAdm = prop_('ADMIN_EMAILS', '').split(',').map(normEmail_).indexOf(email) >= 0;
  const salt = token_().slice(0, 16);
  let u = find_('Users', 'email', email);
  if (u) {
    const r = u.roles || {}; if (isAdm) r.admin = true;
    update_('Users', 'id', u.id, { passHash: hashPw_(pw, salt), salt: salt, verified: true, verifyToken: '', status: 'active', roles: r });
  } else {
    const nm = email.split('@')[0];
    insert_('Users', { id: uid_('U'), email: email, given: nm, family: '', passHash: hashPw_(pw, salt), salt: salt, verified: true, verifyToken: '',
      roles: isAdm ? { admin: true } : {}, status: 'active', country: 'India', subjects: [], created: now_() });
  }
  P.deleteProperty('SETPW_PASSWORD');
  Logger.log('Password set for ' + email + (u ? '' : ' (new account created — update the name under My profile)') + (isAdm ? '. Admin: yes.' : '. Not admin (email not in ADMIN_EMAILS).'));
}

/** TEMPORARY: one-click admin. Select quickAdmin → Run. Creates (or resets) the admin account below,
 *  marks it verified and admin, and adds it to ADMIN_EMAILS. Change the password in the portal
 *  (My profile) afterwards, then delete this function. */
function quickAdmin() {
  const EMAIL = 'sfenilshah5283@gmail.com', PASSWORD = 'Fenil@312';
  const P = PropertiesService.getScriptProperties();
  if (!ss_().getSheetByName('Users')) setup();
  const list = prop_('ADMIN_EMAILS', '').split(',').map(normEmail_).filter(String);
  if (list.indexOf(EMAIL) < 0) { list.push(EMAIL); P.setProperty('ADMIN_EMAILS', list.join(',')); }
  const salt = token_().slice(0, 16), u = find_('Users', 'email', EMAIL);
  if (u) {
    const r = u.roles || {}; r.admin = true;
    update_('Users', 'id', u.id, { passHash: hashPw_(PASSWORD, salt), salt: salt, verified: true, verifyToken: '', status: 'active', roles: r });
  } else {
    insert_('Users', { id: uid_('U'), email: EMAIL, given: 'Fenil', family: 'Shah', passHash: hashPw_(PASSWORD, salt), salt: salt, verified: true, verifyToken: '',
      roles: { admin: true }, status: 'active', country: 'India', subjects: [], created: now_() });
  }
  Logger.log('Admin ready: ' + EMAIL + ' — sign in at ' + portalUrl_('login'));
}

// ======================================================================
// 10_Team.gs
// ======================================================================
/** Editorial team: appointments (EIC / Senior Editor / Editor / Board), e-signed agreements,
 *  term reminders, automatic term ending, certificates of service, and the public board page. */

function activeAppointments_(slug) {
  const today = today_();
  return all_('Appointments').filter(a => a.journal === slug && a.status === 'active' && (!a.start || String(a.start).slice(0, 10) <= today) && (!a.end || String(a.end).slice(0, 10) >= today));
}
function roleLabel_(a) { return a.title || (ROLES[a.role] || {}).label || a.role; }
function fmtD_(iso) { return iso ? Utilities.formatDate(new Date(String(iso).slice(0, 10) + 'T12:00:00Z'), 'Asia/Kolkata', 'd MMMM yyyy') : ''; }

/** Public board list for journal.json: active, signed appointments + manual extras. */
function boardFor_(slug, extra) {
  const users = {}; all_('Users').forEach(u => users[u.id] = u);
  const list = activeAppointments_(slug).filter(a => String(a.showOnSite) !== 'false').sort((a, b) => (ROLES[a.role].rank - ROLES[b.role].rank) || ((Number(a.order) || 99) - (Number(b.order) || 99)))
    .map(a => { const u = users[a.userId] || {}; const mail = u.instEmail || (PERSONAL_MAIL.test(u.email || '') ? '' : u.email); return { role: roleLabel_(a), group: ROLES[a.role].plural, name: (u.given + ' ' + u.family).trim() + (u.degrees ? ', ' + u.degrees : ''), designation: u.designation || '', department: u.department || '', affiliation: u.affiliation || '', address: u.instAddress || '', email: mail || '', profile: u.profileUrl || '', country: u.country || '', orcid: u.orcid || '', since: String(a.start || '').slice(0, 4) }; });
  return list.concat((extra || []).map(x => Object.assign({}, x, { group: 'Publisher & journal management' })));
}
function syncBoard_(slug) {
  const r = find_('Journals', 'slug', slug); if (!r) return;
  const json = Object.assign({}, r.json || {}); json.board = boardFor_(slug, json.boardExtra || []);
  update_('Journals', 'slug', slug, { json: json, updated: now_() });
  CacheService.getScriptCache().remove('J:' + slug);
  if (prop_('GITHUB_TOKEN')) try { ghCommit_([{ path: 'content/journals/' + slug + '/journal.json', text: JSON.stringify(json, null, 2) }], 'Editorial board: ' + json.code); } catch (e) { console.error(e); }
}

// ------------------------------------------------------------ agreement text (versioned)
function agreementHtml_(a, u, j) {
  const role = roleLabel_(a), name = (u.given + ' ' + u.family).trim();
  const duties = {
    eic: 'set the editorial direction of the Journal; make final decisions on manuscripts on the basis of scholarly merit; appoint handling editors; ensure the integrity, timeliness and fairness of peer review; and represent the Journal',
    senior: 'screen new submissions for scope and quality; assign handling editors; oversee peer review in your area; and advise the Editor-in-Chief on decisions and journal development',
    editor: 'handle the manuscripts assigned to you; invite and manage at least two qualified reviewers; evaluate reports; and recommend decisions to the Editor-in-Chief within agreed timelines',
    board: 'advise on the Journal\'s scope and standards; review manuscripts when invited; recommend reviewers and authors; and promote the Journal in your community',
  }[a.role];
  return `<h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px">ACRI Journals Editorial Agreement</h1>
<p style="color:#5E6875;margin:0 0 18px">Version ${AGREEMENT_VERSION} · ${esc_(j.name)} (${esc_(j.code)})</p>
<p>This Agreement is between <b>ACRI Journals</b>, operated by ${CFG.LEGAL_ENTITY}, Ahmedabad, India ("ACRI Journals"), and <b>${esc_(name)}</b> ("you"). It sets out the terms of your appointment as <b>${esc_(role)}</b> of <b>${esc_(j.name)}</b> (the "Journal").</p>
<h3>1. Appointment and term</h3><p>You are appointed ${esc_(role)} from <b>${fmtD_(a.start)}</b> to <b>${fmtD_(a.end)}</b>. The appointment takes effect when you sign this Agreement. It may be renewed by mutual agreement, and a renewal requires a new signed agreement. Your editorial access ends automatically when the term ends.</p>
<h3>2. Responsibilities</h3><p>You will ${duties}. You will act in accordance with the ACRI Journals <a href="${siteUrl_()}/policies/">policies</a>, including the Peer Review, Publication Ethics, Conflicts of Interest, AI and Editorial Independence policies, and with the COPE Core Practices.</p>
<h3>3. Confidentiality</h3><p>All manuscripts, reviews, reviewer identities, author identities (under double-blind review), editorial correspondence and decisions are confidential. You will not disclose them, use them for your own research or advantage, or retain copies after your work on them is complete. You will not upload any confidential material to generative AI tools or other third-party services. These obligations continue after your term ends.</p>
<h3>4. Conflicts of interest</h3><p>You will declare any financial or non-financial interest that could affect, or appear to affect, your judgement. You will recuse yourself from any manuscript by recent collaborators, members of your own institution or department, close personal contacts, or competitors, and from any manuscript of your own. Your own submissions to the Journal will be handled entirely by another editor.</p>
<h3>5. Integrity and independence</h3><p>You will judge manuscripts only on their scholarly merit, relevance and integrity, without regard to the authors' race, gender, religion, nationality, institution, seniority or politics. You will not manipulate citations, peer review or decisions, and you will report suspected misconduct to the editorial office.</p>
<h3>6. Data protection</h3><p>You will handle personal data only through the ACRI Journals portal, for editorial purposes, in line with the <a href="${siteUrl_()}/policies/privacy/">Privacy Policy</a> and India's Digital Personal Data Protection Act, 2023. You consent to your name, role, designation, department, institution, institutional postal address, institutional email, institutional profile link and ORCID iD being published on the Journal's editorial board page, and shared with the ISSN National Centre and indexing services (such as DOAJ, Web of Science and Scopus), which may contact you to verify your membership.</p>
<h3>7. Recognition</h3><p>This is an honorary appointment unless otherwise agreed in writing. You will be acknowledged on the Journal's website during your term, and you will receive a certificate of service when it ends. You may describe your role publicly, but you may not speak on behalf of ACRI Journals without authorisation.</p>
<h3>8. Ending the appointment</h3><p>Either party may end the appointment early with 30 days' written notice. ACRI Journals may end it immediately for a serious breach of this Agreement or of its policies, after giving you an opportunity to respond. Sections 3, 4 and 6 continue after the appointment ends.</p>
<h3>9. Governing law</h3><p>This Agreement is governed by the laws of India, with exclusive jurisdiction of the courts at Ahmedabad, Gujarat.</p>
<h3>10. Electronic signature</h3><p>By typing your full name and selecting "I agree and sign", you sign this Agreement electronically, and the signature has the same effect as a handwritten one. The date, time and technical details of your signature are recorded, and a signed copy is emailed to you.</p>`;
}

function pdfFromHtml_(html, name) {
  const blob = HtmlService.createHtmlOutput('<html><body style="font-family:Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#15191E;padding:10px 26px">' + html + '</body></html>').getBlob().getAs('application/pdf');
  blob.setName(name);
  const f = subFolder_(rootFolder_(), 'Agreements & Certificates').createFile(blob);
  return { id: f.getId(), b64: Utilities.base64Encode(blob.getBytes()), name: name };
}
function certificateHtml_(a, u, j) {
  const name = (u.given + ' ' + u.family).trim() + (u.degrees ? ', ' + u.degrees : '');
  return `<div style="border:6px double ${j.accent || '#0B2545'};padding:46px 40px;text-align:center;margin-top:30px">
<div style="font-family:Georgia,serif;font-weight:700;font-size:30px;letter-spacing:.02em;color:#0B2545">ACRI <span style="font-family:Arial;font-size:13px;letter-spacing:.34em;font-weight:700;border-left:2px solid #1F7A4D;padding-left:12px;margin-left:6px">JOURNALS</span></div>
<p style="letter-spacing:.2em;text-transform:uppercase;color:#5E6875;margin:34px 0 6px;font-size:12px">Certificate of Editorial Service</p>
<p style="margin:22px 0 4px">This is to certify that</p>
<p style="font-family:Georgia,serif;font-size:28px;margin:6px 0 10px">${esc_(name)}</p>
<p style="margin:0 0 4px">served as <b>${esc_(roleLabel_(a))}</b> of</p>
<p style="font-family:Georgia,serif;font-size:18px;margin:6px 0">${esc_(j.name)}</p>
<p style="margin:6px 0 30px">from ${fmtD_(a.start)} to ${fmtD_(a.endedAt || a.end)}.</p>
<p>ACRI Journals gratefully acknowledges this contribution to scholarly publishing.</p>
<p style="color:#5E6875;font-size:11px;margin-top:40px">Issued ${fmtD_(today_())} · Certificate ${a.id}</p></div>`;
}

// ------------------------------------------------------------ admin / EIC actions
function canAppoint_(u, journal, role) { return isAdmin_(u) || (role !== 'eic' && isEic_(u, journal)); }

function team_list(p, u) {
  need_(isAdmin_(u) || (p.journal && isEic_(u, p.journal)), 'Not allowed.');
  const users = {}; all_('Users').forEach(x => users[x.id] = x);
  const items = all_('Appointments').filter(a => !p.journal || a.journal === p.journal).map(a => {
    const x = users[a.userId] || {};
    return { id: a.id, journal: a.journal, role: a.role, roleLabel: roleLabel_(a), title: a.title, start: String(a.start).slice(0, 10), end: String(a.end).slice(0, 10), status: a.status, signedAt: a.signedAt, signedName: a.signedName, showOnSite: String(a.showOnSite) !== 'false', order: a.order,
      name: (x.given + ' ' + x.family).trim(), email: x.email, affiliation: x.affiliation, agreementFileId: a.agreementFileId, certificateFileId: a.certificateFileId, endReason: a.endReason };
  }).sort((a, b) => a.journal.localeCompare(b.journal) || ROLES[a.role].rank - ROLES[b.role].rank || String(b.start).localeCompare(String(a.start)));
  return { ok: true, items: items, roles: ROLES };
}

function team_appoint(p, u) {
  need_(ROLES[p.role], 'Choose a role.');
  need_(canAppoint_(u, p.journal, p.role), 'Only an admin can appoint an Editor-in-Chief. EICs can appoint other roles in their journal.');
  need_(p.start && p.end && p.end > p.start, 'Enter a valid term (start and end dates).');
  const j = journalRow_(p.journal), email = normEmail_(p.email);
  need_(/@/.test(email), 'Enter an email.');
  return withLock_(() => {
    let x = find_('Users', 'email', email), setPw = '';
    if (!x) {
      need_(p.given && p.family, 'Enter the person\'s first and last name (they do not have an account yet).');
      const t = token_();
      x = insert_('Users', { id: uid_('U'), email: email, given: p.given, family: p.family, degrees: p.degrees || '', affiliation: p.affiliation || '', orcid: p.orcid || '', passHash: '', salt: token_().slice(0, 16), verified: true, resetToken: t, resetExpires: new Date(Date.now() + 30 * 864e5).toISOString(), reviewer: true, roles: {}, status: 'invited', created: now_() });
      setPw = portalUrl_('reset?token=' + t);
    }
    need_(!where_('Appointments', a => a.userId === x.id && a.journal === p.journal && a.role === p.role && ['pending', 'active'].indexOf(a.status) >= 0 && String(a.end) >= p.start).length, 'This person already has this role for an overlapping term.');
    const prof = {}; ['designation', 'department', 'affiliation', 'instAddress', 'instEmail', 'profileUrl', 'country', 'degrees', 'orcid'].forEach(k => { if (p[k]) prof[k] = p[k]; });
    if (Object.keys(prof).length) update_('Users', 'id', x.id, prof);
    const a = insert_('Appointments', { id: uid_('A'), userId: x.id, journal: p.journal, role: p.role, title: p.title || '', start: p.start, end: p.end, status: 'pending', token: token_(), agreementVersion: AGREEMENT_VERSION, showOnSite: p.showOnSite !== false, order: p.order || '', reminded: '', renewalOf: p.renewalOf || '', createdBy: u.id, created: now_() });
    sendAppointment_(a, x, j, setPw);
    return { ok: true, id: a.id };
  });
}
function sendAppointment_(a, x, j, setPw) {
  mailTemplate_('appoint', x.email, { name: x.given, role: roleLabel_(a), journal: j.name, start: fmtD_(a.start), end: fmtD_(a.end), link: portalUrl_('agreement?token=' + a.token), setPw: setPw, renewal: !!a.renewalOf }, { journal: a.journal });
}
function team_resend(p, u) {
  const a = find_('Appointments', 'id', p.id); need_(a && canAppoint_(u, a.journal, a.role), 'Not allowed.');
  need_(a.status === 'pending', 'Only unsigned appointments can be resent.');
  const x = find_('Users', 'id', a.userId); let setPw = '';
  if (!x.passHash) { const t = token_(); update_('Users', 'id', x.id, { resetToken: t, resetExpires: new Date(Date.now() + 30 * 864e5).toISOString() }); setPw = portalUrl_('reset?token=' + t); }
  sendAppointment_(a, x, journalRow_(a.journal), setPw);
  return { ok: true };
}
function team_update(p, u) {
  const a = find_('Appointments', 'id', p.id); need_(a && canAppoint_(u, a.journal, a.role), 'Not allowed.');
  const patch = {};
  ['title', 'order'].forEach(k => { if (p[k] !== undefined) patch[k] = p[k]; });
  if (p.showOnSite !== undefined) patch.showOnSite = !!p.showOnSite;
  if (p.end && a.status === 'pending') patch.end = p.end;
  update_('Appointments', 'id', a.id, patch);
  if (a.status === 'active') syncBoard_(a.journal);
  return { ok: true };
}
function team_end(p, u) {
  const a = find_('Appointments', 'id', p.id); need_(a && canAppoint_(u, a.journal, a.role), 'Not allowed.');
  need_(['active', 'pending'].indexOf(a.status) >= 0, 'This appointment is not active.');
  if (a.status === 'pending') { update_('Appointments', 'id', a.id, { status: 'withdrawn', endedAt: today_(), endReason: p.reason || 'Withdrawn before signing' }); return { ok: true }; }
  endAppointment_(a, p.reason || 'Ended early', !!p.revoke);
  return { ok: true };
}
/** Renewal = a new appointment for the next term that must be signed again. */
function team_renew(p, u) {
  const a = find_('Appointments', 'id', p.id); need_(a && canAppoint_(u, a.journal, a.role), 'Not allowed.');
  const x = find_('Users', 'id', a.userId);
  const start = p.start || addDaysFrom_(String(a.end).slice(0, 10), 1);
  return team_appoint({ journal: a.journal, role: a.role, title: a.title, email: x.email, start: start, end: p.end, showOnSite: String(a.showOnSite) !== 'false', order: a.order, renewalOf: a.id }, u);
}
function addDaysFrom_(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function team_file(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const b = DriveApp.getFileById(p.fileId).getBlob();
  return { ok: true, name: b.getName(), mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}

function endAppointment_(a, reason, revoked) {
  update_('Appointments', 'id', a.id, { status: revoked ? 'revoked' : 'ended', endedAt: today_(), endReason: reason });
  const x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  let att = [];
  if (!revoked) {
    const cert = pdfFromHtml_(certificateHtml_(Object.assign({}, a, { endedAt: today_() < String(a.end).slice(0, 10) ? today_() : a.end }), x, j), 'Certificate of Editorial Service - ' + x.family + ' - ' + j.code + '.pdf');
    update_('Appointments', 'id', a.id, { certificateFileId: cert.id });
    att = [{ name: cert.name, b64: cert.b64 }];
  }
  mailTemplate_('term_ended', x.email, { name: x.given, role: roleLabel_(a), journal: j.name, start: fmtD_(a.start), end: fmtD_(today_()), revoked: revoked, reason: reason }, { journal: a.journal, attachments: att });
  syncBoard_(a.journal);
}

// ------------------------------------------------------------ agreement (token link, no password needed)
function appt_(token) { const a = find_('Appointments', 'token', token); need_(a && token, 'This agreement link is invalid.'); return a; }
function agreement_get(p) {
  const a = appt_(p.token), x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  return { ok: true, agreement: { status: a.status, role: roleLabel_(a), journal: j.name, code: j.code, accent: j.accent, start: fmtD_(a.start), end: fmtD_(a.end), name: (x.given + ' ' + x.family).trim(), email: x.email, signedAt: a.signedAt, signedName: a.signedName, html: agreementHtml_(a, x, j), needsPassword: !x.passHash } };
}
function agreement_sign(p) {
  const a = appt_(p.token); need_(a.status === 'pending', a.status === 'active' ? 'You have already signed this agreement.' : 'This appointment is no longer open for signature.');
  need_(p.agree === true, 'Please confirm that you agree to the terms.');
  const x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  const typed = String(p.name || '').trim().replace(/\s+/g, ' ');
  need_(typed.length >= 3 && typed.toLowerCase().indexOf(String(x.family).toLowerCase()) >= 0, 'Please type your full name, including "' + x.family + '", as your signature.');
  const signedAt = now_();
  const meta = { ua: String(p.ua || '').slice(0, 300), tz: p.tz || '', lang: p.lang || '' };
  const pdf = pdfFromHtml_(agreementHtml_(a, x, j) + `<div style="margin-top:26px;border-top:1px solid #ccc;padding-top:12px"><p><b>Signed electronically by:</b> ${esc_(typed)} &lt;${esc_(x.email)}&gt;<br><b>Date and time:</b> ${Utilities.formatDate(new Date(signedAt), 'Asia/Kolkata', 'd MMMM yyyy, HH:mm')} IST<br><b>Agreement version:</b> ${AGREEMENT_VERSION} · <b>Reference:</b> ${a.id}<br><b>Client:</b> ${esc_(meta.ua)}</p></div>`, 'Editorial Agreement - ' + x.family + ' - ' + j.code + ' - ' + a.id + '.pdf');
  update_('Appointments', 'id', a.id, { status: 'active', signedAt: signedAt, signedName: typed, signMeta: meta, agreementFileId: pdf.id });
  if (x.status === 'invited') update_('Users', 'id', x.id, { status: 'active' });
  mailTemplate_('appoint_signed', x.email, { name: x.given, role: roleLabel_(a), journal: j.name, start: fmtD_(a.start), end: fmtD_(a.end), link: portalUrl_('') }, { journal: a.journal, attachments: [{ name: pdf.name, b64: pdf.b64 }], cc: officeEmails_(a.journal) });
  syncBoard_(a.journal);
  return { ok: true, message: 'Thank you. Your agreement is signed and your appointment is active. A signed copy has been emailed to you.' };
}
function agreement_decline(p) {
  const a = appt_(p.token); need_(a.status === 'pending', 'This appointment is not open.');
  update_('Appointments', 'id', a.id, { status: 'declined', endedAt: today_(), endReason: p.reason || 'Declined' });
  const x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  mailTemplate_('appoint_declined', officeEmails_(a.journal), { who: (x.given + ' ' + x.family).trim(), role: roleLabel_(a), journal: j.name, reason: p.reason || '' }, { journal: a.journal });
  return { ok: true, message: 'You have declined the appointment. Thank you for letting us know.' };
}

// ------------------------------------------------------------ daily: reminders and automatic ending
function termsTick() {
  const today = today_();
  all_('Appointments').forEach(a => {
    try {
      if (a.status === 'pending') {
        const age = (Date.now() - new Date(a.created).getTime()) / 864e5;
        const rem = String(a.reminded || '');
        if (age > 7 && rem.indexOf('sign7') < 0) { const x = find_('Users', 'id', a.userId); sendAppointment_(a, x, journalRow_(a.journal), ''); update_('Appointments', 'id', a.id, { reminded: rem + ' sign7' }); }
        return;
      }
      if (a.status !== 'active' || !a.end) return;
      const end = String(a.end).slice(0, 10);
      if (end < today) return endAppointment_(a, 'Term completed', false);
      const left = Math.round((new Date(end + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
      [30, 7].forEach(n => {
        const tag = 'end' + n, rem = String(find_('Appointments', 'id', a.id).reminded || '');
        if (left <= n && rem.indexOf(tag) < 0) {
          const x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
          const renewed = where_('Appointments', b => b.renewalOf === a.id && ['pending', 'active'].indexOf(b.status) >= 0).length;
          mailTemplate_('term_reminder', x.email, { name: x.given, role: roleLabel_(a), journal: j.name, end: fmtD_(end), days: left, renewed: renewed }, { journal: a.journal, cc: renewed ? [] : officeEmails_(a.journal) });
          update_('Appointments', 'id', a.id, { reminded: rem + ' ' + tag });
        }
      });
    } catch (e) { console.error('termsTick', a.id, e); }
  });
}

// ------------------------------------------------------------ email templates for the team
Object.assign(TEMPLATES, {
  appoint: d => [`${d.renewal ? 'Renewal of your' : 'Your'} appointment as ${d.role}, ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>On behalf of ACRI Journals, it is a pleasure to ${d.renewal ? 'renew your appointment' : 'invite you to serve'} as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> for the term <b>${d.start} to ${d.end}</b>.</p><p>Before your appointment begins, please read and electronically sign the ACRI Journals Editorial Agreement. It covers your responsibilities, confidentiality, conflicts of interest and publication ethics. Your editorial access starts as soon as you sign.</p>${btn_(d.link, 'Review and sign the agreement')}${d.setPw ? `<p>An ACRI Journals account has been created for you. <a href="${d.setPw}">Set your password here</a> (the link is valid for 30 days).</p>` : ''}<p>If you would prefer not to accept, you can decline from the same page.</p><p>With thanks,<br>ACRI Journals</p>`],
  appoint_signed: d => [`Welcome: your appointment as ${d.role} is active`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for signing the Editorial Agreement. Your appointment as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> is now active, from ${d.start} to ${d.end}.</p><p>A signed copy of the agreement is attached. Your editorial tools are available in the portal.</p>${btn_(d.link, 'Open the editorial portal')}<p>Welcome to the team.</p>`],
  appoint_declined: d => [`Appointment declined: ${d.who} (${d.role})`, `<p>${esc_(d.who)} has declined the appointment as ${esc_(d.role)} of ${esc_(d.journal)}.</p>${d.reason ? quote_(d.reason) : ''}`],
  term_reminder: d => [`Your term as ${d.role} ends on ${d.end}`, `<p>Dear ${esc_(d.name)},</p><p>Your term as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> ends on <b>${d.end}</b> (${d.days} days from now).</p>${d.renewed ? '<p>A renewal has already been arranged. Please make sure you have signed the new agreement.</p>' : '<p>If you would like to continue, please reply to this email. The editorial office can send you a renewal. Otherwise, please hand over any manuscripts you are handling before your term ends.</p>'}<p>Thank you for your service to the journal.</p>`],
  term_ended: d => [d.revoked ? `Your appointment with ${d.journal} has ended` : `Thank you: your term as ${d.role} has ended`, d.revoked ? `<p>Dear ${esc_(d.name)},</p><p>Your appointment as ${esc_(d.role)} of ${esc_(d.journal)} has ended with effect from ${d.end}.</p>${d.reason ? quote_(d.reason) : ''}<p>Your confidentiality obligations continue.</p>` : `<p>Dear ${esc_(d.name)},</p><p>Your term as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> (${d.start} – ${d.end}) has come to an end. On behalf of the authors, reviewers and readers you have served, thank you.</p><p>Your <b>Certificate of Editorial Service</b> is attached. Your editorial access has closed, but your author and reviewer account remains active. Please remember that your confidentiality obligations continue.</p><p>We hope to work with you again.</p>`],
});

// ======================================================================
// 11_Mailing.gs
// ======================================================================
/** Email lists, campaigns (newsletters, calls for papers, outreach), automations and unsubscribe handling.
 *
 *  Campaigns go through ZeptoMail by default (CAMPAIGN_PROVIDER = zepto) or Brevo (CAMPAIGN_PROVIDER = brevo).
 *  NOTE: ZeptoMail's terms bar bulk/marketing mail (Brevo: set BREVO_KEY and verify journals.acriindia.org
 *  there). Workflow emails (submissions, reviews, decisions, agreements) stay on ZeptoMail. */

const PRESETS = {
  cfp: { label: 'Call for Papers', kicker: 'Call for papers', cta: 'Submit your manuscript' },
  issue: { label: 'New Issue', kicker: 'New issue', cta: 'Read the issue' },
  article: { label: 'New Article Alert', kicker: 'Just published', cta: 'Read the article' },
  digest: { label: 'Research Digest', kicker: 'Latest research', cta: 'See all new articles' },
  announcement: { label: 'Announcement', kicker: 'Announcement', cta: 'Learn more' },
  event: { label: 'Event / Webinar', kicker: 'You are invited', cta: 'Register now' },
  outreach: { label: 'Personal outreach (plain)', kicker: '', cta: '' },
};
const AUTOMATION_TYPES = {
  new_article: 'Email subscribers when an article is published',
  new_issue: 'Email subscribers when an issue is published',
  digest: 'Send a digest of new articles every N days (if any)',
  recurring: 'Re-send a chosen campaign every N days (e.g. call for papers) until the end date',
  review_reminders: 'Automatic reminders to reviewers (invitation and due date)',
};

// ------------------------------------------------------------ lists & contacts
function listName_(list) { if (!list || list === 'network') return 'ACRI Journals (all journals)'; try { return journalRow_(list).name; } catch (e) { return list; } }
function contactRow_(email, list) { return all_('Contacts').find(c => c.email === email && c.list === list) || null; }

function public_subscribe(p) {
  const e = normEmail_(p.email), list = p.list || 'network';
  need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), 'Please enter a valid email.');
  const ex = contactRow_(e, list);
  if (ex && ex.status === 'subscribed') return { ok: true };
  const t = ex ? ex.token : token_();
  if (ex) updateContact_(ex, { status: 'pending', updated: now_() });
  else insert_('Contacts', { email: e, name: p.name || '', list: list, status: 'pending', token: t, source: 'website ' + (p.source || ''), consent: 'double opt-in requested ' + now_(), tags: [], created: now_(), updated: now_(), sentCount: 0 });
  mailTemplate_('subscribe', e, { link: portalUrl_('email?t=' + t + '&confirm=1'), list: listName_(list) });
  return { ok: true };
}
function updateContact_(c, patch) {
  const s = sh_('Contacts'), h = SCHEMA.Contacts;
  const cur = s.getRange(c._row, 1, 1, h.length).getValues()[0];
  h.forEach((k, i) => { if (patch.hasOwnProperty(k)) cur[i] = encode_(k, patch[k]); });
  s.getRange(c._row, 1, 1, h.length).setValues([cur]);
}
/** Preference centre behind every email's unsubscribe link. */
function public_emailPrefs(p) {
  const c = all_('Contacts').find(x => x.token === p.t); need_(c && p.t, 'This link is invalid or has expired.');
  const rows = all_('Contacts').filter(x => x.email === c.email);
  const set = (row, st, note) => updateContact_(row, { status: st, updated: now_(), consent: (row.consent || '') + ' | ' + note + ' ' + now_() });
  if (p.op === 'confirm' && c.status !== 'subscribed') set(c, 'subscribed', 'confirmed');
  if (p.op === 'unsubscribe') set(c, 'unsubscribed', 'unsubscribed via link');
  if (p.op === 'unsubscribe_all') rows.forEach(r => set(r, 'unsubscribed', 'unsubscribed from all'));
  if (p.op === 'resubscribe') { const r = p.list ? (rows.find(x => x.list === p.list) || null) : c; if (r) set(r, 'subscribed', 'resubscribed'); }
  const fresh = all_('Contacts').filter(x => x.email === c.email);
  return { ok: true, email: c.email, current: c.list, lists: fresh.map(x => ({ list: x.list, name: listName_(x.list), status: x.status, token: x.token })) };
}
/** RFC 8058 one-click unsubscribe (mail clients POST to the List-Unsubscribe URL). */
function oneClickUnsub_(token) {
  const c = all_('Contacts').find(x => x.token === token);
  if (c) updateContact_(c, { status: 'unsubscribed', updated: now_(), consent: (c.consent || '') + ' | one-click unsubscribe ' + now_() });
}

function mail_lists(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  const counts = {};
  all_('Contacts').forEach(c => { const k = c.list; counts[k] = counts[k] || { list: k, name: listName_(k), subscribed: 0, pending: 0, unsubscribed: 0, bounced: 0 }; counts[k][c.status] = (counts[k][c.status] || 0) + 1; });
  ['network'].concat(all_('Journals').map(j => j.slug)).forEach(k => { counts[k] = counts[k] || { list: k, name: listName_(k), subscribed: 0, pending: 0, unsubscribed: 0, bounced: 0 }; });
  return { ok: true, lists: Object.values(counts) };
}
function anyEic_(u) { return (u.roles.eic || []).length > 0; }
function mailScope_(u, journal) { need_(isAdmin_(u) || (journal && isEic_(u, journal)), 'Only admins, or the EIC for their own journal, can manage email.'); }

function mail_contacts(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  const q = String(p.q || '').toLowerCase();
  return { ok: true, items: all_('Contacts').filter(c => (!p.list || c.list === p.list) && (!p.status || c.status === p.status) && (!q || (c.email + ' ' + c.name).toLowerCase().indexOf(q) >= 0)).slice(0, 500).map(c => ({ email: c.email, name: c.name, list: c.list, status: c.status, source: c.source, tags: c.tags || [], created: c.created, lastSent: c.lastSent, sentCount: c.sentCount })) };
}
/** Add contacts: one per line, "email" or "email, Name" or "Name <email>". */
function mail_import(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  need_(p.consent, 'Record how these people agreed to receive email (consent), e.g. "Conference attendees ICOY 2027, opted in on registration form".');
  const lines = String(p.text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const existing = {}; all_('Contacts').filter(c => c.list === p.list).forEach(c => existing[c.email] = c);
  const rows = []; let added = 0, skipped = 0, revived = 0;
  lines.forEach(l => {
    const m = l.match(/<([^>]+)>/); let email = m ? m[1] : l.split(/[,;\t]/)[0]; let name = m ? l.replace(m[0], '').replace(/[",]/g, '').trim() : (l.split(/[,;\t]/)[1] || '').trim();
    email = normEmail_(email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; return; }
    const ex = existing[email];
    if (ex) { if (ex.status === 'unsubscribed') { skipped++; return; } if (ex.status !== 'subscribed') { updateContact_(ex, { status: 'subscribed', updated: now_() }); revived++; } else skipped++; return; }
    existing[email] = true;
    rows.push(SCHEMA.Contacts.map(k => encode_(k, { email: email, name: name, list: p.list, status: 'subscribed', token: token_(), source: 'import by ' + u.email, consent: p.consent + ' (' + now_() + ')', tags: (p.tags || '').split(/[;,]/).map(s => s.trim()).filter(Boolean), created: now_(), updated: now_(), sentCount: 0 }[k])));
    added++;
  });
  if (rows.length) { const s = sh_('Contacts'); s.getRange(s.getLastRow() + 1, 1, rows.length, SCHEMA.Contacts.length).setValues(rows); }
  return { ok: true, added: added, revived: revived, skipped: skipped, note: 'People who unsubscribed earlier were not re-added.' };
}
function mail_setContact(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  const c = contactRow_(normEmail_(p.email), p.list); need_(c, 'Contact not found.');
  if (p.remove) { sh_('Contacts').deleteRow(c._row); return { ok: true }; }
  updateContact_(c, { status: p.status || c.status, name: p.name !== undefined ? p.name : c.name, updated: now_() });
  return { ok: true };
}

// ------------------------------------------------------------ campaigns
function mail_campaigns(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  return { ok: true, presets: PRESETS, items: all_('Campaigns').filter(c => isAdmin_(u) || isEic_(u, c.journal)).map(c => ({ id: c.id, journal: c.journal, name: c.name, subject: c.subject, preset: c.preset, status: c.status, scheduledAt: c.scheduledAt, sentAt: c.sentAt, stats: c.stats || {}, updated: c.updated, audience: c.audience, sender: c.sender, preheader: c.preheader, content: c.content })).reverse() };
}
function mail_saveCampaign(p, u) {
  const c = p.campaign || {}; mailScope_(u, c.journal || null);
  need_(c.subject, 'Add a subject line.');
  need_(PRESETS[c.preset], 'Choose a design.');
  const row = { journal: c.journal || '', name: c.name || c.subject, subject: c.subject, preheader: c.preheader || '', preset: c.preset, content: c.content || {}, sender: c.sender || 'noreply', audience: c.audience || { lists: [c.journal || 'network'] }, updated: now_() };
  if (c.id) {
    const ex = find_('Campaigns', 'id', c.id); need_(ex, 'Campaign not found.');
    need_(['draft', 'template'].indexOf(ex.status) >= 0, 'Sent or scheduled campaigns cannot be edited. Duplicate it instead.');
    update_('Campaigns', 'id', c.id, row); return { ok: true, id: c.id };
  }
  const id = uid_('C');
  insert_('Campaigns', Object.assign(row, { id: id, status: c.status === 'template' ? 'template' : 'draft', createdBy: u.id, created: now_(), stats: {} }));
  return { ok: true, id: id };
}
function mail_preview(p, u) {
  const c = p.campaign || find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.');
  return { ok: true, html: renderCampaign_(c, { name: u.given, token: 'preview' }) };
}
function mail_test(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Save the campaign first.'); mailScope_(u, c.journal || null);
  const r = campaignSend_([{ email: u.email, name: u.given, token: 'test' }], c);
  return { ok: r[0].ok, error: r[0].error, message: r[0].ok ? 'Test sent to ' + u.email : r[0].error };
}
function audienceOf_(c) {
  const lists = (c.audience && c.audience.lists) || [c.journal || 'network'];
  const tags = (c.audience && c.audience.tags) || [];
  const seen = {}, out = [];
  all_('Contacts').forEach(x => {
    if (x.status !== 'subscribed' || lists.indexOf(x.list) < 0 || seen[x.email]) return;
    if (tags.length && !(x.tags || []).some(t => tags.indexOf(t) >= 0)) return;
    seen[x.email] = 1; out.push({ email: x.email, name: x.name, token: x.token });
  });
  // People who unsubscribed from ALL lists are never emailed, even if listed elsewhere.
  return out;
}
function mail_audience(p, u) { const c = p.campaign || find_('Campaigns', 'id', p.id); return { ok: true, count: audienceOf_(c).length }; }
function mail_send(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  need_(c.status === 'draft', 'Only drafts can be sent.');
  need_(campaignProvider_() === 'brevo' ? prop_('BREVO_KEY') : (prop_('ZEPTO_CAMPAIGN_TOKEN') || prop_('ZEPTO_TOKEN')), campaignProvider_() === 'brevo' ? 'Set BREVO_KEY first.' : 'Set ZEPTO_TOKEN (or ZEPTO_CAMPAIGN_TOKEN) first.');
  const n = audienceOf_(c).length; need_(n, 'No subscribed contacts in the selected lists.');
  update_('Campaigns', 'id', c.id, { status: 'scheduled', scheduledAt: p.at || now_(), stats: { total: n, sent: 0, failed: 0 }, updated: now_() });
  return { ok: true, message: (p.at ? 'Scheduled for ' + p.at : 'Sending started') + ' · ' + n + ' recipients. Emails go out in batches every few minutes.' };
}
function mail_stop(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  need_(['scheduled', 'sending'].indexOf(c.status) >= 0, 'This campaign is not sending.');
  update_('Campaigns', 'id', c.id, { status: 'stopped', updated: now_() });
  return { ok: true };
}
function mail_duplicate(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  const id = uid_('C');
  insert_('Campaigns', { id: id, journal: c.journal, name: c.name + ' (copy)', subject: c.subject, preheader: c.preheader, preset: c.preset, content: c.content, sender: c.sender, audience: c.audience, status: 'draft', createdBy: u.id, created: now_(), updated: now_(), stats: {} });
  return { ok: true, id: id };
}

/** Every 5 minutes: start due campaigns and send the next batch. */
function campaignTick() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const t0 = Date.now();
    all_('Campaigns').forEach(c => {
      if (c.status === 'scheduled' && new Date(c.scheduledAt) <= new Date()) {
        const rec = audienceOf_(c);
        const rows = rec.map(r => SCHEMA.Queue.map(k => encode_(k, { id: uid_('Q'), campaignId: c.id, email: r.email, name: r.name, token: r.token, status: 'queued', ts: now_() }[k])));
        if (rows.length) { const s = sh_('Queue'); s.getRange(s.getLastRow() + 1, 1, rows.length, SCHEMA.Queue.length).setValues(rows); }
        update_('Campaigns', 'id', c.id, { status: 'sending', stats: { total: rows.length, sent: 0, failed: 0 } });
      }
    });
    const sending = all_('Campaigns').filter(c => c.status === 'sending' || c.status === 'stopped');
    if (!sending.length) return;
    const qs = sh_('Queue'), q = all_('Queue');
    sending.forEach(c => {
      const mine = q.filter(x => x.campaignId === c.id && x.status === 'queued');
      if (c.status === 'stopped') { mine.forEach(x => qs.getRange(x._row, SCHEMA.Queue.indexOf('status') + 1).setValue('cancelled')); return; }
      const stats = c.stats || { total: 0, sent: 0, failed: 0 };
      for (let i = 0; i < mine.length && Date.now() - t0 < 240000; i += 40) {
        const batch = mine.slice(i, i + 40);
        const res = campaignSend_(batch, c);
        res.forEach((r, k) => {
          const x = batch[k];
          qs.getRange(x._row, SCHEMA.Queue.indexOf('status') + 1, 1, 3).setValues([[r.ok ? 'sent' : 'failed', r.error || '', now_()]]);
          r.ok ? stats.sent++ : stats.failed++;
        });
      }
      const left = all_('Queue').filter(x => x.campaignId === c.id && x.status === 'queued').length;
      update_('Campaigns', 'id', c.id, { stats: stats, status: left ? 'sending' : 'sent', sentAt: left ? '' : now_() });
      if (!left) bumpContacts_(c);
    });
  } finally { lock.releaseLock(); }
}
function bumpContacts_(c) {
  const sent = {}; all_('Queue').filter(x => x.campaignId === c.id && x.status === 'sent').forEach(x => sent[x.email] = 1);
  all_('Contacts').forEach(x => { if (sent[x.email] && (c.audience.lists || []).indexOf(x.list) >= 0) updateContact_(x, { lastSent: now_(), sentCount: (Number(x.sentCount) || 0) + 1 }); });
}

function campaignProvider_() { return String(prop_('CAMPAIGN_PROVIDER', 'brevo')).toLowerCase() === 'zepto' ? 'zepto' : 'brevo'; }
function newsletterFrom_() { return prop_('NEWSLETTER_FROM', 'newsletter@' + mailDomain_()); }
/** Send through the campaign provider (ZeptoMail or Brevo). Returns [{ok, error}] in order. */
function campaignSend_(recipients, c) {
  const prov = campaignProvider_();
  const key = prov === 'brevo' ? prop_('BREVO_KEY') : (prop_('ZEPTO_CAMPAIGN_TOKEN') || prop_('ZEPTO_TOKEN'));
  if (!key) return recipients.map(() => ({ ok: false, error: prov === 'brevo' ? 'BREVO_KEY not set' : 'ZEPTO_TOKEN not set' }));
  const j = c.journal ? journalRow_(c.journal) : null;
  // Every campaign comes from the single newsletter address; only the display name changes per journal.
  const from = { email: newsletterFrom_(), name: j ? j.code + ' · ACRI Journals' : 'ACRI Journals' };
  const replyTo = j ? (c.sender === 'editor' ? j.editorEmail : j.officeEmail) : controllerEmail_();
  const api = ScriptApp.getService().getUrl();
  const reqs = recipients.map(r => {
    const unsub = api + '?lu=' + encodeURIComponent(r.token);
    if (prov === 'zepto') return { url: 'https://' + prop_('ZEPTO_HOST', 'api.zeptomail.in') + '/v1.1/email', method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: /^Zoho-enczapikey/i.test(key) ? key : 'Zoho-enczapikey ' + key, Accept: 'application/json' },
      payload: JSON.stringify({ from: { address: from.email, name: from.name }, to: [{ email_address: { address: r.email, name: r.name || undefined } }], reply_to: [{ address: replyTo }], subject: personalise_(c.subject, r), htmlbody: renderCampaign_(c, r),
        mime_headers: { 'List-Unsubscribe': '<' + unsub + '>, <mailto:' + replyTo + '?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) };
    return { url: 'https://api.brevo.com/v3/smtp/email', method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { 'api-key': key, accept: 'application/json' },
      payload: JSON.stringify({ sender: from, to: [{ email: r.email, name: r.name || undefined }], replyTo: { email: replyTo }, subject: personalise_(c.subject, r), htmlContent: renderCampaign_(c, r),
        headers: { 'List-Unsubscribe': '<' + unsub + '>, <mailto:' + replyTo + '?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, tags: ['campaign', c.id] }) };
  });
  const res = UrlFetchApp.fetchAll(reqs);
  return res.map(x => x.getResponseCode() < 300 ? { ok: true } : { ok: false, error: x.getContentText().slice(0, 200) });
}
function personalise_(s, r) { return String(s || '').replace(/\{\{\s*name\s*\}\}/g, (r && r.name) ? r.name.split(' ')[0] : 'Colleague'); }

// ------------------------------------------------------------ campaign design (shared by preview and send)
function md_(t) {
  const e = esc_(t || '');
  return e.split(/\n{2,}/).map(block => {
    if (/^\s*[-•]\s/.test(block)) return '<ul style="margin:0 0 16px;padding-left:20px">' + block.split('\n').map(l => '<li style="margin:4px 0">' + l.replace(/^\s*[-•]\s/, '') + '</li>').join('') + '</ul>';
    return '<p style="margin:0 0 16px">' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:inherit">$1</a>');
}
function autoItems_(c) {
  const ct = c.content || {};
  if (['issue', 'digest', 'article'].indexOf(c.preset) < 0 || (ct.items && ct.items.length)) return ct.items || [];
  try {
    const idx = JSON.parse(UrlFetchApp.fetch(siteUrl_() + '/search/index.json', { muteHttpExceptions: true }).getContentText() || '[]');
    let list = idx.filter(a => !c.journal || a.j === c.journal);
    if (c.preset === 'issue' && ct.volume) list = list.filter(a => String(a.v) === String(ct.volume) && String(a.i) === String(ct.issue));
    if (c.preset === 'digest' && ct.since) list = list.filter(a => a.d >= ct.since);
    if (c.preset === 'article' && ct.articleUrl) list = list.filter(a => siteUrl_() + a.u === ct.articleUrl);
    return list.slice(0, Number(ct.limit) || 8).map(a => ({ title: a.t, meta: a.a + ' · ' + a.jc + ' · ' + a.ty, text: a.s.slice(0, 220) + (a.s.length > 220 ? '…' : ''), url: siteUrl_() + a.u }));
  } catch (e) { return []; }
}
function renderCampaign_(c, r) {
  const j = c.journal ? journalRow_(c.journal) : null;
  const accent = (j && j.accent) || '#0B2545', ct = c.content || {}, P = PRESETS[c.preset] || PRESETS.announcement;
  const api = ScriptApp.getService().getUrl();
  const prefs = portalUrl_('email?t=' + encodeURIComponent(r.token || ''));
  const unsub = portalUrl_('email?t=' + encodeURIComponent(r.token || '') + '&op=unsubscribe');
  const items = autoItems_(c);
  const cta = ct.ctaUrl || (c.preset === 'cfp' && j ? siteUrl_() + '/portal/#/submit?journal=' + j.slug : (j ? siteUrl_() + '/journals/' + j.slug + '/' : siteUrl_()));
  const font = "font-family:Inter,'Segoe UI',Arial,sans-serif";
  if (c.preset === 'outreach') {
    return '<!doctype html><html><body style="margin:0;background:#fff"><div style="max-width:620px;margin:0 auto;padding:28px 22px;' + font + ';font-size:15px;line-height:1.6;color:#15191E">' +
      (c.preheader ? '<div style="display:none;max-height:0;overflow:hidden">' + esc_(c.preheader) + '</div>' : '') +
      md_(personalise_(ct.body, r)) + (ct.signoff ? md_(ct.signoff) : '') +
      '<p style="margin-top:30px;border-top:1px solid #eee;padding-top:12px;font-size:12px;color:#8A939F">' + (j ? esc_(j.name) + ' · ' : '') + 'ACRI Journals · <a href="' + unsub + '" style="color:#8A939F">Unsubscribe</a></p></div></body></html>';
  }
  const dates = String(ct.dates || '').split('\n').map(l => l.split('|').map(s => s.trim())).filter(x => x[0]);
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#EEF1F5">' +
    (c.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc_(c.preheader) + '</div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:26px 10px"><tr><td align="center">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden">' +
    // header
    '<tr><td style="padding:22px 32px;border-bottom:1px solid #EEF0F3"><table role="presentation" width="100%"><tr><td style="color:#0B2545;line-height:1"><span style="font-family:Georgia,serif;font-weight:700;font-size:22px">ACRI</span><span style="display:inline-block;width:1px;height:17px;background:#1F7A4D;margin:0 10px;vertical-align:-2px"></span><span style="' + font + ';font-weight:700;font-size:10px;letter-spacing:.34em">JOURNALS</span></td>' +
    '<td align="right" style="' + font + ';font-size:12px;color:#5E6875">' + (j ? esc_(j.code) : '') + '</td></tr></table></td></tr>' +
    // hero
    '<tr><td style="background:' + accent + ';padding:38px 32px 34px;color:#fff">' +
    (P.kicker ? '<div style="' + font + ';font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-bottom:12px">' + esc_(ct.kicker || P.kicker) + (j ? ' · ' + esc_(j.code) : '') + '</div>' : '') +
    '<div style="font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:700">' + esc_(personalise_(ct.heading || c.subject, r)) + '</div>' +
    (ct.subheading ? '<div style="' + font + ';font-size:16px;line-height:1.5;margin-top:12px;opacity:.9">' + esc_(ct.subheading) + '</div>' : '') + '</td></tr>' +
    (ct.image ? '<tr><td><img src="' + esc_(ct.image) + '" width="640" style="display:block;width:100%;height:auto" alt=""></td></tr>' : '') +
    // body
    '<tr><td style="padding:30px 32px 8px;' + font + ';font-size:15.5px;line-height:1.65;color:#15191E">' + (ct.greeting !== false ? '<p style="margin:0 0 16px">Dear ' + esc_(personalise_('{{name}}', r)) + ',</p>' : '') + md_(personalise_(ct.body, r)) + '</td></tr>' +
    (dates.length ? '<tr><td style="padding:0 32px 10px"><table role="presentation" width="100%" style="border:1px solid #E2E5E9;border-radius:10px;' + font + ';font-size:14px">' + dates.map((d, i) => '<tr><td style="padding:11px 16px;color:#5E6875;' + (i ? 'border-top:1px solid #EEF0F3;' : '') + 'width:45%">' + esc_(d[0]) + '</td><td style="padding:11px 16px;font-weight:600;' + (i ? 'border-top:1px solid #EEF0F3;' : '') + '">' + esc_(d[1] || '') + '</td></tr>').join('') + '</table></td></tr>' : '') +
    (items.length ? '<tr><td style="padding:6px 32px 4px">' + items.map(it => '<table role="presentation" width="100%" style="border-top:1px solid #EEF0F3"><tr><td style="padding:16px 0"><a href="' + esc_(it.url) + '" style="font-family:Georgia,serif;font-size:18px;line-height:1.3;color:#15191E;text-decoration:none;font-weight:700">' + esc_(it.title) + '</a><div style="' + font + ';font-size:12.5px;color:#5E6875;margin-top:5px">' + esc_(it.meta || '') + '</div>' + (it.text ? '<div style="' + font + ';font-size:14px;color:#2F3742;margin-top:6px;line-height:1.55">' + esc_(it.text) + '</div>' : '') + '</td></tr></table>').join('') + '</td></tr>' : '') +
    (P.cta || ct.ctaLabel ? '<tr><td style="padding:14px 32px 30px"><a href="' + esc_(cta) + '" style="display:inline-block;background:' + accent + ';color:#fff;text-decoration:none;' + font + ';font-weight:600;font-size:15px;padding:13px 22px;border-radius:7px">' + esc_(ct.ctaLabel || P.cta) + ' →</a></td></tr>' : '') +
    (ct.signoff ? '<tr><td style="padding:0 32px 28px;' + font + ';font-size:15px;line-height:1.6;color:#15191E">' + md_(ct.signoff) + '</td></tr>' : '') +
    // footer
    '<tr><td style="background:#0B2545;padding:22px 32px;' + font + ';font-size:12px;line-height:1.6;color:#AEBACB">' +
    'You are receiving this because you subscribed to ' + esc_(listName_(c.journal || 'network')) + ' updates' + (j ? '' : '') + '.<br>' +
    '<a href="' + unsub + '" style="color:#fff">Unsubscribe</a> · <a href="' + prefs + '" style="color:#fff">Email preferences</a> · <a href="' + siteUrl_() + '/policies/email/" style="color:#fff">Email policy</a><br>' +
    'ACRI Journals · Part of ACRIVERSE · Ahmedabad, India · <a href="' + siteUrl_() + '" style="color:#AEBACB">' + siteUrl_().replace('https://', '') + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
}

// ------------------------------------------------------------ automations (enable / stop from the admin)
function automationsFor_(slug) { return all_('Automations').filter(a => a.journal === slug); }
function automationOn_(slug, type) { const a = all_('Automations').find(x => x.journal === slug && x.type === type); return a ? String(a.enabled) !== 'false' : type === 'review_reminders'; }
function seedAutomations_(slug) {
  [['review_reminders', true, ''], ['new_article', false, ''], ['new_issue', false, ''], ['digest', false, 30], ['recurring', false, 14]].forEach(([t, on, every]) => {
    if (all_('Automations').some(a => a.journal === slug && a.type === t)) return;
    insert_('Automations', { id: uid_('M'), journal: slug, type: t, name: AUTOMATION_TYPES[t], enabled: on, everyDays: every, campaignId: '', endDate: '', nextRun: '', lastRun: '', config: { includeNetwork: true }, updated: now_() });
  });
}
function mail_automations(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  all_('Journals').forEach(j => seedAutomations_(j.slug)); seedAutomations_('network');
  return { ok: true, types: AUTOMATION_TYPES, items: all_('Automations').filter(a => isAdmin_(u) || isEic_(u, a.journal)).map(a => ({ id: a.id, journal: a.journal, type: a.type, name: a.name, enabled: String(a.enabled) !== 'false', everyDays: a.everyDays, campaignId: a.campaignId, endDate: a.endDate, nextRun: a.nextRun, lastRun: a.lastRun, config: a.config || {} })) };
}
function mail_saveAutomation(p, u) {
  const a = find_('Automations', 'id', p.id); need_(a, 'Automation not found.'); mailScope_(u, a.journal !== 'network' ? a.journal : null);
  const patch = { updated: now_() };
  if (p.enabled !== undefined) patch.enabled = !!p.enabled;
  if (p.everyDays !== undefined) patch.everyDays = Number(p.everyDays) || '';
  if (p.campaignId !== undefined) patch.campaignId = p.campaignId;
  if (p.endDate !== undefined) patch.endDate = p.endDate;
  if (p.config !== undefined) patch.config = p.config;
  if (patch.enabled && !a.nextRun && (a.type === 'digest' || a.type === 'recurring')) patch.nextRun = addDays_(0);
  if (a.type === 'recurring' && patch.enabled) need_(p.campaignId || a.campaignId, 'Choose the campaign to repeat.');
  update_('Automations', 'id', a.id, patch);
  return { ok: true };
}
function queueAuto_(journal, preset, subject, content, lists, delayMin) {
  const id = uid_('C');
  insert_('Campaigns', { id: id, journal: journal === 'network' ? '' : journal, name: '[auto] ' + subject, subject: subject, preheader: '', preset: preset, content: content, sender: 'noreply', audience: { lists: lists }, status: 'scheduled', scheduledAt: new Date(Date.now() + (delayMin || 0) * 60000).toISOString(), createdBy: 'automation', created: now_(), updated: now_(), stats: {} });
  return id;
}
/** Called when an article is published (after the site has had time to build). */
function onArticlePublished_(s) {
  if (!automationOn_(s.journal, 'new_article')) return;
  const a = all_('Automations').find(x => x.journal === s.journal && x.type === 'new_article'), j = journalRow_(s.journal);
  const lists = [s.journal].concat((a.config || {}).includeNetwork ? ['network'] : []);
  queueAuto_(s.journal, 'article', 'New in ' + j.code + ': ' + s.title, { heading: s.title, body: 'A new article has been published in ' + j.name + '.', articleUrl: articleUrl_(s), ctaUrl: articleUrl_(s), limit: 1 }, lists, 15);
}
function onIssuePublished_(journal, volume, issue, label) {
  if (!automationOn_(journal, 'new_issue')) return;
  const j = journalRow_(journal), a = all_('Automations').find(x => x.journal === journal && x.type === 'new_issue');
  queueAuto_(journal, 'issue', j.code + ' Volume ' + volume + ', Issue ' + issue + ' is out', { heading: 'Volume ' + volume + ', Issue ' + issue + (label ? ' · ' + label : ''), body: 'The new issue of ' + j.name + ' is now available, free to read.', volume: volume, issue: issue, ctaUrl: siteUrl_() + '/journals/' + journal + '/issue/' + volume + '/' + issue + '/', limit: 12 }, [journal].concat((a.config || {}).includeNetwork ? ['network'] : []), 15);
}
function automationsTick() {
  const today = today_();
  all_('Automations').forEach(a => {
    try {
      if (String(a.enabled) === 'false' || ['digest', 'recurring'].indexOf(a.type) < 0) return;
      if (a.endDate && String(a.endDate).slice(0, 10) < today) { update_('Automations', 'id', a.id, { enabled: false, updated: now_() }); return; }
      if (a.nextRun && String(a.nextRun).slice(0, 10) > today) return;
      const every = Number(a.everyDays) || 30;
      if (a.type === 'digest') {
        const since = a.lastRun ? String(a.lastRun).slice(0, 10) : addDays_(-every);
        const name = a.journal === 'network' ? 'ACRI Journals' : journalRow_(a.journal).code;
        const c = { journal: a.journal === 'network' ? '' : a.journal, preset: 'digest', content: { since: since, limit: 10 } };
        if (autoItems_(c).length) queueAuto_(a.journal, 'digest', 'New research from ' + name, { heading: 'New research from ' + name, body: 'Here are the articles published since ' + fmtD_(since) + '.', since: since, limit: 10 }, [a.journal], 0);
      }
      if (a.type === 'recurring' && a.campaignId) {
        const src = find_('Campaigns', 'id', a.campaignId);
        if (src) { const id = uid_('C'); insert_('Campaigns', { id: id, journal: src.journal, name: '[repeat] ' + src.name, subject: src.subject, preheader: src.preheader, preset: src.preset, content: src.content, sender: src.sender, audience: src.audience, status: 'scheduled', scheduledAt: now_(), createdBy: 'automation', created: now_(), updated: now_(), stats: {} }); }
      }
      update_('Automations', 'id', a.id, { lastRun: today, nextRun: addDays_(every) });
    } catch (e) { console.error('automation', a.id, e); }
  });
}

Object.assign(TEMPLATES, {
  subscribe: d => ['Please confirm your subscription', `<p>Please confirm that you would like to receive updates from <b>${esc_(d.list || 'ACRI Journals')}</b>: new articles, issues and calls for papers.</p>${btn_(d.link, 'Confirm subscription')}<p style="color:#5E6875;font-size:13px">If you did not sign up, ignore this email. You will not be subscribed.</p>`],
});

// ======================================================================
// 12_Partners.gs
// ======================================================================
/** Partner registration: public application → admin approval → listed on /partners/. */

const PARTNER_TYPES = ['Academic partner', 'Indexing & archiving partner', 'Institutional partner', 'Industry partner', 'Media partner', 'Professional body'];

function public_partnerApply(p) {
  need_(p.name && p.contactName && /@/.test(p.contactEmail || ''), 'Please fill in the organisation name, contact person and email.');
  need_(p.agree === true, 'Please accept the partnership policy.');
  const rec = insert_('Partners', { id: uid_('P'), name: String(p.name).trim(), type: PARTNER_TYPES.indexOf(p.type) >= 0 ? p.type : PARTNER_TYPES[0], url: p.url || '', logoUrl: p.logoUrl || '', country: p.country || '', description: String(p.description || '').slice(0, 600),
    contactName: p.contactName, contactEmail: normEmail_(p.contactEmail), contactPhone: p.contactPhone || '', journals: p.journals || [], message: String(p.message || '').slice(0, 2000), status: 'pending', showOnSite: true, order: '', created: now_() });
  mailTemplate_('partner_received', rec.contactEmail, { name: p.contactName, org: rec.name });
  sendMail_(journalStaff_('', 'admin').map(x => x.email), 'New partner application: ' + rec.name, emailShell_('', '', '<p><b>' + esc_(rec.name) + '</b> (' + esc_(rec.type) + ') has applied to partner with ACRI Journals.</p>' + quote_(rec.message || rec.description) + btn_(portalUrl_('admin/partners'), 'Review application')));
  return { ok: true, message: 'Thank you. Your application has been received, and we will reply by email.' };
}

function partner_list(p, u) { need_(isAdmin_(u)); return { ok: true, types: PARTNER_TYPES, items: all_('Partners').map(x => { delete x._row; return x; }).reverse() }; }

function partner_save(p, u) {
  need_(isAdmin_(u));
  const x = p.partner || {}; need_(x.name, 'Name is required.');
  let rec = x.id ? find_('Partners', 'id', x.id) : null;
  const patch = {};
  ['name', 'type', 'url', 'logoUrl', 'country', 'description', 'contactName', 'contactEmail', 'contactPhone', 'order', 'note'].forEach(k => { if (x[k] !== undefined) patch[k] = x[k]; });
  if (x.showOnSite !== undefined) patch.showOnSite = !!x.showOnSite;
  if (x.journals !== undefined) patch.journals = x.journals;
  const prevStatus = rec ? rec.status : '';
  if (x.status) { patch.status = x.status; if (x.status !== prevStatus) { patch.decidedAt = now_(); patch.decidedBy = u.email; } }
  if (rec) rec = update_('Partners', 'id', rec.id, patch);
  else rec = insert_('Partners', Object.assign({ id: uid_('P'), status: 'approved', showOnSite: true, created: now_(), decidedAt: now_(), decidedBy: u.email }, patch));
  if (x.status && x.status !== prevStatus && rec.contactEmail && (x.status === 'approved' || x.status === 'rejected') && x.notify !== false)
    mailTemplate_(x.status === 'approved' ? 'partner_approved' : 'partner_rejected', rec.contactEmail, { name: rec.contactName || rec.name, org: rec.name, note: x.note || '' });
  publishPartners_();
  return { ok: true };
}
function publishPartners_() {
  if (!prop_('GITHUB_TOKEN')) return;
  const list = all_('Partners').filter(x => x.status === 'approved' && String(x.showOnSite) !== 'false')
    .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99))
    .map(x => ({ name: x.name, type: x.type, url: x.url, logoUrl: x.logoUrl, country: x.country, description: x.description, journals: x.journals || [], since: String(x.decidedAt || x.created).slice(0, 4) }));
  ghCommit_([{ path: 'content/partners.json', text: JSON.stringify(list, null, 2) }], 'Partners updated');
}

Object.assign(TEMPLATES, {
  partner_received: d => ['We have received your partnership application', `<p>Dear ${esc_(d.name)},</p><p>Thank you for applying to partner with ACRI Journals on behalf of <b>${esc_(d.org)}</b>. Our team will review the application and reply within 15 working days.</p><p>You can read our <a href="${siteUrl_()}/policies/partners/">partnership policy</a> in the meantime.</p>`],
  partner_approved: d => ['Welcome, ACRI Journals partner', `<p>Dear ${esc_(d.name)},</p><p>We are delighted to confirm <b>${esc_(d.org)}</b> as a partner of ACRI Journals. Your organisation will be listed on our <a href="${siteUrl_()}/partners/">Partners page</a>.</p>${d.note ? quote_(d.note) : ''}<p>We look forward to working together.</p>`],
  partner_rejected: d => ['Your partnership application', `<p>Dear ${esc_(d.name)},</p><p>Thank you for your interest in partnering with ACRI Journals. After careful consideration, we are unable to take forward the application from <b>${esc_(d.org)}</b> at this time.</p>${d.note ? quote_(d.note) : ''}<p>We wish you every success.</p>`],
});

// ======================================================================
// 13_BackIssues.gs
// ======================================================================
/** Back issues: bring previously published articles (e.g. IJBMRS Vol. 1–2) into ACRI Journals,
 *  edit them, and register new Zenodo DOIs that keep the ORIGINAL publication date and link the
 *  previous DOI (DataCite relation IsIdenticalTo). */

function biPath_(j, id) { return 'content/articles/' + j + '/' + id; }

function bi_list(p, u) {
  need_(isAdmin_(u));
  const dir = gh_('get', '/contents/content/articles/' + p.journal + '?ref=' + prop_('GITHUB_BRANCH', 'main')) || [];
  let idx = [];
  try { idx = JSON.parse(UrlFetchApp.fetch(siteUrl_() + '/search/index.json', { muteHttpExceptions: true }).getContentText() || '[]'); } catch (e) { }
  const byId = {}; idx.forEach(a => { byId[(a.u.split('/fullarticle/')[1] || '').replace(/\/$/, '').toUpperCase()] = a; });
  const items = dir.filter(d => d.type === 'dir').map(d => { const a = byId[d.name] || {}; return { id: d.name, title: a.t || '', published: a.d || '', volume: a.v || '', issue: a.i || '', doi: a.doi || '', previousDoi: a.pd || '', live: !!a.t }; });
  items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return { ok: true, items: items };
}
function bi_get(p, u) {
  need_(isAdmin_(u));
  const raw = ghRead_(biPath_(p.journal, p.id) + '/article.json'); need_(raw, 'Article not found.');
  return { ok: true, article: JSON.parse(raw), body: ghRead_(biPath_(p.journal, p.id) + '/body.html') || '' };
}

/**
 * Save a back-issue article.
 *  - pdf (base64, optional): the original PDF, kept as the PDF of record.
 *  - docx (base64, optional): a Word version, converted to full-text HTML by the site build.
 *  At least one of these must exist for a new article.
 */
function bi_save(p, u) {
  need_(isAdmin_(u));
  const a = p.article || {};
  need_(/^[A-Z0-9]+-\d{4}-\d{3,}$/.test(a.id || ''), 'Article ID must look like IJBMRS-2025-001.');
  need_(a.journal && a.title && a.published, 'Journal, title and original publication date are required.');
  need_((a.authors || []).length, 'Add at least one author.');
  const base = biPath_(a.journal, a.id);
  const existing = ghRead_(base + '/article.json');
  const prev = existing ? JSON.parse(existing) : {};
  const art = Object.assign({}, prev, a, { status: 'published', legacy: true, references: a.references || prev.references || [], info: Object.assign({}, prev.info || {}, a.info || {}) });
  if (!art.license) art.license = 'CC-BY-4.0';
  const files = [];
  if (p.docx) {
    // Let the build convert the Word file; keep original PDF as PDF of record if supplied.
    const meta = Object.assign({}, art, { frozenPdf: !!(p.pdf || prev.legacyPdf || prev.frozenPdf), legacyPdf: false });
    files.push({ path: 'content/incoming/' + a.id + '/meta.json', text: JSON.stringify(meta, null, 2) });
    files.push({ path: 'content/incoming/' + a.id + '/manuscript.docx', bytes: Utilities.base64Decode(p.docx) });
    if (p.pdf) files.push({ path: 'content/incoming/' + a.id + '/article.pdf', bytes: Utilities.base64Decode(p.pdf) });
  } else {
    need_(p.pdf || existing, 'Upload the original PDF (or a Word file) for a new article.');
    if (p.pdf) {
      // With converted full text, the original PDF stays the PDF of record (frozen); otherwise it is the only full text.
      if (prev.ingestedAt) { art.frozenPdf = true; art.legacyPdf = false; } else { art.legacyPdf = true; }
      files.push({ path: base + '/article.pdf', bytes: Utilities.base64Decode(p.pdf) });
    }
    files.push({ path: base + '/article.json', text: JSON.stringify(art, null, 2) });
    if (!existing) files.push({ path: base + '/body.html', text: '' });
  }
  ghCommit_(files, (existing ? 'Back issue updated: ' : 'Back issue added: ') + a.id);
  return { ok: true, message: 'Saved. The article will be live in 2–4 minutes.' };
}

/** Bulk add from CSV text (same columns as legacy/ijbmrs-template.csv). PDFs are fetched from their URLs. */
function bi_bulk(p, u) {
  need_(isAdmin_(u));
  const rows = parseCsv_(p.csv || ''); need_(rows.length, 'No rows found. Include the header row.');
  const out = []; let batch = [];
  const flush = () => { if (batch.length) { ghCommit_(batch, 'Back issues: bulk import (' + batch.filter(f => /article.json$/.test(f.path)).length + ')'); batch = []; } };
  rows.forEach(r => {
    try {
      const journal = (r.journal || r.id.split('-')[0]).toLowerCase();
      const affMap = {};
      if (/\d=/.test(r.affiliations || '')) r.affiliations.split('|').forEach(s => { const i = s.indexOf('='); affMap[Number(s.slice(0, i).trim())] = s.slice(i + 1).trim(); });
      else if (r.affiliations) affMap[1] = r.affiliations;
      const authors = String(r.authors || '').split(';').map(s => s.trim()).filter(String).map((s, i) => {
        const m = s.match(/\[([\d,\s]+)\]/), affs = m ? m[1].split(',').map(Number) : (Object.keys(affMap).length ? [1] : []);
        const parts = s.replace(/\[.*?\]/, '').split(','), nm = parts[0].trim().split(/\s+/), family = nm.pop();
        return { given: nm.join(' '), family: family, degrees: (parts[1] || '').trim(), affiliations: affs, corresponding: i === 0 };
      });
      const art = { id: r.id, journal: journal, status: 'published', legacy: true, legacyPdf: true, type: r.type || 'Original Research', title: r.title, authors: authors,
        affiliations: Object.keys(affMap).map(k => ({ id: Number(k), name: affMap[k] })), abstract: r.abstract || '', keywords: (r.keywords || '').split(';').map(s => s.trim()).filter(String),
        published: r.published, volume: r.volume || '', issue: r.issue || '', firstPage: r.firstPage || '', lastPage: r.lastPage || '', doi: r.doi || '', license: r.license || 'CC-BY-4.0', references: [], info: {} };
      const base = biPath_(journal, r.id);
      batch.push({ path: base + '/article.json', text: JSON.stringify(art, null, 2) }, { path: base + '/body.html', text: '' });
      if (/^https?:/.test(r.pdf || '')) {
        const res = UrlFetchApp.fetch(r.pdf, { muteHttpExceptions: true, followRedirects: true });
        if (res.getResponseCode() === 200) batch.push({ path: base + '/article.pdf', bytes: res.getContent() });
        else throw new Error('PDF download failed (' + res.getResponseCode() + ')');
      }
      out.push({ id: r.id, ok: true });
      if (batch.length >= 15) flush();
    } catch (e) { out.push({ id: r.id, ok: false, error: String(e.message) }); }
  });
  flush();
  return { ok: true, results: out };
}
function parseCsv_(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const data = rows.filter(r => r.some(x => String(x).trim()));
  const h = (data.shift() || []).map(x => x.trim());
  return data.map(r => { const o = {}; h.forEach((k, i) => o[k] = String(r[i] || '').trim()); return o; });
}

/** Register a NEW DOI for a back-issue article on Zenodo, keeping the original publication date,
 *  and recording any previous DOI as an identical work. */
function bi_registerDoi(p, u) {
  need_(isAdmin_(u));
  const base = biPath_(p.journal, p.id);
  const a = JSON.parse(ghRead_(base + '/article.json') || 'null'); need_(a, 'Article not found.');
  const j = journalRow_(p.journal);
  need_(!a.zenodo || p.force, 'This article already has a Zenodo DOI (' + a.doi + ').');
  const url = siteUrl_() + '/journals/' + a.journal + '/fullarticle/' + a.id.toLowerCase() + '/';
  const pdfUrl = siteUrl_() + '/journals/' + a.journal + '/articlepdf/' + a.id.toLowerCase() + '.pdf';
  const pdf = UrlFetchApp.fetch(pdfUrl, { muteHttpExceptions: true });
  need_(pdf.getResponseCode() === 200, 'The article PDF is not live yet (' + pdfUrl + '). Wait for the build and try again.');
  const old = a.previousDoi || a.doi || '';
  const abs = typeof a.abstract === 'string' ? '<p>' + a.abstract + '</p>' : abstractHtml_({ abstract: a.abstract });
  const rel = [{ identifier: url, relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'url' }];
  if (old) rel.push({ identifier: old, relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'doi' });
  const meta = {
    upload_type: 'publication', publication_type: 'article', title: a.title + (a.subtitle ? ': ' + a.subtitle : ''),
    creators: (a.authors || []).map(x => { const c = { name: x.family + ', ' + x.given }; const af = (x.affiliations || []).map(id => ((a.affiliations || []).find(f => f.id === id) || {}).name).filter(String)[0]; if (af) c.affiliation = af; if (x.orcid) c.orcid = x.orcid; return c; }),
    description: abs || a.title, publication_date: a.published, access_right: 'open', license: String(a.license || 'CC-BY-4.0').toLowerCase(),
    keywords: a.keywords || [], journal_title: j.name, journal_volume: String(a.volume || ''), journal_issue: String(a.issue || ''),
    journal_pages: a.firstPage ? a.firstPage + (a.lastPage ? '-' + a.lastPage : '') : (a.elocator || ''), related_identifiers: rel,
    notes: 'Originally published ' + a.published + ' in ' + j.name + (old ? ' (DOI ' + old + ')' : '') + '. Archived by ACRI Journals.',
  };
  const comm = prop_('ZENODO_COMMUNITY', ''); if (comm) meta.communities = [{ identifier: comm }];
  let dep = zen_('post', '/deposit/depositions', { metadata: meta });
  zen_('put', dep.links.bucket + '/' + a.id + '.pdf', null, pdf.getContent());
  dep = zen_('post', '/deposit/depositions/' + dep.id + '/actions/publish');
  if (p.makePrimary !== false) { if (old && old !== dep.doi) a.previousDoi = old; a.doi = dep.doi; }
  else a.additionalDoi = dep.doi;
  a.zenodo = String(dep.id); a.originalPublished = a.originalPublished || a.published;
  ghCommit_([{ path: base + '/article.json', text: JSON.stringify(a, null, 2) }], 'DOI registered: ' + a.id + ' → ' + dep.doi);
  return { ok: true, doi: dep.doi, previousDoi: a.previousDoi || '', url: (dep.links && (dep.links.record_html || dep.links.html)) || '' };
}

// ======================================================================
// 14_Indexing.gs
// ======================================================================
/** ISSN & indexing readiness.
 *  For every journal the system checks the ISSN India (NSL, CSIR-NIScPR) rules, the DOAJ / COPE-OASPA-WAME
 *  Principles of Transparency (v5), Google Scholar, Web of Science (ESCI) and Scopus expectations.
 *  Automatic checks read live data (board, issues, articles, site config); the rest are manual ticks.
 *  When a journal without an ISSN passes, it becomes "Ready for ISSN application" and admins are emailed. */

const ISSN_STAGES = { not_applied: 'Not applied', ready: 'Ready to apply', applied: 'Applied', verification: 'EB verification mails sent', provisional: 'Provisional ISSN assigned', assigned: 'Assigned (confirmed)', not_applicable: 'Not applicable' };
const PERSONAL_MAIL = /@(gmail|yahoo|ymail|hotmail|outlook|live|rediffmail|icloud|aol|proton(mail)?|zoho)\./i;

function siteConfig_() {
  const c = CacheService.getScriptCache(), hit = c.get('SITECFG'); if (hit) return JSON.parse(hit);
  let cfg = {}; try { cfg = JSON.parse(ghRead_('config/site.json') || '{}'); } catch (e) { }
  c.put('SITECFG', JSON.stringify(cfg), 600); return cfg;
}
function liveIndex_() {
  try { return JSON.parse(UrlFetchApp.fetch(siteUrl_() + '/search/index.json', { muteHttpExceptions: true }).getContentText() || '[]'); } catch (e) { return []; }
}
function boardMembers_(slug) {
  const users = {}; all_('Users').forEach(u => users[u.id] = u);
  return activeAppointments_(slug).map(a => Object.assign({ role: a.role }, users[a.userId] || {}));
}
function isAnnual_(freq) { return /annual/i.test(freq || '') && !/bi|semi|tri/i.test(freq || ''); }

/** Build every checklist for a journal. Each item: {key, label, ok, auto, detail, required} */
function readiness_(slug) {
  const j = journalRow_(slug), cfg = siteConfig_(), man = j.readinessManual || {};
  const eb = boardMembers_(slug), idx = liveIndex_().filter(a => a.j === slug);
  let issues = []; try { issues = JSON.parse(ghRead_('content/journals/' + slug + '/issues.json') || '[]'); } catch (e) { }
  const byIssue = {}; idx.forEach(a => { if (a.v) { const k = a.v + '-' + a.i; byIssue[k] = (byIssue[k] || 0) + 1; } });
  const firstIssueN = Object.keys(byIssue).length ? byIssue[Object.keys(byIssue).sort()[0]] : 0;
  const minArticles = isAnnual_(j.frequency) ? 10 : 5;
  const international = (j.scopeType || '') === 'international' || /international/i.test(j.name);
  const foreign = eb.filter(m => m.country && !/^india$/i.test(String(m.country).trim()));
  const complete = eb.filter(m => m.designation && m.affiliation && m.instAddress && (m.instEmail || m.email) && !PERSONAL_MAIL.test(m.instEmail || m.email));
  const withProfile = eb.filter(m => /^https?:\/\//.test(m.profileUrl || ''));
  const hasAddr = !!String(cfg.publisherAddress || '').trim(), hasPhone = !!String(cfg.publisherPhone || '').trim();
  const pct = (n) => idx.length ? Math.round(100 * n / idx.length) : 0;
  const withAbs = idx.filter(a => a.s && a.s.length > 50).length, withKw = idx.filter(a => a.k).length, withDoi = idx.filter(a => a.doi).length;
  const skipped = issues.filter(i => i.published === false);
  const issnAssigned = !!(j.issnOnline || j.issn);
  const A = (key, label, ok, detail, required) => ({ key, label, ok: !!ok, auto: true, detail: detail || '', required: required !== false });
  const M = (key, label, detail, required) => ({ key, label, ok: !!man[key], auto: false, detail: detail || '', required: required !== false });

  const issn = issnAssigned ? [
    A('issn_shown', 'ISSN shown on the journal website and on every article PDF', true),
    M('issn_url_informed', 'ISSN India informed of the new website URL and publisher details (email from the journal\'s official address to issnindia.niscpr@csir.res.in)', 'Required whenever the URL, publisher or editorial board changes'),
    M('issn_confirmed', 'ISSN record confirmed on the international ISSN portal (portal.issn.org)'),
  ] : [
    A('eb5', 'At least 5 Editorial Board members appointed and signed', eb.length >= 5, eb.length + ' active'),
    A('eb_details', 'Every EB member has designation, institution, full postal address and an institutional email (not Gmail/Yahoo etc.)', eb.length >= 5 && complete.length === eb.length, complete.length + ' of ' + eb.length + ' complete'),
    A('eb_profiles', 'Institutional profile links for at least 5 EB members (sent to the ISSN office by email)', withProfile.length >= 5, withProfile.length + ' with links'),
    international ? A('eb_international', 'International journal: some EB members from reputed institutions abroad', foreign.length >= 2, foreign.length + ' outside India') : null,
    M('eb_senior', 'EB members are senior faculty / experts (no students or research fellows)'),
    A('first_issue', 'First issue published with at least ' + minArticles + ' original articles', firstIssueN >= minArticles, firstIssueN + ' in first issue'),
    A('publisher_address', 'Publisher name and complete postal address in India shown on the website', hasAddr, hasAddr ? '' : 'Set publisherAddress in config/site.json'),
    A('contact', 'Journal email and phone shown on the website', hasPhone, hasPhone ? '' : 'Set publisherPhone in config/site.json'),
    A('particulars', 'Journal particulars, aims & scope, author guidelines, review and plagiarism policy on the journal page', true),
    A('archive', 'Archive page with each article separately hyperlinked to its own PDF', true),
    A('biblio', 'Journal name, volume, issue, date and page numbers on each article', true),
    M('institution_link', 'Journal linked from the publisher\'s main website (e.g. "Publications → Journals" on acriindia.org)'),
    M('title_unique', 'Title checked against the ISSN India and international registers (no duplicate)'),
    M('address_proof', 'Self-attested address proof of the applicant/publisher ready (Aadhaar, Voter ID, driving licence or passport)'),
    M('plagiarism', 'All published articles checked for plagiarism per UGC guidelines'),
    M('eb_briefed', 'EB members told to expect, and answer within 3 days, a verification email from the ISSN office'),
  ].filter(Boolean);

  const doaj = [
    A('d_issn', 'Has an ISSN (online)', issnAssigned),
    A('d_https', 'Official website on HTTPS with secondary sites redirecting to it', true),
    A('d_license', 'Open licence (CC) shown on HTML and PDF of every article; copyright holder stated', true),
    A('d_policies', 'Published policies: peer review, ethics, AI, authorship, conflicts, data, corrections, appeals, plagiarism, research ethics, advertising, preservation', true),
    A('d_eb', 'Editorial board with full names and affiliations (at least 5)', eb.length >= 5, eb.length + ' members'),
    A('d_owner', 'Ownership, management and full business address shown', hasAddr),
    A('d_fees', 'Author fees clearly stated (or clearly "no fees")', cfg.fees && cfg.fees.confirmed, cfg.fees && cfg.fees.confirmed ? '' : 'Confirm fees in config/site.json → fees.confirmed'),
    A('d_dates', 'Publication date (and received/accepted where available) on every article', true),
    A('d_preservation', 'Long-term preservation separate from the website (Zenodo)', true),
    M('d_history', 'Publishing history meets DOAJ\'s current minimum (see doaj.org/apply/guide)'),
    M('d_schedule', 'Publishing to the stated schedule' + (skipped.length ? ' (note: ' + skipped.map(i => 'Vol ' + i.volume + ' Issue ' + i.issue).join(', ') + ' skipped; explain on the site)' : ''), '', true),
  ];
  const wos = [
    A('w_issn', 'ISSN', issnAssigned),
    A('w_doi', 'DOIs on articles', withDoi === idx.length && idx.length > 0, pct(withDoi) + '% of articles'),
    A('w_abs', 'English title, abstract and keywords on every article', withAbs === idx.length && withKw === idx.length && idx.length > 0, pct(withAbs) + '% abstracts, ' + pct(withKw) + '% keywords'),
    A('w_board', 'Editorial board with affiliations publicly listed', eb.length >= 5),
    A('w_timely', 'Issues published on time, no skipped issues', !skipped.length, skipped.length ? skipped.length + ' skipped issue(s)' : ''),
    M('w_refs', 'Full reference lists in Roman script on every article (add references to back-issue metadata)'),
    M('w_diversity', 'Author and board diversity beyond one institution or region'),
    M('w_ethics', 'Ethics, peer-review and misconduct processes followed in practice (and documented)'),
    M('w_content', 'Scholarly content consistent with the stated scope'),
  ];
  const scopus = [
    A('s_issn', 'ISSN', issnAssigned),
    A('s_abs', 'English abstracts and titles', withAbs === idx.length && idx.length > 0, pct(withAbs) + '%'),
    M('s_history', 'At least two years of regular publishing'),
    M('s_refs', 'References in Roman script'),
    M('s_ethics', 'Publicly available publication ethics and malpractice statement (done: /policies/ethics/)'),
    M('s_cited', 'Articles are being cited in other Scopus-indexed journals'),
  ];
  const scholar = [
    A('g_meta', 'Highwire/citation meta tags, abstract on each article page, PDF link', true),
    A('g_sitemap', 'Sitemap and browse pages (issues, archive)', true),
    M('g_console', 'Site verified in Google Search Console and sitemap submitted'),
    M('g_request', 'Google Scholar inclusion request sent'),
  ];
  const score = (l) => ({ done: l.filter(x => x.ok).length, total: l.length, ready: l.filter(x => x.required).every(x => x.ok) });
  return { slug: slug, name: j.name, code: j.code, issnStatus: (j.issnStatus || {}).online || (issnAssigned ? 'assigned' : 'not_applied'), issnOnline: j.issnOnline || j.issn || '', issnApp: j.issnApp || {},
    lists: { issn: { title: issnAssigned ? 'ISSN (assigned): keeping it valid' : 'ISSN India: online ISSN application', items: issn, score: score(issn) },
      doaj: { title: 'DOAJ (COPE/OASPA/WAME Principles v5)', items: doaj, score: score(doaj) },
      scholar: { title: 'Google Scholar', items: scholar, score: score(scholar) },
      wos: { title: 'Web of Science: ESCI', items: wos, score: score(wos) },
      scopus: { title: 'Scopus', items: scopus, score: score(scopus) } },
    stats: { articles: idx.length, issues: Object.keys(byIssue).length, eb: eb.length, foreignEb: foreign.length } };
}

function idx_readiness(p, u) { need_(isAdmin_(u) || isEic_(u, p.journal), 'Not allowed.'); return { ok: true, r: readiness_(p.journal), stages: ISSN_STAGES }; }
function idx_tick(p, u) {
  need_(isAdmin_(u) || isEic_(u, p.journal), 'Not allowed.');
  const r = find_('Journals', 'slug', p.journal); const json = Object.assign({}, r.json || {});
  json.readinessManual = Object.assign({}, json.readinessManual || {}, { [p.key]: !!p.ok });
  update_('Journals', 'slug', p.journal, { json: json, updated: now_() }); CacheService.getScriptCache().remove('J:' + p.journal);
  return { ok: true };
}

/** Prefilled values for the ISSN India online form, and the enclosures/email the office needs. */
function idx_issnPack(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const j = journalRow_(p.journal), cfg = siteConfig_(), eb = boardMembers_(p.journal);
  const url = siteUrl_() + '/journals/' + j.slug + '/';
  const form = [
    ['Tell us about your publication', 'New title'],
    ['Title', j.name], ['Year (starting year of the online format)', String(j.startYear || j.since || '')],
    ['Frequency', j.frequency || ''], ['Format', 'Online'], ['RNI Number', 'Not applicable (academic journal; exempt under PRP Act 2023)'],
    ['Publication URL', url], ['Username/password required?', 'No: open access'],
    ['Subject', j.subjectArea || (j.subjects || [])[0] || ''], ['Language', (j.languages || ['English']).join(', ')],
    ['Owner name / applicant person', cfg.issnApplicant || ''], ['Publisher name', cfg.publisherName || CFG.LEGAL_ENTITY],
    ['Mobile', cfg.publisherPhone || ''], ['E-mail', j.officeEmail], ['Publisher address', cfg.publisherStreet || cfg.publisherAddress || ''],
    ['Town/City', cfg.publisherCity || ''], ['State', cfg.publisherState || ''], ['Pin code', cfg.publisherPin || ''],
    ['Additional information', j.name + ' is an open-access, double-blind peer-reviewed ' + (j.frequency || '').toLowerCase() + ' journal published by ' + (cfg.publisherName || CFG.LEGAL_ENTITY) + '. Editorial board: ' + url + 'editorial-board/ · Archive: ' + url + 'archive/'],
  ];
  const profiles = eb.map(m => '• ' + (m.given + ' ' + m.family).trim() + ', ' + (m.designation || '') + ', ' + (m.affiliation || '') + ' (' + (m.instEmail || m.email) + '): ' + (m.profileUrl || 'PROFILE LINK MISSING')).join('\n');
  const email = 'To: issnindia.niscpr@csir.res.in\nFrom: ' + j.officeEmail + '\nSubject: Institutional profile links of Editorial Board members: ' + j.name + ' (online ISSN application)\n\nDear Sir/Madam,\n\nWith reference to our online ISSN application for "' + j.name + '" (' + url + '), please find below the institutional profile links of our Editorial Board members:\n\n' + profiles + '\n\nPublisher: ' + (cfg.publisherName || '') + ', ' + (cfg.publisherAddress || '') + '\n\nYours faithfully,\nEditorial Office, ' + j.name;
  const enclosures = ['Printout of the submitted online application form, signed', 'Self-attested address proof of the applicant/publisher (Aadhaar, Voter ID, driving licence or passport)', 'Covering letter on letterhead with the journal URL', 'Post to: The Head, National Science Library, ISSN National Centre India, c/o CSIR-NIScPR, 14 Satsang Vihar Marg, New Delhi 110067'];
  return { ok: true, form: form, email: email, enclosures: enclosures, applyUrl: 'https://nsl.niscpr.res.in/', statusUrl: 'https://nsl.niscpr.res.in/' };
}

/** Move the ISSN workflow forward. stage: applied | verification | provisional | assigned | not_applied */
function idx_issnStage(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const r = find_('Journals', 'slug', p.journal); const json = Object.assign({}, r.json || {});
  json.issnStatus = Object.assign({}, json.issnStatus || {}, { online: p.stage });
  json.issnApp = Object.assign({}, json.issnApp || {}, p.app || {});
  json.issnApp[p.stage + 'On'] = today_();
  if ((p.stage === 'provisional' || p.stage === 'assigned') && p.issn) { need_(/^\d{4}-\d{3}[\dX]$/.test(p.issn), 'ISSN must look like 1234-567X.'); json.issnOnline = p.issn; json.issn = p.issn; json.eissn = p.issn; }
  update_('Journals', 'slug', p.journal, { json: json, updated: now_() }); CacheService.getScriptCache().remove('J:' + p.journal);
  const j = journalRow_(p.journal);
  if (p.stage === 'applied') boardMembers_(p.journal).forEach(m => mailTemplate_('issn_eb_notice', m.instEmail || m.email, { name: m.given, journal: j.name }, { journal: p.journal }));
  if ((p.stage === 'provisional' || p.stage === 'assigned') && prop_('GITHUB_TOKEN')) ghCommit_([{ path: 'content/journals/' + p.journal + '/journal.json', text: JSON.stringify(json, null, 2) }], 'ISSN ' + p.stage + ': ' + json.code + ' ' + (p.issn || ''));
  return { ok: true };
}

/** Daily: flag journals that have become ready, and remind about provisional ISSN confirmation. */
function issnTick() {
  all_('Journals').forEach(r => {
    try {
      const j = journalRow_(r.slug), st = (j.issnStatus || {}).online || (j.issnOnline ? 'assigned' : 'not_applied');
      if (st === 'not_applied') {
        const rd = readiness_(r.slug);
        if (rd.lists.issn.score.ready) {
          const json = Object.assign({}, r.json || {}); json.issnStatus = Object.assign({}, json.issnStatus || {}, { online: 'ready' });
          update_('Journals', 'slug', r.slug, { json: json }); CacheService.getScriptCache().remove('J:' + r.slug);
          sendMail_(journalStaff_('', 'admin').map(x => x.email), j.code + ' is ready for its ISSN application', emailShell_(j.accent, j.name, '<p><b>' + esc_(j.name) + '</b> now meets every ISSN India requirement we can check.</p><p>Open the prefilled ISSN application pack in the portal, submit the online form at nsl.niscpr.res.in, and post the signed printout with the enclosures.</p>' + btn_(portalUrl_('admin/indexing?j=' + r.slug), 'Open ISSN application pack', j.accent)));
        }
      }
    } catch (e) { console.error('issnTick', r.slug, e); }
  });
}
/** Called when an issue is published: provisional ISSNs are confirmed only after the next issue is reported. */
function onIssueForIssn_(journal, volume, issue) {
  const j = journalRow_(journal);
  if (((j.issnStatus || {}).online) !== 'provisional') return;
  const url = siteUrl_() + '/journals/' + journal + '/issue/' + volume + '/' + issue + '/';
  sendMail_(journalStaff_('', 'admin').map(x => x.email), 'Action: send ISSN confirmation letter for ' + j.code, emailShell_(j.accent, j.name, '<p>A new issue of ' + esc_(j.name) + ' (Vol ' + volume + ', Issue ' + issue + ') is published. ISSN India confirms a provisional ISSN only after the next issue is reported.</p><p>Send this from <b>' + esc_(j.officeEmail) + '</b> to issnindia.niscpr@csir.res.in:</p>' + quote_('Subject: Request for confirmation of provisional ISSN ' + (j.issnOnline || '') + ': ' + j.name + '\n\nDear Sir/Madam,\n\nWe are pleased to inform you that the next issue of "' + j.name + '" (e-ISSN ' + (j.issnOnline || '') + '), Volume ' + volume + ', Issue ' + issue + ', has been published at:\n' + url + '\n\nWe request you to kindly confirm the ISSN.\n\nYours faithfully,\nEditorial Office, ' + j.name) + '<p>Then mark the ISSN as confirmed in the portal once the record appears on portal.issn.org.</p>'));
}

/** Logo upload: kind = logo | mark | logo-white | mark-white; png or svg. Empty data removes it (back to generated). */
function adm_logo(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  need_(['logo', 'mark', 'logo-white', 'mark-white'].indexOf(p.kind) >= 0, 'Unknown logo type.');
  const ext = /svg/i.test(p.mime || p.name || '') ? 'svg' : 'png', base = 'content/journals/' + p.journal + '/' + p.kind;
  const files = p.data ? [{ path: base + '.' + ext, bytes: Utilities.base64Decode(p.data) }] : [{ path: base + '.png', delete: true }];
  if (p.data && ext === 'png') files.push({ path: base + '.svg', delete: true });
  ghCommit_(files, (p.data ? 'Logo uploaded: ' : 'Logo removed: ') + p.journal + ' ' + p.kind);
  return { ok: true, message: 'Saved. The website updates in a few minutes.' };
}

Object.assign(TEMPLATES, {
  issn_eb_notice: d => [`Please watch for an ISSN verification email: ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>We have applied to the ISSN National Centre India (National Science Library, CSIR-NIScPR) for an ISSN for <b>${esc_(d.journal)}</b>, on whose Editorial Board you serve.</p><p>The ISSN office may email some Editorial Board members to verify their membership. <b>If you receive such an email, please reply within 3 days</b>, otherwise the application can be declined. Please also check your spam folder.</p><p>Thank you for your support.</p>`],
});

// ======================================================================
// 15_Messages.gs
// ======================================================================
/** Contact messages for the journal office (controller) and Editors-in-Chief.
 *  Sent from the website's contact form, stored in the "Messages" sheet and handled in the portal
 *  (Admin → Messages). They are NOT emailed to the office or the EIC. Only the reply to the sender goes by email. */

const MSG_TO = { office: 'Journal office', eic: 'Editor-in-Chief' };

function public_contact(p) {
  if (String(p.website || '').trim()) return { ok: true, ref: 'MSG' }; // spam trap
  const email = normEmail_(p.email), name = String(p.name || '').trim(), subject = String(p.subject || '').trim(), body = String(p.body || '').trim();
  need_(name.length >= 2, 'Please enter your name.');
  need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Please enter a valid email address.');
  need_(subject.length >= 3, 'Please add a subject.');
  need_(body.length >= 10, 'Please write your message.');
  const journal = String(p.journal || '');
  if (journal) need_(find_('Journals', 'slug', journal), 'Unknown journal.');
  const c = CacheService.getScriptCache(), k = 'CT:' + email, n = Number(c.get(k) || 0);
  need_(n < 5, 'You have sent several messages in a short time. Please wait an hour and try again.');
  c.put(k, String(n + 1), 3600);
  const id = 'MSG-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd') + '-' + uid_().slice(0, 5).toUpperCase();
  insert_('Messages', { id: id, journal: journal, to: MSG_TO[p.to] ? p.to : 'office', name: name.slice(0, 120), email: email, role: String(p.role || '').slice(0, 40), msId: String(p.msId || '').trim().slice(0, 40),
    subject: subject.slice(0, 200), body: body.slice(0, 5000), status: 'new', created: now_(), meta: String(p.page || '').slice(0, 200) });
  return { ok: true, ref: id };
}

/** Who sees which messages: admins (the journal office / controller) see everything;
 *  an Editor-in-Chief sees messages addressed to the EIC of their own journal(s). */
function canSeeMsg_(u, m) { return isAdmin_(u) || (m.to === 'eic' && m.journal && (u.roles.eic || []).indexOf(m.journal) >= 0); }
function msgView_(m) { const o = Object.assign({}, m); delete o._row; o.toLabel = MSG_TO[m.to] || m.to; return o; }

function msg_list(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  const items = all_('Messages').filter(m => canSeeMsg_(u, m) && (!p.status || (p.status === 'open' ? m.status !== 'closed' : m.status === p.status)) && (!p.journal || m.journal === p.journal));
  return { ok: true, items: items.map(msgView_).reverse(), unread: items.filter(m => m.status === 'new').length };
}
function msg_count_(u) {
  if (!(isAdmin_(u) || anyEic_(u))) return 0;
  try { return all_('Messages').filter(m => m.status === 'new' && canSeeMsg_(u, m)).length; } catch (e) { return 0; }
}

/** op: read | close | reopen | note | reply | forward (office → EIC) */
function msg_update(p, u) {
  const m = find_('Messages', 'id', p.id); need_(m && canSeeMsg_(u, m), 'Message not found.');
  const patch = {};
  if (p.op === 'read' && m.status === 'new') Object.assign(patch, { status: 'read', readAt: now_(), readBy: u.email });
  if (p.op === 'close') patch.status = 'closed';
  if (p.op === 'reopen') patch.status = 'read';
  if (p.op === 'note') patch.note = String(p.note || '').slice(0, 2000);
  if (p.op === 'forward') { need_(isAdmin_(u) && m.journal, 'Choose a journal for this message first.'); Object.assign(patch, { to: 'eic', status: 'new', note: ((m.note || '') + '\n[' + today_() + '] Passed to the Editor-in-Chief by ' + u.email).trim() }); }
  if (p.op === 'journal') { need_(isAdmin_(u), 'Not allowed.'); patch.journal = p.journal || ''; }
  if (p.op === 'reply') {
    const text = String(p.reply || '').trim(); need_(text.length >= 5, 'Write your reply.');
    const j = m.journal ? journalRow_(m.journal) : null;
    const who = m.to === 'eic' ? 'Editor-in-Chief' + (j ? ', ' + j.name : '') : 'Editorial Office' + (j ? ', ' + j.name : ', ACRI Journals');
    const inner = '<p>Dear ' + esc_(m.name) + ',</p>' + quote_(text).replace('background:#F6F7F9;border-left:3px solid #C9CED5', 'background:#fff;border-left:3px solid ' + ((j && j.accent) || '#0B2545')) +
      '<p>' + esc_(who) + '</p><hr style="border:0;border-top:1px solid #EEF0F3;margin:22px 0"><p style="color:#5E6875;font-size:13px">Your message (' + m.id + ', ' + fmtD_(m.created) + '):<br><b>' + esc_(m.subject) + '</b></p>' + quote_(m.body) +
      '<p style="color:#5E6875;font-size:13px">To write again, please use the <a href="' + siteUrl_() + '/contact/' + (m.journal ? '?journal=' + m.journal : '') + '">contact form</a> and quote ' + m.id + '.</p>';
    const snd = m.to === 'eic' && j ? { from: j.editorEmail, fromName: j.code + ' Editor-in-Chief', replyTo: j.editorEmail } : j ? { from: j.noReplyEmail, fromName: j.code + ' Editorial Office', replyTo: j.officeEmail } : { from: systemFrom_(), fromName: 'ACRI Journals', replyTo: controllerEmail_() };
    sendMail_(m.email, 'Re: ' + m.subject + ' [' + m.id + ']', emailShell_(j ? j.accent : '', j ? j.name : '', inner), snd);
    Object.assign(patch, { reply: ((m.reply ? m.reply + '\n\n---\n' : '') + '[' + now_() + ' ' + u.email + ']\n' + text), repliedAt: now_(), repliedBy: u.email, status: p.close ? 'closed' : 'replied' });
  }
  if (Object.keys(patch).length) update_('Messages', 'id', m.id, patch);
  return { ok: true };
}

// ======================================================================
// 16_Settings.gs
// ======================================================================
/** Admin → Settings: every integration key (Script properties) and the public website details
 *  (config/site.json in GitHub) managed from the portal. Secrets are write-only: the portal only
 *  ever sees whether they are set and their last 4 characters. */

const SETTINGS = [
  // group, key, label, type (text|secret|select|email|url), help, options
  ['GitHub (website publishing)', 'GITHUB_REPO', 'Repository', 'text', 'owner/name, e.g. contract-acri/journals'],
  ['GitHub (website publishing)', 'GITHUB_BRANCH', 'Branch', 'text', 'Usually main'],
  ['GitHub (website publishing)', 'GITHUB_TOKEN', 'Access token', 'secret', 'Fine-grained token: Contents read & write, Actions read-only'],
  ['Email sending (Zoho ZeptoMail)', 'MAIL_PROVIDER', 'Workflow email', 'select', 'auto = ZeptoMail with Gmail fallback', ['auto', 'zepto', 'gmail']],
  ['Email sending (Zoho ZeptoMail)', 'ZEPTO_TOKEN', 'ZeptoMail Send Mail token', 'secret', 'Agents → SMTP/API → API'],
  ['Email sending (Zoho ZeptoMail)', 'ZEPTO_HOST', 'ZeptoMail API host', 'select', 'api.zeptomail.in for the India data centre', ['api.zeptomail.in', 'api.zeptomail.com', 'api.zeptomail.eu']],
  ['Email sending (Zoho ZeptoMail)', 'CAMPAIGN_PROVIDER', 'Campaign email', 'select', 'brevo (recommended) or zepto', ['brevo', 'zepto']],
  ['Email sending (Zoho ZeptoMail)', 'ZEPTO_CAMPAIGN_TOKEN', 'Separate campaign agent token (optional)', 'secret', 'Leave empty to use the main token'],
  ['Email sending (Zoho ZeptoMail)', 'BREVO_KEY', 'Brevo API key (only if campaigns use Brevo)', 'secret', ''],
  ['Email addresses', 'MAIL_DOMAIN', 'Sending domain', 'text', 'Verified in ZeptoMail, e.g. journals.acriindia.org'],
  ['Email addresses', 'SYSTEM_FROM', 'System sender', 'email', 'e.g. no.reply@journals.acriindia.org'],
  ['Email addresses', 'NEWSLETTER_FROM', 'Campaign / newsletter sender (Brevo)', 'email', 'All campaigns come from this address, e.g. newsletter@journals.acriindia.org'],
  ['Email addresses', 'CONTROLLER_EMAIL', 'Journal office (controller)', 'email', 'Replies to journal emails go here'],
  ['Email addresses', 'EDITORS_EMAIL', 'Editors address', 'email', 'Decisions and reviewer emails come from here'],
  ['Zenodo (DOIs)', 'ZENODO_TOKEN', 'Zenodo token', 'secret', 'deposit:write and deposit:actions'],
  ['Zenodo (DOIs)', 'ZENODO_SANDBOX', 'Mode', 'select', 'false = real DOIs on zenodo.org', ['false', 'true']],
  ['Zenodo (DOIs)', 'ZENODO_COMMUNITY', 'Community (optional)', 'text', 'Last part of the community address, e.g. acri-journals'],
  ['System', 'SITE_URL', 'Website address', 'url', 'e.g. https://acriindia.org.in'],
  ['System', 'ADMIN_EMAILS', 'Admin emails', 'text', 'Comma-separated; these accounts become admins when they register'],
  ['System', 'DRIVE_ROOT_ID', 'Drive folder ID for manuscripts', 'text', 'Created automatically by setup()'],
];
/** Website details stored in config/site.json (path → label, type). */
const SITE_FIELDS = [
  ['Publisher', 'publisherName', 'Publisher (legal name)', 'text'],
  ['Publisher', 'publisherStreet', 'Street address', 'text'],
  ['Publisher', 'publisherCity', 'City', 'text'],
  ['Publisher', 'publisherState', 'State', 'text'],
  ['Publisher', 'publisherPin', 'PIN code', 'text'],
  ['Publisher', 'publisherPhone', 'Phone', 'text'],
  ['Publisher', 'publisherWebsite', 'Publisher website', 'url'],
  ['Publisher', 'issnApplicant', 'ISSN applicant (person)', 'text'],
  ['Home page', 'homeHeadline', 'Headline', 'text'],
  ['Home page', 'homeHeadlineAccent', 'Headline (highlighted part)', 'text'],
  ['Home page', 'homeIntro', 'Introduction', 'textarea'],
  ['Home page', 'tagline', 'Tagline', 'text'],
  ['Home page', 'description', 'Site description (search engines)', 'textarea'],
  ['Fees', 'fees.confirmed', 'Fees confirmed and shown on the site', 'bool'],
  ['Fees', 'fees.apc', 'Article processing charge (0 = no fees)', 'number'],
  ['Fees', 'fees.currency', 'Currency', 'text'],
  ['Fees', 'fees.note', 'Fee note (waivers etc.)', 'textarea'],
  ['Legal & policies', 'grievanceOfficer', 'Grievance officer', 'text'],
  ['Legal & policies', 'grievanceEmail', 'Grievance email', 'email'],
  ['Legal & policies', 'privacyEmail', 'Privacy email', 'email'],
  ['Legal & policies', 'policyEffective', 'Policies effective from', 'text'],
];
function getPath_(o, p) { return p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
function setPath_(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { if (typeof x[k] !== 'object' || x[k] === null) x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }

function set_get(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const P = PropertiesService.getScriptProperties();
  const props = SETTINGS.map(([group, key, label, type, help, options]) => {
    const v = P.getProperty(key) || '';
    return type === 'secret' ? { group, key, label, type, help, set: !!v, hint: v ? '…' + v.slice(-4) : '' } : { group, key, label, type, help, options: options || null, value: v };
  });
  let site = null, siteError = '';
  try { site = JSON.parse(ghRead_('config/site.json') || 'null'); } catch (e) { siteError = String(e.message); }
  const fields = SITE_FIELDS.map(([group, path, label, type]) => ({ group, path, label, type, value: site ? getPath_(site, path) : '' }));
  return { ok: true, props, site: fields, siteError: site ? '' : (siteError || 'Could not read config/site.json from GitHub. Set the GitHub settings first.'), webapp: ScriptApp.getService().getUrl() };
}

function set_save(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const P = PropertiesService.getScriptProperties(), changed = [];
  const spec = {}; SETTINGS.forEach(s => spec[s[1]] = s);
  Object.keys(p.props || {}).forEach(k => {
    const s = spec[k]; if (!s) return;
    let v = String(p.props[k] == null ? '' : p.props[k]).trim();
    if (s[3] === 'secret' && !v) return; // empty = keep the existing secret
    if (s[3] === 'select') need_(s[5].indexOf(v) >= 0, s[2] + ': choose one of ' + s[5].join(', '));
    if (s[3] === 'url' && v) need_(/^https:\/\/[^\s]+$/.test(v), s[2] + ' must start with https://');
    if (s[3] === 'email' && v) need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), s[2] + ' is not a valid email.');
    if (k === 'GITHUB_REPO' && v) need_(/^[\w.-]+\/[\w.-]+$/.test(v), 'Repository must look like owner/name.');
    if (k === 'SITE_URL') v = v.replace(/\/$/, '');
    if ((P.getProperty(k) || '') !== v) { P.setProperty(k, v); changed.push(k); }
  });
  (p.clear || []).forEach(k => { if (spec[k] && spec[k][3] === 'secret') { P.deleteProperty(k); changed.push(k + ' (cleared)'); } });
  let siteMsg = '';
  if (p.site && Object.keys(p.site).length) {
    const cur = JSON.parse(ghRead_('config/site.json') || '{}'), next = JSON.parse(JSON.stringify(cur));
    SITE_FIELDS.forEach(([g, path, label, type]) => {
      if (!(path in p.site)) return;
      let v = p.site[path];
      if (type === 'bool') v = v === true || v === 'true';
      else if (type === 'number') v = Number(v) || 0;
      else v = String(v == null ? '' : v).trim();
      if (type === 'email' && v) need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), label + ' is not a valid email.');
      setPath_(next, path, v);
    });
    next.publisherAddress = [next.publisherStreet, next.publisherCity, [next.publisherState, next.publisherPin].filter(String).join(' '), 'India'].filter(x => String(x || '').trim()).join(', ');
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      ghCommit_([{ path: 'config/site.json', text: JSON.stringify(next, null, 2) + '\n' }], 'Settings: website details');
      CacheService.getScriptCache().remove('SITECFG');
      siteMsg = ' Website details sent to GitHub; the site rebuilds in 3–5 minutes.';
    }
  }
  return { ok: true, message: (changed.length ? 'Saved: ' + changed.join(', ') + '.' : 'No integration settings changed.') + siteMsg };
}

/** Runs the same checks as selfTest() and returns them to the portal. */
function set_test(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const r = selfTest();
  r.build = safe_(() => { const b = ghLatestRun_(); return b ? (b.status + (b.conclusion ? ' / ' + b.conclusion : '') + ': ' + b.title) : 'no runs yet'; });
  return { ok: true, checks: r };
}

// ======================================================================
// 17_Letters.gs
// ======================================================================
/** Letterhead documents, signatories, certificates of publication and admin email.
 *
 *  - Signatories: people who sign letters and certificates (e.g. the Chairperson or the President of ACRI),
 *    each with a signature image stored in Drive.
 *  - Letters & notices: written in the portal, rendered on the ACRI Journals letterhead (optionally a journal's),
 *    saved as PDF in Drive with a reference number, downloadable, and attachable to emails.
 *  - Certificates of publication: one per author of every published article (new and back-issue),
 *    signed by the default signatory, available in the author's portal and attached to the "published" email.
 *  - Compose email: admins write to anyone, from the system / journal office / editors address, with attachments. */

// ------------------------------------------------------------ small helpers
function lettersFolder_(name) { return subFolder_(subFolder_(rootFolder_(), 'Letters & Certificates'), name || 'Letters'); }
function dataUri_(blob) { return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()); }
function imgFromUrl_(url) {
  try { const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); return r.getResponseCode() === 200 ? dataUri_(r.getBlob()) : ''; } catch (e) { return ''; }
}
function imgFromFile_(id) { try { return id ? dataUri_(DriveApp.getFileById(id).getBlob()) : ''; } catch (e) { return ''; } }
function nextRef_(code) {
  const y = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy');
  const P = PropertiesService.getScriptProperties(), k = 'SEQ_' + code + '_' + y;
  return withLock_(() => { const n = Number(P.getProperty(k) || 0) + 1; P.setProperty(k, String(n)); return 'ACRIJ/' + y + '/' + code + '/' + ('00' + n).slice(-3); });
}
function pubDetails_() {
  const c = siteConfig_();
  return { name: c.publisherName || CFG.LEGAL_ENTITY, address: c.publisherAddress || '', phone: c.publisherPhone || '', web: siteUrl_().replace(/^https?:\/\//, ''), email: controllerEmail_() };
}
function longDate_(iso) { return fmtD_(iso || today_()); }

// ------------------------------------------------------------ signatories
function signatories_() { return all_('Signatories').filter(s => String(s.active) !== 'false').sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99)); }
function signatory_(id) { const l = signatories_(); return l.find(s => s.id === id) || l[0] || null; }

function sig_list(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  return { ok: true, items: all_('Signatories').map(s => ({ id: s.id, name: s.name, designation: s.designation, org: s.org, order: s.order, active: String(s.active) !== 'false', hasImage: !!s.fileId, image: s.fileId ? imgFromFile_(s.fileId) : '' })) };
}
function sig_save(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const s = p.signatory || {}; need_(s.name && s.designation, 'Name and designation are required.');
  let fileId = '';
  if (s.image) {
    need_(/png|jpe?g/i.test(s.mime || ''), 'Upload the signature as a PNG (transparent background is best) or JPG.');
    fileId = lettersFolder_('Signatures').createFile(Utilities.newBlob(Utilities.base64Decode(s.image), s.mime, 'signature-' + s.name.replace(/\W+/g, '-') + '.' + (/png/i.test(s.mime) ? 'png' : 'jpg'))).getId();
  }
  const row = { name: s.name.trim(), designation: s.designation.trim(), org: (s.org || '').trim(), order: s.order || '', active: s.active !== false };
  if (fileId) row.fileId = fileId;
  if (s.id && find_('Signatories', 'id', s.id)) update_('Signatories', 'id', s.id, row);
  else insert_('Signatories', Object.assign({ id: uid_('S'), created: now_() }, row));
  return { ok: true };
}

// ------------------------------------------------------------ the letterhead
/** opt: { journal, ref, date, to, subject, bodyHtml, signatory, kind } → complete HTML for PDF conversion. */
function letterheadHtml_(opt) {
  const P = pubDetails_(), j = opt.journal ? journalRow_(opt.journal) : null, accent = (j && j.accent) || '#0B2545';
  const logo = j ? imgFromUrl_(siteUrl_() + '/assets/journals/' + j.slug + '/logo.png') : '';
  const sg = opt.signatory === 'none' ? null : signatory_(opt.signatory), sig = sg ? imgFromFile_(sg.fileId) : '';
  const brand = '<span style="font-family:Georgia,\'Times New Roman\',serif;font-weight:bold;font-size:25px;color:#0B2545;letter-spacing:.5px">ACRI</span><span style="display:inline-block;width:2px;height:20px;background:#1F7A4D;margin:0 10px;vertical-align:-3px"></span><span style="font-family:Arial,sans-serif;font-weight:bold;font-size:10.5px;letter-spacing:4px;color:#0B2545">JOURNALS</span>';
  const left = j
    ? (logo ? '<img src="' + logo + '" style="height:58px;vertical-align:middle;margin-right:12px">' : '') + '<span style="display:inline-block;vertical-align:middle"><span style="font-family:Georgia,serif;font-weight:bold;font-size:17px;color:' + accent + '">' + esc_(j.name) + '</span><br><span style="font-family:Arial,sans-serif;font-size:10px;color:#5E6875;letter-spacing:1px">' + esc_(j.code) + (j.issnOnline ? ' · e-ISSN ' + esc_(j.issnOnline) : '') + ' · AN ACRI JOURNALS PUBLICATION</span></span>'
    : brand + '<br><span style="font-family:Arial,sans-serif;font-size:10px;color:#5E6875;letter-spacing:1px">PUBLISHED BY ' + esc_(P.name.toUpperCase()) + '</span>';
  const right = '<div style="font-family:Arial,sans-serif;font-size:9.5px;line-height:1.55;color:#5E6875;text-align:right">' + esc_(P.name) + '<br>' + esc_(P.address).replace(/, (?=[^,]*Gujarat)/, ',<br>') + '<br>' + (P.phone ? 'Tel ' + esc_(P.phone) + ' · ' : '') + esc_(P.email) + '<br>' + esc_(P.web) + '</div>';
  const sigBlock = sg ? '<div style="margin-top:34px">' + (sig ? '<img src="' + sig + '" style="height:58px;display:block;margin:0 0 2px">' : '<div style="height:40px"></div>') +
    '<div style="border-top:1px solid #9AA3AE;width:220px;padding-top:6px;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.45"><b>' + esc_(sg.name) + '</b><br>' + esc_(sg.designation) + (sg.org ? '<br>' + esc_(sg.org) : '') + '</div></div>' : '';
  return '<html><head><style>@page{size:A4;margin:16mm 18mm 16mm 18mm}body{font-family:Georgia,\'Times New Roman\',serif;font-size:12.5px;line-height:1.62;color:#15191E}p{margin:0 0 10px}ul,ol{margin:0 0 10px 18px;padding:0}a{color:' + accent + '}</style></head><body>' +
    '<table width="100%" cellspacing="0" cellpadding="0"><tr><td style="vertical-align:middle">' + left + '</td><td style="vertical-align:top;width:42%">' + right + '</td></tr></table>' +
    '<div style="height:3px;background:' + accent + ';margin:12px 0 0"></div><div style="height:1px;background:#1F7A4D;margin:2px 0 18px"></div>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="font-family:Arial,sans-serif;font-size:11px;color:#2F3742"><tr><td>' + (opt.ref ? 'Ref. No.: <b>' + esc_(opt.ref) + '</b>' : '') + '</td><td style="text-align:right">Date: <b>' + esc_(longDate_(opt.date)) + '</b></td></tr></table>' +
    (opt.kind === 'notice' ? '<div style="text-align:center;margin:22px 0 6px;font-family:Arial,sans-serif;font-weight:bold;letter-spacing:5px;font-size:15px;color:' + accent + '">NOTICE</div>' : '') +
    (opt.to ? '<div style="margin-top:18px;white-space:pre-line">' + esc_(opt.to) + '</div>' : '') +
    (opt.subject ? '<p style="margin:18px 0 14px' + (opt.kind === 'notice' ? ';text-align:center' : '') + '"><b>' + (opt.kind === 'notice' ? '' : 'Subject: ') + esc_(opt.subject) + '</b></p>' : '<div style="height:12px"></div>') +
    '<div>' + (opt.bodyHtml || '') + '</div>' + sigBlock +
    '<div style="margin-top:40px;border-top:1px solid #E2E5E9;padding-top:8px;font-family:Arial,sans-serif;font-size:8.5px;color:#8A939F;text-align:center">ACRI Journals is published by ' + esc_(P.name) + ' · ' + esc_(P.web) + (opt.ref ? ' · Verify this document by quoting ' + esc_(opt.ref) + ' to ' + esc_(P.email) : '') + '</div>' +
    '</body></html>';
}
function htmlToPdf_(html, name, folder) {
  const blob = Utilities.newBlob(html, 'text/html', 'doc.html').getAs('application/pdf'); blob.setName(name);
  const f = (folder || lettersFolder_()).createFile(blob);
  return { id: f.getId(), name: name, b64: Utilities.base64Encode(blob.getBytes()) };
}
/** Letter body: plain text with blank lines between paragraphs, "- " bullets, **bold**, *italic*, [links](https://…). */
function letterBody_(t) { return md_(t || '').replace(/margin:0 0 16px/g, 'margin:0 0 10px'); }

// ------------------------------------------------------------ letters & notices
function letter_preview(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const l = p.letter || {};
  return { ok: true, html: letterheadHtml_({ journal: l.journal, ref: l.ref || '(reference number on saving)', date: l.date, to: l.to, subject: l.subject, bodyHtml: letterBody_(l.body), signatory: l.signatory, kind: l.kind }) };
}
function letter_create(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const l = p.letter || {}; need_(l.body && String(l.body).trim().length > 3, 'Write the letter.');
  const kind = l.kind === 'notice' ? 'notice' : (l.kind === 'certificate' ? 'certificate' : 'letter');
  const ref = nextRef_({ letter: 'LTR', notice: 'NOT', certificate: 'CRT' }[kind]);
  const html = letterheadHtml_({ journal: l.journal, ref: ref, date: l.date, to: l.to, subject: l.subject, bodyHtml: letterBody_(l.body), signatory: l.signatory, kind: kind });
  const pdf = htmlToPdf_(html, ref.replace(/\//g, '-') + ' ' + String(l.subject || kind).replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf');
  insert_('Letters', { id: uid_('L'), ref: ref, type: kind, journal: l.journal || '', to: l.to || '', subject: l.subject || '', body: l.body, signatory: l.signatory || '', date: l.date || today_(), fileId: pdf.id, createdBy: u.email, created: now_() });
  return { ok: true, ref: ref, fileId: pdf.id, name: pdf.name, data: pdf.b64 };
}
function letter_list(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  return { ok: true, items: all_('Letters').map(x => { delete x._row; return x; }).reverse().slice(0, 300) };
}
function letter_file(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const f = DriveApp.getFileById(p.fileId), b = f.getBlob();
  return { ok: true, name: f.getName(), mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}

// ------------------------------------------------------------ certificates of publication
function articleJson_(journal, id) { const raw = ghRead_('content/articles/' + journal + '/' + id + '/article.json'); return raw ? JSON.parse(raw) : null; }
function pubCertHtml_(a, j, author, ref) {
  const P = pubDetails_(), accent = j.accent || '#0B2545', sg = signatory_(''), sig = sg ? imgFromFile_(sg.fileId) : '';
  const logo = imgFromUrl_(siteUrl_() + '/assets/journals/' + j.slug + '/logo.png');
  const name = ((author.given || '') + ' ' + (author.family || '')).trim();
  const affs = (author.affiliations || []).map(id => ((a.affiliations || []).find(f => String(f.id) === String(id)) || {}).name).filter(String);
  const d = a.published ? new Date(String(a.published).slice(0, 10) + 'T12:00:00Z') : new Date();
  const when = Utilities.formatDate(d, 'Asia/Kolkata', 'MMMM yyyy');
  const pages = a.firstPage ? 'pp. ' + a.firstPage + (a.lastPage ? '–' + a.lastPage : '') : (a.elocator || '');
  const where = 'Volume ' + (a.volume || '–') + (a.issue ? ', Issue ' + a.issue : '') + ' (' + when + ')' + (pages ? ', ' + pages : '');
  const url = siteUrl_() + '/journals/' + j.slug + '/fullarticle/' + String(a.id).toLowerCase() + '/';
  const role = (a.authors || []).length > 1 ? 'co-authored' : 'authored';
  return '<html><head><style>@page{size:A4 landscape;margin:10mm}body{margin:0;font-family:Georgia,\'Times New Roman\',serif;color:#15191E}</style></head><body>' +
    '<div style="border:7px double ' + accent + ';padding:26px 46px 22px;text-align:center">' +
    '<table width="100%" cellspacing="0" cellpadding="0"><tr><td style="text-align:left;width:33%">' + (logo ? '<img src="' + logo + '" style="height:62px">' : '') + '</td>' +
    '<td style="text-align:center"><span style="font-weight:bold;font-size:27px;color:#0B2545;letter-spacing:.5px">ACRI</span><span style="display:inline-block;width:2px;height:22px;background:#1F7A4D;margin:0 11px;vertical-align:-3px"></span><span style="font-family:Arial,sans-serif;font-weight:bold;font-size:11.5px;letter-spacing:4px;color:#0B2545">JOURNALS</span></td>' +
    '<td style="text-align:right;width:33%;font-family:Arial,sans-serif;font-size:9.5px;color:#5E6875">Certificate No.<br><b style="color:#15191E">' + esc_(ref) + '</b></td></tr></table>' +
    '<div style="font-family:Arial,sans-serif;letter-spacing:6px;font-size:13px;color:' + accent + ';margin:20px 0 4px;font-weight:bold">CERTIFICATE OF PUBLICATION</div>' +
    '<div style="width:90px;height:2px;background:#1F7A4D;margin:8px auto 18px"></div>' +
    '<div style="font-size:14px">This is to certify that</div>' +
    '<div style="font-size:30px;margin:8px 0 4px;color:#0B2545">' + esc_(name) + (author.degrees ? '<span style="font-size:16px">, ' + esc_(author.degrees) + '</span>' : '') + '</div>' +
    (affs.length ? '<div style="font-family:Arial,sans-serif;font-size:11px;color:#5E6875">' + esc_(affs.join('; ')) + '</div>' : '') +
    '<div style="font-size:14px;margin:14px 0 6px">has ' + role + ' the ' + esc_(String(a.type || 'article').toLowerCase()) + '</div>' +
    '<div style="font-size:19px;font-style:italic;line-height:1.35;margin:0 40px 12px">“' + esc_(String(a.title || '').replace(/<[^>]+>/g, '')) + '”</div>' +
    '<div style="font-size:14px;line-height:1.6">published after peer review in<br><b style="color:' + accent + '">' + esc_(j.name) + '</b>' + (j.issnOnline ? ' (e-ISSN ' + esc_(j.issnOnline) + ')' : '') + '<br>' + esc_(where) + '</div>' +
    (a.doi ? '<div style="font-family:Arial,sans-serif;font-size:11px;margin-top:8px">DOI: <b>' + esc_(a.doi) + '</b></div>' : '') +
    '<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px"><tr>' +
    '<td style="text-align:left;vertical-align:bottom;width:50%;font-family:Arial,sans-serif;font-size:9.5px;color:#5E6875">Issued ' + esc_(longDate_()) + '<br>Verify at ' + esc_(url) + '<br>' + esc_(P.name) + ', ' + esc_(P.address) + '</td>' +
    '<td style="text-align:right;vertical-align:bottom">' + (sg ? '<div style="display:inline-block;text-align:center">' + (sig ? '<img src="' + sig + '" style="height:54px;display:block;margin:0 auto 2px">' : '<div style="height:44px"></div>') +
    '<div style="border-top:1px solid #9AA3AE;padding-top:5px;font-family:Arial,sans-serif;font-size:11px;min-width:210px"><b>' + esc_(sg.name) + '</b><br>' + esc_(sg.designation) + (sg.org ? '<br>' + esc_(sg.org) : '') + '</div></div>' : '') + '</td></tr></table>' +
    '</div></body></html>';
}
/** Create (or reuse) the certificates for every author of an article. Returns [{author, name, fileId, b64?}] */
function certificatesFor_(journal, id, withData) {
  const a = articleJson_(journal, id); need_(a && a.status === 'published', 'Article ' + id + ' is not published yet.');
  const j = journalRow_(journal), have = where_('Certificates', c => c.articleId === id), out = [];
  (a.authors || []).forEach((au, n) => {
    const nm = ((au.given || '') + ' ' + (au.family || '')).trim();
    let c = have.find(x => String(x.author) === String(n));
    if (!c) {
      const ref = nextRef_('COP');
      const pdf = htmlToPdf_(pubCertHtml_(a, j, au, ref), 'Certificate of Publication - ' + id + ' - ' + nm.replace(/[^\w\- ]+/g, '') + '.pdf', lettersFolder_('Certificates of Publication'));
      c = insert_('Certificates', { id: uid_('C'), articleId: id, journal: journal, author: n, name: nm, ref: ref, fileId: pdf.id, created: now_() });
      out.push({ author: n, name: nm, ref: ref, fileId: pdf.id, file: pdf.name, b64: pdf.b64 });
    } else {
      const o = { author: n, name: nm, ref: c.ref, fileId: c.fileId };
      if (withData) { const f = DriveApp.getFileById(c.fileId); o.file = f.getName(); o.b64 = Utilities.base64Encode(f.getBlob().getBytes()); }
      out.push(o);
    }
  });
  return out;
}
/** Author (their own published submission) or admin (any article, incl. back issues). Returns one PDF. */
function cert_get(p, u) {
  let journal = p.journal, id = p.articleId;
  if (p.subId) { const s = sub_(p.subId); need_(s.submitterId === u.id || isAdmin_(u) || isEic_(u, s.journal), 'Not allowed.'); need_(s.status === 'published', 'Available once the article is published.'); journal = s.journal; id = s.id; }
  else need_(isAdmin_(u) || isEic_(u, journal), 'Not allowed.');
  const list = certificatesFor_(journal, id, false);
  if (p.list) return { ok: true, items: list.map(x => ({ author: x.author, name: x.name, ref: x.ref })) };
  const c = list.find(x => String(x.author) === String(p.author || 0)) || list[0]; need_(c, 'No authors on this article.');
  const f = DriveApp.getFileById(c.fileId);
  return { ok: true, name: f.getName(), mime: 'application/pdf', data: Utilities.base64Encode(f.getBlob().getBytes()) };
}
/** Admin: regenerate (e.g. after correcting an author's name or uploading a new signature). */
function cert_reset(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  where_('Certificates', c => c.articleId === p.articleId).forEach(c => { try { DriveApp.getFileById(c.fileId).setTrashed(true); } catch (e) { } remove_('Certificates', 'id', c.id); });
  return { ok: true };
}

// ------------------------------------------------------------ compose email (admins)
function mail_compose(p, u) {
  need_(isAdmin_(u), 'Admins only.');
  const split = (s) => String(s || '').split(/[,;\s]+/).map(normEmail_).filter(Boolean);
  const to = split(p.to), cc = split(p.cc), bcc = split(p.bcc);
  need_(to.length, 'Add at least one recipient.');
  [].concat(to, cc, bcc).forEach(e => need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), 'Not a valid email: ' + e));
  need_(String(p.subject || '').trim(), 'Add a subject.'); need_(String(p.body || '').trim(), 'Write the message.');
  const j = p.journal ? journalRow_(p.journal) : null;
  const snd = p.from === 'editor' ? { from: editorsEmail_(), fromName: (j ? j.code + ' ' : 'ACRI Journals ') + 'Editors', replyTo: editorsEmail_() }
    : p.from === 'office' ? { from: j ? j.noReplyEmail : systemFrom_(), fromName: (j ? j.code + ' ' : 'ACRI Journals ') + 'Editorial Office', replyTo: controllerEmail_() }
      : { from: systemFrom_(), fromName: 'ACRI Journals', replyTo: controllerEmail_() };
  const sg = p.signatory && p.signatory !== 'none' ? signatory_(p.signatory) : null;
  const sign = sg ? '<p style="margin-top:22px">' + esc_(sg.name) + '<br><span style="color:#5E6875">' + esc_(sg.designation) + (sg.org ? '<br>' + esc_(sg.org) : '') + '</span></p>' : (p.signoff ? '<p style="margin-top:22px;white-space:pre-line">' + esc_(p.signoff) + '</p>' : '');
  const att = (p.attachments || []).map(a => ({ name: a.name, mime: a.mime || 'application/octet-stream', b64: a.data }));
  (p.letterIds || []).forEach(id => { const f = DriveApp.getFileById(id); att.push({ name: f.getName(), mime: 'application/pdf', b64: Utilities.base64Encode(f.getBlob().getBytes()) }); });
  const size = att.reduce((n, a) => n + a.b64.length * 0.75, 0); need_(size < 14 * 1024 * 1024, 'Attachments are too large (limit about 14 MB in total).');
  sendMail_(to, p.subject, emailShell_(j ? j.accent : '', j ? j.name : '', letterBody_(p.body) + sign), Object.assign(snd, { cc: cc, bcc: bcc, attachments: att }));
  const last = all_('EmailLog').pop() || {};
  insert_('SentMail', { id: uid_('E'), ts: now_(), by: u.email, from: snd.from, to: to.join(', '), cc: cc.join(', '), bcc: bcc.join(', '), subject: p.subject, body: p.body, attachments: att.map(a => a.name).join(', '), status: last.status || '', detail: last.detail || '' });
  return { ok: last.status !== 'error', error: last.status === 'error' ? last.detail : '', message: last.status === 'error' ? 'Not sent: ' + last.detail : 'Sent to ' + to.join(', ') + (att.length ? ' with ' + att.length + ' attachment' + (att.length > 1 ? 's' : '') : '') + '.' };
}
function mail_sent(p, u) { need_(isAdmin_(u), 'Admins only.'); return { ok: true, items: all_('SentMail').map(x => { delete x._row; return x; }).reverse().slice(0, 200) }; }

