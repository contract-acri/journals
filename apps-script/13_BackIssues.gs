/** Back issues: bring previously published articles (e.g. IJBMRS Vol. 1–2) into ACRI Journals,
 *  edit them, and register new Zenodo DOIs that keep the ORIGINAL publication date and link the
 *  previous DOI (DataCite relation IsIdenticalTo). */

function biPath_(j, id) { return 'content/articles/' + j + '/' + id; }

function bi_list(p, u) {
  need_(isAdmin_(u));
  const dir = gh_('get', '/contents/content/articles/' + p.journal + '?ref=' + prop_('GITHUB_BRANCH', 'main')) || [];
  let idx = [];
  try { idx = JSON.parse(UrlFetchApp.fetch(siteUrl_() + '/search/index.json', { muteHttpExceptions: true }).getContentText() || '[]'); } catch (e) { }
  const byId = {}; idx.forEach(a => { byId[(a.u.split('/fullarticle/')[1] || '').replace(/\/$/, '').toUpperCase()] = a; });
  const items = dir.filter(d => d.type === 'dir').map(d => { const a = byId[d.name] || {}; return { id: d.name, title: a.t || '', published: a.d || '', volume: a.v || '', issue: a.i || '', doi: a.doi || '', previousDoi: a.pd || '', live: !!a.t }; });
  items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return { ok: true, items: items };
}
function bi_get(p, u) {
  need_(isAdmin_(u));
  const raw = ghRead_(biPath_(p.journal, p.id) + '/article.json'); need_(raw, 'Article not found.');
  return { ok: true, article: JSON.parse(raw), body: ghRead_(biPath_(p.journal, p.id) + '/body.html') || '' };
}

/**
 * Save a back-issue article.
 *  - pdf (base64, optional): the original PDF, kept as the PDF of record.
 *  - docx (base64, optional): a Word version, converted to full-text HTML by the site build.
 *  At least one of these must exist for a new article.
 */
function bi_save(p, u) {
  need_(isAdmin_(u));
  const a = p.article || {};
  need_(/^[A-Z0-9]+-\d{4}-\d{3,}$/.test(a.id || ''), 'Article ID must look like IJBMRS-2025-001.');
  need_(a.journal && a.title && a.published, 'Journal, title and original publication date are required.');
  need_((a.authors || []).length, 'Add at least one author.');
  const base = biPath_(a.journal, a.id);
  const existing = ghRead_(base + '/article.json');
  const prev = existing ? JSON.parse(existing) : {};
  const art = Object.assign({}, prev, a, { status: 'published', legacy: true, references: a.references || prev.references || [], info: Object.assign({}, prev.info || {}, a.info || {}) });
  if (!art.license) art.license = 'CC-BY-4.0';
  const files = [];
  if (p.docx) {
    // Let the build convert the Word file; keep original PDF as PDF of record if supplied.
    const meta = Object.assign({}, art, { frozenPdf: !!(p.pdf || prev.legacyPdf || prev.frozenPdf), legacyPdf: false });
    files.push({ path: 'content/incoming/' + a.id + '/meta.json', text: JSON.stringify(meta, null, 2) });
    files.push({ path: 'content/incoming/' + a.id + '/manuscript.docx', bytes: Utilities.base64Decode(p.docx) });
    if (p.pdf) files.push({ path: 'content/incoming/' + a.id + '/article.pdf', bytes: Utilities.base64Decode(p.pdf) });
  } else {
    need_(p.pdf || existing, 'Upload the original PDF (or a Word file) for a new article.');
    if (p.pdf) {
      // With converted full text, the original PDF stays the PDF of record (frozen); otherwise it is the only full text.
      if (prev.ingestedAt) { art.frozenPdf = true; art.legacyPdf = false; } else { art.legacyPdf = true; }
      files.push({ path: base + '/article.pdf', bytes: Utilities.base64Decode(p.pdf) });
    }
    files.push({ path: base + '/article.json', text: JSON.stringify(art, null, 2) });
    if (!existing) files.push({ path: base + '/body.html', text: '' });
  }
  ghCommit_(files, (existing ? 'Back issue updated: ' : 'Back issue added: ') + a.id);
  return { ok: true, message: 'Saved. The article will be live in 2–4 minutes.' };
}

/** Bulk add from CSV text (same columns as legacy/ijbmrs-template.csv). PDFs are fetched from their URLs. */
function bi_bulk(p, u) {
  need_(isAdmin_(u));
  const rows = parseCsv_(p.csv || ''); need_(rows.length, 'No rows found. Include the header row.');
  const out = []; let batch = [];
  const flush = () => { if (batch.length) { ghCommit_(batch, 'Back issues: bulk import (' + batch.filter(f => /article.json$/.test(f.path)).length + ')'); batch = []; } };
  rows.forEach(r => {
    try {
      const journal = (r.journal || r.id.split('-')[0]).toLowerCase();
      const affMap = {};
      if (/\d=/.test(r.affiliations || '')) r.affiliations.split('|').forEach(s => { const i = s.indexOf('='); affMap[Number(s.slice(0, i).trim())] = s.slice(i + 1).trim(); });
      else if (r.affiliations) affMap[1] = r.affiliations;
      const authors = String(r.authors || '').split(';').map(s => s.trim()).filter(String).map((s, i) => {
        const m = s.match(/\[([\d,\s]+)\]/), affs = m ? m[1].split(',').map(Number) : (Object.keys(affMap).length ? [1] : []);
        const parts = s.replace(/\[.*?\]/, '').split(','), nm = parts[0].trim().split(/\s+/), family = nm.pop();
        return { given: nm.join(' '), family: family, degrees: (parts[1] || '').trim(), affiliations: affs, corresponding: i === 0 };
      });
      const art = { id: r.id, journal: journal, status: 'published', legacy: true, legacyPdf: true, type: r.type || 'Original Research', title: r.title, authors: authors,
        affiliations: Object.keys(affMap).map(k => ({ id: Number(k), name: affMap[k] })), abstract: r.abstract || '', keywords: (r.keywords || '').split(';').map(s => s.trim()).filter(String),
        published: r.published, volume: r.volume || '', issue: r.issue || '', firstPage: r.firstPage || '', lastPage: r.lastPage || '', doi: r.doi || '', license: r.license || 'CC-BY-4.0', references: [], info: {} };
      const base = biPath_(journal, r.id);
      batch.push({ path: base + '/article.json', text: JSON.stringify(art, null, 2) }, { path: base + '/body.html', text: '' });
      if (/^https?:/.test(r.pdf || '')) {
        const res = UrlFetchApp.fetch(r.pdf, { muteHttpExceptions: true, followRedirects: true });
        if (res.getResponseCode() === 200) batch.push({ path: base + '/article.pdf', bytes: res.getContent() });
        else throw new Error('PDF download failed (' + res.getResponseCode() + ')');
      }
      out.push({ id: r.id, ok: true });
      if (batch.length >= 15) flush();
    } catch (e) { out.push({ id: r.id, ok: false, error: String(e.message) }); }
  });
  flush();
  return { ok: true, results: out };
}
function parseCsv_(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const data = rows.filter(r => r.some(x => String(x).trim()));
  const h = (data.shift() || []).map(x => x.trim());
  return data.map(r => { const o = {}; h.forEach((k, i) => o[k] = String(r[i] || '').trim()); return o; });
}

/** Register a NEW DOI for a back-issue article on Zenodo, keeping the original publication date,
 *  and recording any previous DOI as an identical work. */
function bi_registerDoi(p, u) {
  need_(isAdmin_(u));
  const base = biPath_(p.journal, p.id);
  const a = JSON.parse(ghRead_(base + '/article.json') || 'null'); need_(a, 'Article not found.');
  const j = journalRow_(p.journal);
  need_(!a.zenodo || p.force, 'This article already has a Zenodo DOI (' + a.doi + ').');
  const url = siteUrl_() + '/journals/' + a.journal + '/fullarticle/' + a.id.toLowerCase() + '/';
  const pdfUrl = siteUrl_() + '/journals/' + a.journal + '/articlepdf/' + a.id.toLowerCase() + '.pdf';
  const pdf = UrlFetchApp.fetch(pdfUrl, { muteHttpExceptions: true });
  need_(pdf.getResponseCode() === 200, 'The article PDF is not live yet (' + pdfUrl + '). Wait for the build and try again.');
  const old = a.previousDoi || a.doi || '';
  const abs = typeof a.abstract === 'string' ? '<p>' + a.abstract + '</p>' : abstractHtml_({ abstract: a.abstract });
  const rel = [{ identifier: url, relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'url' }];
  if (old) rel.push({ identifier: old, relation: 'isIdenticalTo', resource_type: 'publication-article', scheme: 'doi' });
  const meta = {
    upload_type: 'publication', publication_type: 'article', title: a.title + (a.subtitle ? ': ' + a.subtitle : ''),
    creators: (a.authors || []).map(x => { const c = { name: x.family + ', ' + x.given }; const af = (x.affiliations || []).map(id => ((a.affiliations || []).find(f => f.id === id) || {}).name).filter(String)[0]; if (af) c.affiliation = af; if (x.orcid) c.orcid = x.orcid; return c; }),
    description: abs || a.title, publication_date: a.published, access_right: 'open', license: String(a.license || 'CC-BY-4.0').toLowerCase(),
    keywords: a.keywords || [], journal_title: j.name, journal_volume: String(a.volume || ''), journal_issue: String(a.issue || ''),
    journal_pages: a.firstPage ? a.firstPage + (a.lastPage ? '-' + a.lastPage : '') : (a.elocator || ''), related_identifiers: rel,
    notes: 'Originally published ' + a.published + ' in ' + j.name + (old ? ' (DOI ' + old + ')' : '') + '. Archived by ACRI Journals.',
  };
  const comm = prop_('ZENODO_COMMUNITY', ''); if (comm) meta.communities = [{ identifier: comm }];
  let dep = zen_('post', '/deposit/depositions', { metadata: meta });
  zen_('put', dep.links.bucket + '/' + a.id + '.pdf', null, pdf.getContent());
  dep = zen_('post', '/deposit/depositions/' + dep.id + '/actions/publish');
  if (p.makePrimary !== false) { if (old && old !== dep.doi) a.previousDoi = old; a.doi = dep.doi; }
  else a.additionalDoi = dep.doi;
  a.zenodo = String(dep.id); a.originalPublished = a.originalPublished || a.published;
  ghCommit_([{ path: base + '/article.json', text: JSON.stringify(a, null, 2) }], 'DOI registered: ' + a.id + ' → ' + dep.doi);
  return { ok: true, doi: dep.doi, previousDoi: a.previousDoi || '', url: (dep.links && (dep.links.record_html || dep.links.html)) || '' };
}
