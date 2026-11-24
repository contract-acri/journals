/** Import a submission received outside AES (for example through the old Google Form).
 *  The admin enters the details, uploads the manuscript and keeps the original date of receipt.
 *  The submission joins the editorial queue as "submitted" with its own manuscript ID, and the
 *  corresponding author gets an ACRI One account (if new) with a link to set a password. */
function adm_importSub(p, u) {
  need_(isAdmin_(u), 'Only an admin can import a submission.');
  const f = p.sub || {};
  const j = journalRow_(f.journal); need_(j && !j.network, 'Choose a journal.');
  need_(String(f.title || '').trim(), 'Enter the title.');
  need_(String(f.abstract || '').trim(), 'Enter the abstract.');
  const authors = (f.authors || []).filter(a => String(a.given || a.family || '').trim());
  need_(authors.length, 'Add at least one author.');
  if (!authors.some(a => a.corresponding)) authors[0].corresponding = true;
  const corr = authors.find(a => a.corresponding);
  corr.email = normEmail_(corr.email || '');
  need_(/@/.test(corr.email), 'The corresponding author needs an email address.');
  need_(p.file && p.file.data, 'Upload the manuscript file.');
  const received = String(f.received || '').slice(0, 10);
  need_(/^\d{4}-\d{2}-\d{2}$/.test(received), 'Enter the date the submission was received.');
  const dup = where_('Submissions', s => s.journal === f.journal && String(s.title || '').trim().toLowerCase() === String(f.title).trim().toLowerCase());
  need_(!dup.length || p.force, 'A submission with this title already exists (' + (dup[0] || {}).id + '). Tick "Import anyway" if this is a different paper.');
  return withLock_(() => {
    // Author account
    let x = find_('Users', 'email', corr.email), setPw = '';
    if (!x) {
      const t = token_();
      x = insert_('Users', { id: uid_('U'), email: corr.email, given: corr.given || '', family: corr.family || '', degrees: corr.degrees || '', affiliation: corr.affiliationName || '', designation: corr.designation || '', phone: corr.phone || '', country: corr.country || 'India', passHash: '', salt: token_().slice(0, 16), verified: true, resetToken: t, resetExpires: new Date(Date.now() + 30 * 864e5).toISOString(), reviewer: false, roles: {}, status: 'active', created: now_() });
      setPw = portalUrl_('reset?token=' + t);
    }
    // Affiliations list from the authors' institutions
    const affs = [], affId = (name) => { name = String(name || '').trim(); if (!name) return []; let a = affs.find(z => z.name.toLowerCase() === name.toLowerCase()); if (!a) { a = { id: affs.length + 1, name: name }; affs.push(a); } return [a.id]; };
    const list = authors.map(a => ({ given: String(a.given || '').trim(), family: String(a.family || '').trim(), degrees: a.degrees || '', email: normEmail_(a.email || ''), orcid: a.orcid || '', affiliations: affId(a.affiliationName), corresponding: !!a.corresponding }));
    const n = nextId_(f.journal);
    const recIso = new Date(received + 'T12:00:00+05:30').toISOString();
    const src = String(f.source || 'Google Form').trim();
    const s = insert_('Submissions', {
      id: n.id, journal: f.journal, year: n.year, serial: n.serial, status: 'submitted', type: f.type || 'Research Article',
      subject: f.subject || [], title: String(f.title).trim(), subtitle: '', abstract: JSON.stringify(String(f.abstract).trim()), keywords: f.keywords || [],
      authors: list, affiliations: affs,
      declarations: { original: true, ethics: true, consent: true, license: true, imported: src, importedNote: f.declarationNote || 'Declarations accepted on the original submission form.' },
      coverLetter: f.coverLetter || '', submitterId: x.id, editorId: '', version: 1, created: recIso, updated: now_(), submittedAt: recIso,
      flags: { imported: src, importedBy: u.email, importedAt: now_(), originalLink: f.originalLink || '' } });
    saveUpload_(s, 1, 'manuscript', p.file.name, p.file.mime, p.file.data, u.id);
    if (p.titlepage && p.titlepage.data) saveUpload_(s, 1, 'titlepage', p.titlepage.name, p.titlepage.mime, p.titlepage.data, u.id);
    log_(s.id, u.id, 'imported', 'Received on ' + fmtD_(received) + ' through the ' + src + '; imported into AES by the editorial office.', true);
    if (p.notify !== false) mailTemplate_('imported_author', corr.email, { name: corr.given || 'Author', id: s.id, title: s.title, journal: j.name, received: fmtD_(received), source: src, link: link_(s.id), setPw: setPw }, { journal: s.journal });
    return { ok: true, id: s.id, newAccount: !!setPw, message: 'Imported as ' + s.id + '.' + (p.notify !== false ? ' The author has been emailed.' : '') };
  });
}
Object.assign(TEMPLATES, {
  imported_author: d => [`Your submission is now in the ACRI Journals portal: ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for submitting your manuscript to <b>${esc_(d.journal)}</b> on ${esc_(d.received)} through our ${esc_(d.source)}. We have now moved all submissions to the ACRI Journals editorial portal, and yours has been carried across with its original date of receipt.</p><p><b>Manuscript ID:</b> ${d.id}<br><b>Title:</b> ${esc_(d.title)}</p><p>There is nothing you need to resubmit. You can follow every stage of the review online, and you will receive emails as your manuscript moves forward.</p>${d.setPw ? `<p>We have created an ACRI One account for you with this email address. Please choose a password to sign in:</p>${btn_(d.setPw, 'Set your password')}<p style="font-size:14px;color:#5E6875">This link is valid for 30 days. After that, use "Forgot password" on the sign-in page.</p>` : `${btn_(d.link, 'View your submission')}`}<p>With thanks,<br>The Editorial Office<br>${esc_(d.journal)}</p>`],
});
