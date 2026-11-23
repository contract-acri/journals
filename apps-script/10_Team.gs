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
    .map(a => { const u = users[a.userId] || {}; const mail = u.instEmail || (PERSONAL_MAIL.test(u.email || '') ? '' : u.email); return { role: roleLabel_(a), group: ROLES[a.role].plural, photo: u.photo || '', name: (u.given + ' ' + u.family).trim() + (u.degrees ? ', ' + u.degrees : ''), designation: u.designation || '', department: u.department || '', affiliation: u.affiliation || '', address: u.instAddress || '', email: mail || '', profile: u.profileUrl || '', country: u.country || '', orcid: u.orcid || '', since: String(a.start || '').slice(0, 4) }; });
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
      name: (x.given + ' ' + x.family).trim() || x.email, email: x.email, affiliation: x.affiliation, link: a.status === 'pending' ? portalUrl_('agreement?token=' + a.token) : '', expires: a.expires || '', agreementFileId: a.agreementFileId, certificateFileId: a.certificateFileId, endReason: a.endReason };
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
    const days = [1, 3, 7, 14, 30].indexOf(Number(p.days)) >= 0 ? Number(p.days) : 7;
    let x = find_('Users', 'email', email), setPw = '';
    if (!x) {
      const t = token_();
      x = insert_('Users', { id: uid_('U'), email: email, given: p.given || '', family: p.family || '', degrees: p.degrees || '', affiliation: p.affiliation || '', orcid: p.orcid || '', passHash: '', salt: token_().slice(0, 16), verified: true, resetToken: t, resetExpires: new Date(Date.now() + days * 864e5).toISOString(), reviewer: true, roles: {}, status: 'invited', created: now_() });
      setPw = portalUrl_('reset?token=' + t);
    }
    need_(!where_('Appointments', a => a.userId === x.id && a.journal === p.journal && a.role === p.role && ['pending', 'active'].indexOf(a.status) >= 0 && String(a.end) >= p.start).length, 'This person already has this role for an overlapping term.');
    const prof = {}; ['designation', 'department', 'affiliation', 'instAddress', 'instEmail', 'profileUrl', 'country', 'degrees', 'orcid'].forEach(k => { if (p[k]) prof[k] = p[k]; });
    if (Object.keys(prof).length) update_('Users', 'id', x.id, prof);
    const a = insert_('Appointments', { id: uid_('A'), userId: x.id, journal: p.journal, role: p.role, title: p.title || '', start: p.start, end: p.end, status: 'pending', token: token_(), agreementVersion: AGREEMENT_VERSION, showOnSite: p.showOnSite !== false, order: p.order || '', reminded: '', renewalOf: p.renewalOf || '', createdBy: u.id, created: now_(), expires: new Date(Date.now() + days * 864e5).toISOString(), transfer: !!p.transfer });
    sendAppointment_(a, x, j, setPw);
    return { ok: true, id: a.id };
  });
}
function sendAppointment_(a, x, j, setPw) {
  const exp = a.expires ? Utilities.formatDate(new Date(a.expires), 'Asia/Kolkata', 'd MMMM yyyy, h:mm a') + ' IST' : '';
  mailTemplate_('appoint', x.email, { name: x.given || 'Colleague', role: roleLabel_(a), journal: j.name, start: fmtD_(a.start), end: fmtD_(a.end), link: portalUrl_('agreement?token=' + a.token), setPw: setPw, renewal: !!a.renewalOf, transfer: String(a.transfer) === 'true' || a.transfer === true, expires: exp }, { journal: a.journal });
}
function team_resend(p, u) {
  const a = find_('Appointments', 'id', p.id); need_(a && canAppoint_(u, a.journal, a.role), 'Not allowed.');
  need_(a.status === 'pending', 'Only unsigned appointments can be resent.');
  const x = find_('Users', 'id', a.userId); let setPw = '';
  const days = [1, 3, 7, 14, 30].indexOf(Number(p.days)) >= 0 ? Number(p.days) : 7;
  const fresh = update_('Appointments', 'id', a.id, { token: token_(), expires: new Date(Date.now() + days * 864e5).toISOString() });
  if (!x.passHash) { const t = token_(); update_('Users', 'id', x.id, { resetToken: t, resetExpires: new Date(Date.now() + days * 864e5).toISOString() }); setPw = portalUrl_('reset?token=' + t); }
  sendAppointment_(fresh, x, journalRow_(a.journal), setPw);
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
function appt_(token) {
  const a = find_('Appointments', 'token', token); need_(a && token, 'This agreement link is invalid or has been replaced by a newer one. Please use the latest email, or ask the journal office to resend it.');
  if (a.status === 'pending') need_(!a.expires || new Date(a.expires) > new Date(), 'This link expired on ' + Utilities.formatDate(new Date(a.expires), 'Asia/Kolkata', 'd MMMM yyyy') + '. Please write to the journal office (use the contact form on the website) and they will send you a new one.');
  return a;
}
function agreement_get(p) {
  const a = appt_(p.token), x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  return { ok: true, agreement: { status: a.status, role: roleLabel_(a), journal: j.name, code: j.code, accent: j.accent, start: fmtD_(a.start), end: fmtD_(a.end), name: (x.given + ' ' + x.family).trim(), email: x.email, signedAt: a.signedAt, signedName: a.signedName, html: agreementHtml_(a, x, j), needsPassword: !x.passHash, transfer: String(a.transfer) === 'true', expires: a.expires || '',
    profile: { given: x.given || '', family: x.family || '', photo: x.photo || '', degrees: x.degrees || '', designation: x.designation || '', department: x.department || '', affiliation: x.affiliation || '', instAddress: x.instAddress || '', instEmail: x.instEmail || '', profileUrl: x.profileUrl || '', orcid: x.orcid || '', country: x.country || 'India' },
    prefs: { reviewer: String(x.reviewer) !== 'false', reviewDays: Number(x.reviewDays) || 21, reviewMax: Number(x.reviewMax) || 2 } } };
}
function agreement_sign(p) {
  const a = appt_(p.token); need_(a.status === 'pending', a.status === 'active' ? 'You have already signed this agreement.' : 'This appointment is no longer open for signature.');
  need_(p.agree === true, 'Please confirm that you agree to the terms.');
  const x = find_('Users', 'id', a.userId), j = journalRow_(a.journal);
  const typed = String(p.name || '').trim().replace(/\s+/g, ' ');
  const famName = String((p.profile && p.profile.family) || x.family || '').trim();
  need_(typed.length >= 3 && (!famName || typed.toLowerCase().indexOf(famName.toLowerCase()) >= 0), 'Please type your full name' + (famName ? ', including "' + famName + '",' : '') + ' as your signature.');
  // Confirm the member's public board details (ISSN India / indexers need them), reviewing preferences and password.
  const pr = p.profile || {}, prof = {};
  if (pr.given !== undefined || pr.family !== undefined) {
    need_(String(pr.given || '').trim() && String(pr.family || '').trim(), 'Please enter your first and last name as they should appear on the board page.');
    prof.given = String(pr.given).trim(); prof.family = String(pr.family).trim();
  }
  if (p.photo && p.photo.data) prof.photo = savePhoto_(x.id, p.photo);
  if (p.signature && p.signature.data) { try { prof.signatureFileId = lettersFolder_('Signatures').createFile(Utilities.newBlob(Utilities.base64Decode(p.signature.data), p.signature.mime || 'image/png', 'signature-' + x.id + '.png')).getId(); } catch (e) { } }
  ['degrees', 'designation', 'department', 'affiliation', 'instAddress', 'instEmail', 'profileUrl', 'orcid', 'country'].forEach(k => { if (pr[k] !== undefined) prof[k] = String(pr[k]).trim(); });
  if (p.profile) {
    need_(prof.designation && prof.affiliation && prof.instAddress, 'Please fill in your designation, institution and full institutional address. They are shown on the editorial board page.');
    if (prof.instEmail) need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prof.instEmail), 'Institutional email is not valid.');
    if (prof.profileUrl) need_(/^https?:\/\//.test(prof.profileUrl), 'Profile link must start with https://');
  }
  Object.assign(prof, reviewPrefs_(p.prefs || {}));
  if (p.prefs && p.prefs.reviewer !== undefined) prof.reviewer = !!p.prefs.reviewer;
  if (!x.passHash) { need_(p.password && String(p.password).length >= 8, 'Please choose a password of at least 8 characters for the portal.'); prof.salt = token_().slice(0, 16); prof.passHash = hashPw_(p.password, prof.salt); prof.verified = true; prof.resetToken = ''; }
  if (Object.keys(prof).length) Object.assign(x, update_('Users', 'id', x.id, prof));
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
  appoint: d => [d.transfer ? `${d.journal} has moved to ACRI Journals: please confirm your board membership` : `${d.renewal ? 'Renewal of your' : 'Your'} appointment as ${d.role}, ${d.journal}`, `<p>Dear ${esc_(d.name)},</p>${d.transfer ? `<p>Thank you for serving on the editorial board of <b>${esc_(d.journal)}</b>. The journal now runs on <b>ACRI Journals</b>, our new publishing platform, with its own editorial portal for manuscripts, reviews and board work.</p><p>To continue as <b>${esc_(d.role)}</b> for the term <b>${d.start} to ${d.end}</b>, please confirm your details, set your reviewing preferences and sign the Editorial Agreement. It takes about five minutes.</p>` : `<p>On behalf of ACRI Journals, it is a pleasure to ${d.renewal ? 'renew your appointment' : 'invite you to serve'} as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> for the term <b>${d.start} to ${d.end}</b>.</p><p>Before your appointment begins, please read and electronically sign the ACRI Journals Editorial Agreement. It covers your responsibilities, confidentiality, conflicts of interest and publication ethics. Your editorial access starts as soon as you sign.</p>`}${btn_(d.link, d.transfer ? 'Confirm and sign' : 'Review and sign the agreement')}${d.expires ? `<p style="color:#B42318;font-size:14px"><b>This link is personal and valid until ${esc_(d.expires)}.</b></p>` : ''}${d.setPw ? `<p>You will choose your portal password on the same page.</p>` : ''}<p>If you would prefer not to accept, you can decline from the same page.</p><p>With thanks,<br>ACRI Journals</p>`],
  appoint_signed: d => [`Welcome: your appointment as ${d.role} is active`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for signing the Editorial Agreement. Your appointment as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> is now active, from ${d.start} to ${d.end}.</p><p>A signed copy of the agreement is attached. Your editorial tools are available in the portal.</p>${btn_(d.link, 'Open the editorial portal')}<p>Welcome to the team.</p>`],
  appoint_declined: d => [`Appointment declined: ${d.who} (${d.role})`, `<p>${esc_(d.who)} has declined the appointment as ${esc_(d.role)} of ${esc_(d.journal)}.</p>${d.reason ? quote_(d.reason) : ''}`],
  term_reminder: d => [`Your term as ${d.role} ends on ${d.end}`, `<p>Dear ${esc_(d.name)},</p><p>Your term as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> ends on <b>${d.end}</b> (${d.days} days from now).</p>${d.renewed ? '<p>A renewal has already been arranged. Please make sure you have signed the new agreement.</p>' : '<p>If you would like to continue, please reply to this email. The editorial office can send you a renewal. Otherwise, please hand over any manuscripts you are handling before your term ends.</p>'}<p>Thank you for your service to the journal.</p>`],
  term_ended: d => [d.revoked ? `Your appointment with ${d.journal} has ended` : `Thank you: your term as ${d.role} has ended`, d.revoked ? `<p>Dear ${esc_(d.name)},</p><p>Your appointment as ${esc_(d.role)} of ${esc_(d.journal)} has ended with effect from ${d.end}.</p>${d.reason ? quote_(d.reason) : ''}<p>Your confidentiality obligations continue.</p>` : `<p>Dear ${esc_(d.name)},</p><p>Your term as <b>${esc_(d.role)}</b> of <b>${esc_(d.journal)}</b> (${d.start} – ${d.end}) has come to an end. On behalf of the authors, reviewers and readers you have served, thank you.</p><p>Your <b>Certificate of Editorial Service</b> is attached. Your editorial access has closed, but your author and reviewer account remains active. Please remember that your confidentiality obligations continue.</p><p>We hope to work with you again.</p>`],
});
