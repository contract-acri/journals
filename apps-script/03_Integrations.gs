/** External services: Google Drive (files), GitHub (publishing), Zenodo (DOIs), ZeptoMail (email). */

// ============================== Drive ==============================
function rootFolder_() {
  const id = prop_('DRIVE_ROOT_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('ACRI Journals — Manuscript Files');
  PropertiesService.getScriptProperties().setProperty('DRIVE_ROOT_ID', f.getId());
  return f;
}
function subFolder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function submissionFolder_(sub) { return subFolder_(subFolder_(rootFolder_(), sub.journal.toUpperCase()), sub.id); }

/** Save a base64 upload into the submission folder. */
function saveUpload_(sub, version, kind, name, mime, b64, userId) {
  const bytes = Utilities.base64Decode(b64);
  need_(bytes.length <= CFG.MAX_UPLOAD_MB * 1024 * 1024, 'Files must be smaller than ' + CFG.MAX_UPLOAD_MB + ' MB.');
  const safe = String(name).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const folder = subFolder_(submissionFolder_(sub), 'v' + version);
  const file = folder.createFile(Utilities.newBlob(bytes, mime || 'application/octet-stream', safe));
  const rec = { id: uid_('F'), subId: sub.id, version: version, kind: kind, name: safe, mime: mime, size: bytes.length, driveId: file.getId(), pdfId: '', uploadedBy: userId, created: now_(), active: true };
  insert_('Files', rec);
  return rec;
}

/** Convert a .docx to PDF via Google Docs (needs the Drive API advanced service, v3). Removes author metadata. */
function toPdf_(fileRec) {
  if (fileRec.pdfId) return fileRec.pdfId;
  const src = DriveApp.getFileById(fileRec.driveId);
  let pdfBlob;
  if (/pdf$/i.test(fileRec.mime) || /\.pdf$/i.test(fileRec.name)) pdfBlob = src.getBlob();
  else {
    const gdoc = Drive.Files.create({ name: 'tmp-' + fileRec.id, mimeType: MimeType.GOOGLE_DOCS }, src.getBlob(), { supportsAllDrives: true });
    pdfBlob = DriveApp.getFileById(gdoc.id).getAs(MimeType.PDF);
    DriveApp.getFileById(gdoc.id).setTrashed(true);
  }
  pdfBlob.setName(fileRec.name.replace(/\.\w+$/, '') + '.pdf');
  const pdf = src.getParents().next().createFile(pdfBlob);
  update_('Files', 'id', fileRec.id, { pdfId: pdf.getId() });
  return pdf.getId();
}

// ============================== GitHub ==============================
function gh_(method, path, body) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + prop_('GITHUB_REPO') + path, {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop_('GITHUB_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: body ? JSON.stringify(body) : null,
  });
  const code = res.getResponseCode();
  if (code === 404 && method === 'get') return null;
  if (code >= 300) throw new Error('GitHub ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || '{}');
}
function ghRead_(path) {
  const r = gh_('get', '/contents/' + encodeURI(path) + '?ref=' + prop_('GITHUB_BRANCH', 'main'));
  if (!r) return null;
  return Utilities.newBlob(Utilities.base64Decode(r.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
}
/**
 * Commit several files in ONE commit (so the site builds once).
 * files: [{ path, text } | { path, bytes } | { path, delete: true }]
 */
function ghCommit_(files, message) {
  const br = prop_('GITHUB_BRANCH', 'main');
  const ref = gh_('get', '/git/ref/heads/' + br);
  const baseSha = ref.object.sha;
  const base = gh_('get', '/git/commits/' + baseSha);
  const tree = files.map(f => {
    if (f.delete) return { path: f.path, mode: '100644', type: 'blob', sha: null };
    const content = f.bytes ? Utilities.base64Encode(f.bytes) : Utilities.base64Encode(f.text, Utilities.Charset.UTF_8);
    const blob = gh_('post', '/git/blobs', { content: content, encoding: 'base64' });
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  });
  const t = gh_('post', '/git/trees', { base_tree: base.tree.sha, tree: tree });
  const c = gh_('post', '/git/commits', { message: message, tree: t.sha, parents: [baseSha], author: { name: 'ACRI Journals EMS', email: systemFrom_(), date: now_() } });
  gh_('patch', '/git/refs/heads/' + br, { sha: c.sha });
  return c.sha;
}
function ghLatestRun_() {
  const r = gh_('get', '/actions/runs?per_page=1&branch=' + prop_('GITHUB_BRANCH', 'main'));
  const run = r && r.workflow_runs && r.workflow_runs[0];
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, updated: run.updated_at, title: run.display_title } : null;
}

// ============================== Zenodo ==============================
function zenodoBase_() { return String(prop_('ZENODO_SANDBOX', 'true')) === 'true' ? 'https://sandbox.zenodo.org/api' : 'https://zenodo.org/api'; }
function zen_(method, path, body, raw) {
  const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + prop_('ZENODO_TOKEN') } };
  if (raw) { opt.payload = raw; opt.contentType = 'application/octet-stream'; }
  else if (body) { opt.payload = JSON.stringify(body); opt.contentType = 'application/json'; }
  const url = /^https?:/.test(path) ? path : zenodoBase_() + path;
  const res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode();
  if (code >= 300) throw new Error('Zenodo ' + code + ': ' + res.getContentText().slice(0, 400));
  return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}
/** Create an unpublished deposition and reserve its DOI (called at acceptance). */
function zenodoReserve_(sub, j) {
  const d = zen_('post', '/deposit/depositions', { metadata: zenodoMeta_(sub, j, true) });
  return { id: String(d.id), doi: d.metadata.prereserve_doi.doi };
}
/** Full Zenodo metadata. Uses the published article (article.json in GitHub) when available, so the
 *  record carries everything the website shows: abstract, keywords, references, journal details, links. */
function zenodoMeta_(sub, j, minimal) {
  let a = null;
  if (!minimal) { try { a = articleJson_(sub.journal, sub.id); } catch (e) { } }
  const src = a || sub, affs = src.affiliations || [];
  const affName = (ids) => (ids || []).map(id => (affs.find(f => String(f.id) === String(id)) || {}).name).filter(String)[0];
  const m = {
    upload_type: 'publication', publication_type: 'article',
    title: String(src.title || '').replace(/<[^>]+>/g, '') + (src.subtitle ? ': ' + src.subtitle : ''),
    creators: (src.authors || []).map(x => { const c = { name: x.family + ', ' + x.given }; const af = affName(x.affiliations); if (af) c.affiliation = af; if (x.orcid) c.orcid = String(x.orcid).replace(/^https?:\/\/orcid.org\//, ''); return c; }),
    description: abstractHtml_({ abstract: src.abstract }) || String(src.title || ''),
    access_right: 'open', license: 'cc-by-4.0', language: 'eng',
    keywords: (src.keywords || []).filter(String),
    publication_date: String(src.published || sub.published || today_()).slice(0, 10),
    journal_title: j.name, journal_volume: String(src.volume || ''), journal_issue: String(src.issue || ''),
  };
  if (minimal) { m.prereserve_doi = true; return m; }
  const url = articleUrl_(sub), jurl = siteUrl_() + '/journals/' + j.slug + '/';
  m.journal_pages = src.firstPage ? src.firstPage + (src.lastPage ? '-' + src.lastPage : '') : (src.elocator || ('e' + String(sub.id).split('-').slice(1).join('')));
  m.related_identifiers = [
    { identifier: url, relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'url' },
    { identifier: jurl, relation: 'isPartOf', scheme: 'url' },
  ];
  if (j.issnOnline || j.issn) m.related_identifiers.push({ identifier: j.issnOnline || j.issn, relation: 'isPartOf', scheme: 'issn' });
  if (a && a.previousDoi) m.related_identifiers.push({ identifier: a.previousDoi, relation: 'isIdenticalTo', scheme: 'doi' });
  const refs = ((a && a.references) || []).map(r => String(r.text || r).replace(/<[^>]+>/g, '').trim()).filter(String);
  if (refs.length) m.references = refs;
  const info = (a && a.info) || {};
  m.notes = (src.type || 'Article') + ' published in ' + j.name + (j.issnOnline ? ' (e-ISSN ' + j.issnOnline + ')' : '') + ' by ' + (siteConfig_().publisherName || CFG.LEGAL_ENTITY) + '. Version of record: ' + url +
    (info.funding ? ' Funding: ' + info.funding : '') + (info.conflicts ? ' Conflicts of interest: ' + info.conflicts : '');
  const comm = prop_('ZENODO_COMMUNITY', '');
  if (comm) m.communities = [{ identifier: comm }];
  return m;
}
/** The article PDF: the live site first, then the copy stored in GitHub (typeset or uploaded). */
function articlePdfBytes_(journal, id) {
  const live = UrlFetchApp.fetch(siteUrl_() + '/journals/' + journal + '/articlepdf/' + String(id).toLowerCase() + '.pdf', { muteHttpExceptions: true });
  if (live.getResponseCode() === 200 && /pdf/i.test(live.getHeaders()['Content-Type'] || live.getHeaders()['content-type'] || 'pdf')) return live.getContent();
  const own = ghBytes_('content/articles/' + journal + '/' + id + '/article.pdf'); if (own) return own;
  const dir = gh_('get', '/contents/content/typeset?ref=' + prop_('GITHUB_BRANCH', 'main')) || [];
  const f = dir.filter(x => x.name.indexOf(id + '-') === 0).pop();
  return f ? ghBytes_('content/typeset/' + f.name) : null;
}
function ghBytes_(path) {
  const r = gh_('get', '/contents/' + encodeURI(path) + '?ref=' + prop_('GITHUB_BRANCH', 'main'));
  if (!r) return null;
  if (r.content) return Utilities.base64Decode(r.content.replace(/\n/g, ''));
  if (r.download_url) return UrlFetchApp.fetch(r.download_url, { headers: { Authorization: 'Bearer ' + prop_('GITHUB_TOKEN') } }).getContent();
  return null;
}
/** Upload the PDF, send the full metadata and publish the deposition (registers the DOI with DataCite). */
function zenodoRegister_(sub, j) {
  need_(sub.zenodoId, 'No Zenodo deposition for this article. Reserve a DOI first.');
  let dep = zen_('get', '/deposit/depositions/' + sub.zenodoId);
  if (dep.submitted && dep.state === 'done') return { doi: dep.doi, url: dep.links.record_html || dep.links.html };
  if (dep.submitted) { try { dep = zen_('post', '/deposit/depositions/' + sub.zenodoId + '/actions/edit'); } catch (e) { } }
  const pdf = articlePdfBytes_(sub.journal, sub.id);
  need_(pdf, 'The article PDF could not be found (not on the website and not in GitHub). Wait for the website build to finish, then try again.');
  if (!dep.submitted) {
    (dep.files || []).forEach(f => zen_('delete', '/deposit/depositions/' + sub.zenodoId + '/files/' + f.id));
    zen_('put', dep.links.bucket + '/' + sub.id + '.pdf', null, pdf);
  }
  const meta = zenodoMeta_(sub, j, false);
  try { zen_('put', '/deposit/depositions/' + sub.zenodoId, { metadata: meta }); }
  catch (e) { // Retry without optional fields Zenodo may reject, keeping everything required.
    ['references', 'communities', 'notes', 'language'].forEach(k => delete meta[k]);
    meta.related_identifiers = meta.related_identifiers.filter(r => r.scheme === 'url');
    zen_('put', '/deposit/depositions/' + sub.zenodoId, { metadata: meta });
  }
  dep = zen_('post', '/deposit/depositions/' + sub.zenodoId + '/actions/publish');
  return { doi: dep.doi, url: (dep.links && (dep.links.record_html || dep.links.html)) || '' };
}
function abstractHtml_(sub) {
  const a = sub.abstract;
  if (!a) return '';
  if (typeof a === 'string') { try { const o = JSON.parse(a); return abstractHtml_({ abstract: o }); } catch (e) { return '<p>' + a + '</p>'; } }
  return (a.sections || []).map(s => '<p>' + (s.heading ? '<strong>' + s.heading + ':</strong> ' : '') + s.text + '</p>').join('');
}
function articleUrl_(sub) { return siteUrl_() + '/journals/' + sub.journal + '/fullarticle/' + sub.id.toLowerCase() + '/'; }

// ============================== ZeptoMail ==============================
/** Send a transactional email.
 *  MAIL_PROVIDER (script property): auto (default) | zepto | gmail
 *   auto  → ZeptoMail if ZEPTO_TOKEN is set; if it is missing or ZeptoMail fails, falls back to Gmail.
 *   gmail → always send from the Google account that owns the script (MailApp).
 *  Gmail fallback sends FROM the script owner's address (display name and Reply-To are kept), and has a
 *  daily quota (about 100/day on a free Gmail, 1,500/day on Google Workspace). */
function sendMail_(to, subject, html, opts) {
  opts = opts || {};
  const list = (Array.isArray(to) ? to : [to]).filter(String).map(e => ({ email_address: typeof e === 'string' ? { address: e } : { address: e.email, name: e.name } }));
  if (!list.length) return;
  const mode = String(prop_('MAIL_PROVIDER', 'auto')).toLowerCase();
  const tok = prop_('ZEPTO_TOKEN');
  let status = 'sent', detail = '', via = '';
  if (mode !== 'gmail' && tok) {
    via = 'zepto';
    const body = { from: { address: opts.from || systemFrom_(), name: opts.fromName || CFG.APP }, to: list, subject: subject, htmlbody: html };
    if (opts.attachments && opts.attachments.length) body.attachments = opts.attachments.map(a => ({ name: a.name, mime_type: a.mime || 'application/pdf', content: a.b64 }));
    if (opts.cc && [].concat(opts.cc).filter(String).length) body.cc = [].concat(opts.cc).filter(String).map(e => ({ email_address: { address: e } }));
    if (opts.bcc && [].concat(opts.bcc).filter(String).length) body.bcc = [].concat(opts.bcc).filter(String).map(e => ({ email_address: { address: e } }));
    if (opts.replyTo) body.reply_to = [{ address: opts.replyTo }];
    try {
      const res = UrlFetchApp.fetch('https://' + prop_('ZEPTO_HOST', 'api.zeptomail.in') + '/v1.1/email', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: /^Zoho-enczapikey/i.test(tok) ? tok : 'Zoho-enczapikey ' + tok, Accept: 'application/json' },
        payload: JSON.stringify(body),
      });
      if (res.getResponseCode() >= 300) { status = 'error'; detail = 'ZeptoMail ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 250); }
    } catch (e) { status = 'error'; detail = 'ZeptoMail: ' + String(e.message || e); }
  } else if (mode === 'zepto') { status = 'error'; detail = 'ZEPTO_TOKEN not set (MAIL_PROVIDER=zepto, so no Gmail fallback)'; }
  // Gmail fallback: when ZeptoMail is not connected, or failed in auto mode.
  if (mode === 'gmail' || (mode === 'auto' && (!tok || status === 'error'))) {
    const prev = detail; via = via ? via + '→gmail' : 'gmail';
    try {
      const o = { htmlBody: html, name: opts.fromName || CFG.APP, replyTo: opts.replyTo || opts.from || controllerEmail_() };
      if (opts.cc) o.cc = [].concat(opts.cc).filter(String).join(',');
      if (opts.bcc) o.bcc = [].concat(opts.bcc).filter(String).join(',');
      if (opts.attachments && opts.attachments.length) o.attachments = opts.attachments.map(a => Utilities.newBlob(Utilities.base64Decode(a.b64), a.mime || 'application/pdf', a.name));
      MailApp.sendEmail(list.map(x => x.email_address.address).join(','), subject, String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), o);
      status = 'sent'; detail = prev ? 'fallback after ' + prev : '';
    } catch (e) { status = 'error'; detail = (prev ? prev + ' | ' : '') + 'Gmail: ' + String(e.message || e); }
  }
  insert_('EmailLog', { ts: now_(), to: list.map(x => x.email_address.address).join(', '), subject: subject, status: status, detail: (via ? '[' + via + '] ' : '') + detail });
}
