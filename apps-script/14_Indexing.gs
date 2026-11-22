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
    ['Mobile', cfg.publisherPhone || ''], ['E-mail', j.officeEmail], ['Publisher address', cfg.publisherAddress || ''],
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
