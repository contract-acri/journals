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
