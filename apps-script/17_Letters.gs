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
  const sg = opt.sigObj || (opt.signatory === 'none' ? null : signatory_(opt.signatory)), sig = sg ? imgFromFile_(sg.fileId) : '';
  const brand = '<span style="font-family:Georgia,\'Times New Roman\',serif;font-weight:bold;font-size:25px;color:#0B2545;letter-spacing:.5px">ACRI</span><span style="display:inline-block;width:2px;height:20px;background:#1F7A4D;margin:0 10px;vertical-align:-3px"></span><span style="font-family:Arial,sans-serif;font-weight:bold;font-size:10.5px;letter-spacing:4px;color:#0B2545">JOURNALS</span>';
  const left = j
    ? (logo ? '<img src="' + logo + '" style="height:58px;vertical-align:middle;margin-right:12px">' : '') + '<span style="display:inline-block;vertical-align:middle"><span style="font-family:Georgia,serif;font-weight:bold;font-size:17px;color:' + accent + '">' + esc_(j.name) + '</span><br><span style="font-family:Arial,sans-serif;font-size:10px;color:#5E6875;letter-spacing:1px">' + esc_(j.code) + (j.issnOnline ? ' · e-ISSN ' + esc_(j.issnOnline) : '') + ' · AN ACRI JOURNALS PUBLICATION</span></span>'
    : brand + '<br><span style="font-family:Arial,sans-serif;font-size:10px;color:#5E6875;letter-spacing:1px">PUBLISHED BY ' + esc_(P.name.toUpperCase()) + '</span>';
  const right = '<div style="font-family:Arial,sans-serif;font-size:9.5px;line-height:1.55;color:#5E6875;text-align:right">' + esc_(P.name) + '<br>' + esc_(P.address).replace(/, (?=[^,]*Gujarat)/, ',<br>') + '<br>' + (P.phone ? 'Tel ' + esc_(P.phone) + ' · ' : '') + esc_(P.email) + '<br>' + esc_(P.web) + '</div>';
  const sigBlock = sg ? '<div style="margin-top:34px">' + (sig ? '<img src="' + sig + '" style="height:58px;display:block;margin:0 0 2px">' : '<div style="height:40px"></div>') +
    '<div style="border-top:1px solid #9AA3AE;width:220px;padding-top:6px;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.45"><b>' + esc_(sg.name) + '</b><br>' + esc_(sg.designation) + (sg.org ? '<br>' + esc_(sg.org) : '') + '</div></div>' : '';
  return '<html><head><style>@page{size:A4;margin:16mm 18mm 16mm 18mm}body{font-family:Georgia,\'Times New Roman\',serif;font-size:12.5px;line-height:1.62;color:#15191E}p{margin:0 0 10px}ul,ol{margin:0 0 10px 18px;padding:0}a{color:' + accent + '}</style></head><body>' +
    '<table width="100%" cellspacing="0" cellpadding="0"><tr><td style="vertical-align:middle">' + left + '</td><td style="vertical-align:top;width:42%">' + right + '</td></tr></table>' +
    '<div style="height:3px;background:' + accent + ';margin:12px 0 0"></div><div style="height:1px;background:#1F7A4D;margin:2px 0 ' + (opt.fromDesk ? '8px' : '18px') + '"></div>' +
    (opt.fromDesk ? '<div style="font-family:Arial,sans-serif;font-size:10.5px;color:' + accent + ';letter-spacing:.5px;margin:0 0 16px">FROM THE DESK OF <b>' + esc_(String(opt.fromDesk.name).toUpperCase()) + '</b> · ' + esc_(opt.fromDesk.designation) + '</div>' : '') +
    '<table width="100%" cellspacing="0" cellpadding="0" style="font-family:Arial,sans-serif;font-size:11px;color:#2F3742"><tr><td>' + (opt.ref ? 'Ref. No.: <b>' + esc_(opt.ref) + '</b>' : '') + '</td><td style="text-align:right">Date: <b>' + esc_(longDate_(opt.date)) + '</b></td></tr></table>' +
    (opt.kind === 'notice' ? '<div style="text-align:center;margin:22px 0 6px;font-family:Arial,sans-serif;font-weight:bold;letter-spacing:5px;font-size:15px;color:' + accent + '">NOTICE</div>' : '') +
    (opt.to ? '<div style="margin-top:18px;white-space:pre-line">' + esc_(opt.to) + '</div>' : '') +
    (opt.subject ? '<p style="margin:18px 0 14px' + (opt.kind === 'notice' ? ';text-align:center' : '') + '"><b>' + (opt.kind === 'notice' ? '' : 'Subject: ') + esc_(opt.subject) + '</b></p>' : '<div style="height:12px"></div>') +
    '<div>' + (opt.bodyHtml || '') + '</div>' + sigBlock +
    (opt.fromDesk ? '<p style="margin-top:26px;font-family:Arial,sans-serif;font-size:9.5px;line-height:1.5;color:#5E6875;border-left:2px solid #C9CED5;padding:4px 10px">The views expressed in this letter are those of ' + esc_(opt.fromDesk.name) + ' in their capacity as a member of the editorial board, and do not necessarily represent the views of ' + esc_(j ? j.name : 'the journal') + ', ACRI Journals or ' + esc_(P.name) + '.</p>' : '') +
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
/** Admins write on any letterhead and choose a signatory. Board members write on their own journal's
 *  letterhead, as themselves ("From the desk of …"), signed with their own signature. */
function letterCtx_(p, u) {
  const l = p.letter || {}, admin = isAdmin_(u);
  if (!admin) need_(l.journal && isBoard_(u, l.journal), 'Choose one of your journals.');
  const asMe = !admin || l.signatory === 'me';
  if (asMe) need_(l.journal, 'Choose the journal whose letterhead you are writing on.');
  const me = asMe ? selfSignatory_(find_('Users', 'id', u.id), l.journal) : null;
  return { l: l, opt: { journal: l.journal, date: l.date, to: l.to, subject: l.subject, bodyHtml: letterBody_(l.body), signatory: l.signatory, sigObj: me, fromDesk: me, kind: l.kind } };
}
function letter_preview(p, u) {
  const c = letterCtx_(p, u);
  return { ok: true, html: letterheadHtml_(Object.assign(c.opt, { ref: c.l.ref || '(reference number on saving)' })) };
}
function letter_create(p, u) {
  const c = letterCtx_(p, u), l = c.l; need_(l.body && String(l.body).trim().length > 3, 'Write the letter.');
  const kind = l.kind === 'notice' ? 'notice' : (l.kind === 'certificate' ? 'certificate' : 'letter');
  const ref = nextRef_({ letter: 'LTR', notice: 'NOT', certificate: 'CRT' }[kind]);
  const pdf = htmlToPdf_(letterheadHtml_(Object.assign(c.opt, { ref: ref, kind: kind })), ref.replace(/\//g, '-') + ' ' + String(l.subject || kind).replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf');
  insert_('Letters', { id: uid_('L'), ref: ref, type: kind, journal: l.journal || '', to: l.to || '', subject: l.subject || '', body: l.body, signatory: c.opt.sigObj ? 'self:' + u.email : (l.signatory || ''), date: l.date || today_(), fileId: pdf.id, createdBy: u.email, created: now_() });
  return { ok: true, ref: ref, fileId: pdf.id, name: pdf.name, data: pdf.b64 };
}
function letter_list(p, u) {
  need_(isAdmin_(u) || myJournals_(u).length, 'Not allowed.');
  return { ok: true, items: all_('Letters').filter(x => isAdmin_(u) || x.createdBy === u.email).map(x => { delete x._row; return x; }).reverse().slice(0, 300) };
}
function letter_file(p, u) {
  if (!isAdmin_(u)) need_(all_('Letters').some(x => x.fileId === p.fileId && x.createdBy === u.email), 'Not allowed.');
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
