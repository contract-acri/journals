// ACRI Journals — static site build.
// Reads /content, writes a complete static website to /dist that Cloudflare Pages serves.
// Every article page is plain HTML with Google Scholar (Highwire) meta tags, JSON-LD and
// Dublin Core, so indexers and reference managers see everything without running JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, CONTENT, DIST, readJSON, readText, write, copyDir, hash, esc, strip,
  fmtDate, fmtMonthYear, year, slashDate, fullName, nameWithDegrees, authorsShort, authorsTiny,
  citations, abstractText, slugify, elocator, loc, doiUrl, MARK, WORDMARK, ORCID, journalLogoSVG, CCBY, ICON,
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
// ACRI Journals management team (written by AES to content/management.json).
const MGMT_FILE = path.join(CONTENT, 'management.json');
const MGMT = (() => { const used = {}; const list = fs.existsSync(MGMT_FILE) ? (readJSON(MGMT_FILE).members || []) : [];
  return list.map(p => { const q = Object.assign({}, p, { group: 'Management team' }); if (!p.pageOff) { let s = p.slug || slugify((p.plainName || String(p.name || '').split(',')[0]).trim()) || 'member', b = s, n = 2; while (used[s]) s = b + '-' + (n++); used[s] = 1; q.slug = s; } else q.slug = ''; return q; }); })();
const mgmtUrl = (p) => `/management/${p.slug}/`;
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
    <div><h5>Network</h5><a href="/about/">About ACRI Journals</a><a href="/management/">Management</a><a href="/how-it-works/">How it works</a><a href="/aes/">AES editorial system</a><a href="/one/">ACRI One</a><a href="/partners/">Partners</a><a href="/search/">Search</a><a href="/rss.xml">RSS</a><a href="/contact/">Contact</a><a href="/one/">Sign in</a><a href="https://www.acriverse.acriindia.org">ACRIVERSE</a></div>
  </div>
  <div class="legal"><span>© ${new Date().getFullYear()} ACRI Journals · Part of ACRIVERSE. Website © ${esc(pubInfo().name)}; articles © their authors, open access under the licence stated on each article. Published by ${esc(pubInfo().name)}.</span><span><a href="/policies/privacy/">Privacy</a> · <a href="/policies/terms/">Terms</a> · <a href="/policies/">All policies</a> · <a href="/about/#contact">Contact</a></span></div>
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

// Deterministic art for each article: the motif follows the topic, the colours follow the journal,
// and the details follow the article id, so no two articles look alike.
const ART_PALS = ['#0B2545', '#13315C', '#0E5E6F', '#1F7A4D', '#5B2A86', '#8A3B12', '#7A1F3D', '#2D3A8C'];
const artText = (a) => strip([a.title, (a.keywords || []).join(' '), a.type].join(' ')).toLowerCase();
function artMotif(t, h) {
  if (/financ|stock|market|return|invest|bank|price|bitcoin|crypto|forecast|econom|fii|nifty|accounting|tax|profit/.test(t)) return 'chart';
  if (/artificial intelligence|\bai\b|digital|technolog|machine|data|algorithm|network|online|cyber|platform/.test(t)) return 'network';
  if (/educat|teach|learn|school|student|curricul|pedagog|class|liberal arts|universit/.test(t)) return 'grid';
  if (/sustainab|esg|climate|environment|green|degrowth|energy|csr|social responsib/.test(t)) return 'waves';
  if (/organi[sz]ation|leader|manag|employee|human resource|succession|culture|behaviou?r|retire|team|governance/.test(t)) return 'blocks';
  return ['orbits', 'chart', 'network', 'grid', 'waves', 'blocks'][h % 6];
}
function coverArt(seed, accent, text = '') {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (n) => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) % n; };
  const motif = artMotif(text, h), id = 'g' + (h % 99991), c2 = ART_PALS[r(ART_PALS.length)], ang = r(4);
  const W = (o) => `rgba(255,255,255,${o})`;
  let m = '';
  if (motif === 'chart') {
    const n = 14, pts = []; let y = 300 + r(60);
    for (let i = 0; i < n; i++) { y = Math.max(70, Math.min(360, y - 30 + r(56) - (i > n / 2 ? 8 : 0))); pts.push([60 + i * 52, y]); }
    m += Array.from({ length: 5 }, (_, i) => `<line x1="40" x2="760" y1="${80 + i * 70}" y2="${80 + i * 70}" stroke="${W(.07)}"/>`).join('');
    m += pts.map(([x, yy], i) => { const hgt = 20 + r(60); return `<rect x="${x - 7}" y="${yy - hgt / 2}" width="14" height="${hgt}" rx="2" fill="${W(i % 3 ? .16 : .3)}"/><line x1="${x}" x2="${x}" y1="${yy - hgt / 2 - 14}" y2="${yy + hgt / 2 + 14}" stroke="${W(.25)}"/>`; }).join('');
    m += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${W(.85)}" stroke-width="3" stroke-linejoin="round"/><circle cx="${pts[n - 1][0]}" cy="${pts[n - 1][1]}" r="7" fill="#fff"/>`;
  } else if (motif === 'network') {
    const P = Array.from({ length: 22 }, () => [40 + r(720), 30 + r(350), 2 + r(6)]);
    for (let i = 0; i < P.length; i++) for (let k = i + 1; k < P.length; k++) { const d = Math.hypot(P[i][0] - P[k][0], P[i][1] - P[k][1]); if (d < 170) m += `<line x1="${P[i][0]}" y1="${P[i][1]}" x2="${P[k][0]}" y2="${P[k][1]}" stroke="${W((0.32 * (1 - d / 170)).toFixed(2))}" stroke-width="1.5"/>`; }
    m += P.map(([x, y, s], i) => `<circle cx="${x}" cy="${y}" r="${s + (i % 5 === 0 ? 6 : 0)}" fill="${W(i % 5 === 0 ? .9 : .5)}"/>${i % 5 === 0 ? `<circle cx="${x}" cy="${y}" r="${s + 18}" fill="none" stroke="${W(.25)}"/>` : ''}`).join('');
  } else if (motif === 'grid') {
    const cs = 46, cols = 18, rows = 9;
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) { const v = r(10); if (v > 5) m += `<rect x="${x * cs + 6}" y="${y * cs + 6}" width="${cs - 10}" height="${cs - 10}" rx="${v > 8 ? 18 : 4}" fill="${W((0.05 + v * 0.035).toFixed(2))}"/>`; }
    m += `<path d="M${120 + r(300)} 300 q 90 -70 180 0 q 90 -70 180 0" fill="none" stroke="${W(.8)}" stroke-width="4"/>`;
  } else if (motif === 'waves') {
    for (let i = 0; i < 9; i++) { const y0 = 90 + i * 34, a1 = 20 + r(50), ph = r(200); m += `<path d="M -20 ${y0} C ${180 + ph} ${y0 - a1}, ${380 - ph / 2} ${y0 + a1}, 560 ${y0} S 820 ${y0 - a1 / 2}, 840 ${y0}" fill="none" stroke="${W((0.08 + i * 0.05).toFixed(2))}" stroke-width="${2 + (i % 3) * 2}"/>`; }
    m += `<circle cx="${560 + r(160)}" cy="${80 + r(60)}" r="${34 + r(20)}" fill="${W(.85)}"/>`;
  } else if (motif === 'blocks') {
    const base = 410;
    for (let i = 0; i < 11; i++) { const w = 40 + r(60), hgt = 60 + r(230), x = 40 + i * 68; m += `<rect x="${x}" y="${base - hgt}" width="${w}" height="${hgt}" fill="${W((0.08 + r(5) * 0.05).toFixed(2))}"/>`; }
    const lx = 100 + r(500); m += `<rect x="${lx}" y="${60 + r(60)}" width="90" height="90" rx="6" fill="none" stroke="${W(.85)}" stroke-width="3" transform="rotate(${r(30) - 15} ${lx + 45} 130)"/>`;
  } else {
    m += Array.from({ length: 8 }, (_, i) => `<circle cx="${r(800)}" cy="${r(420)}" r="${50 + r(190)}" fill="none" stroke="${W((0.05 + i * 0.02).toFixed(3))}" stroke-width="${6 + r(36)}"/>`).join('');
  }
  const x2 = [1, 0, 1, 0][ang], y2 = [1, 1, 0, 0][ang];
  return `<svg viewBox="0 0 800 410" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2 || 1}"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${c2 === accent ? '#0B2545' : c2}"/></linearGradient><radialGradient id="${id}r" cx="${20 + r(60)}%" cy="${10 + r(40)}%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="800" height="410" fill="url(#${id})"/><rect width="800" height="410" fill="url(#${id}r)"/>${m}</svg>`;
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
  const ordered = pub.filter(a => a.featured).concat(pub.filter(a => !a.featured));
  const [lead] = ordered;
  const latest = pub.slice(0, 9);
  const authorsN = new Set(pub.flatMap(a => (a.authors || []).map(x => ((x.given || '') + ' ' + (x.family || '')).trim().toLowerCase()))).size;
  const doiN = pub.filter(a => a.doi).length;
  const subjects = [...new Set(journals.map(j => j.subjectArea || '').filter(Boolean))];
  const H1 = esc((/from India/i.test(site.homeHeadline || '') ? '' : site.homeHeadline) || 'Rigorous research,'), H1b = esc((/to the world/i.test(site.homeHeadlineAccent || '') ? '' : site.homeHeadlineAccent) || 'open to everyone.');
  const intro = esc(site.homeIntro || 'ACRI Journals publishes peer-reviewed, open-access journals across ' + (subjects.length ? subjects.join(', ').replace(/, ([^,]*)$/, ' and $1').toLowerCase() : 'business and education') + '. Every article is free to read, carefully reviewed and built to be found, cited and preserved.');
  const plain = (t) => strip(String(t || ''));
  // Rotating "now reading" cards in the hero: real, recent articles.
  const reel = ordered.slice(0, 5);
  const ticker = pub.slice(0, 14);
  const mtext = site.homeManifesto || 'Good research should not wait behind a paywall, or behind a famous name. We review every manuscript *on its merit*, publish it *openly*, and keep it *permanently*, so new voices and established scholars reach readers *on equal terms*.';
  const manifesto = esc(mtext).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const stem = (w) => w.toLowerCase().replace(/(ing|ment|ments|ship|al|s)$/,'').slice(0, 7);
  const topics = journals.flatMap(j => (j.subjects || []).map(name => {
    const keys = name.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !['and', 'with', 'from'].includes(w)).map(stem);
    const n = byJournal(j.slug).filter(a => { const t = artText(a) + ' ' + strip(abstractText(a) || '').toLowerCase(); return keys.some(k => t.includes(k)); }).length;
    return { name, code: j.code, c: j.accent, n };
  })).sort((a, b) => b.n - a.n).slice(0, 12);
  const count = (n, l, suf = '') => `<div class="hx-stat"><b data-count="${n}" data-suf="${suf}">${n}${suf}</b><span>${l}</span></div>`;
  const body = `
<section class="hx-hero"><canvas class="hx-net" aria-hidden="true"></canvas><div class="hx-glow" aria-hidden="true"></div>
<div class="wrap hx-grid">
  <div class="hx-l">
    <span class="hx-eyebrow"><i></i>Peer-reviewed · Open access<span class="hx-loc"> · Permanent DOIs</span></span>
    <h1 class="hx-h1"><span class="hx-line">${H1}</span> <em class="hx-line">${H1b}</em></h1>
    <p class="hx-p">${intro}</p>
    <form class="hx-search" action="/search/" role="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input name="q" placeholder="Search articles, authors and topics" aria-label="Search ACRI Journals"><button>Search</button></form>
    <div class="hx-cta"><a class="hx-btn hx-btn-g" href="/portal/#/submit">Submit your research <span>→</span></a><a class="hx-btn hx-btn-o" href="#journals">Explore the journals</a></div>
  </div>
  <div class="hx-r">
    ${reel.length ? `<div class="hx-reel" aria-label="Recently published">
      <div class="hx-reel-h"><span class="hx-live"><i></i>Now reading</span><span class="hx-dots">${reel.map((_, i) => `<button aria-label="Article ${i + 1}" data-i="${i}"${i ? '' : ' class="on"'}></button>`).join('')}</span></div>
      ${reel.map((a, i) => `<a class="hx-card${i ? '' : ' on'}" href="${a.path}" style="--c:${a.j.accent}"><div class="hx-art">${coverArt(a.id, a.j.accent, artText(a))}</div><span class="hx-tag">${esc(a.j.code)} · ${esc(a.type || 'Article')}</span><h3>${plain(a.title)}</h3><p>${esc(authorsShort(a.authors))}</p><span class="hx-read">Read the article →</span></a>`).join('')}
    </div>` : `<div class="hx-reel"><div class="hx-card on"><div class="hx-art">${coverArt('acri', '#1F7A4D')}</div><span class="hx-tag">Now accepting submissions</span><h3>Open-access research from the ACRI journal network</h3></div></div>`}
  </div>
</div>
<div class="wrap hx-stats">${count(journals.length, journals.length === 1 ? 'Journal' : 'Journals')}${count(pub.length, 'Articles published')}${count(authorsN, 'Authors')}${count(doiN, 'DOIs registered')}${count(100, 'Free to read', '%')}</div>
</section>
${ticker.length ? `<section class="hx-ticker" aria-label="Latest titles"><div class="hx-track">${[0, 1].map(k => `<div class="hx-run"${k ? ' aria-hidden="true"' : ''}>${ticker.map(a => `<a href="${a.path}"${k ? ' tabindex="-1"' : ''}><b style="color:${a.j.accent === '#0B2545' ? '#7DB4F0' : 'var(--hx-tick)'}">${esc(a.j.code)}</b>${esc(plain(a.title).slice(0, 90))}${plain(a.title).length > 90 ? '…' : ''}</a>`).join('<i>✦</i>')}<i>✦</i></div>`).join('')}</div></section>` : ''}

<section class="hx-manifesto"><div class="wrap"><span class="hx-k">What we stand for</span><p class="reveal">${manifesto}</p></div></section>
<section class="hx-sec hx-feat"><div class="wrap">
  <div class="hx-sh"><div><span class="hx-k">Featured research</span><h2>Read what's new.</h2></div><a class="hx-more" href="/online-first/">All new articles →</a></div>
  <div class="hx-fgrid">
    ${lead ? `<a class="hx-lead reveal" href="${lead.path}" style="--c:${lead.j.accent}"><div class="hx-art">${coverArt(lead.id, lead.j.accent, artText(lead))}</div><div class="hx-lead-b"><span class="hx-tag">${esc(lead.j.code)} · ${esc(lead.type || 'Article')}</span><h3>${lead.title}</h3><p>${esc(snippet(lead, 230))}</p><span class="meta">${esc(authorsShort(lead.authors))} · ${fmtDate(lead.published)}</span></div></a>` : ''}
    <div class="hx-list">${latest.filter(a => a !== lead).slice(0, 5).map((a, i) => `<a class="hx-li reveal" href="${a.path}" style="--c:${a.j.accent};transition-delay:${i * 60}ms"><span class="hx-n">${String(i + 1).padStart(2, '0')}</span><div><span class="hx-tag">${esc(a.j.code)} · ${esc(a.type || 'Article')}</span><h4>${a.title}</h4><span class="meta">${esc(authorsTiny(a.authors))} · ${fmtDate(a.published)}</span></div></a>`).join('') || '<p class="meta">New articles will appear here as they are published.</p>'}</div>
  </div>
</div></section>

<section class="hx-sec hx-journals" id="journals"><div class="wrap">
  <div class="hx-sh"><div><span class="hx-k">The network</span><h2>${journals.length} journals. One standard.</h2></div><a class="hx-more" href="/journals/">All journals →</a></div>
  <div class="hx-jgrid">${journals.map((j, i) => { const n = byJournal(j.slug).length; return `<a class="hx-j reveal" href="/journals/${j.slug}/" style="--c:${j.accent};transition-delay:${i * 80}ms">
    <div class="hx-j-top">${jimg(j, 'markWhite', 'hx-jm', '')}<span class="hx-j-code">${esc(j.code)}</span></div>
    <h3>${esc(j.name)}</h3><p>${esc((j.scope || '').slice(0, 150))}${(j.scope || '').length > 150 ? '…' : ''}</p>
    <div class="hx-j-meta"><span>${j.issnOnline ? 'e-ISSN ' + esc(j.issnOnline) : 'ISSN applied'}</span><span>${esc(j.frequency || '')}</span><span>${n ? n + ' article' + (n === 1 ? '' : 's') : 'New journal'}</span></div>
    <span class="hx-j-go">Enter journal <b>→</b></span></a>`; }).join('')}</div>
</div></section>

${topics.length ? `<section class="hx-sec hx-topics"><div class="wrap">
  <div class="hx-sh"><div><span class="hx-k">Browse by subject</span><h2>Find your field.</h2></div><a class="hx-more" href="/search/">Search everything →</a></div>
  <div class="hx-tgrid">${topics.map((t, i) => `<a class="hx-t reveal" href="/search/?q=${encodeURIComponent(t.name)}" style="--c:${t.c};transition-delay:${(i % 6) * 50}ms"><span class="hx-t-j">${esc(t.code)}</span><b>${esc(t.name)}</b><span class="hx-t-n">${t.n ? t.n + ' article' + (t.n === 1 ? '' : 's') : 'Open for submissions'} →</span></a>`).join('')}</div>
</div></section>` : ''}
<section class="hx-sec hx-why"><div class="wrap">
  <div class="hx-sh hx-sh-c"><div><span class="hx-k">Why publish with us</span><h2>Serious about research.<br><em>Generous with access.</em></h2></div></div>
  <div class="hx-pgrid">
    <div class="hx-pil reveal"><span class="hx-pn">01</span><h3>Free to read, forever</h3><p>Every article is open access under CC BY 4.0. No paywalls, no logins, and authors keep their copyright.</p></div>
    <div class="hx-pil reveal" style="transition-delay:80ms"><span class="hx-pn">02</span><h3>Real peer review</h3><p>Double-blind review by at least two independent experts, with editors bound by a signed ethics agreement.</p></div>
    <div class="hx-pil reveal" style="transition-delay:160ms"><span class="hx-pn">03</span><h3>Permanent and citable</h3><p>Every article gets a DOI through Zenodo (CERN)${doiN ? `, ${doiN} so far` : ''}, archived away from this website so the record lasts.</p></div>
    <div class="hx-pil reveal" style="transition-delay:240ms"><span class="hx-pn">04</span><h3>Built to be found</h3><p>Article pages carry the metadata Google Scholar and indexers read, plus a typeset PDF and ready-made citations.</p></div>
  </div>
</div></section>

<section class="hx-path"><div class="wrap">
  <div class="hx-path-l"><span class="hx-k" style="color:#7DD3A6">From manuscript to DOI</span><h2>One portal. Careful review. A permanent home for your work.</h2><p>Submit to any ACRI journal with one ACRI One account and follow every stage online.</p>
  <div class="hx-cta"><a class="hx-btn hx-btn-g" href="/portal/#/submit">Submit a manuscript <span>→</span></a><a class="hx-btn hx-btn-o" href="/how-it-works/">How it works</a></div></div>
  <ol class="hx-steps">${[['Prepare', 'Use the ACRI Journals manuscript template.'], ['Submit', 'The editorial office checks scope and format.'], ['Review', 'Double-blind review by two or more experts.'], ['Publish', 'Proofs, typeset PDF, DOI and certificate.']].map((s, i) => `<li class="reveal" style="transition-delay:${i * 90}ms"><b>${i + 1}</b><div><h4>${s[0]}</h4><p>${s[1]}</p></div></li>`).join('')}</ol>
</div></section>

<section class="hx-sec hx-nl"><div class="wrap">
  <div class="hx-nl-box reveal"><div><span class="hx-k">Stay in the loop</span><h2>New research, in your inbox.</h2><p>New articles and issues from ACRI Journals. No more than one email a week.</p></div>
  <form class="nl" data-api="subscribe"><input type="email" name="email" required placeholder="Your email address" aria-label="Email address"><button class="hx-btn hx-btn-g">Subscribe</button><p class="meta nl-msg" style="width:100%;margin:6px 0 0"></p></form></div>
</div></section>
<script>${HOME_JS}</script>`;
  return layout({ title: '', canonical: BASE + '/', bodyClass: 'hx', body, head: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: BASE, parentOrganization: { '@type': 'Organization', name: site.publisherName || site.publisher, url: site.publisherUrl } })}</script>` });
}
// Small, dependency-free motion for the homepage. Everything is skipped when the reader prefers reduced motion.
const HOME_JS = `(()=>{const R=matchMedia('(prefers-reduced-motion: reduce)').matches;
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(el=>R?el.classList.add('in'):io.observe(el));
const nums=document.querySelectorAll('[data-count]');const run=el=>{const t=+el.dataset.count,s=el.dataset.suf||'',d=1300,t0=performance.now();const f=n=>{const p=Math.min(1,(n-t0)/d),v=Math.round(t*(1-Math.pow(1-p,3)));el.textContent=v+s;if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)};
if(!R){const io2=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){run(e.target);io2.unobserve(e.target)}}));nums.forEach(n=>{n.textContent='0'+(n.dataset.suf||'');io2.observe(n)})}
const cards=[...document.querySelectorAll('.hx-card')],dots=[...document.querySelectorAll('.hx-dots button')];let i=0,tm;const show=k=>{i=(k+cards.length)%cards.length;cards.forEach((c,n)=>c.classList.toggle('on',n===i));dots.forEach((d,n)=>d.classList.toggle('on',n===i))};
const go=()=>{clearInterval(tm);if(!R&&cards.length>1)tm=setInterval(()=>show(i+1),5200)};dots.forEach(d=>d.onclick=()=>{show(+d.dataset.i);go()});const reel=document.querySelector('.hx-reel');if(reel){reel.onmouseenter=()=>clearInterval(tm);reel.onmouseleave=go}go();
const cv=document.querySelector('.hx-net');if(cv&&!R){const x=cv.getContext('2d');let W,H,P=[];const DPR=Math.min(2,devicePixelRatio||1);
const size=()=>{W=cv.clientWidth;H=cv.clientHeight;cv.width=W*DPR;cv.height=H*DPR;x.setTransform(DPR,0,0,DPR,0,0);const n=Math.round(W*H/16000);P=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:Math.random()*1.6+.6}))};
size();addEventListener('resize',size);let vis=true;new IntersectionObserver(e=>vis=e[0].isIntersecting).observe(cv);
const tick=()=>{if(vis){x.clearRect(0,0,W,H);for(const p of P){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1}
for(let a=0;a<P.length;a++){for(let b=a+1;b<P.length;b++){const dx=P[a].x-P[b].x,dy=P[a].y-P[b].y,d=dx*dx+dy*dy;if(d<13000){x.strokeStyle='rgba(125,211,166,'+(0.16*(1-d/13000))+')';x.lineWidth=1;x.beginPath();x.moveTo(P[a].x,P[a].y);x.lineTo(P[b].x,P[b].y);x.stroke()}}
x.fillStyle='rgba(200,225,255,.55)';x.beginPath();x.arc(P[a].x,P[a].y,P[a].r,0,7);x.fill()}}requestAnimationFrame(tick)};tick()}})();`;

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
  ${lead ? `<a class="feature" href="${lead.path}"><div class="art">${coverArt(lead.id, j.accent, artText(lead))}</div><span class="kicker">${esc(lead.type)}</span><h1>${lead.title}</h1><p>${esc(snippet(lead, 240))}</p><div class="meta">${esc(authorsShort(lead.authors))}</div></a>`
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

// ---------------------------------------------------------------- editorial board + personal pages
const plainOf = (p) => (p.plainName || String(p.name || '').split(',')[0]).trim();
const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').replace(/\b(dr|prof|mr|ms|mrs)\b/g, '').replace(/\s+/g, ' ').trim();
// Give every board entry a stable page slug (set by AES; derived from the name for older entries).
const boardOf = (j) => {
  if (j._board) return j._board;
  const used = {};
  j._board = (j.board || []).map(p => {
    const q = Object.assign({}, p);
    if (p.pageOff) q.slug = '';
    else {
      let s = p.slug || slugify(plainOf(p)) || 'member', base = s, n = 2;
      while (used[s] && used[s] !== normName(plainOf(p))) s = base + '-' + (n++);
      used[s] = normName(plainOf(p)); q.slug = s;
    }
    return q;
  });
  return j._board;
};
const personUrl = (j, p) => `/journals/${j.slug}/editorial-board/${p.slug}/`;
// Everywhere this person serves, across the network.
const servesOf = (p) => {
  const key = p.orcid || normName(plainOf(p)), out = [];
  for (const j of journals) for (const q of boardOf(j)) if (q.slug && q.group !== 'Publisher & journal management' && ((q.orcid && q.orcid === p.orcid) || normName(plainOf(q)) === normName(plainOf(p)))) { if (!key) continue; out.push({ j, q }); }
  return out;
};
const mgmtOf = (p) => MGMT.filter(q => (p.orcid && q.orcid === p.orcid) || normName(plainOf(q)) === normName(plainOf(p)));
const authoredBy = (p) => pub.filter(a => (a.authors || []).some(au => (p.orcid && au.orcid === p.orcid) || normName(fullName(au)) === normName(plainOf(p)))).sort((a, b) => String(b.published).localeCompare(String(a.published)));
const short = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, t.lastIndexOf(' ', n) > 0 ? t.lastIndexOf(' ', n) : n) + '…' : t; };
const ICONL = { scholar: 'Google Scholar', linkedin: 'LinkedIn', website: 'Website', profile: 'Institutional profile' };

function boardPage(j) {
  currentTab = 'board';
  const MG = 'Publisher & journal management';
  const groups = {}; for (const p of boardOf(j)) if (!(MGMT.length && (p.group === MG))) (groups[p.group || p.role] ||= []).push(p);
  if (MGMT.length) groups[MG] = MGMT.map(p => Object.assign({}, p, { _m: 1 }));
  const keys = Object.keys(groups).sort((a, b) => (a === MG) - (b === MG));
  const card = (p) => {
    const u = p._m ? (p.slug ? mgmtUrl(p) : '') : p.slug ? personUrl(j, p) : '';
    const nm = u ? `<a class="pname" href="${u}">${esc(p.name)}</a>` : esc(p.name);
    return `<div class="person${p.photo ? ' has-photo' : ''}">${p.photo ? (u ? `<a href="${u}" tabindex="-1" aria-hidden="true">` : '') + `<img class="pph" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="84" height="84">` + (u ? '</a>' : '') : ''}<span class="role">${esc(p.role)}</span><b>${nm}</b>${p.designation ? `<span>${esc(p.designation)}${p.department ? ', ' + esc(p.department) : ''}</span>` : ''}<span>${esc(p.affiliation || '')}</span>${p.address ? `<span class="lbl">Institutional address</span><span>${esc(p.address)}</span>` : ''}${p.email ? `<span><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></span>` : ''}${p.profile ? `<span><a href="${esc(p.profile)}" rel="noopener">Institutional profile ↗</a></span>` : ''}${p.orcid ? `<span><a class="orcidl" href="https://orcid.org/${esc(p.orcid)}" rel="noopener" title="ORCID iD">${ORCID}${esc(p.orcid)}</a></span>` : ''}${p.since ? `<span>Serving since ${esc(p.since)}</span>` : ''}${p.bio ? `<p class="pbio">${esc(short(p.bio, 240))}</p>` : ''}${u ? `<a class="pmore" href="${u}">View full profile →</a>` : ''}</div>`;
  };
  return layout({ j, title: 'Editorial Board', canonical: BASE + `/journals/${j.slug}/editorial-board/`, body: `<div class="wrap page"><div class="page-h"><span class="kicker">${esc(j.code)}</span><h1>Editorial Board</h1><p>The editors set the journal's direction, handle manuscripts and uphold its standards of review. Every editor has agreed to serve, signs the <a href="/policies/editorial-independence/">ACRI Journals Editorial Agreement</a> and serves a fixed term. The board is reviewed at least once a year.</p></div>
  ${keys.map(r => `<section class="toc-sec"><h2>${esc(r)}</h2><div class="board" style="margin-top:18px">${groups[r].map(card).join('')}</div></section>`).join('') || '<p class="meta">The editorial board is being appointed.</p>'}
  <section class="toc-sec"><h2>Editorial office</h2><div class="prose" style="margin-top:14px;font-size:16px">${esc(pubInfo().name)}. To reach the journal office or the Editor-in-Chief, use the <a href="/contact/?journal=${j.slug}">contact form</a>.</div></section>
  </div>` });
}

function personPage(j, p) {
  currentTab = 'board';
  const serves = servesOf(p), canon = serves[0] ? personUrl(serves[0].j, serves[0].q) : personUrl(j, p);
  const arts = authoredBy(p);
  const links = [['profile', p.profile], ['scholar', p.scholar], ['linkedin', p.linkedin], ['website', p.website]].filter(x => x[1]);
  const pos = [p.designation && (p.designation + (p.department ? ', ' + p.department : '')), p.affiliation].filter(Boolean);
  const ld = { '@context': 'https://schema.org', '@type': 'ProfilePage', url: BASE + canon, mainEntity: { '@type': 'Person', name: plainOf(p), ...(p.designation ? { jobTitle: p.designation } : {}), ...(p.affiliation ? { affiliation: { '@type': 'Organization', name: p.affiliation, ...(p.address ? { address: p.address } : {}) } } : {}), ...(p.photo ? { image: BASE + p.photo } : {}), ...(p.bio ? { description: short(p.bio, 300) } : {}), ...(p.interests?.length ? { knowsAbout: p.interests } : {}), ...(p.orcid ? { identifier: 'https://orcid.org/' + p.orcid } : {}), sameAs: [p.orcid && 'https://orcid.org/' + p.orcid, p.profile, p.scholar, p.linkedin, p.website].filter(Boolean), memberOf: serves.map(s => ({ '@type': 'Organization', name: s.j.name, url: `${BASE}/journals/${s.j.slug}/` })) } };
  const desc = `${plainOf(p)} — ${p.role}, ${j.name}.${pos.length ? ' ' + pos.join(', ') + '.' : ''}`;
  const body = `<div class="wrap page"><nav class="crumbs"><a href="/journals/${j.slug}/">${esc(j.code)}</a> › <a href="/journals/${j.slug}/editorial-board/">Editorial Board</a> › <span>${esc(plainOf(p))}</span></nav>
  <div class="pp">
    <aside class="pp-side">
      ${p.photo ? `<img class="pp-ph" src="${esc(p.photo)}" alt="${esc(plainOf(p))}" width="240" height="240">` : `<div class="pp-ph pp-ini" aria-hidden="true">${esc(plainOf(p).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>`}
      ${p.orcid ? `<a class="orcidl pp-orcid" href="https://orcid.org/${esc(p.orcid)}" rel="noopener">${ORCID}${esc(p.orcid)}</a>` : ''}
      ${links.length ? `<div class="pp-links">${links.map(([k, v]) => `<a href="${esc(v)}" rel="noopener">${ICONL[k]} ↗</a>`).join('')}</div>` : ''}
      ${p.email ? `<a class="pp-mail" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}
    </aside>
    <div class="pp-main">
      <span class="kicker" style="color:var(--accent)">${esc(p.role)} · ${esc(j.code)}</span>
      <h1>${esc(p.name)}</h1>
      ${pos.length ? `<p class="pp-pos">${pos.map(esc).join('<br>')}</p>` : ''}
      ${p.address ? `<p class="pp-addr"><span class="lbl">Institutional address</span>${esc(p.address)}</p>` : ''}
      ${p.bio ? `<section><h2>Biography</h2><div class="prose pp-bio">${String(p.bio).split(/\n{2,}|\r?\n/).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('')}</div></section>` : ''}
      ${p.interests?.length ? `<section><h2>Research interests</h2><ul class="pp-tags">${p.interests.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      <section><h2>Roles at ACRI Journals</h2><ul class="pp-roles">${mgmtOf(p).map(m => `<li><a href="${mgmtUrl(m)}">${esc(m.role)}</a>, ACRI Journals management team</li>`).join('')}${serves.map(s => `<li><a href="${personUrl(s.j, s.q)}">${esc(s.q.role)}</a>, <a href="/journals/${s.j.slug}/"><i>${esc(s.j.name)}</i></a>${s.q.since ? ` <span class="meta">· since ${esc(s.q.since)}</span>` : ''}</li>`).join('')}</ul></section>
      ${arts.length ? `<section><h2>Articles in ACRI Journals</h2><div class="pp-arts">${arts.map(a => itemCard(a)).join('')}</div></section>` : ''}
      <p class="pp-note">Board members keep this page up to date through their AES profile. Peer-review and editorial work on individual manuscripts is confidential and is not listed. <a href="/journals/${j.slug}/editorial-board/">← Back to the editorial board</a></p>
    </div>
  </div></div>`;
  return layout({ j, title: `${plainOf(p)} · Editorial Board`, desc, canonical: BASE + canon, body, head: `<meta property="og:type" content="profile"><meta property="og:title" content="${esc(plainOf(p))}">${p.photo ? `<meta property="og:image" content="${esc(BASE + p.photo)}">` : ''}<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` });
}

// ---------------------------------------------------------------- management team
const paras = (t) => String(t || '').split(/\n{2,}|\r?\n/).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');
const initials = (p) => esc(plainOf(p).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase());
function managementPage() {
  const msgs = MGMT.filter(p => p.message);
  const card = (p) => { const u = p.slug ? mgmtUrl(p) : ''; return `<div class="person mg${p.photo ? ' has-photo' : ''}">${p.photo ? `<img class="pph" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="84" height="84">` : `<div class="pph pini">${initials(p)}</div>`}<span class="role">${esc(p.role)}</span><b>${u ? `<a class="pname" href="${u}">${esc(p.name)}</a>` : esc(p.name)}</b>${p.designation ? `<span>${esc(p.designation)}${p.department ? ', ' + esc(p.department) : ''}</span>` : ''}${p.affiliation ? `<span>${esc(p.affiliation)}</span>` : ''}${p.bio ? `<p class="pbio">${esc(short(p.bio, 220))}</p>` : ''}${u ? `<a class="pmore" href="${u}">View full profile →</a>` : ''}</div>`; };
  const body = `<div class="wrap page"><div class="page-h"><span class="kicker">ACRI Journals</span><h1>Management</h1><p>The management team looks after ACRI Journals as a whole: its governance, operations, standards and growth. It appoints editors for fixed terms but takes no part in decisions on individual manuscripts, which belong to each journal's editors. See <a href="/policies/editorial-independence/">Editorial independence and governance</a>.</p></div>
  ${msgs.map(p => `<section class="mg-msg"><span class="kicker">Message from the ${esc(p.role)}</span><div class="mg-msg-b prose">${paras(p.message)}</div><div class="mg-sig">${p.photo ? `<img src="${esc(p.photo)}" alt="" width="52" height="52">` : ''}<div><b>${esc(plainOf(p))}</b><span>${esc(p.role)}, ACRI Journals</span></div>${p.slug ? `<a href="${mgmtUrl(p)}">Profile →</a>` : ''}</div></section>`).join('')}
  <section class="toc-sec"><h2>Management team</h2>${MGMT.length ? `<div class="board" style="margin-top:18px">${MGMT.map(card).join('')}</div>` : '<p class="meta" style="margin-top:14px">The management team is being appointed.</p>'}</section>
  <section class="toc-sec"><h2>Editorial boards</h2><div class="board" style="margin-top:18px">${journals.map(j => `<a class="person" href="/journals/${j.slug}/editorial-board/" style="text-decoration:none;border-top:4px solid ${j.accent}"><span class="role" style="color:${j.accent}">${esc(j.code)}</span><b>${esc(j.name)}</b><span>Editorial board →</span></a>`).join('')}</div></section></div>`;
  return layout({ title: 'Management', canonical: BASE + '/management/', desc: 'The management team of ACRI Journals.', body });
}
function mgmtPersonPage(p) {
  const links = [['profile', p.profile], ['scholar', p.scholar], ['linkedin', p.linkedin], ['website', p.website]].filter(x => x[1]);
  const pos = [p.designation && (p.designation + (p.department ? ', ' + p.department : '')), p.affiliation].filter(Boolean);
  const serves = servesOf(p), arts = authoredBy(p);
  const ld = { '@context': 'https://schema.org', '@type': 'ProfilePage', url: BASE + mgmtUrl(p), mainEntity: { '@type': 'Person', name: plainOf(p), jobTitle: p.role, worksFor: { '@type': 'Organization', name: site.name, url: BASE }, ...(p.photo ? { image: BASE + p.photo } : {}), ...(p.bio ? { description: short(p.bio, 300) } : {}), sameAs: [p.orcid && 'https://orcid.org/' + p.orcid, p.profile, p.scholar, p.linkedin, p.website].filter(Boolean) } };
  const body = `<div class="wrap page"><nav class="crumbs"><a href="/">ACRI Journals</a> › <a href="/management/">Management</a> › <span>${esc(plainOf(p))}</span></nav>
  <div class="pp"><aside class="pp-side">${p.photo ? `<img class="pp-ph" src="${esc(p.photo)}" alt="${esc(plainOf(p))}" width="240" height="240">` : `<div class="pp-ph pp-ini" aria-hidden="true">${initials(p)}</div>`}
    ${p.orcid ? `<a class="orcidl pp-orcid" href="https://orcid.org/${esc(p.orcid)}" rel="noopener">${ORCID}${esc(p.orcid)}</a>` : ''}
    ${links.length ? `<div class="pp-links">${links.map(([k, v]) => `<a href="${esc(v)}" rel="noopener">${ICONL[k]} ↗</a>`).join('')}</div>` : ''}
    ${p.email ? `<a class="pp-mail" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}</aside>
  <div class="pp-main"><span class="kicker" style="color:var(--green)">${esc(p.role)} · ACRI Journals</span><h1>${esc(p.name)}</h1>
    ${pos.length ? `<p class="pp-pos">${pos.map(esc).join('<br>')}</p>` : ''}
    ${p.message ? `<section><h2>Message from the ${esc(p.role)}</h2><div class="prose pp-bio mg-quote">${paras(p.message)}</div></section>` : ''}
    ${p.bio ? `<section><h2>Biography</h2><div class="prose pp-bio">${paras(p.bio)}</div></section>` : ''}
    ${p.interests?.length ? `<section><h2>Interests</h2><ul class="pp-tags">${p.interests.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    <section><h2>Roles at ACRI Journals</h2><ul class="pp-roles"><li>${esc(p.role)}, ACRI Journals management team${p.since ? ` <span class="meta">· since ${esc(p.since)}</span>` : ''}</li>${serves.map(s => `<li><a href="${personUrl(s.j, s.q)}">${esc(s.q.role)}</a>, <a href="/journals/${s.j.slug}/"><i>${esc(s.j.name)}</i></a></li>`).join('')}</ul></section>
    ${arts.length ? `<section><h2>Articles in ACRI Journals</h2><div class="pp-arts">${arts.map(a => itemCard(a)).join('')}</div></section>` : ''}
    <p class="pp-note">The management team takes no part in decisions on individual manuscripts. <a href="/management/">← Back to Management</a></p></div></div></div>`;
  return layout({ title: `${plainOf(p)} · ${p.role}`, desc: `${plainOf(p)}, ${p.role} of ACRI Journals.`, canonical: BASE + mgmtUrl(p), body, head: `<meta property="og:type" content="profile">${p.photo ? `<meta property="og:image" content="${esc(BASE + p.photo)}">` : ''}<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` });
}

function journalAbout(j) {
  currentTab = 'about';
  const P = pubInfo(), F = site.fees || {};
  const fees = F.confirmed ? (Number(F.apc) > 0 ? `${esc(j.code)} charges an article processing charge of ${esc(F.currency || 'INR')} ${esc(F.apc)} after acceptance. There are no submission or review fees. ${esc(F.note || '')} See the <a href="/policies/fees/">fees and waivers policy</a>.` : `${esc(j.code)} charges <b>no fees of any kind</b>: no submission, review, processing or publication charges. Publication costs are met by the publisher.`) : `There are no submission or peer-review fees. See the <a href="/policies/fees/">fees and waivers policy</a>.`;
  return layout({ j, title: 'About', canonical: BASE + `/journals/${j.slug}/about/`, body: `<div class="wrap page cols"><nav class="side-nav"><a href="#scope">Aims and scope</a><a href="#particulars">Journal particulars</a><a href="#ownership">Ownership & management</a><a href="#review">Peer review</a><a href="#fees">Fees</a><a href="#oa">Open access & copyright</a><a href="#indexing">Indexing & archiving</a><a href="#contact">Contact</a></nav>
  <div class="prose"><div class="jabout-logos"><div class="jl">${fullLogo(j)}</div><div class="ap">An ${MINIWM} publication</div></div><h1 style="font:600 34px/1.2 var(--serif);margin:18px 0 18px">About ${esc(j.name)}</h1>
  <h2 id="scope">Aims and scope</h2><p>${esc(j.scope)}</p><p><b>Subjects:</b> ${(j.subjects || []).map(esc).join(', ')}.</p><p><b>Article types:</b> ${(j.articleTypes || []).map(esc).join(', ')}.</p><p><b>Audience:</b> researchers, practitioners, educators and policymakers. ${esc(j.code)} is an ${esc(j.scopeType || 'international')} journal and welcomes submissions from authors in every country.</p>
  <h2 id="particulars">Journal particulars</h2><div class="rbox" style="font-family:var(--sans)">${particulars(j)}</div>
  <h2 id="ownership">Ownership and management</h2><p>${esc(j.name)} is owned and published by <b>${esc(P.name)}</b>${P.web ? ` (<a href="${esc(P.web)}">${esc(P.web.replace('https://', ''))}</a>)` : ''}, and is published on the ACRI Journals platform, part of ACRIVERSE. ${j.school ? `It is affiliated with the ${esc(j.school)}. ` : ''}The publisher appoints the editors for fixed terms under a written agreement and does not take part in decisions on individual manuscripts. Editors are not paid according to the number of articles accepted. See <a href="/policies/editorial-independence/">Editorial independence and governance</a> and the <a href="editorial-board/">Editorial Board</a>.</p>
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
// ---------------------------------------------------------------- explainer pages: how it works, AES
function howItWorksPage() {
  const steps = [
    ['Prepare', 'Before you submit', 'Authors write the paper with the ACRI Journals Word template, which already has the right headings, reference style and figure captions. A separate title page carries the names, so the manuscript itself stays anonymous for review.', 'You'],
    ['Submit', 'Day 0', 'Authors sign in with their ACRI One account and submit through a six-step form: journal and article type, title and abstract, authors and affiliations, files, declarations (ethics, funding, conflicts, AI use) and a final check. Every co-author is told by email.', 'Minutes'],
    ['Technical check', 'Within about 5 working days', 'The editorial office checks scope, format, anonymity, completeness and similarity. If something is missing, the paper is returned once with a clear list of corrections, rather than rejected.', 'Editorial office'],
    ['Editor', 'Next few days', 'The Editor-in-Chief or a Senior Editor reads the paper and either declines it without review (with reasons) or assigns a handling editor from the editorial board who knows the field.', 'Editors'],
    ['Peer review', 'Usually 3–6 weeks', 'The handling editor invites at least two independent reviewers. Review is double-blind: reviewers do not see the authors\' names, and authors do not see the reviewers\'. Each reviewer chooses how many days they need (usually 21), reads the manuscript in a secure viewer, and sends comments for the authors and, separately, for the editor.', 'Reviewers'],
    ['Decision', 'After the reviews', 'The Editor-in-Chief decides: accept, minor revision, major revision or reject. Authors receive the decision letter with every reviewer\'s comments. Revised papers go back to the same editor, and often the same reviewers.', 'Editor-in-Chief'],
    ['Production', 'About 1–2 weeks after acceptance', 'A DOI is reserved the moment a paper is accepted. Authors upload final files; AES converts the Word file into a web article and a typeset two-column PDF, with references linked and figures optimised.', 'AES + office'],
    ['Proofs', '3 days for authors', 'Authors check the web page and PDF exactly as they will be published and either approve them or list corrections. Only errors can be corrected at this stage.', 'Authors'],
    ['Publication', 'Published online', 'The article goes live, free to read for everyone under CC BY 4.0. The DOI is registered with DataCite through Zenodo (CERN), a copy is archived there, and each author receives a certificate of publication.', 'Everyone'],
    ['Discovery', 'The weeks after', 'Article pages carry the metadata Google Scholar and indexers read, the sitemap updates itself, and the article appears in its journal issue, in "Just Published", in search and in the RSS feed. Subscribers can be told by email.', 'The world'],
  ];
  return layout({ title: 'How ACRI Journals works', canonical: BASE + '/how-it-works/', desc: 'The life of a paper at ACRI Journals: submission, technical check, double-blind peer review, decision, production, proofs, publication, DOI and discovery.', body: `
<section class="onehero hiw"><div class="wrap"><span class="kicker" style="color:#7DD3A6">How it works</span><h1>The life of a paper</h1><p>From the moment you submit to the day your article is read and cited, here is everything that happens at ACRI Journals, who does it, and roughly how long it takes.</p></div></section>
<section class="sec"><div class="wrap" style="max-width:920px"><ol class="tl">${steps.map((x, i) => `<li><span class="n">${i + 1}</span><div><span class="kicker">${esc(x[1])} · ${esc(x[3])}</span><h3>${esc(x[0])}</h3><p>${esc(x[2])}</p></div></li>`).join('')}</ol>
<p class="meta" style="margin-top:18px">Times are typical, not guaranteed: they depend on the field, on reviewers' availability and on how quickly revisions come back. You can follow every stage of your own paper in the portal.</p></div></section>
<section class="sec pillars"><div class="wrap"><div class="sec-h"><div><span class="kicker">Who does what</span><h2>The people behind every paper</h2></div></div><div class="pgrid">
  <div class="pil"><h3>Authors</h3><p>Submit, follow every stage online, respond to reviewers, approve proofs, and download their certificates of publication.</p></div>
  <div class="pil"><h3>Reviewers</h3><p>Independent experts who choose how long they need and how many reviews they take, and review in a secure viewer. Their identity is never shown to authors.</p></div>
  <div class="pil"><h3>Editors</h3><p>Handling editors manage review; the Editor-in-Chief makes decisions. Every editor serves a fixed term under a signed agreement on ethics, confidentiality and conflicts of interest.</p></div>
  <div class="pil"><h3>Editorial office</h3><p>Runs technical checks, production, proofs and publication, answers the contact form, and keeps the journals' records, archive and indexing up to date.</p></div>
</div></div></section>
<section class="sec"><div class="wrap" style="max-width:920px"><div class="sec-h"><div><span class="kicker">Principles</span><h2>What we hold ourselves to</h2></div></div>
<div class="prose" style="font-size:16.5px">
<p><b>Free to read, forever.</b> Every article is open access under CC BY 4.0. Authors keep their copyright, and the published version is archived outside our own website so it lasts.</p>
<p><b>Decisions on merit.</b> Editors decide on scholarly quality alone. The publisher does not take part in decisions on individual papers, and editors handle no paper where they have a conflict of interest. Papers by editors or by the publisher's own people are handled entirely by someone else.</p>
<p><b>Honest about mistakes.</b> Errors are corrected openly with a correction notice, never silently. Concerns about a paper can be raised with the editorial office at any time.</p>
<p>Read the full <a href="/policies/peer-review/">peer review policy</a>, <a href="/policies/ethics/">publication ethics</a> and <a href="/policies/editorial-independence/">editorial independence</a> policies.</p>
</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px"><a class="btn btn-primary" href="/portal/#/submit">Submit a manuscript</a><a class="btn btn-ghost" href="/aes/">About AES, our editorial system</a><a class="btn btn-ghost" href="/for-authors/">Author guidelines</a></div>
</div></section>` });
}
function aesPage() {
  const E = readJSON(path.join(ROOT, 'config/aes-errors.json'), { version: '2.0.0' });
  const roles = [
    ['Authors', ['Submit to any ACRI journal from one account, in six guided steps', 'Save drafts and come back later', 'See where your paper is at every stage, in plain words', 'Read decisions and every reviewer\'s comments in one place', 'Upload revisions with a response to reviewers', 'Check and approve proofs of the web page and PDF', 'Download a signed certificate of publication for each author']],
    ['Reviewers', ['Accept or decline an invitation with one click', 'Read the manuscript in a secure viewer, no download needed', 'Choose how many days you need and how many reviews you take at a time', 'Pause reviewing while you are away', 'Score the paper and write separate comments for authors and editor', 'See the decision and the other reviewers\' comments afterwards']],
    ['Editors and the board', ['Join by a personal link: add your own photo, bio and details, set a password and sign the editorial agreement', 'Handle manuscripts: invite reviewers, follow up, recommend a decision', 'Editor-in-Chief: assign editors and record decisions with the decision letter', 'Write letters on the journal letterhead, signed by you', 'Recommend authors, reviewers, board members and papers to the office', 'Receive a certificate of service at the end of your term']],
    ['Editorial office', ['Technical checks, production, proofs and publication in one place', 'DOIs reserved on acceptance and registered automatically through Zenodo', 'Editorial board appointments with signed agreements, term reminders and automatic endings', 'Letters, notices and certificates on the letterhead, with a numbered register', 'Email from the portal, newsletters and calls for papers with one-click unsubscribe', 'ISSN, DOAJ, Web of Science and Scopus readiness checklists', 'One settings page for every connection, and an error log with reference numbers']],
  ];
  return layout({ title: 'AES · ACRI Editorial System', canonical: BASE + '/aes/', desc: 'AES, the ACRI Editorial System, runs submission, peer review, production and publication for ACRI Journals.', body: `
<section class="onehero"><div class="wrap"><span class="onemark" style="font-size:34px"><b>AES</b><i></i><span>ACRI EDITORIAL SYSTEM</span></span>
<h1>The system behind ACRI Journals.</h1><p>AES, the ACRI Editorial System, is the platform ACRI built to run its journals: submission, peer review, editorial decisions, production, publication and everything around them. Version ${esc(E.version)}.</p>
<div class="onecta"><a class="btn btn-green" href="/portal/">Open the editorial portal</a><a class="btn btn-line" href="/how-it-works/">How a paper moves through it</a></div></div></section>
<section class="sec"><div class="wrap" style="max-width:920px"><div class="sec-h"><div><span class="kicker">Why we built it</span><h2>Built in-house, for the way we work</h2></div></div>
<div class="prose" style="font-size:16.5px">
<p>Most journals rent a large commercial system. We built our own, so that it fits how ACRI's journals work and so that it stays fast, open and affordable for an independent publisher.</p>
<p>Two parts work together. The <b>public website</b>, where articles are read, is a set of ready-made pages served from a global network, so articles open almost instantly anywhere and remain easy for search engines and Google Scholar to read. The <b>editorial portal</b> is where authors, reviewers and editors sign in with their <a href="/one/">ACRI One</a> account and do their work. When an article is published, AES builds its web page, typeset PDF, citations and feeds, and the site updates itself within minutes.</p>
<p>Published work is preserved outside our own website: every article is deposited with Zenodo, the research repository run by CERN, which also registers its DOI.</p>
</div></div></section>
<section class="sec pillars"><div class="wrap"><div class="sec-h"><div><span class="kicker">The editorial portal</span><h2>What AES does for each person</h2></div></div>
<div class="pgrid aesroles">${roles.map(([t, l]) => `<div class="pil"><h3>${esc(t)}</h3><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></div></section>
<section class="sec"><div class="wrap" style="max-width:920px"><div class="sec-h"><div><span class="kicker">Built to be trusted</span><h2>Privacy, security and reliability</h2></div></div>
<div class="prose" style="font-size:16.5px">
<p><b>Confidential review.</b> Manuscripts under review are visible only to the editors handling them and to invited reviewers, who read them in a secure viewer. Author names are kept off the review copy.</p>
<p><b>Your account.</b> Passwords are never stored as written; they are kept only in a protected, scrambled form. ACRI will never ask for your password by email or phone.</p>
<p><b>When something goes wrong.</b> AES shows a short code (for example <code>AES-NET-001</code>) that explains what happened. See the <a href="/aes/errors/">list of error codes</a>. If a page is slow, AES retries on its own and reloads gently, so your work is not lost.</p>
<p><b>Your data.</b> Personal data is used only to run the journals, as set out in our <a href="/policies/privacy/">privacy policy</a>.</p>
</div></div></section>
<section class="sec" style="border:0"><div class="wrap" style="max-width:920px"><div class="sec-h"><div><span class="kicker">Release notes</span><h2>Versions</h2></div></div>
<table class="aes-err"><tbody>
<tr><td><code>AES 2.0.0</code></td><td><b>November 2026</b><p>The name AES; ACRI One accounts; error codes and an error log; gentler loading with automatic retries; board members join by a personal link and add their own photo, bio and details; reviewing preferences; letters on the journal letterhead; recommendations; certificates of publication; full Zenodo metadata.</p></td></tr>
<tr><td><code>AES 1.0</code></td><td><b>November 2026</b><p>First release: the ACRI Journals website, submission and peer review, production with automatic web and PDF typesetting, DOIs through Zenodo, editorial board appointments with signed agreements, campaigns, partners, back issues, policies and ISSN and indexing readiness.</p></td></tr>
</tbody></table></div></section>` });
}

function onePage() {
  const mark = (size) => `<span class="onemark" style="font-size:${size}px"><b>ACRI</b><i></i><span>ONE</span></span>`;
  return layout({ title: 'ACRI One', canonical: BASE + '/one/', desc: 'ACRI One is your single account for ACRI services, starting with ACRI Journals: submit, review and edit across every ACRI journal.', body: `
<section class="onehero"><div class="wrap">
  ${mark(34)}
  <h1>One account for ACRI.</h1>
  <p>ACRI One is the account you use to sign in to ACRI's services. Today it opens ACRI Journals, where you can submit your research, review manuscripts and work as an editor across every ACRI journal.</p>
  <div class="onecta"><a class="btn btn-green" href="/portal/#/login">Sign in with ACRI One</a><a class="btn btn-line" href="/portal/#/register">Create an account</a></div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-h"><div><span class="kicker">Available with ACRI One</span><h2>Services</h2></div></div>
  <div class="onegrid">
    <a class="onesvc" href="/portal/#/login"><span class="kicker">Live</span><h3>ACRI Journals</h3><p>Submit manuscripts, follow every stage of review, act as a reviewer or editor, and download your certificates of publication. Runs on <u>AES</u>, the ACRI Editorial System.</p><span class="go">Sign in →</span></a>
    <div class="onesvc soon"><span class="kicker">Planned</span><h3>More ACRI services</h3><p>Other ACRI platforms will join ACRI One over time. Each will be listed here when it is ready to use your account.</p></div>
  </div>
</div></section>
<section class="sec pillars"><div class="wrap"><div class="pgrid onefaq">
  <div class="pil"><h3>One account, every journal</h3><p>You do not need a separate login for each journal. The same account works for IJBMRS, IJELF, IJSRI and every future ACRI journal.</p></div>
  <div class="pil"><h3>Your roles follow you</h3><p>Whether you are an author, a reviewer, an editor or all three, you see the right tools after signing in.</p></div>
  <div class="pil"><h3>Forgot your password?</h3><p>Use <a href="/portal/#/forgot">Reset your password</a>. We email you a link that is valid for one hour.</p></div>
  <div class="pil"><h3>Keep it safe</h3><p>ACRI will never ask for your password by email or phone. Sign in only at acriindia.org.in.</p></div>
</div></div></section>`, });
}

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
  page('/one/', onePage());
  page('/how-it-works/', howItWorksPage());
  page('/aes/', aesPage());
  page('/management/', managementPage());
  for (const p of MGMT) if (p.slug) page(mgmtUrl(p), mgmtPersonPage(p));
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
    for (const p of boardOf(j)) if (p.slug && !(MGMT.length && p.group === 'Publisher & journal management')) page(personUrl(j, p), personPage(j, p));
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
