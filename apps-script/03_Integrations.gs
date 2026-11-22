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
function zenodoMeta_(sub, j, minimal) {
  const authors = sub.authors || [], affs = sub.affiliations || [];
  const m = {
    upload_type: 'publication', publication_type: 'article', prereserve_doi: true,
    title: sub.title + (sub.subtitle ? ': ' + sub.subtitle : ''),
    creators: authors.map(a => {
      const c = { name: a.family + ', ' + a.given };
      const af = (a.affiliations || []).map(id => (affs.find(f => f.id === id) || {}).name).filter(String)[0];
      if (af) c.affiliation = af; if (a.orcid) c.orcid = a.orcid; return c;
    }),
    description: abstractHtml_(sub) || sub.title,
    access_right: 'open', license: 'cc-by-4.0',
    keywords: sub.keywords || [],
    journal_title: j.name, journal_volume: String(sub.volume || ''), journal_issue: String(sub.issue || ''),
  };
  if (!minimal) {
    m.publication_date = sub.published || today_();
    m.related_identifiers = [{ identifier: articleUrl_(sub), relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'url' }];
    m.journal_pages = sub.elocator || ('e' + sub.id.split('-').slice(1).join(''));
    m.notes = 'Published in ' + j.name + ' by ' + CFG.PUBLISHER + '.';
    const comm = prop_('ZENODO_COMMUNITY', '');
    if (comm) m.communities = [{ identifier: comm }];
  }
  return m;
}
/** Upload the published PDF from the live site and publish the deposition (registers the DOI with DataCite). */
function zenodoRegister_(sub, j) {
  need_(sub.zenodoId, 'No Zenodo deposition for this article. Reserve a DOI first.');
  const pdfUrl = siteUrl_() + '/journals/' + sub.journal + '/articlepdf/' + sub.id.toLowerCase() + '.pdf';
  const pdf = UrlFetchApp.fetch(pdfUrl, { muteHttpExceptions: true });
  need_(pdf.getResponseCode() === 200, 'The PDF is not live yet (' + pdfUrl + '). Wait for the site build to finish and try again.');
  let dep = zen_('get', '/deposit/depositions/' + sub.zenodoId);
  if (dep.submitted) return { doi: dep.doi, url: dep.links.record_html || dep.links.html };
  (dep.files || []).forEach(f => zen_('delete', '/deposit/depositions/' + sub.zenodoId + '/files/' + f.id));
  zen_('put', dep.links.bucket + '/' + sub.id + '.pdf', null, pdf.getContent());
  zen_('put', '/deposit/depositions/' + sub.zenodoId, { metadata: zenodoMeta_(sub, j, false) });
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
function sendMail_(to, subject, html, opts) {
  opts = opts || {};
  const tok = prop_('ZEPTO_TOKEN');
  const list = (Array.isArray(to) ? to : [to]).filter(String).map(e => ({ email_address: typeof e === 'string' ? { address: e } : { address: e.email, name: e.name } }));
  if (!list.length) return;
  const body = {
    from: { address: opts.from || systemFrom_(), name: opts.fromName || CFG.APP },
    to: list, subject: subject, htmlbody: html,
  };
  if (opts.attachments && opts.attachments.length) body.attachments = opts.attachments.map(a => ({ name: a.name, mime_type: a.mime || 'application/pdf', content: a.b64 }));
  if (opts.cc) body.cc = [].concat(opts.cc).filter(String).map(e => ({ email_address: { address: e } }));
  if (opts.replyTo) body.reply_to = [{ address: opts.replyTo }];
  let status = 'sent', detail = '';
  try {
    if (!tok) throw new Error('ZEPTO_TOKEN not set');
    const res = UrlFetchApp.fetch('https://' + prop_('ZEPTO_HOST', 'api.zeptomail.in') + '/v1.1/email', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: /^Zoho-enczapikey/i.test(tok) ? tok : 'Zoho-enczapikey ' + tok, Accept: 'application/json' },
      payload: JSON.stringify(body),
    });
    if (res.getResponseCode() >= 300) { status = 'error'; detail = res.getContentText().slice(0, 300); }
  } catch (e) { status = 'error'; detail = String(e.message || e); }
  insert_('EmailLog', { ts: now_(), to: list.map(x => x.email_address.address).join(', '), subject: subject, status: status, detail: detail });
}
