// ACRI Journals — static site build.
// Reads /content, writes a complete static website to /dist that Cloudflare Pages serves.
// Every article page is plain HTML with Google Scholar (Highwire) meta tags, JSON-LD and
// Dublin Core, so indexers and reference managers see everything without running JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, CONTENT, DIST, readJSON, readText, write, copyDir, hash, esc, strip,
  fmtDate, fmtMonthYear, year, slashDate, fullName, nameWithDegrees, authorsShort, authorsTiny,
  citations, abstractText, elocator, loc, doiUrl, MARK, WORDMARK, ORCID, journalLogoSVG, CCBY, ICON,
} from './lib.mjs';
import { policies, POLICY_GROUPS } from './policies.mjs';

const site = readJSON(path.join(ROOT, 'config/site.json'));
const BASE = site.url.replace(/\/$/, '');
const ASSET_V = hash(readText(path.join(ROOT, 'site/assets/css/acrij.css')) + readText(path.join(ROOT, 'site/assets/js/acrij.js')));

// ---------------------------------------------------------------- load content
const journals = fs.readdirSync(path.join(CONTENT, 'journals'))
  .map(s => readJSON(path.join(CONTENT, 'journals', s, 'journal.json')))
  .filter(j => j && j.active !== false)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.code.localeCompare(b.code));
const J = Object.fromEntries(journals.map(j => [j.slug, j]));
for (const j of journals) {
  j.issues = readJSON(path.join(CONTENT, 'journals', j.slug, 'issues.json'), []);
  const d = path.join(CONTENT, 'journals', j.slug), has = (f) => fs.existsSync(path.join(d, f));
  // Journal logos: uploaded PNG/SVG files win; otherwise the build generates the house-style emblem.
  j.logo = { full: has('logo.png') ? 'logo.png' : 'logo.svg', mark: has('mark.png') ? 'mark.png' : 'mark.svg', fullWhite: has('logo-white.png') ? 'logo-white.png' : 'logo-white.svg', markWhite: has('mark-white.png') ? 'mark-white.png' : 'mark-white.svg', generated: !has('logo.png') };
  j.logoBase = `/assets/journals/${j.slug}/`;
  j.issnOnline = j.issnOnline ?? j.issn; j.issnPrint = j.issnPrint || '';
}
const jimg = (j, k, cls = '', alt) => `<img src="${j.logoBase}${j.logo[k]}" alt="${esc(alt ?? j.name + ' logo')}" class="${cls}">`;
const fullLogo = (j, white) => j.logo.generated ? journalLogoSVG(j, white ? { color: '#fff' } : {}) : jimg(j, white ? 'fullWhite' : 'full', 'jfull');
const MINIWM = `<span class="miniwm"><b>ACRI</b><i></i><span>JOURNALS</span></span>`;
const pubInfo = () => ({ name: site.publisherName || site.legalEntity || site.publisher, address: site.publisherAddress || '', phone: site.publisherPhone || '', web: site.publisherWebsite || '' });

const articles = [];
for (const js of fs.existsSync(path.join(CONTENT, 'articles')) ? fs.readdirSync(path.join(CONTENT, 'articles')) : []) {
  if (!J[js]) continue;
  for (const id of fs.readdirSync(path.join(CONTENT, 'articles', js))) {
    const dir = path.join(CONTENT, 'articles', js, id);
    const a = readJSON(path.join(dir, 'article.json'));
    if (!a) continue;
    if (a.status !== 'published' && a.status !== 'proof') continue;
    a.dir = dir; a.journal = js; a.j = J[js];
    a.body = readText(path.join(dir, 'body.html'));
    a.slug = a.id.toLowerCase();
    a.proof = a.status === 'proof';
    const tok = a.previewToken || hash('proof:' + a.id);
    a.path = a.proof ? `/proofs/${tok}/` : `/journals/${js}/fullarticle/${a.slug}/`;
    a.url = BASE + a.path;
    a.pdfPath = a.proof ? `/proofs/${tok}/${a.slug}.pdf` : `/journals/${js}/articlepdf/${a.slug}.pdf`;
    a.pdfUrl = BASE + a.pdfPath;
    a.proof = a.status === 'proof';
    articles.push(a);
  }
}
articles.sort((a, b) => (b.published || '').localeCompare(a.published || '') || b.id.localeCompare(a.id));
const pub = articles.filter(a => !a.proof);
const byJournal = (slug) => pub.filter(a => a.journal === slug);

// ---------------------------------------------------------------- layout
const journalsMenu = () => journals.map(j => `<a href="/journals/${j.slug}/">${jimg(j, 'mark', 'mm', '')}<span><b>${esc(j.name)}</b><small>${esc(j.code)}${j.issn ? ' · ISSN ' + esc(j.issn) : ''}</small></span></a>`).join('');

function layout({ title, desc = site.description, canonical, head = '', body, j = null, noindex = false, bodyClass = '' }) {
  const accent = j ? `<style>:root{--accent:${j.accent};--accent-tint:${j.accentTint || '#F3F5F8'}}</style>` : '';
  const fullTitle = title ? `${title} | ${j ? j.code + ' | ' : ''}${site.name}` : `${site.name} — ${site.tagline}`;
  return `<!doctype html>
<html lang="${site.language}" data-api="${esc(site.apiUrl)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(strip(desc).slice(0, 300))}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml"><link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/Lora.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/assets/fonts/Inter-Regular.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/assets/css/acrij.css?v=${ASSET_V}">
<link rel="alternate" type="application/rss+xml" title="${esc(j ? j.name : site.name)}" href="${j ? `/journals/${j.slug}/rss.xml` : '/rss.xml'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(strip(desc).slice(0, 300))}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:image" content="${BASE}/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
${accent}
${head}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to main content</a>
<div class="util"><div class="wrap">
  <nav class="l"><a href="https://www.acriverse.acriindia.org">Part of ACRIVERSE</a></nav>
  <nav><a href="/for-authors/">For Authors</a><a href="/for-reviewers/">For Reviewers</a><a href="/portal/">Sign in</a></nav>
</div></div>
<header class="hdr" id="hdr"><div class="wrap">
  <a class="brand" href="/" aria-label="${esc(site.name)} home">${WORDMARK}</a>
  <nav class="mainnav" aria-label="Main">
    <div class="dd"><button aria-haspopup="true">Journals ▾</button><div class="dd-menu">${journalsMenu()}</div></div>
    <a href="/online-first/">Just Published</a>
    <a href="/for-authors/">For Authors</a>
    <a href="/about/">About</a>
  </nav>
  <form class="hsearch" action="/search/" role="search"><input name="q" placeholder="Search ACRI Journals" aria-label="Search"><button aria-label="Search">${ICON.search}</button></form>
  <button class="menu-tg" aria-label="Menu" onclick="document.getElementById('hdr').classList.toggle('open')">☰</button>
</div></header>
${j ? journalMast(j) : ''}
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/js/acrij.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

let currentTab = '';
function journalMast(j) {
  const t = (k, href, label) => `<a href="${href}"${currentTab === k ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
  return `<div class="jmast"><div class="wrap">
  <div class="top">
    <a class="jmark" href="/journals/${j.slug}/">${jimg(j, 'mark')}</a>
    <div><div class="cob">An ${MINIWM} publication</div><h1><a href="/journals/${j.slug}/">${esc(j.name)}</a></h1>
    <div class="sub">${j.issnOnline ? `e-ISSN ${esc(j.issnOnline)} · ` : ''}${j.issnPrint ? `p-ISSN ${esc(j.issnPrint)} · ` : ''}${esc(j.frequency || '')} · Open access · Since ${esc(j.startYear || j.since || '')}</div></div>
    <div class="cta"><a class="btn btn-ghost" href="/journals/${j.slug}/for-authors/">Author guidelines</a><a class="btn btn-accent" href="/portal/#/submit?journal=${j.slug}">Submit manuscript</a></div>
  </div>
  <nav class="jtabs" aria-label="${esc(j.code)}">
    ${t('home', `/journals/${j.slug}/`, 'Home')}
    ${t('online', `/journals/${j.slug}/online-first/`, 'New Online')}
    ${t('current', `/journals/${j.slug}/currentissue/`, 'Current Issue')}
    ${t('archive', `/journals/${j.slug}/archive/`, 'All Issues')}
    ${t('board', `/journals/${j.slug}/editorial-board/`, 'Editorial Board')}
    ${t('authors', `/journals/${j.slug}/for-authors/`, 'For Authors')}
    ${t('about', `/journals/${j.slug}/about/`, 'About')}
  </nav>
</div><div class="jbar"></div></div>`;
}

function footer() {
  return `<footer class="ftr"><div class="wrap">
  <div class="cols5">
    <div><a class="brand" href="/" aria-label="ACRI Journals">${WORDMARK}</a>
      <p style="margin:16px 0 0;max-width:320px">${esc(site.description)}</p></div>
    <div><h5>Journals</h5>${journals.map(j => `<a href="/journals/${j.slug}/">${esc(j.code)}</a>`).join('')}</div>
    <div><h5>Publish</h5><a href="/for-authors/">For Authors</a><a href="/for-authors/#template">Manuscript template</a><a href="/portal/#/submit">Submit a manuscript</a><a href="/for-reviewers/">For Reviewers</a></div>
    <div><h5>Policies</h5><a href="/policies/privacy/">Privacy</a><a href="/policies/terms/">Terms of use</a><a href="/policies/open-access/">Open access</a><a href="/policies/peer-review/">Peer review</a><a href="/policies/ethics/">Publication ethics</a><a href="/policies/">All policies →</a></div>
    <div><h5>Network</h5><a href="/about/">About ACRI Journals</a><a href="/partners/">Partners</a><a href="/search/">Search</a><a href="/rss.xml">RSS</a><a href="/contact/">Contact</a><a href="/portal/">Sign in</a><a href="https://www.acriverse.acriindia.org">ACRIVERSE</a></div>
  </div>
  <div class="legal"><span>© ${new Date().getFullYear()} ACRI Journals · Part of ACRIVERSE. Website © ${esc(pubInfo().name)}; articles © their authors, open access under the licence stated on each article. Published by ${esc(pubInfo().name)}${pubInfo().address ? ', ' + esc(pubInfo().address) : ''}.</span><span><a href="/policies/privacy/">Privacy</a> · <a href="/policies/terms/">Terms</a> · <a href="/policies/">All policies</a> · <a href="/about/#contact">Contact</a></span></div>
</div></footer>`;
}

// ---------------------------------------------------------------- journal particulars (ISSN India / DOAJ format)
function particulars(j) {
  const P = pubInfo(), row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `<dl>${row('Title', esc(j.name))}${row('Abbreviation', esc(j.abbrev))}${row('e-ISSN', esc(j.issnOnline))}${row('p-ISSN', esc(j.issnPrint))}
    ${row('Frequency', esc(j.frequency))}${row('Starting year', esc(j.startYear || j.since))}${row('Subject', esc(j.subjectArea || (j.subjects || []).slice(0, 3).join(', ')))}
    ${row('Language', esc((j.languages || ['English']).join(', ')))}${row('Format', esc((j.formats || ['Online']).join(', ')))}${row('Access', 'Open access (CC BY 4.0)')}
    ${row('Peer review', 'Double-blind, at least two external reviewers')}${row('Publisher', esc(P.name))}${row('Publisher address', esc(P.address))}
    ${row('Journal office', `<a href="mailto:${esc(j.officeEmail || site.officeEmail)}">${esc(j.officeEmail || site.officeEmail)}</a>`)}${row('Editors', `<a href="mailto:${esc(j.editorEmail || site.editorsEmail)}">${esc(j.editorEmail || site.editorsEmail)}</a>`)}${row('Contact form', `<a href="/contact/?journal=${j.slug}">Write to the office or Editor-in-Chief</a>`)}${row('Phone', esc(P.phone))}${row('Website', `<a href="${BASE}/journals/${j.slug}/">${BASE.replace('https://', '')}/journals/${j.slug}/</a>`)}</dl>`;
}

// ---------------------------------------------------------------- shared bits
function snippet(a, n) {
  const ab = a.abstract; let t = typeof ab === 'string' ? strip(ab) : (ab?.sections || []).map(s => strip(s.text)).join(' ');
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}
const typeLine = (a) => `<span class="atype">${esc(a.type || 'Article')}</span>${a.subject?.length ? `<span class="meta"> ${esc(a.subject[0])}</span>` : ''}`;
const itemCard = (a, showJ = true) => `<a class="item" href="${a.path}">${typeLine(a)}<h3>${a.title}</h3><div class="au">${esc(authorsTiny(a.authors))}</div>${showJ ? `<div class="jn">${esc(a.j.code)} · ${fmtDate(a.published)}</div>` : `<div class="jn">${fmtDate(a.published)}</div>`}</a>`;

function tocItem(a) {
  return `<div class="toc-item"><div>${typeLine(a)} <span class="badge oa">Open access</span>
  <h3><a href="${a.path}">${a.title}</a></h3>
  <div class="meta">${esc(authorsShort(a.authors))}</div>
  <div class="meta" style="margin-top:4px">${esc(a.j.abbrev)}. ${year(a.published)};${a.volume || ''}${a.issue ? `(${a.issue})` : ''}:${loc(a)}${a.doi ? ` · doi:${esc(a.doi)}` : ''}</div></div>
  <div class="acts"><a class="chip" href="${a.path}">Full text</a><a class="chip" href="${a.pdfPath}">${ICON.pdf.replace('<svg', '<svg width="13" height="13"')} PDF</a></div></div>`;
}

function coverArt(seed, accent) {
  // Deterministic abstract art for features (no stock imagery required).
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (n) => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
  const shapes = Array.from({ length: 7 }, (_, i) => `<circle cx="${r(800)}" cy="${r(420)}" r="${60 + r(180)}" fill="none" stroke="rgba(255,255,255,${(0.05 + i * 0.015).toFixed(3)})" stroke-width="${10 + r(40)}"/>`).join('');
  const lines = Array.from({ length: 14 }, (_, i) => `<rect x="${520 + (i % 7) * 34}" y="${80 + Math.floor(i / 7) * 150 + r(40)}" width="18" height="${40 + r(110)}" rx="3" fill="rgba(255,255,255,${0.08 + (i % 4) * 0.05})"/>`).join('');
  return `<svg viewBox="0 0 800 410" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g${h % 999}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#0B2545"/></linearGradient></defs><rect width="800" height="410" fill="url(#g${h % 999})"/>${shapes}${lines}</svg>`;
}

// ---------------------------------------------------------------- article page
function scholarMeta(a) {
  const j = a.j, m = [];
  const add = (n, v) => { if (v !== undefined && v !== null && String(v) !== '') m.push(`<meta name="${n}" content="${esc(v)}">`); };
  add('citation_title', strip(a.title) + (a.subtitle ? ': ' + strip(a.subtitle) : ''));
  for (const au of a.authors || []) {
    add('citation_author', `${au.family}, ${au.given}`);
    for (const id of au.affiliations || []) add('citation_author_institution', (a.affiliations || []).find(x => x.id === id)?.name);
    if (au.email && au.corresponding) add('citation_author_email', au.email);
    if (au.orcid) add('citation_author_orcid', `https://orcid.org/${au.orcid}`);
  }
  add('citation_publication_date', slashDate(a.published));
  add('citation_online_date', slashDate(a.published));
  add('citation_journal_title', j.name);
  add('citation_journal_abbrev', j.abbrev);
  add('citation_issn', j.issn);
  add('citation_publisher', site.publisher);
  add('citation_volume', a.volume);
  add('citation_issue', a.issue);
  add('citation_firstpage', a.firstPage || elocator(a));
  if (a.lastPage) add('citation_lastpage', a.lastPage);
  add('citation_doi', a.doi);
  add('citation_language', a.language || site.language);
  add('citation_abstract_html_url', a.url);
  add('citation_fulltext_html_url', a.url);
  add('citation_pdf_url', a.pdfUrl);
  add('citation_article_type', a.type);
  if (a.keywords?.length) add('citation_keywords', a.keywords.join('; '));
  for (const r of a.references || []) add('citation_reference', strip(r.text).slice(0, 500));
  // Dublin Core (used by some indexers) + PRISM
  add('dc.title', strip(a.title)); for (const au of a.authors || []) add('dc.creator', fullName(au));
  add('dc.date', a.published); add('dc.identifier', a.doi ? 'doi:' + a.doi : a.url);
  add('dc.publisher', site.publisher); add('dc.type', 'Text.Serial.Journal'); add('dc.rights', a.license || site.defaultLicense);
  add('prism.publicationName', j.name); add('prism.issn', j.issn); add('prism.volume', a.volume); add('prism.number', a.issue); add('prism.doi', a.doi);
  m.push(`<meta property="og:type" content="article">`);
  m.push(`<meta property="article:published_time" content="${esc(a.published)}">`);
  const ld = {
    '@context': 'https://schema.org', '@type': 'ScholarlyArticle',
    headline: strip(a.title).slice(0, 110), name: strip(a.title), datePublished: a.published,
    author: (a.authors || []).map(x => ({ '@type': 'Person', name: fullName(x), ...(x.orcid ? { identifier: `https://orcid.org/${x.orcid}` } : {}), affiliation: (x.affiliations || []).map(id => ({ '@type': 'Organization', name: (a.affiliations || []).find(f => f.id === id)?.name })) })),
    publisher: { '@type': 'Organization', name: site.publisher, url: site.publisherUrl },
    isPartOf: { '@type': 'PublicationIssue', issueNumber: a.issue, isPartOf: { '@type': 'PublicationVolume', volumeNumber: a.volume, isPartOf: { '@type': 'Periodical', name: j.name, issn: j.issn || undefined } } },
    abstract: abstractText(a), keywords: (a.keywords || []).join(', '), url: a.url, inLanguage: a.language || site.language,
    ...(a.doi ? { sameAs: doiUrl(a), identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: a.doi } } : {}),
    license: licenseUrl(a), isAccessibleForFree: true,
  };
  m.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return m.join('\n');
}
const LICENSES = {
  'CC-BY-4.0': ['Creative Commons Attribution 4.0 International (CC BY 4.0)', 'https://creativecommons.org/licenses/by/4.0/'],
  'CC-BY-NC-4.0': ['Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)', 'https://creativecommons.org/licenses/by-nc/4.0/'],
  'CC-BY-NC-ND-4.0': ['Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 (CC BY-NC-ND 4.0)', 'https://creativecommons.org/licenses/by-nc-nd/4.0/'],
};
const licenseUrl = (a) => (LICENSES[a.license || site.defaultLicense] || LICENSES['CC-BY-4.0'])[1];
const licenseName = (a) => (LICENSES[a.license || site.defaultLicense] || LICENSES['CC-BY-4.0'])[0];

function authorsBlock(a) {
  const affIndex = new Map((a.affiliations || []).map((f, i) => [f.id, i + 1]));
  const list = (a.authors || []).map(au => {
    const sups = (au.affiliations || []).map(id => affIndex.get(id)).filter(Boolean).join(',');
    return `<span class="au">${esc(nameWithDegrees(au))}${sups ? `<sup>${sups}</sup>` : ''}${au.corresponding ? '<sup title="Corresponding author">*</sup>' : ''}${au.orcid ? `<a href="https://orcid.org/${esc(au.orcid)}" title="ORCID ${esc(au.orcid)}">${ORCID}</a>` : ''}</span>`;
  }).join('; ');
  const affs = (a.affiliations || []).map((f, i) => `<li value="${i + 1}">${esc(f.name)}</li>`).join('');
  return { list, affs };
}

function abstractBlock(a) {
  if (!a.abstract) return '';
  if (typeof a.abstract === 'string') return `<p>${a.abstract}</p>`;
  return (a.abstract.sections || []).map(s => `<p>${s.heading ? `<span class="ah">${esc(s.heading)}</span> ` : ''}${s.text}</p>`).join('');
}

const EDITOR_ONLY = ['Editorial', 'Book Review', 'Correction', 'Retraction', 'Erratum'];
function peerReviewOf(a) { return a.peerReview || (EDITOR_ONLY.includes(a.type) ? 'Not externally peer reviewed (editorial review only)' : 'Double-blind peer review'); }
function articleInfo(a) {
  const i = a.info || {};
  const corr = (a.authors || []).find(x => x.corresponding);
  const corrAff = corr ? (a.affiliations || []).find(f => f.id === (corr.affiliations || [])[0])?.name : '';
  const rows = [
    a.received && `<p><b>Received:</b> ${fmtDate(a.received)}${a.revised ? `; <b>Revised:</b> ${fmtDate(a.revised)}` : ''}</p>`,
    a.accepted && `<p><b>Accepted for Publication:</b> ${fmtDate(a.accepted)}</p>`,
    `<p><b>Published:</b> ${fmtDate(a.published)}.${a.doi ? ` doi:${esc(a.doi)}` : ''}</p>`,
    `<p><b>Open Access:</b> This is an open access article distributed under the terms of the <a href="${licenseUrl(a)}" rel="license">${licenseName(a)}</a> licence. © ${year(a.published)} ${esc(a.authors?.[0]?.family || '')}${a.authors?.length > 1 ? ' et al' : ''}. ${esc(a.j.name)}.</p>`,
    corr && `<p><b>Corresponding Author:</b> ${esc(nameWithDegrees(corr))}${corrAff ? ', ' + esc(corrAff) : ''}${corr.email ? ` (<a href="mailto:${esc(corr.email)}">${esc(corr.email)}</a>)` : ''}.</p>`,
    i.contributions && `<p><b>Author Contributions:</b> ${i.contributions}</p>`,
    `<p><b>Conflict of Interest Disclosures:</b> ${i.conflicts || 'None reported.'}</p>`,
    `<p><b>Funding/Support:</b> ${i.funding || 'None reported.'}</p>`,
    `<p><b>Peer Review:</b> ${esc(peerReviewOf(a))}.</p>`,
    i.ethics && `<p><b>Ethics Approval:</b> ${i.ethics}</p>`,
    i.consent && `<p><b>Consent for Publication:</b> ${i.consent}</p>`,
    i.dataSharing && `<p><b>Data Sharing Statement:</b> ${i.dataSharing}</p>`,
    i.aiUse && `<p><b>Use of AI Tools:</b> ${i.aiUse}</p>`,
    i.acknowledgments && `<p><b>Additional Contributions:</b> ${i.acknowledgments}</p>`,
    a.previousDoi && `<p><b>Originally published:</b> ${fmtDate(a.originalPublished || a.published)}${a.originalVenue ? ' in ' + esc(a.originalVenue) : ''}. Original DOI: <a href="https://doi.org/${esc(a.previousDoi)}">${esc(a.previousDoi)}</a>.</p>`,
    a.zenodo && `<p><b>Archived copy:</b> <a href="https://zenodo.org/records/${esc(a.zenodo)}">Zenodo record ${esc(a.zenodo)}</a></p>`,
  ].filter(Boolean).join('');
  return rows;
}

function refsBlock(a) {
  if (!a.references?.length) return '';
  return `<section class="refs" id="references"><h2>References</h2><ol>${a.references.map((r, i) => {
    const q = encodeURIComponent(strip(r.text).slice(0, 250));
    return `<li id="ref-${i + 1}">${r.text}<span class="rl">${r.doi ? `<a href="https://doi.org/${esc(r.doi)}" rel="nofollow">Crossref</a>` : ''}<a href="https://scholar.google.com/scholar?q=${q}" rel="nofollow">Google Scholar</a></span></li>`;
  }).join('')}</ol></section>`;
}

function sectionsNav(a) {
  const ids = [];
  if (a.keyPoints) ids.push(['key-points', 'Key Points']);
  if (a.abstract) ids.push(['abstract', 'Abstract']);
  const re = /<h2[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g; let m;
  while ((m = re.exec(a.body))) ids.push([m[1], strip(m[2])]);
  ids.push(['article-information', 'Article Information']);
  if (a.references?.length) ids.push(['references', 'References']);
  return ids.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('');
}

function articlePage(a) {
  const j = a.j; currentTab = '';
  const { list, affs } = authorsBlock(a);
  const cites = citations(a, j, site, a.url);
  const related = byJournal(a.journal).filter(x => x.id !== a.id).slice(0, 4);
  const kp = a.keyPoints ? `<section class="kp" id="key-points"><h2>Key Points</h2>${a.keyPoints.question ? `<p><b>Question</b> ${a.keyPoints.question}</p>` : ''}${a.keyPoints.findings ? `<p><b>Findings</b> ${a.keyPoints.findings}</p>` : ''}${a.keyPoints.meaning ? `<p><b>Meaning</b> ${a.keyPoints.meaning}</p>` : ''}</section>` : '';
  const legacy = a.legacyPdf && !a.body.trim() ? `<div class="kp" style="border-top-color:var(--navy);background:var(--soft)"><p style="font-family:var(--sans)">The full text of this article is available as a PDF.</p><a class="btn btn-accent" href="${a.pdfPath}">${ICON.pdf.replace('<svg', '<svg width="16" height="16"')} Download full-text PDF</a></div>` : '';
  const pubLine = `<b>Published Online:</b> ${fmtDate(a.published)} · <i>${esc(j.abbrev)}</i>. ${year(a.published)};${a.volume || ''}${a.issue ? `(${a.issue})` : ''}:${loc(a)}${a.doi ? ` · <a href="${doiUrl(a)}">doi:${esc(a.doi)}</a>` : ''}`;
  const body = `
${a.proof ? '<div style="background:#FFF4D6;border-bottom:1px solid #F1D27A;padding:10px 0;font-size:14px"><div class="wrap"><b>Proof preview.</b> This page is not public and is not indexed. Check the text, figures and PDF, then approve in the portal.</div></div>' : ''}
<div class="wrap art-wrap">
  <aside class="art-nav" aria-label="Sections"><h4>Sections</h4><nav class="side-nav" id="secnav">${sectionsNav(a)}</nav>
    <a class="btn btn-accent pdfbtn" href="${a.pdfPath}">${ICON.pdf.replace('<svg', '<svg width="16" height="16"')} Download PDF</a></aside>
  <article>
    <div class="crumbs"><a href="/">Home</a> › <a href="/journals/${j.slug}/">${esc(j.code)}</a>${a.volume ? ` › <a href="/journals/${j.slug}/issue/${a.volume}/${a.issue}/">Vol. ${esc(a.volume)}, No. ${esc(a.issue)}</a>` : ' › New Online'}</div>
    <header class="art-head">
      ${typeLine(a)} <span class="badge oa">Open access</span>
      <h1>${a.title}</h1>
      ${a.subtitle ? `<p class="subtitle">${a.subtitle}</p>` : ''}
      <div class="authors">${list}</div>
      <details class="disclose"><summary>Author Affiliations</summary><ol>${affs}</ol></details>
      <div class="publine">${pubLine}</div>
      <div class="actbar">
        <a class="chip" href="${a.pdfPath}">${ICON.pdf} PDF</a>
        <button class="chip" data-open="cite">${ICON.cite} Cite this</button>
        <button class="chip" data-share>${ICON.share} Share</button>
        ${a.doi ? `<a class="chip" href="${doiUrl(a)}">${ICON.doi} DOI</a>` : ''}
      </div>
    </header>
    ${kp}
    ${a.abstract ? `<section class="abstract article-body" id="abstract"><h2 style="border:0;margin-top:20px">Abstract</h2>${abstractBlock(a)}</section>` : ''}
    ${a.keywords?.length ? `<div class="kw"><b>Keywords:</b> ${a.keywords.map(k => `<a href="/search/?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div>` : ''}
    ${legacy}
    <div class="article-body" id="body">${a.body}</div>
    <section class="ainfo" id="article-information"><h2>Article Information</h2>${articleInfo(a)}</section>
    ${refsBlock(a)}
  </article>
  <aside class="rail">
    <div class="rbox"><h4>Cite this article</h4><div style="font:14px/1.55 var(--serif)">${esc(cites.ama)}</div><button class="chip" style="margin-top:12px" data-open="cite">All formats & download</button></div>
    <div class="rbox"><h4>Article details</h4><dl>
      <dt>Journal</dt><dd><a href="/journals/${j.slug}/">${esc(j.code)}</a></dd>
      <dt>Type</dt><dd>${esc(a.type || 'Article')}</dd>
      <dt>Peer review</dt><dd>${esc(peerReviewOf(a))}</dd>
      ${a.volume ? `<dt>Issue</dt><dd>Vol. ${esc(a.volume)}, No. ${esc(a.issue)}</dd>` : ''}
      ${a.firstPage ? '' : `<dt>Article no.</dt><dd>${esc(elocator(a))}</dd>`}
      <dt>Published</dt><dd>${fmtDate(a.published)}</dd>
      ${a.doi ? `<dt>DOI</dt><dd><a href="${doiUrl(a)}">${esc(a.doi)}</a></dd>` : ''}
      ${a.previousDoi ? `<dt>Original DOI</dt><dd><a href="https://doi.org/${esc(a.previousDoi)}">${esc(a.previousDoi)}</a></dd>` : ''}
      ${a.firstPage ? `<dt>Pages</dt><dd>${esc(a.firstPage)}${a.lastPage ? '–' + esc(a.lastPage) : ''}</dd>` : ''}
      <dt>ID</dt><dd>${esc(a.id)}</dd>
    </dl></div>
    <div class="rbox"><div class="lic">${CCBY}<span>Open access under <a href="${licenseUrl(a)}">${esc((a.license || site.defaultLicense).replace(/-/g, ' '))}</a></span></div></div>
    ${related.length ? `<div class="rbox"><h4>More from ${esc(j.code)}</h4>${related.map(r => `<a class="rel" href="${r.path}">${r.title}<small>${esc(r.type)} · ${fmtDate(r.published)}</small></a>`).join('')}</div>` : ''}
  </aside>
</div>
<div class="modal" id="cite" role="dialog" aria-modal="true" aria-labelledby="cite-h"><div class="box"><div class="mh"><h3 id="cite-h">Cite this article</h3><button data-close aria-label="Close">×</button></div><div class="mb">
  <div class="ctabs">${['AMA', 'APA', 'MLA', 'Chicago', 'Harvard', 'BibTeX', 'RIS'].map((k, i) => `<button data-ct="${k.toLowerCase()}"${i === 0 ? ' class="on"' : ''}>${k}</button>`).join('')}</div>
  <div class="cbox" id="cbox"></div>
  <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary" data-copy>Copy</button><a class="btn btn-ghost" href="${a.path}cite.bib" download>Download .bib</a><a class="btn btn-ghost" href="${a.path}cite.ris" download>Download .ris (EndNote, Zotero, Mendeley)</a></div>
</div></div></div>
<div class="lightbox" id="lb"><img alt=""></div>
<script type="application/json" id="cites">${JSON.stringify(cites).replace(/</g, '\\u003c')}</script>`;
  write(path.join(DIST, a.path, 'cite.bib'), cites.bibtex);
  write(path.join(DIST, a.path, 'cite.ris'), cites.ris);
  return layout({ title: strip(a.title), desc: abstractText(a), canonical: a.url, head: a.proof ? '' : scholarMeta(a), body, j, noindex: a.proof });
}

// ---------------------------------------------------------------- PDF print page (rendered by pdf.mjs)
function printPage(a) {
  const j = a.j;
  const { list, affs } = authorsBlock(a);
  const cites = citations(a, j, site, a.url);
  const corr = (a.authors || []).find(x => x.corresponding);
  const info = [
    a.received && `<div><b>Received</b>${fmtDate(a.received)}</div>`,
    a.accepted && `<div><b>Accepted</b>${fmtDate(a.accepted)}</div>`,
    `<div><b>Published</b>${fmtDate(a.published)}</div>`,
    a.doi && `<div><b>DOI</b>${esc(a.doi)}</div>`,
    `<div><b>Cite as</b>${esc(cites.ama)}</div>`,
    corr && `<div><b>Corresponding author</b>${esc(nameWithDegrees(corr))}${corr.email ? '<br>' + esc(corr.email) : ''}</div>`,
    `<div><b>Licence</b>© ${year(a.published)} The Author(s). Open access under ${esc(licenseName(a))}.${CCBY.replace('<svg', '<svg class="ccb"')}</div>`,
  ].filter(Boolean).join('');
  const kp = a.keyPoints ? `<div class="pdf-kp"><h2>Key Points</h2>${a.keyPoints.question ? `<p><b>Question</b> ${a.keyPoints.question}</p>` : ''}${a.keyPoints.findings ? `<p><b>Findings</b> ${a.keyPoints.findings}</p>` : ''}${a.keyPoints.meaning ? `<p><b>Meaning</b> ${a.keyPoints.meaning}</p>` : ''}</div>` : '';
  const body = a.body.replace(/<div class="fa">[\s\S]*?<\/div>/g, '').replace(/src="figures\//g, `src="${a.path}figures/`);
  const i = a.info || {};
  const end = [
    i.contributions && `<p><b>Author contributions:</b> ${i.contributions}</p>`,
    `<p><b>Conflict of interest disclosures:</b> ${i.conflicts || 'None reported.'}</p>`,
    `<p><b>Funding/support:</b> ${i.funding || 'None reported.'}</p>`,
    i.ethics && `<p><b>Ethics approval:</b> ${i.ethics}</p>`,
    i.dataSharing && `<p><b>Data sharing statement:</b> ${i.dataSharing}</p>`,
    i.aiUse && `<p><b>Use of AI tools:</b> ${i.aiUse}</p>`,
    i.acknowledgments && `<p><b>Acknowledgments:</b> ${i.acknowledgments}</p>`,
  ].filter(Boolean).join('');
  return `<!doctype html><html lang="${site.language}"><head><meta charset="utf-8"><title>${esc(strip(a.title))}</title>
<link rel="stylesheet" href="/assets/css/acrij.css"><link rel="stylesheet" href="/assets/css/acrij-print.css">
<style>:root{--accent:${j.accent};--accent-tint:${j.accentTint || '#F3F5F8'}}body{font-size:9.6pt}.pdf-info .ccb{width:62pt;display:block;margin-top:3pt}</style></head><body>
<div class="pdf-top"><div class="jn" style="display:flex;align-items:center;gap:7pt">${jimg(j, 'mark', '', '').replace('<img', '<img style="width:26pt;height:26pt"')}<div>${esc(j.name)}<small>${j.issnOnline ? 'e-ISSN ' + esc(j.issnOnline) + ' · ' : ''}${esc(j.abbrev)}. ${year(a.published)};${a.volume || ''}${a.issue ? `(${a.issue})` : ''}:${loc(a)}</small></div></div>
<div class="net"><b>ACRI</b><i></i><span>JOURNALS</span></div></div>
<div class="pdf-type">${esc(a.type || 'Article')}${a.subject?.length ? ' · ' + esc(a.subject[0]) : ''}</div>
<h1 class="pdf-title">${a.title}</h1>${a.subtitle ? `<p class="pdf-subtitle">${a.subtitle}</p>` : ''}
<div class="pdf-authors">${list.replace(/<a [^>]*orcid[^>]*>[\s\S]*?<\/a>/g, '').replace(/<a href="https:\/\/orcid[^"]*"[^>]*>[\s\S]*?<\/a>/g, '')}</div>
<ol class="pdf-affil">${(a.affiliations || []).map((f, k) => `<li><sup>${k + 1}</sup>${esc(f.name)}</li>`).join('')}</ol>
<div class="pdf-grid"><div class="pdf-info">${info}</div><div>${kp}${a.abstract ? `<div class="pdf-abs"><h2>Abstract</h2>${abstractBlock(a)}</div>` : ''}${a.keywords?.length ? `<div class="pdf-kw"><b>Keywords:</b> ${a.keywords.map(esc).join('; ')}</div>` : ''}</div></div>
<div class="pdf-body">${body}</div>
${end ? `<div class="pdf-end"><h2>Article information</h2><div class="pdf-ainfo">${end}</div></div>` : ''}
${a.references?.length ? `<div class="pdf-refs"><h2>References</h2><ol>${a.references.map(r => `<li>${r.text}</li>`).join('')}</ol></div>` : ''}
</body></html>`;
}

// ---------------------------------------------------------------- network pages
function homePage() {
  const [lead, ...rest] = pub.filter(a => a.featured).concat(pub.filter(a => !a.featured));
  const jp = pub.slice(0, 8);
  const authorsN = new Set(pub.flatMap(a => (a.authors || []).map(x => ((x.given || '') + ' ' + (x.family || '')).trim().toLowerCase()))).size;
  const doiN = pub.filter(a => a.doi).length;
  const subjects = [...new Set(journals.map(j => j.subjectArea || '').filter(Boolean))];
  const ico = {
    oa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/></svg>',
    rev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5M14.5 15.5c2.6-.6 5.6.6 6.5 4.5"/></svg>',
    doi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  };
  const stat = (n, l) => `<div class="hstat"><b>${n}</b><span>${l}</span></div>`;
  const body = `
<section class="intro"><div class="wrap">
  <div class="intro-l">
    <span class="kicker">ACRIVERSE · Ahmedabad, India</span>
    <h1>${esc(site.homeHeadline || 'Research from India,')} <em>${esc(site.homeHeadlineAccent ?? 'open to the world.')}</em></h1>
    <p>${esc(site.homeIntro || 'ACRI Journals publishes peer-reviewed, open-access journals across ' + (subjects.length ? subjects.join(', ').replace(/, ([^,]*)$/, ' and $1').toLowerCase() : 'business and education') + '. Every article is free to read, carefully reviewed and built to be found, cited and preserved.')}</p>
    <form class="isearch" action="/search/" role="search"><input name="q" placeholder="Search articles, authors and topics" aria-label="Search ACRI Journals"><button class="btn btn-green">Search</button></form>
    <div class="intro-cta"><a class="btn btn-green" href="/portal/#/submit">Submit a manuscript</a><a class="btn btn-line" href="#journals">Explore the journals</a></div>
  </div>
  <div class="intro-r">
    <div class="hstats">${stat(journals.length, journals.length === 1 ? 'journal' : 'journals')}${stat(pub.length, 'articles published')}${stat(authorsN, 'authors')}${stat('100%', 'open access')}</div>
    <div class="ilogos">${journals.map(j => `<a href="/journals/${j.slug}/" title="${esc(j.name)}">${jimg(j, 'markWhite', '', j.code)}<span>${esc(j.code)}</span></a>`).join('')}</div>
  </div>
</div></section>
<section class="hero"><div class="wrap">
  ${lead ? `<a class="feature" href="${lead.path}"><span class="kicker" style="color:var(--muted);margin-bottom:12px;display:block">Featured research</span><div class="art">${coverArt(lead.id, lead.j.accent)}</div>
    <span class="kicker" style="color:${lead.j.accent}">${esc(lead.j.code)} · ${esc(lead.type)}</span>
    <h1>${lead.title}</h1><p>${esc(snippet(lead, 260))}</p>
    <div class="meta">${esc(authorsShort(lead.authors))}</div></a>`
    : `<div class="feature"><div class="art">${coverArt('acri', '#1F7A4D')}</div><span class="kicker">Now accepting submissions</span><h1>Open-access research from the ACRI journal network</h1><a class="btn btn-primary" href="/portal/#/submit">Submit a manuscript</a></div>`}
  <div class="stack"><h2>Just Published</h2>${jp.length ? jp.slice(0, 5).map(a => itemCard(a)).join('') : '<p class="meta" style="padding:16px 0">New articles will appear here as they are published.</p>'}
    ${jp.length > 5 ? '<a href="/online-first/" style="padding-top:14px;font-weight:600;font-size:14px">See all new articles →</a>' : ''}</div>
</div></section>
<section class="sec" id="journals"><div class="wrap">
  <div class="sec-h"><div><span class="kicker">The network</span><h2>Our journals</h2></div><a href="/journals/">All journals →</a></div>
  <div class="jgrid">${journals.map(j => { const n = byJournal(j.slug).length; return `<div class="jcard2" style="--accent:${j.accent};--accent-tint:${j.accentTint || '#F3F5F8'}">
    <a class="cov" href="/journals/${j.slug}/">${jimg(j, 'markWhite', 'cm', '')}<div><b>${esc(j.code)}</b><small>${esc(j.school || site.publisher)}</small></div></a>
    <div class="bd"><h3><a href="/journals/${j.slug}/">${esc(j.name)}</a></h3><p>${esc((j.scope || '').slice(0, 170))}${(j.scope || '').length > 170 ? '…' : ''}</p>
    <div class="jmeta"><span>${j.issnOnline ? 'e-ISSN ' + esc(j.issnOnline) : 'ISSN: applying'}</span><span>${esc(j.frequency || '')}</span><span>${n ? n + ' article' + (n === 1 ? '' : 's') : 'New journal'}</span></div>
    <div class="jlinks"><a href="/journals/${j.slug}/">Read</a><a href="/journals/${j.slug}/about/">About</a><a href="/portal/#/submit?journal=${j.slug}" class="go">Submit →</a></div></div></div>`; }).join('')}</div>
</div></section>
<section class="sec pillars"><div class="wrap"><div class="pgrid">
  <div class="pil">${ico.oa}<h3>Free to read, forever</h3><p>Every article is open access under CC BY 4.0. No paywalls, no logins, and authors keep their copyright.</p></div>
  <div class="pil">${ico.rev}<h3>Real peer review</h3><p>Double-blind review by at least two independent experts, with editors who sign an agreement on ethics and confidentiality.</p></div>
  <div class="pil">${ico.doi}<h3>Permanent and citable</h3><p>DOIs registered through Zenodo (CERN)${doiN ? `, ${doiN} so far` : ''}, with copies archived away from this website so the record lasts.</p></div>
  <div class="pil">${ico.find}<h3>Built to be found</h3><p>Clean article pages with the metadata Google Scholar and indexers read, plus a typeset PDF and ready-made citations.</p></div>
</div></div></section>
${jp.length > 5 ? `<section class="sec"><div class="wrap"><div class="sec-h"><div><span class="kicker">Latest</span><h2>Recent research across the network</h2></div><a href="/online-first/">View all →</a></div><div class="grid4">${jp.slice(0, 8).map(a => `<a class="card" href="${a.path}"><span class="atype" style="color:${a.j.accent}">${esc(a.j.code)} · ${esc(a.type)}</span><h3>${a.title}</h3><div class="meta">${esc(authorsTiny(a.authors))}</div></a>`).join('')}</div></div></section>` : ''}
<section class="band"><div class="wrap">
  <div><span class="kicker" style="color:#7DD3A6">Publish with ACRI Journals</span><h2>One portal. Careful review. A permanent home for your work.</h2>
  <p>Submit to any ACRI journal through one account. Follow every stage online, from technical check to proofs, and get a typeset PDF and a DOI when your article is published.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-green" href="/portal/#/submit">Submit a manuscript</a><a class="btn btn-line" href="/for-authors/">Author guidelines</a></div></div>
  <div class="steps"><div class="step"><b>1</b><span>Prepare your paper with the ACRI Journals manuscript template.</span></div><div class="step"><b>2</b><span>Submit in the author portal. The editorial office checks scope and format.</span></div><div class="step"><b>3</b><span>Double-blind peer review by at least two independent reviewers.</span></div><div class="step"><b>4</b><span>On acceptance: copyediting, typeset proofs, DOI and publication.</span></div></div>
</div></section>
<section class="sec" style="border:0"><div class="wrap" style="max-width:820px;text-align:center">
  <h2 style="font:600 28px/1.2 var(--serif);margin:0 0 8px">Get new research by email</h2><p class="meta" style="margin:0 0 18px;font-size:15px">New articles and issues from ACRI Journals. No more than one email a week.</p>
  <form class="nl" data-api="subscribe" style="max-width:560px;margin:0 auto"><input type="email" name="email" required placeholder="Email address" aria-label="Email address"><button class="btn btn-primary">Subscribe</button><p class="meta nl-msg" style="width:100%;margin:6px 0 0"></p></form>
</div></section>`;
  return layout({ title: '', canonical: BASE + '/', body, head: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: BASE, parentOrganization: { '@type': 'Organization', name: site.publisherName || site.publisher, url: site.publisherUrl } })}</script>` });
}

function journalsIndex() {
  return layout({ title: 'Journals', canonical: BASE + '/journals/', body: `<div class="wrap page"><div class="page-h"><span class="kicker">The network</span><h1>Our Journals</h1><p>Each ACRI journal is edited independently by its own Editor-in-Chief and editorial board, and shares the network's standards for peer review, open access and production.</p></div>
  <div class="grid3">${journals.map(j => `<a class="jcard" href="/journals/${j.slug}/" style="--accent:${j.accent}"><div class="cov">${jimg(j, 'markWhite', 'cm', '')}<div><small>${esc(j.school || '')}</small><b>${esc(j.code)}</b></div></div><div class="bd"><h3>${esc(j.name)}</h3><p>${esc(j.scope)}</p><div class="issn">${j.issnOnline ? 'e-ISSN ' + esc(j.issnOnline) + ' · ' : ''}${esc(j.frequency || '')}</div></div></a>`).join('')}</div></div>` });
}

function onlineFirst(j = null) {
  const list = j ? byJournal(j.slug) : pub;
  currentTab = 'online';
  return layout({ j, title: j ? 'New Online' : 'Just Published', canonical: BASE + (j ? `/journals/${j.slug}/online-first/` : '/online-first/'), body: `<div class="wrap page"><div class="page-h"><span class="kicker">${j ? esc(j.code) : 'All journals'}</span><h1>${j ? 'New Online' : 'Just Published'}</h1><p>The latest peer-reviewed articles, newest first${j ? '' : ', across every ACRI journal'}.</p></div>
  ${list.length ? list.map(tocItem).join('') : '<p class="meta">No articles have been published yet.</p>'}</div>` });
}

// ---------------------------------------------------------------- journal pages
function issuesOf(j) {
  // Combine declared issues with issues implied by articles.
  const map = new Map();
  for (const i of j.issues) map.set(`${i.volume}-${i.issue}`, { ...i });
  for (const a of byJournal(j.slug)) if (a.volume && a.issue) {
    const k = `${a.volume}-${a.issue}`;
    if (!map.has(k)) map.set(k, { volume: a.volume, issue: a.issue, year: year(a.published) });
    (map.get(k).articles ||= []).push(a);
  }
  return [...map.values()].filter(i => i.articles?.length).sort((a, b) => b.volume - a.volume || b.issue - a.issue);
}
const issueLabel = (i) => `Volume ${i.volume}, Issue ${i.issue}${i.label ? ' · ' + i.label : i.year ? ' · ' + i.year : ''}`;
const coverMini = (j, i) => `<div class="cover-mini" style="background:${j.accent}"><small style="display:flex;align-items:center;gap:8px">${jimg(j, 'markWhite', '', '').replace('<img', '<img style="width:30px;height:30px"')}${esc(j.code)}</small><div><b>Vol ${esc(i.volume)} · No ${esc(i.issue)}</b><br><i>${esc(i.label || i.year || '')}</i></div><small>ACRI Journals</small></div>`;

function journalHome(j) {
  currentTab = 'home';
  const list = byJournal(j.slug);
  const iss = issuesOf(j);
  const lead = list.find(a => a.featured) || list[0];
  const body = `
<section class="hero"><div class="wrap">
  ${lead ? `<a class="feature" href="${lead.path}"><div class="art">${coverArt(lead.id, j.accent)}</div><span class="kicker">${esc(lead.type)}</span><h1>${lead.title}</h1><p>${esc(snippet(lead, 240))}</p><div class="meta">${esc(authorsShort(lead.authors))}</div></a>`
    : `<div class="feature"><div class="art">${coverArt(j.slug, j.accent)}</div><span class="kicker">Call for papers</span><h1>${esc(j.name)}</h1><p>${esc(j.scope)}</p><a class="btn btn-accent" href="/portal/#/submit?journal=${j.slug}">Submit a manuscript</a></div>`}
  <div class="stack"><h2>New Online</h2>${list.slice(0, 5).map(a => itemCard(a, false)).join('') || '<p class="meta" style="padding:16px 0">Articles will appear here as they are published.</p>'}</div>
</div></section>
${iss.length ? `<section class="sec"><div class="wrap"><div class="sec-h"><h2>Current Issue</h2><a href="/journals/${j.slug}/archive/">All issues →</a></div>
  <div class="issue-cover">${coverMini(j, iss[0])}<div><span class="kicker">${esc(issueLabel(iss[0]))}</span><h2 style="font:600 26px/1.25 var(--serif);margin:10px 0">${esc(iss[0].title || 'In this issue')}</h2><p class="meta">${iss[0].articles.length} article${iss[0].articles.length === 1 ? "" : "s"}</p><a class="btn btn-accent" href="/journals/${j.slug}/issue/${iss[0].volume}/${iss[0].issue}/">View table of contents</a></div></div></div></section>` : ''}
<section class="sec"><div class="wrap cols" style="grid-template-columns:1.3fr 1fr">
  <div><h2 style="font:600 26px var(--serif);margin:0 0 12px">Aims and scope</h2><p class="prose" style="font-size:16.5px">${esc(j.scope)}</p>
  <div class="kw">${(j.subjects || []).map(s => `<a href="/search/?q=${encodeURIComponent(s)}&j=${j.slug}">${esc(s)}</a>`).join('')}</div></div>
  <div class="rbox"><h4>Journal particulars</h4>${particulars(j)}
    <h4 style="margin-top:20px">Get ${esc(j.code)} updates</h4><form class="nl" data-api="subscribe" data-list="${j.slug}"><input type="email" name="email" required placeholder="Email address" aria-label="Email address"><button class="btn btn-accent">Subscribe</button><p class="meta nl-msg" style="width:100%;margin:6px 0 0"></p></form></div>
</div></section>`;
  return layout({ j, title: j.name, desc: j.scope, canonical: BASE + `/journals/${j.slug}/`, body });
}

function issuePage(j, i) {
  currentTab = 'current';
  const groups = {};
  for (const a of i.articles.sort((x, y) => (x.order ?? 999) - (y.order ?? 999) || x.id.localeCompare(y.id))) (groups[a.type || 'Articles'] ||= []).push(a);
  const order = j.articleTypes || [];
  const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  const body = `<div class="wrap page">
  <div class="issue-cover">${coverMini(j, i)}<div><span class="kicker">${esc(issueLabel(i))}</span><h1 style="font:600 32px/1.2 var(--serif);margin:10px 0 8px">${esc(i.title || `${j.code} · Volume ${i.volume}, Issue ${i.issue}`)}</h1>
  ${i.note ? `<p>${esc(i.note)}</p>` : ''}<p class="meta">${i.articles.length} articles · ${esc(j.name)}</p>
  ${i.pdf ? `<a class="btn btn-accent" href="${esc(i.pdf)}">${ICON.pdf.replace('<svg', '<svg width="16" height="16"')} Full issue PDF</a>` : ''}</div></div>
  ${keys.map(k => `<section class="toc-sec"><h2>${esc(k)}</h2>${groups[k].map(tocItem).join('')}</section>`).join('')}
</div>`;
  return layout({ j, title: `Volume ${i.volume}, Issue ${i.issue}`, canonical: BASE + `/journals/${j.slug}/issue/${i.volume}/${i.issue}/`, body });
}

function archivePage(j) {
  currentTab = 'archive';
  const iss = issuesOf(j);
  const byYear = {};
  for (const i of iss) (byYear[i.year || 'Undated'] ||= []).push(i);
  return layout({ j, title: 'All Issues', canonical: BASE + `/journals/${j.slug}/archive/`, body: `<div class="wrap page"><div class="page-h"><span class="kicker">${esc(j.code)}</span><h1>All Issues</h1></div>
  ${(() => { for (const x of j.issues.filter(x => x.published === false && x.note)) (byYear[x.year || 'Undated'] ||= []).push({ ...x, skipped: true }); return ''; })()}
  ${Object.keys(byYear).sort().reverse().map(y => `<section class="toc-sec"><h2>${esc(y)}</h2><div class="archive" style="margin-top:20px">${byYear[y].sort((a, b) => b.volume - a.volume || b.issue - a.issue).map(i => i.skipped ? `<div style="opacity:.55"><div class="cover-mini" style="background:#9AA3AE"><small>${esc(j.code)}</small><div><b>Vol ${esc(i.volume)} · No ${esc(i.issue)}</b><br><i>${esc(i.label || '')}</i></div><small>${esc(i.note)}</small></div><b style="font-size:14px">Vol. ${i.volume}, No. ${i.issue}</b><div class="meta">${esc(i.note)}</div></div>` : `<a href="/journals/${j.slug}/issue/${i.volume}/${i.issue}/">${coverMini(j, i)}<b style="font-size:14px">Vol. ${i.volume}, No. ${i.issue}</b><div class="meta">${i.articles.length} article${i.articles.length === 1 ? "" : "s"}</div></a>`).join('')}</div></section>`).join('') || '<p class="meta">The first issue is in preparation. Accepted articles appear under <a href="online-first/">New Online</a> first.</p>'}
  </div>` });
}

function boardPage(j) {
  currentTab = 'board';
  const MG = 'Publisher & journal management';
  const groups = {}; for (const p of j.board || []) (groups[p.group || p.role] ||= []).push(p);
  const keys = Object.keys(groups).sort((a, b) => (a === MG) - (b === MG));
  const card = (p) => `<div class="person${p.photo ? ' has-photo' : ''}">${p.photo ? `<img class="pph" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="84" height="84">` : ''}<span class="role">${esc(p.role)}</span><b>${esc(p.name)}</b>${p.designation ? `<span>${esc(p.designation)}${p.department ? ', ' + esc(p.department) : ''}</span>` : ''}<span>${esc(p.affiliation || '')}</span>${p.address ? `<span>${esc(p.address)}</span>` : ''}${p.email ? `<span><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></span>` : ''}${p.profile ? `<span><a href="${esc(p.profile)}" rel="noopener">Institutional profile ↗</a></span>` : ''}${p.orcid ? `<span><a href="https://orcid.org/${esc(p.orcid)}">${ORCID} ${esc(p.orcid)}</a></span>` : ''}${p.since ? `<span>Serving since ${esc(p.since)}</span>` : ''}${p.bio ? `<p class="pbio">${esc(p.bio)}</p>` : ''}</div>`;
  return layout({ j, title: 'Editorial Board', canonical: BASE + `/journals/${j.slug}/editorial-board/`, body: `<div class="wrap page"><div class="page-h"><span class="kicker">${esc(j.code)}</span><h1>Editorial Board</h1><p>The editors set the journal's direction, handle manuscripts and uphold its standards of review. Every editor has agreed to serve, signs the <a href="/policies/editorial-independence/">ACRI Journals Editorial Agreement</a> and serves a fixed term. The board is reviewed at least once a year.</p></div>
  ${keys.map(r => `<section class="toc-sec"><h2>${esc(r)}</h2><div class="board" style="margin-top:18px">${groups[r].map(card).join('')}</div></section>`).join('') || '<p class="meta">The editorial board is being appointed.</p>'}
  <section class="toc-sec"><h2>Editorial office</h2><div class="prose" style="margin-top:14px;font-size:16px">${esc(pubInfo().name)}${pubInfo().address ? ', ' + esc(pubInfo().address) : ''}${pubInfo().phone ? ' · Phone: ' + esc(pubInfo().phone) : ''}. To reach the journal office or the Editor-in-Chief, use the <a href="/contact/?journal=${j.slug}">contact form</a>.</div></section>
  </div>` });
}

function journalAbout(j) {
  currentTab = 'about';
  const P = pubInfo(), F = site.fees || {};
  const fees = F.confirmed ? (Number(F.apc) > 0 ? `${esc(j.code)} charges an article processing charge of ${esc(F.currency || 'INR')} ${esc(F.apc)} after acceptance. There are no submission or review fees. ${esc(F.note || '')} See the <a href="/policies/fees/">fees and waivers policy</a>.` : `${esc(j.code)} charges <b>no fees of any kind</b>: no submission, review, processing or publication charges. Publication costs are met by the publisher.`) : `There are no submission or peer-review fees. See the <a href="/policies/fees/">fees and waivers policy</a>.`;
  return layout({ j, title: 'About', canonical: BASE + `/journals/${j.slug}/about/`, body: `<div class="wrap page cols"><nav class="side-nav"><a href="#scope">Aims and scope</a><a href="#particulars">Journal particulars</a><a href="#ownership">Ownership & management</a><a href="#review">Peer review</a><a href="#fees">Fees</a><a href="#oa">Open access & copyright</a><a href="#indexing">Indexing & archiving</a><a href="#contact">Contact</a></nav>
  <div class="prose"><div class="jabout-logos"><div class="jl">${fullLogo(j)}</div><div class="ap">An ${MINIWM} publication</div></div><h1 style="font:600 34px/1.2 var(--serif);margin:18px 0 18px">About ${esc(j.name)}</h1>
  <h2 id="scope">Aims and scope</h2><p>${esc(j.scope)}</p><p><b>Subjects:</b> ${(j.subjects || []).map(esc).join(', ')}.</p><p><b>Article types:</b> ${(j.articleTypes || []).map(esc).join(', ')}.</p><p><b>Audience:</b> researchers, practitioners, educators and policymakers. ${esc(j.code)} is an ${esc(j.scopeType || 'international')} journal and welcomes submissions from authors in every country.</p>
  <h2 id="particulars">Journal particulars</h2><div class="rbox" style="font-family:var(--sans)">${particulars(j)}</div>
  <h2 id="ownership">Ownership and management</h2><p>${esc(j.name)} is owned and published by <b>${esc(P.name)}</b>${P.address ? ', ' + esc(P.address) : ''}${P.web ? ` (<a href="${esc(P.web)}">${esc(P.web.replace('https://', ''))}</a>)` : ''}, and is published on the ACRI Journals platform, part of ACRIVERSE. ${j.school ? `It is affiliated with the ${esc(j.school)}. ` : ''}The publisher appoints the editors for fixed terms under a written agreement and does not take part in decisions on individual manuscripts. Editors are not paid according to the number of articles accepted. See <a href="/policies/editorial-independence/">Editorial independence and governance</a> and the <a href="editorial-board/">Editorial Board</a>.</p>
  <h2 id="review">Peer review</h2><p>${esc(j.code)} uses <b>double-blind peer review</b>. Neither authors nor reviewers learn each other's identities. Each research manuscript is first screened by the editorial office (completeness, anonymisation, similarity check) and by the Editor-in-Chief or a Senior Editor (scope and quality). Manuscripts may be declined at this stage without external review.</p>
  <p>Manuscripts that pass screening are sent to <b>at least two independent external experts</b>, chosen by the handling editor. Reviewers are never members of the editorial office. Reviewers are asked to report within 21 days, and the first decision usually comes within 6–8 weeks of submission. Supplementary material is reviewed along with the manuscript. Reviews are anonymous and are not published with the article.</p>
  <p>Reviewers must keep manuscripts confidential, must not contact the authors, may involve a colleague only with the editor's permission, and must not use generative AI to write or improve their reviews. Authors may suggest reviewers to widen the pool, but editors are not bound by these suggestions. Reviewers are assigned by editors, not by automated or AI tools.</p>
  <p>The Editor-in-Chief makes the final decision. Editorials and perspectives may be reviewed by the editors only, and such articles say so on the article page. Acceptance is never guaranteed. See the full <a href="/policies/peer-review/">peer review policy</a>.</p>
  <h2 id="fees">Fees</h2><p>${fees}</p>
  <h2 id="oa">Open access and copyright</h2><p>All articles are free to read on publication under a Creative Commons Attribution 4.0 licence (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). <b>Authors keep copyright</b> in their articles, and this is stated on every article page and PDF. Copyright in the website itself, its design and the journal logos belongs to the publisher. Authors may deposit any version of their article in any repository. See <a href="/policies/open-access/">Open access & licensing</a>.</p>
  <h2 id="indexing">Indexing and archiving</h2><p>Each article has a DOI and is permanently archived in Zenodo (CERN), separately from this website. Metadata is available to Google Scholar and indexing services through article pages, the <a href="/sitemap.xml">sitemap</a>, <a href="doaj.xml">DOAJ-format article export</a> and <a href="rss.xml">RSS</a>.</p>
  ${j.legacyUrl ? `<p>This journal's earlier website was <a href="${esc(j.legacyUrl)}">${esc(j.legacyUrl.replace('https://', ''))}</a>. It now redirects here, and all back issues are hosted on ACRI Journals.</p>` : ''}
  <h2 id="contact">Contact</h2><p>Editorial office, ${esc(j.name)}<br>${esc(P.name)}${P.address ? '<br>' + esc(P.address) : ''}${P.phone ? '<br>Phone: ' + esc(P.phone) : ''}</p><p><a class="btn btn-accent" href="/contact/?journal=${j.slug}&to=office">Write to the journal office</a> <a class="btn btn-ghost" href="/contact/?journal=${j.slug}&to=eic">Write to the Editor-in-Chief</a></p><p class="meta">Messages are handled in our editorial system and answered by email.</p></div></div>` });
}

function journalAuthors(j) {
  currentTab = 'authors';
  return layout({ j, title: 'For Authors', canonical: BASE + `/journals/${j.slug}/for-authors/`, body: `<div class="wrap page"><div class="page-h"><span class="kicker">${esc(j.code)}</span><h1>Information for Authors</h1><p>${esc(j.code)} follows the ACRI Journals author guidelines and manuscript standard. Journal-specific points are listed below.</p></div>
  <div class="grid3"><a class="card" href="/for-authors/"><span class="kicker">Guidelines</span><h3>ACRI Journals author guidelines</h3><p>Article types, structure, references, figures, tables and ethics requirements.</p></a>
  <a class="card" href="/for-authors/#template"><span class="kicker">Template</span><h3>Manuscript template (.docx)</h3><p>Use the template so your paper converts cleanly to the web and PDF versions.</p></a>
  <a class="card" href="/portal/#/submit?journal=${j.slug}"><span class="kicker">Submit</span><h3>Submit to ${esc(j.code)}</h3><p>Sign in or create an account in the author portal to start a submission.</p></a></div>
  <div class="prose" style="margin-top:36px"><h2>Article types accepted</h2><ul>${(j.articleTypes || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></div>` });
}

// Static content pages (network) come from /content/pages/*.html with a front-matter line.
function aesErrorsPage() {
  const E = readJSON(path.join(ROOT, 'config/aes-errors.json'), { groups: [] });
  return layout({ title: 'AES error codes', canonical: BASE + '/aes/errors/', desc: 'Error codes of AES, the ACRI Editorial System, with what each one means and how to fix it.', body: `<div class="wrap page narrow"><div class="page-h"><span class="kicker">${esc(E.name)} · ${esc(E.fullName)} · version ${esc(E.version)}</span><h1>Error codes</h1><p>When something goes wrong in the editorial portal, AES shows a short code such as <code>AES-GH-401</code>. Find it below to see what happened and how to fix it. Codes for system faults also come with a reference (for example <code>E261124-7KQ2A</code>), which the journal office can look up in the error log.</p>
  <p class="meta">How to read a code: <b>AES</b>, then the area (AUTH sign-in, LINK personal links, VAL forms, GH website publishing, ZEN DOIs, MAIL email, SRV / SHEET / DRIVE server and storage, NET / UI / CFG your browser), then a number. Numbers in the 400s are usually fixable by you; 500s are system faults.</p></div>
  ${E.groups.map(g => `<section class="toc-sec"><h2 id="${esc(g.id)}">${esc(g.title)}</h2><table class="aes-err"><tbody>${g.codes.map(c => `<tr id="${esc(c.code)}"><td><code>${esc(c.code)}</code></td><td><b>${esc(c.title)}</b><p>${esc(c.meaning)}</p><p class="fix"><b>What to do:</b> ${esc(c.fix)}</p></td></tr>`).join('')}</tbody></table></section>`).join('')}
  <p class="meta" style="margin-top:30px">Still stuck? <a href="/contact/">Contact the editorial office</a> and include the code and reference.</p></div>`, head: '<meta name="robots" content="noindex">' });
}

function contactPage() {
  const P = pubInfo();
  const jopts = journals.map(j => `<option value="${j.slug}">${esc(j.code)}: ${esc(j.name)}</option>`).join('');
  return layout({ title: 'Contact', canonical: BASE + '/contact/', desc: 'Write to the ACRI Journals editorial office or a journal\'s Editor-in-Chief.', body: `<div class="wrap page narrow"><div class="page-h"><span class="kicker">ACRI Journals</span><h1>Contact the editorial office</h1><p>Send a message to a journal's office or its Editor-in-Chief. Messages are handled inside our editorial system, and we reply to the email address you give, usually within 5 working days. For a manuscript you have submitted, include its ID (for example IJBMRS-2026-021). To submit or check a manuscript, use the <a href="/portal/">author portal</a>.</p></div>
  <form class="cform" data-api="contact" novalidate>
    <div class="cgrid">
      <label>Journal<select name="journal"><option value="">ACRI Journals (general)</option>${jopts}</select></label>
      <label>Message for<select name="to"><option value="office">Journal office (submissions, technical and general questions)</option><option value="eic">Editor-in-Chief (editorial and scholarly matters, appeals)</option></select></label>
      <label>Your name<input name="name" required maxlength="120" autocomplete="name"></label>
      <label>Your email<input name="email" type="email" required maxlength="160" autocomplete="email"></label>
      <label>You are<select name="role"><option>Author</option><option>Reviewer</option><option>Editor</option><option>Reader</option><option>Institution / partner</option><option>Other</option></select></label>
      <label>Manuscript ID (if any)<input name="msId" maxlength="40" placeholder="e.g. IJBMRS-2026-021"></label>
    </div>
    <label>Subject<input name="subject" required maxlength="200"></label>
    <label>Message<textarea name="body" required rows="8" maxlength="5000"></textarea></label>
    <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="meta">By sending, you agree that we store your message to answer it, as set out in our <a href="/policies/privacy/">privacy policy</a>.</p>
    <button class="btn btn-primary" type="submit">Send message</button>
    <div class="c-msg" role="status" aria-live="polite"></div>
  </form>
  <section class="toc-sec"><h2>Postal address</h2><div class="prose" style="margin-top:12px;font-size:16px">ACRI Journals, ${esc(P.name)}<br>${esc(P.address)}${P.phone ? '<br>Phone: ' + esc(P.phone) : ''}</div></section>
  </div>` });
}

function contentPage(file) {
  const raw = readText(file);
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
  const meta = m ? JSON.parse(m[1]) : {};
  const html = raw.replace(/^<!--[\s\S]*?-->/, '');
  return { meta, html: layout({ title: meta.title, desc: meta.description, canonical: BASE + meta.path, body: html }) };
}

// ---------------------------------------------------------------- policies & partners
const fmtLong = (iso) => fmtDate(iso);
function policyPages() {
  const list = policies(site);
  const side = (cur) => POLICY_GROUPS.map(g => `<div style="margin-bottom:14px"><div class="kicker" style="color:var(--muted);margin:0 0 6px 16px">${esc(g)}</div>${list.filter(p => p.group === g).map(p => `<a href="/policies/${p.slug}/"${p.slug === cur ? ' class="on"' : ''}>${esc(p.title)}</a>`).join('')}</div>`).join('');
  const out = [];
  out.push(['/policies/', layout({ title: 'Policies', canonical: BASE + '/policies/', desc: 'Editorial, legal and privacy policies of ACRI Journals.', body: `<div class="wrap page"><div class="page-h"><span class="kicker">Policies</span><h1>Policies of ACRI Journals</h1><p>The standards every ACRI journal, author, reviewer and editor works by. Version ${esc(site.policyVersion)}, effective ${fmtLong(site.policyEffective)}.</p></div>
    ${POLICY_GROUPS.map(g => `<section class="toc-sec"><h2>${esc(g)}</h2><div class="grid3" style="margin-top:18px">${list.filter(p => p.group === g).map(p => `<a class="card" href="/policies/${p.slug}/"><h3 style="margin-top:0">${esc(p.title)}</h3><p>${esc(p.summary)}</p></a>`).join('')}</div></section>`).join('')}</div>` })]);
  for (const p of list) out.push([`/policies/${p.slug}/`, layout({ title: p.title, canonical: BASE + `/policies/${p.slug}/`, desc: p.summary, body: `<div class="wrap page cols"><nav class="side-nav" aria-label="Policies">${side(p.slug)}</nav>
    <div class="prose"><span class="kicker">${esc(p.group)}</span><h1 style="font:600 36px/1.2 var(--serif);margin:8px 0 6px">${esc(p.title)}</h1><p class="meta" style="font-family:var(--sans)">Version ${esc(site.policyVersion)} · Effective ${fmtLong(site.policyEffective)}</p>${p.html}
    <p class="meta" style="font-family:var(--sans);margin-top:40px;border-top:1px solid var(--line);padding-top:14px">Questions about this policy: <a href="/contact/">contact the editorial office</a>. All policies: <a href="/policies/">ACRI Journals policies</a>.</p></div></div>` })]);
  return out;
}
function partnersPage() {
  const ps = readJSON(path.join(CONTENT, 'partners.json'), []).filter(p => p.showOnSite !== false);
  const types = [...new Set(ps.map(p => p.type || 'Partners'))];
  return layout({ title: 'Partners', canonical: BASE + '/partners/', desc: 'Organisations that partner with ACRI Journals.', body: `<div class="wrap page"><div class="page-h"><span class="kicker">Network</span><h1>Our Partners</h1><p>Institutions and organisations that work with ACRI Journals to advance open, rigorous research.</p></div>
    ${ps.length ? types.map(t => `<section class="toc-sec"><h2>${esc(t)}</h2><div class="grid4" style="margin-top:18px">${ps.filter(p => (p.type || 'Partners') === t).map(p => `<a class="card" href="${esc(p.url || '#')}" rel="noopener" target="_blank" style="align-items:flex-start">${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="" style="height:52px;width:auto;object-fit:contain;margin-bottom:12px">` : ''}<h3 style="margin:0 0 6px">${esc(p.name)}</h3><p>${esc(p.description || '')}</p><span class="meta">${esc(p.country || '')}</span></a>`).join('')}</div></section>`).join('') : '<p class="meta">Our partner programme is open. The first partners will be listed here.</p>'}
    <div class="band" style="border-radius:12px;margin-top:40px"><div class="wrap" style="grid-template-columns:1fr auto;padding:36px"><div><h2 style="font-size:26px">Partner with ACRI Journals</h2><p style="margin:0">Universities, research centres, indexing services, professional bodies and industry are welcome. See the <a style="color:#7DD3A6" href="/policies/partners/">partnership policy</a>.</p></div><a class="btn btn-green" href="/portal/#/partner-apply">Apply to partner</a></div></div></div>` });
}

// ---------------------------------------------------------------- feeds, sitemap, search
function rss(list, title, link, desc) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(title)}</title><link>${link}</link><description>${esc(desc)}</description><language>${site.language}</language>
<atom:link href="${link}rss.xml" rel="self" type="application/rss+xml"/>
${list.slice(0, 50).map(a => `<item><title>${esc(strip(a.title))}</title><link>${a.url}</link><guid isPermaLink="true">${a.url}</guid><pubDate>${new Date(a.published + 'T00:00:00Z').toUTCString()}</pubDate>${(a.authors || []).map(x => `<dc:creator>${esc(fullName(x))}</dc:creator>`).join('')}<description>${esc(abstractText(a).slice(0, 600))}</description></item>`).join('\n')}
</channel></rss>`;
}

// ---------------------------------------------------------------- main
const pendingPngs = [];
function doajXml(j, list) {
  const x = (t) => esc(strip(String(t ?? '')));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<records>\n${list.map(a => `<record><language>eng</language><publisher>${x(pubInfo().name)}</publisher><journalTitle>${x(j.name)}</journalTitle>${j.issnOnline ? `<eissn>${x(j.issnOnline)}</eissn>` : ''}<publicationDate>${x(a.published)}</publicationDate><volume>${x(a.volume)}</volume><issue>${x(a.issue)}</issue><startPage>${x(a.firstPage || elocator(a))}</startPage>${a.lastPage ? `<endPage>${x(a.lastPage)}</endPage>` : ''}${a.doi ? `<doi>${x(a.doi)}</doi>` : ''}<publisherRecordId>${x(a.id)}</publisherRecordId><documentType>article</documentType><title language="eng">${x(a.title)}</title><authors>${(a.authors || []).map(au => `<author><name>${x(fullName(au))}</name>${(au.affiliations || [])[0] ? `<affiliationId>${au.affiliations[0]}</affiliationId>` : ''}${au.orcid ? `<orcid_id>https://orcid.org/${x(au.orcid)}</orcid_id>` : ''}</author>`).join('')}</authors><affiliationsList>${(a.affiliations || []).map(f => `<affiliationName affiliationId="${f.id}">${x(f.name)}</affiliationName>`).join('')}</affiliationsList>${abstractText(a) ? `<abstract language="eng">${x(abstractText(a))}</abstract>` : ''}<fullTextUrl format="html">${x(a.url)}</fullTextUrl>${a.keywords?.length ? `<keywords language="eng">${a.keywords.map(k => `<keyword>${x(k)}</keyword>`).join('')}</keywords>` : ''}</record>`).join('\n')}\n</records>`;
}
async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'site'), DIST);
  copyDir(path.join(ROOT, 'portal'), path.join(DIST, 'portal'));
  copyDir(path.join(CONTENT, 'people'), path.join(DIST, 'assets', 'people'));
  for (const j of journals) {
    const out = path.join(DIST, 'assets/journals', j.slug); fs.mkdirSync(out, { recursive: true });
    for (const f of ['logo.png', 'mark.png', 'logo-white.png', 'mark-white.png', 'logo.svg', 'mark.svg']) { const src = path.join(CONTENT, 'journals', j.slug, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f)); }
    if (j.logo.generated) {
      fs.writeFileSync(path.join(out, 'logo.svg'), journalLogoSVG(j));
      fs.writeFileSync(path.join(out, 'logo-white.svg'), journalLogoSVG(j, { color: '#fff' }));
      fs.writeFileSync(path.join(out, 'mark.svg'), journalLogoSVG(j, { variant: 'mark' }));
      fs.writeFileSync(path.join(out, 'mark-white.svg'), journalLogoSVG(j, { variant: 'mark', color: '#fff' }));
      pendingPngs.push([path.join(out, 'mark.svg'), path.join(out, 'mark.png')], [path.join(out, 'mark-white.svg'), path.join(out, 'mark-white.png')]);
    }
  }
  const pi = path.join(DIST, 'portal/index.html');
  if (fs.existsSync(pi) && site.apiUrl && !/PASTE_/.test(site.apiUrl)) write(pi, readText(pi).replace('PASTE_APPS_SCRIPT_WEB_APP_URL_HERE', site.apiUrl));
  copyDir(path.join(ROOT, 'templates/public'), path.join(DIST, 'downloads'));
  const urls = [];
  const page = (p, html, inSitemap = true) => { write(path.join(DIST, p, 'index.html'), html); if (inSitemap) urls.push(BASE + p); };

  page('/', homePage());
  page('/journals/', journalsIndex());
  page('/online-first/', onlineFirst());
  for (const [p, html] of policyPages()) page(p, html);
  page('/partners/', partnersPage());
  page('/contact/', contactPage());
  page('/aes/errors/', aesErrorsPage(), false);
  // Site pages (About, For Authors, For Reviewers, Search): content/pages overrides the built-in copies in build/pages.
  const pageFiles = {};
  for (const dir of [path.join(ROOT, 'build', 'pages'), path.join(CONTENT, 'pages')])
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) pageFiles[f] = path.join(dir, f);
  for (const file of Object.values(pageFiles)) {
    const { meta, html } = contentPage(file);
    page(meta.path, html, meta.sitemap !== false);
  }
  for (const j of journals) {
    const b = `/journals/${j.slug}`;
    page(b + '/', journalHome(j));
    page(b + '/online-first/', onlineFirst(j));
    page(b + '/archive/', archivePage(j));
    page(b + '/editorial-board/', boardPage(j));
    page(b + '/about/', journalAbout(j));
    page(b + '/for-authors/', journalAuthors(j));
    const iss = issuesOf(j);
    for (const i of iss) page(`${b}/issue/${i.volume}/${i.issue}/`, issuePage(j, i));
    const cur = iss[0] ? `${b}/issue/${iss[0].volume}/${iss[0].issue}/` : `${b}/online-first/`;
    write(path.join(DIST, b, 'currentissue/index.html'), `<!doctype html><meta charset="utf-8"><title>Current issue</title><link rel="canonical" href="${BASE + cur}"><meta http-equiv="refresh" content="0;url=${cur}"><a href="${cur}">Current issue</a>`);
    write(path.join(DIST, b, 'rss.xml'), rss(byJournal(j.slug), j.name, `${BASE}${b}/`, j.scope));
    write(path.join(DIST, b, 'doaj.xml'), doajXml(j, byJournal(j.slug)));
  }
  // Articles
  const printList = [];
  for (const a of articles) {
    page(a.path, articlePage(a), !a.proof);
    copyDir(path.join(a.dir, 'figures'), path.join(DIST, a.path, 'figures'));
    const legacy = path.join(a.dir, 'article.pdf');
    const printHtml = printPage(a);
    const pdfHash = hash(printHtml + readText(path.join(ROOT, 'site/assets/css/acrij-print.css')));
    if (fs.existsSync(legacy) && (a.legacyPdf || a.frozenPdf)) {
      fs.mkdirSync(path.dirname(path.join(DIST, a.pdfPath)), { recursive: true });
      fs.copyFileSync(legacy, path.join(DIST, a.pdfPath));
    } else {
      write(path.join(DIST, '_print', a.journal, a.slug + '.html'), printHtml);
      const stored = path.join(ROOT, 'content', 'typeset', `${a.id}-${pdfHash}.pdf`);
      if (fs.existsSync(stored)) { fs.mkdirSync(path.dirname(path.join(DIST, a.pdfPath)), { recursive: true }); fs.copyFileSync(stored, path.join(DIST, a.pdfPath)); }
      printList.push({ id: a.id, html: `/_print/${a.journal}/${a.slug}.html`, out: a.pdfPath, hash: pdfHash, title: strip(a.title), journal: a.j.name, code: a.j.code, citation: `${a.j.abbrev}. ${year(a.published)};${a.volume || ''}${a.issue ? `(${a.issue})` : ''}:${loc(a)}`, doi: a.doi || '', accent: a.j.accent });
    }
  }
  write(path.join(DIST, '_print/manifest.json'), JSON.stringify(printList, null, 1));
  // Feeds, search, sitemap, robots, headers
  write(path.join(DIST, 'rss.xml'), rss(pub, site.name, BASE + '/', site.description));
  write(path.join(DIST, 'search/index.json'), JSON.stringify(pub.map(a => ({ t: strip(a.title), a: (a.authors || []).map(fullName).join(', '), j: a.journal, jc: a.j.code, ty: a.type, d: a.published, k: (a.keywords || []).join(', '), s: abstractText(a).slice(0, 400), u: a.path, doi: a.doi || '', v: a.volume || '', i: a.issue || '', pd: a.previousDoi || '' }))));
  write(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n${pub.map(a => `<url><loc>${esc(a.pdfUrl)}</loc></url>`).join('\n')}\n</urlset>`);
  write(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /portal/\nDisallow: /_print/\nDisallow: /proofs/\n\nSitemap: ${BASE}/sitemap.xml\n`);
  write(path.join(DIST, '_headers'), `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/journals/*/articlepdf/*\n  Content-Type: application/pdf\n  Cache-Control: public, max-age=86400\n/portal/*\n  X-Robots-Tag: noindex\n  Cache-Control: no-cache\n/_print/*\n  X-Robots-Tag: noindex\n/proofs/*\n  X-Robots-Tag: noindex\n  Cache-Control: no-store\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
  // Old-site redirects (e.g. IJBMRS back issues) live in content/redirects.txt
  const red = readText(path.join(CONTENT, 'redirects.txt'));
  write(path.join(DIST, '_redirects'), `/journals/:j/currentissue /journals/:j/currentissue/ 301\n${red}`);
  write(path.join(DIST, '404.html'), layout({ title: 'Page not found', body: `<div class="wrap page" style="text-align:center;padding:90px 24px"><span class="kicker">404</span><h1 style="font:600 36px var(--serif)">We couldn't find that page</h1><p class="meta">It may have moved when our journals joined ACRI Journals. Try searching.</p><form class="sbox" action="/search/" style="max-width:520px;margin:24px auto"><input name="q" placeholder="Search articles, authors, keywords"><button class="btn btn-primary">Search</button></form></div>`, noindex: true }));
  if (pendingPngs.length) { try { const sharp = (await import('sharp')).default; for (const [i, o] of pendingPngs) await sharp(i, { density: 200 }).resize(400).png().toFile(o); } catch (e) { console.warn('Logo PNGs skipped (sharp not available)'); } }
  console.log(`Built ${urls.length} pages, ${articles.length} articles (${pub.length} public), ${printList.length} PDFs queued → dist/`);
}
await main();
