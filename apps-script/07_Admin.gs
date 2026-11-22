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

