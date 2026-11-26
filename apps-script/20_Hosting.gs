/** Journal hosting: schools, colleges and universities run their own journal on ACRI Journals, free of charge.
 *  The institution is the publisher (and applies for its own ISSN); ACRI provides the platform, AES and DOIs.
 *  Two ways in: the institution applies on /start-a-journal/, or an ACRI admin adds the journal directly.
 *  Either way AES creates the journal, then invites its Journal Admin and Editor-in-Chief by email. */

const INST_TYPES = ['School', 'College', 'University', 'Research institute', 'Other'];

function public_hostApply(p) {
  if (p.website2) return { ok: true, message: 'Thank you.' }; // honeypot
  const t = (k, n) => String(p[k] || '').trim().slice(0, n || 300);
  need_(t('institution').length >= 3, 'Please enter the name of your institution.');
  need_(t('contactName').length >= 2, 'Please enter your name.');
  const email = normEmail_(p.contactEmail);
  need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Please enter a valid email address.');
  need_(instEmailOk_(email), 'Please use your official institutional email address, not a personal Gmail, Yahoo or Outlook address.');
  need_(t('journalName').length >= 5, 'Please enter the proposed name of the journal.');
  need_(t('scope', 3000).length >= 40, 'Please describe the aims and scope of the journal in a few sentences.');
  need_(p.agree === true, 'Please accept the Journal Hosting Policy.');
  const recent = where_('HostApps', a => a.contactEmail === email && (Date.now() - new Date(a.created).getTime()) < 864e5).length;
  need_(recent < 3, 'You have already sent an application today. We will reply by email.');
  const rec = insert_('HostApps', { id: uid_('H'), created: now_(), status: 'new', institution: t('institution'), instType: INST_TYPES.indexOf(p.instType) >= 0 ? p.instType : 'Other',
    city: t('city', 80), country: t('country', 60) || 'India', website: t('website'), address: t('address', 400), contactName: t('contactName', 120), contactRole: t('contactRole', 120), contactEmail: email, phone: t('phone', 30),
    journalName: t('journalName'), acronym: t('acronym', 12).toUpperCase(), scope: t('scope', 3000), subjects: t('subjects', 600), frequency: t('frequency', 40), audience: t('audience', 200),
    eicName: t('eicName', 120), eicEmail: normEmail_(p.eicEmail || ''), adminEmail: normEmail_(p.adminEmail || email), notes: t('notes', 2000) });
  mailTemplate_('host_received', email, { name: rec.contactName, journal: rec.journalName, institution: rec.institution });
  return { ok: true, message: 'Thank you. Your application has been received. We will review it and reply by email, usually within two weeks.' };
}

function host_list(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const apps = all_('HostApps').map(a => { delete a._row; return a; }).reverse();
  const journals = all_('Journals').filter(r => (r.json || {}).partner).map(r => { const j = journalRow_(r.slug); return { slug: r.slug, code: r.code, name: r.name, publisher: (j.publisher || {}).name || '', status: j.partnerStatus || 'setup', active: j.active, school: !!j.schoolJournal, ready: hostReadiness_(r.slug) }; });
  return { ok: true, apps: apps, journals: journals, types: INST_TYPES };
}

function host_decide(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const a = find_('HostApps', 'id', p.id); need_(a, 'Application not found.');
  need_(['declined', 'new', 'reviewing'].indexOf(p.status) >= 0, 'Unknown status.');
  update_('HostApps', 'id', a.id, { status: p.status, decidedBy: u.email, decidedAt: now_(), decisionNote: String(p.note || '').slice(0, 2000) });
  if (p.status === 'declined' && p.notify !== false) mailTemplate_('host_declined', a.contactEmail, { name: a.contactName, journal: a.journalName, note: p.note || '' });
  return { ok: true };
}

/** Create a hosted journal (from an application or directly) and invite its Journal Admin and Editor-in-Chief. */
function host_create(p, u) {
  need_(isAdmin_(u), 'Only an ACRI Journals admin can add a hosted journal.');
  const j = p.journal || {};
  j.slug = String(j.slug || '').toLowerCase().trim();
  need_(!find_('Journals', 'slug', j.slug), 'A journal with the web address /journals/' + j.slug + '/ already exists.');
  const adminEmail = normEmail_(p.adminEmail), eicEmail = normEmail_(p.eicEmail || '');
  need_(/@/.test(adminEmail), 'Enter the email of the Journal Admin at the institution.');
  Object.assign(j, { partner: true, partnerStatus: 'setup', active: true, scopeType: j.scopeType || 'national' });
  const res = adm_saveJournal({ journal: j, publish: p.publish }, u);
  const start = today_(), end = Utilities.formatDate(new Date(Date.now() + 3 * 365 * 864e5), 'Asia/Kolkata', 'yyyy-MM-dd');
  const out = [];
  team_appoint({ journal: j.slug, role: 'jadmin', email: adminEmail, given: p.adminGiven || '', family: p.adminFamily || '', title: 'Journal Admin', start: start, end: end, showOnSite: false, days: 14 }, u); out.push('Journal Admin invited (' + adminEmail + ')');
  if (eicEmail) { team_appoint({ journal: j.slug, role: 'eic', email: eicEmail, given: p.eicGiven || '', family: p.eicFamily || '', start: start, end: end, showOnSite: true, days: 14 }, u); out.push('Editor-in-Chief invited (' + eicEmail + ')'); }
  if (p.appId) { const a = find_('HostApps', 'id', p.appId); if (a) update_('HostApps', 'id', a.id, { status: 'approved', journal: j.slug, decidedBy: u.email, decidedAt: now_() }); }
  return { ok: true, slug: j.slug, message: 'Journal created. ' + out.join('; ') + '. ' + (res.message || '') };
}

/** Change a hosted journal's status: setup → live, or suspended. Only ACRI admins. */
function host_status(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const r = find_('Journals', 'slug', p.journal); need_(r && (r.json || {}).partner, 'Not a hosted journal.');
  need_(['setup', 'live', 'suspended'].indexOf(p.status) >= 0, 'Unknown status.');
  if (p.status === 'live') { const rd = hostReadiness_(p.journal); need_(rd.ready, 'Before going live, complete: ' + rd.items.filter(x => x.required && !x.ok).map(x => x.label).join('; ') + '.'); }
  const json = Object.assign({}, r.json, { partnerStatus: p.status, active: p.status !== 'suspended' });
  update_('Journals', 'slug', p.journal, { json: json, active: json.active, updated: now_() });
  CacheService.getScriptCache().remove('J:' + p.journal);
  if (prop_('GITHUB_TOKEN')) ghCommit_([{ path: 'content/journals/' + p.journal + '/journal.json', text: JSON.stringify(Object.assign(json, { board: boardFor_(p.journal, json.boardExtra) }), null, 2) }], 'Hosted journal ' + r.code + ': ' + p.status);
  return { ok: true, message: 'Status changed to ' + p.status + '.' };
}

/** ISSN India checklist for a hosted journal. Articles cannot be published until every required item is met. */
function hostReadiness_(slug) {
  const j = journalRow_(slug), P = j.publisher || {};
  const board = boardFor_(slug, []);
  const active = activeAppointments_(slug);
  const eic = active.filter(a => a.role === 'eic'), members = board.filter(b => b.group !== 'Publisher & journal management');
  const complete = members.filter(b => b.designation && b.affiliation && b.address);
  const items = [
    { k: 'title', label: 'Full journal title', ok: !!j.name, required: true },
    { k: 'acronym', label: 'Acronym and ISO 4 abbreviation', ok: !!(j.code && j.abbrev), required: true },
    { k: 'scope', label: 'Aims and scope', ok: String(j.scope || '').length >= 80, required: true },
    { k: 'frequency', label: 'Publication frequency', ok: !!j.frequency, required: true },
    { k: 'publisher', label: 'Publisher (institution) name', ok: !!P.name, required: true },
    { k: 'address', label: 'Publisher postal address', ok: String(P.address || '').length >= 15, required: true },
    { k: 'contact', label: 'Publisher email or website', ok: !!(P.email || P.website), required: true },
    { k: 'jadmin', label: 'Journal Admin has accepted', ok: active.some(a => a.role === 'jadmin'), required: true },
    { k: 'eic', label: 'Editor-in-Chief has accepted', ok: eic.length > 0, required: true },
    { k: 'board', label: 'Editorial board of at least 5 members with designation, institution and address', ok: complete.length >= 5, required: true, note: complete.length + ' of 5' },
    { k: 'logo', label: 'Institution logo uploaded', ok: !!j.instLogo, required: false },
    { k: 'issn', label: 'ISSN assigned and shown on the website', ok: !!(j.issnOnline || j.issnPrint), required: false },
  ];
  return { ready: items.every(x => !x.required || x.ok), items: items };
}

Object.assign(TEMPLATES, {
  host_received: d => [`Application received: ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for applying to host <b>${esc_(d.journal)}</b> of ${esc_(d.institution)} on ACRI Journals. Hosting is free of charge.</p><p>We will review the proposal against the <a href="${siteUrl_()}/policies/journal-hosting/">Journal Hosting Policy</a> and reply by email, usually within two weeks. If it is approved, your Journal Admin and Editor-in-Chief will each receive a personal link to set up the journal.</p><p>With best wishes,<br>ACRI Journals</p>`],
  host_declined: d => [`Your journal hosting application: ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for your interest in hosting <b>${esc_(d.journal)}</b> on ACRI Journals. After careful review, we are not able to host the journal at this time.</p>${d.note ? `<p>${esc_(d.note)}</p>` : ''}<p>You are welcome to apply again in future. With best wishes,<br>ACRI Journals</p>`],
});
