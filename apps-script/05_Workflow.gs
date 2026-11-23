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
    v.boardMembers = ['eic', 'senior', 'editor', 'board'].reduce((a, r) => a.concat(journalStaff_(s.journal, r)), []).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).map(x => ({ id: x.id, name: nameOf_(x), email: x.email, reviewDays: Number(x.reviewDays) || 21, reviewMax: Number(x.reviewMax) || 2, paused: x.reviewPauseUntil && String(x.reviewPauseUntil).slice(0, 10) >= today_() ? String(x.reviewPauseUntil).slice(0, 10) : '' }));
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
    if (!p.force) {
      need_(!(r.reviewPauseUntil && String(r.reviewPauseUntil).slice(0, 10) >= today_()), nameOf_(r) + ' is not taking reviews until ' + String(r.reviewPauseUntil).slice(0, 10) + (r.reviewNote ? ' (' + r.reviewNote + ')' : '') + '. Invite someone else, or tick "invite anyway".');
      const busy = where_('Reviews', x => x.reviewerId === r.id && ['invited', 'accepted'].indexOf(x.status) >= 0).length;
      need_(!r.reviewMax || busy < Number(r.reviewMax), nameOf_(r) + ' has asked for at most ' + r.reviewMax + ' review(s) at a time and already has ' + busy + '. Invite someone else, or tick "invite anyway".');
    }
    const n = where_('Reviews', x => x.subId === s.id).reduce((m, x) => Math.max(m, Number(x.number) || 0), 0);
    const prev = where_('Reviews', x => x.subId === s.id && x.reviewerId === r.id)[0];
    const rv = insert_('Reviews', { id: uid_('R'), subId: s.id, version: s.version, reviewerId: r.id, number: prev ? prev.number : n + 1, status: 'invited', invitedBy: u.id, invitedAt: now_(), due: '', reminders: 0, token: token_() });
    if (s.status === 'with_editor') update_('Submissions', 'id', s.id, { status: 'under_review', editorId: s.editorId || u.id, updated: now_() });
    log_(s.id, u.id, 'reviewer_invited', nameOf_(r) + ' <' + email + '>');
    const j = journalRow_(s.journal);
    mailTemplate_('review_invite', email, { name: nameOf_(r), id: s.id, title: s.title, type: s.type, journal: j.name, abstract: abstractHtml_(s), accept: portalUrl_('review?token=' + rv.token + '&a=accept'), decline: portalUrl_('review?token=' + rv.token + '&a=decline'), days: Math.min(Math.max(Number(r.reviewDays) || CFG.REVIEW_DAYS, 7), 60) }, { journal: s.journal });
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
  if (p.accept) { const me = find_('Users', 'id', r.reviewerId) || {}; patch.due = addDays_(Math.min(Math.max(Number(me.reviewDays) || CFG.REVIEW_DAYS, 7), 60)); }
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
