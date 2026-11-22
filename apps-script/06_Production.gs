/** Production: send to GitHub → automatic conversion → proofs → publish → Zenodo DOI registration. */

function artPath_(s) { return 'content/articles/' + s.journal + '/' + s.id; }

/** Build the article metadata the converter needs (everything except the body). */
function articleMeta_(s) {
  const d = s.declarations || {};
  return {
    id: s.id, journal: s.journal, type: s.type, subject: s.subject || [], title: s.title, subtitle: s.subtitle || undefined,
    authors: (s.authors || []).map(a => ({ given: a.given, family: a.family, degrees: a.degrees || '', orcid: a.orcid || '', email: a.corresponding ? a.email : undefined, affiliations: a.affiliations || [], corresponding: !!a.corresponding })),
    affiliations: s.affiliations || [], abstract: tryJson_(s.abstract) || undefined, keywords: s.keywords || [],
    received: (s.submittedAt || '').slice(0, 10), accepted: s.acceptedAt || '', doi: s.doi || '', zenodo: s.zenodoId || '',
    volume: s.volume || '', issue: s.issue || '', license: d.licenseType || 'CC-BY-4.0', previewToken: s.previewToken,
    info: { contributions: d.contributions || '', conflicts: d.conflicts || 'None reported.', funding: d.funding || 'None reported.', ethics: d.ethicsStatement || '', dataSharing: d.dataSharing || '', aiUse: d.aiUse || '', acknowledgments: d.acknowledgments || '' },
  };
}

function prod_send(p, u) {
  need_(isAdmin_(u), 'Production is handled by the editorial office.');
  const s = sub_(p.id); need_(['accepted', 'production', 'proof'].indexOf(s.status) >= 0, 'Only accepted manuscripts can go to production.');
  const files = where_('Files', f => f.subId === s.id && String(f.active) !== 'false');
  const ms = files.filter(f => f.kind === 'final').pop() || files.filter(f => f.kind === 'manuscript').pop();
  need_(ms && /\.docx$/i.test(ms.name), 'No final .docx manuscript found.');
  const figs = files.filter(f => f.kind === 'final_figure');
  const useFigs = figs.length ? figs : files.filter(f => f.kind === 'figure' && String(f.version) === String(s.version));
  const token = s.previewToken || token_().slice(0, 24).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  s.previewToken = token;
  const meta = Object.assign(articleMeta_(s), p.meta || {});
  const base = 'content/incoming/' + s.id + '/';
  const commit = [
    { path: base + 'meta.json', text: JSON.stringify(meta, null, 2) },
    { path: base + 'manuscript.docx', bytes: DriveApp.getFileById(ms.driveId).getBlob().getBytes() },
  ].concat(useFigs.map(f => ({ path: base + 'figures/' + f.name, bytes: DriveApp.getFileById(f.driveId).getBlob().getBytes() })));
  ghCommit_(commit, 'Production: ' + s.id + ' (' + s.title.slice(0, 60) + ')');
  update_('Submissions', 'id', s.id, { status: 'production', previewToken: token, updated: now_() });
  log_(s.id, u.id, 'sent_to_production', ms.name + ', ' + useFigs.length + ' figures', true);
  return { ok: true, message: 'Sent. The site will build the proof in about 2–4 minutes.' };
}

/** Called by the portal (and a 10-minute trigger): when the converted article exists in the repo, notify the author. */
function prod_check(p, u) {
  if (u) need_(isAdmin_(u), 'Not allowed.');
  const list = p && p.id ? [sub_(p.id)] : where_('Submissions', s => s.status === 'production');
  const out = [];
  list.forEach(s => {
    if (s.status !== 'production') return;
    const a = ghRead_(artPath_(s) + '/article.json');
    if (!a) { out.push({ id: s.id, ready: false }); return; }
    // Make sure the proof page is live before emailing.
    const live = UrlFetchApp.fetch(siteUrl_() + '/proofs/' + s.previewToken + '/', { muteHttpExceptions: true, followRedirects: true }).getResponseCode() === 200;
    if (!live) { out.push({ id: s.id, ready: false, building: true }); return; }
    update_('Submissions', 'id', s.id, { status: 'proof', updated: now_() });
    log_(s.id, 'system', 'proof_ready', 'Proofs sent to author', true);
    const sm = submitter_(s);
    mailTemplate_('proof', authorEmails_(s), { name: sm ? sm.given : '', id: s.id, title: s.title, link: link_(s.id) }, { journal: s.journal });
    out.push({ id: s.id, ready: true });
  });
  return { ok: true, items: out, build: u ? ghLatestRun_() : null };
}
function productionTick() { try { prod_check({}, null); } catch (e) { console.error(e); } }

/** Read / edit the converted article directly (fix a typo, a caption, an affiliation). */
function prod_source(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id);
  return { ok: true, article: ghRead_(artPath_(s) + '/article.json'), body: ghRead_(artPath_(s) + '/body.html') };
}
function prod_saveSource(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id);
  JSON.parse(p.article); // validate
  ghCommit_([{ path: artPath_(s) + '/article.json', text: p.article }, { path: artPath_(s) + '/body.html', text: p.body }], 'Edit: ' + s.id);
  log_(s.id, u.id, 'source_edited', p.note || 'Article source edited');
  return { ok: true };
}

function prod_publish(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(['proof', 'proof_approved'].indexOf(s.status) >= 0 || p.force, 'Publish after the author has approved the proofs.');
  const raw = ghRead_(artPath_(s) + '/article.json'); need_(raw, 'Converted article not found in the repository.');
  const a = JSON.parse(raw);
  a.status = 'published';
  a.published = p.published || today_();
  a.volume = String(p.volume || ''); a.issue = String(p.issue || '');
  if (p.elocator) a.elocator = p.elocator;
  if (p.featured !== undefined) a.featured = !!p.featured;
  a.doi = s.doi || a.doi || ''; a.zenodo = s.zenodoId || a.zenodo || '';
  delete a.previewToken;
  ghCommit_([{ path: artPath_(s) + '/article.json', text: JSON.stringify(a, null, 2) }], 'Publish: ' + s.id);
  update_('Submissions', 'id', s.id, { status: 'published', published: a.published, volume: a.volume, issue: a.issue, updated: now_() });
  log_(s.id, u.id, 'published', 'Published ' + a.published + (a.volume ? ' in Vol ' + a.volume + '(' + a.issue + ')' : ' (New Online)'), true);
  const sm = submitter_(s), j = journalRow_(s.journal);
  mailTemplate_('published', authorEmails_(s), { name: sm ? sm.given : '', title: s.title, journal: j.name, doi: s.doi, url: articleUrl_(s) }, { journal: s.journal });
  try { onArticlePublished_(s); } catch (e) { console.error(e); }
  return { ok: true, message: 'Published. The article will be live in about 2–4 minutes. Then register the DOI.' };
}

function prod_registerDoi(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(s.status === 'published', 'Publish the article first.');
  const sub = Object.assign({}, s, { abstract: tryJson_(s.abstract) });
  const r = zenodoRegister_(sub, journalRow_(s.journal));
  update_('Submissions', 'id', s.id, { doi: r.doi || s.doi, flags: Object.assign({}, s.flags || {}, { doiRegistered: true, zenodoUrl: r.url }) });
  log_(s.id, u.id, 'doi_registered', (r.doi || s.doi) + ' ' + r.url);
  return { ok: true, doi: r.doi, url: r.url };
}
function prod_reserveDoi(p, u) {
  need_(isAdmin_(u), 'Not allowed.');
  const s = sub_(p.id); need_(!s.zenodoId, 'A DOI is already reserved: ' + s.doi);
  const z = zenodoReserve_(Object.assign({}, s, { abstract: tryJson_(s.abstract) }), journalRow_(s.journal));
  update_('Submissions', 'id', s.id, { zenodoId: z.id, doi: z.doi });
  log_(s.id, u.id, 'doi_reserved', z.doi);
  return { ok: true, doi: z.doi };
}
