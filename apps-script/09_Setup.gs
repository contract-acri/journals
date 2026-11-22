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
