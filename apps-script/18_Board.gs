/** Editorial board tools: importing an existing board, reviewing preferences, recommendations
 *  and personal letterheads for board members. */

/** Reviewing preferences a person sets for themselves (profile or agreement page). */
function reviewPrefs_(p) {
  const out = {};
  if (p.reviewDays !== undefined && p.reviewDays !== '') out.reviewDays = Math.min(Math.max(Number(p.reviewDays) || 21, 7), 60);
  if (p.reviewMax !== undefined && p.reviewMax !== '') out.reviewMax = Math.min(Math.max(Number(p.reviewMax) || 1, 0), 10);
  if (p.reviewPauseUntil !== undefined) out.reviewPauseUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(p.reviewPauseUntil)) ? p.reviewPauseUntil : '';
  if (p.reviewNote !== undefined) out.reviewNote = String(p.reviewNote).slice(0, 200);
  return out;
}

/** Bring an existing board across: one row per member (CSV with a header row).
 *  Columns: role, title, given, family, email, degrees, designation, department, affiliation, instAddress, instEmail, profileUrl, country, orcid, start, end
 *  role = eic | senior | editor | board. Each person gets a personal link (valid p.days) to confirm details and sign. */
function team_import(p, u) {
  // The header row is optional: "role,email" lines (or just emails) work too.
  let text = String(p.csv || '').trim();
  const first = (text.split(/\r?\n/)[0] || '').toLowerCase();
  if (!/\b(email)\b/.test(first) || /@/.test(first)) text = (/,/.test(first) ? 'role,email\n' : 'email\n') + text;
  const rows = parseCsv_(text).filter(r => String(r.email || '').trim()); need_(rows.length, 'Paste at least one line, for example: board, name@university.edu');
  const out = [];
  rows.forEach((r, i) => {
    try {
      const role = String(r.role || 'board').toLowerCase().trim().replace(/editor-in-chief|chief editor/, 'eic').replace(/senior editor/, 'senior').replace(/^(editorial )?board( member)?$/, 'board');
      const res = team_appoint(Object.assign({}, r, { journal: p.journal, role: role, email: r.email, start: r.start || today_(), end: r.end || addDays_(730), days: p.days, transfer: true, showOnSite: true }), u);
      out.push({ row: i + 2, email: r.email, ok: true, id: res.id });
    } catch (e) { out.push({ row: i + 2, email: r.email || '', ok: false, error: String(e.message || e) }); }
  });
  return { ok: true, results: out, sent: out.filter(x => x.ok).length };
}

// ------------------------------------------------------------ recommendations (board → office)
const REC_KINDS = { author: 'Author to invite to submit', reviewer: 'Reviewer', board: 'Editorial board member', article: 'Paper or topic to publish' };
function myJournals_(u) { return all_('Journals').map(j => j.slug).filter(s => isBoard_(u, s)); }
function rec_submit(p, u) {
  need_(isAdmin_(u) || myJournals_(u).length, 'Recommendations are for editorial board members.');
  need_(REC_KINDS[p.kind], 'Choose what you are recommending.');
  need_(p.journal && (isAdmin_(u) || isBoard_(u, p.journal)), 'Choose one of your journals.');
  need_(String(p.name || '').trim(), 'Add a name (person or paper title).');
  if (p.email) need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email), 'Email is not valid.');
  insert_('Recommendations', { id: uid_('R'), journal: p.journal, kind: p.kind, name: String(p.name).trim().slice(0, 200), email: normEmail_(p.email || ''), affiliation: String(p.affiliation || '').slice(0, 200), url: String(p.url || '').slice(0, 300), note: String(p.note || '').slice(0, 2000), by: u.id, byName: nameOf_(u), status: 'new', created: now_(), updated: now_() });
  return { ok: true, message: 'Thank you. Your recommendation has been passed to the editorial office.' };
}
function rec_list(p, u) {
  const mine = !(isAdmin_(u) || anyEic_(u));
  const items = all_('Recommendations').filter(r => isAdmin_(u) || isEic_(u, r.journal) || r.by === u.id).filter(r => !p.mine || r.by === u.id);
  return { ok: true, kinds: REC_KINDS, canManage: !mine, items: items.map(r => { delete r._row; return r; }).reverse() };
}
/** op: status | invite (email the recommended person from the journal office, naming the board member) */
function rec_update(p, u) {
  const r = find_('Recommendations', 'id', p.id); need_(r && (isAdmin_(u) || isEic_(u, r.journal)), 'Not allowed.');
  if (p.op === 'invite') {
    need_(r.email, 'There is no email address for this person.');
    const j = journalRow_(r.journal), rec = find_('Users', 'id', r.by) || {};
    const what = r.kind === 'reviewer' ? 'to join our pool of peer reviewers' : r.kind === 'board' ? 'to consider joining our editorial board' : 'to submit your work';
    const body = `<p>Dear ${esc_(r.name)},</p><p>On the recommendation of <b>${esc_(nameOf_(rec))}</b>, a member of the editorial board of <b>${esc_(j.name)}</b>, we would like to invite you ${what}.</p>${p.message ? '<p style="white-space:pre-line">' + esc_(p.message) + '</p>' : ''}<p>${esc_(j.name)} is an open-access, peer-reviewed journal published by ${esc_(siteConfig_().publisherName || CFG.LEGAL_ENTITY)}. You can read about its scope and policies here:</p>` +
      btn_(siteUrl_() + '/journals/' + j.slug + '/about/', 'About the journal', j.accent) + (r.kind === 'author' || r.kind === 'article' ? '<p><a href="' + portalUrl_('submit?journal=' + j.slug) + '">Submit a manuscript</a></p>' : '') + '<p>With best regards,<br>Editorial Office, ' + esc_(j.name) + '</p>';
    sendMail_(r.email, 'Invitation from ' + j.name, emailShell_(j.accent, j.name, body), { from: j.noReplyEmail, fromName: j.code + ' Editorial Office', replyTo: j.officeEmail });
    update_('Recommendations', 'id', r.id, { status: 'contacted', updated: now_(), handledBy: u.email });
    return { ok: true, message: 'Invitation sent to ' + r.email + '.' };
  }
  need_(['new', 'contacted', 'accepted', 'declined', 'done'].indexOf(p.status) >= 0, 'Unknown status.');
  update_('Recommendations', 'id', r.id, { status: p.status, updated: now_(), handledBy: u.email });
  return { ok: true };
}

// ------------------------------------------------------------ personal signature (for named letterheads)
function me_signature(p, u) {
  need_(isAdmin_(u) || myJournals_(u).length, 'Only editorial board members can add a signature.');
  if (!p.image) { update_('Users', 'id', u.id, { signatureFileId: '' }); return { ok: true }; }
  need_(/png|jpe?g/i.test(p.mime || ''), 'Upload a PNG (transparent background is best) or JPG.');
  const id = lettersFolder_('Signatures').createFile(Utilities.newBlob(Utilities.base64Decode(p.image), p.mime, 'signature-' + u.id + '.' + (/png/i.test(p.mime) ? 'png' : 'jpg'))).getId();
  update_('Users', 'id', u.id, { signatureFileId: id });
  return { ok: true };
}
/** The board member as a signatory, with their highest current role on that journal. */
function selfSignatory_(u, journal) {
  const order = { eic: 1, senior: 2, editor: 3, board: 4 };
  const ap = activeAppointments_(journal).filter(a => a.userId === u.id).sort((a, b) => order[a.role] - order[b.role])[0];
  const j = journalRow_(journal);
  return { id: 'me', name: nameOf_(u) + (u.degrees ? ', ' + u.degrees : ''), designation: (ap ? roleLabel_(ap) : 'Editorial Board') + ', ' + j.code, org: [u.designation, u.affiliation].filter(String).join(', '), fileId: u.signatureFileId || '' };
}
function me_tools(p, u) {
  const js = isAdmin_(u) ? all_('Journals').map(j => j.slug) : myJournals_(u);
  need_(js.length, 'Editor tools are for editorial board members.');
  const me = find_('Users', 'id', u.id);
  return { ok: true, journals: js.map(s => { const j = journalRow_(s); return { slug: s, code: j.code, name: j.name }; }), hasSignature: !!me.signatureFileId, signature: me.signatureFileId ? imgFromFile_(me.signatureFileId) : '' };
}

/** Board member photo: a small square JPEG prepared in the browser, published with the website. */
function savePhoto_(userId, ph) {
  need_(/jpe?g|png|webp/i.test(ph.mime || ''), 'The photo must be a JPG or PNG image.');
  const bytes = Utilities.base64Decode(ph.data); need_(bytes.length < 1.5 * 1024 * 1024, 'The photo is too large. Please use a smaller image.');
  const name = String(userId).toLowerCase().replace(/[^a-z0-9]/g, '') + '.jpg';
  if (prop_('GITHUB_TOKEN')) ghCommit_([{ path: 'content/people/' + name, bytes: bytes }], 'Board photo: ' + userId);
  return '/assets/people/' + name + '?v=' + Date.now().toString(36);
}
/** Anyone with an active board role can change their own photo later from their profile. */
function me_photo(p, u) {
  need_(isAdmin_(u) || myJournals_(u).length, 'Photos are for editorial board members.');
  update_('Users', 'id', u.id, { photo: p.data ? savePhoto_(u.id, p) : '' });
  myJournals_(u).forEach(s => { try { syncBoard_(s); } catch (e) { } });
  return { ok: true, message: 'Photo saved. The board page updates in a few minutes.' };
}
