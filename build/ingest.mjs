// ACRI Journals — manuscript ingest.
// content/incoming/<ID>/ { meta.json, manuscript.docx, figures/Figure1.png ... }
//   → content/articles/<journal>/<ID>/ { article.json, body.html, figures/*.webp }
// Apps Script places files in content/incoming when an editor clicks "Send to production".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONTENT, readJSON, write, strip, slugify } from './lib.mjs';

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { console.warn('sharp not installed: figures will be copied without resizing'); }

const INCOMING = path.join(CONTENT, 'incoming');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const KEEP = process.argv.includes('--keep');

const TPL = path.join(path.dirname(new URL(import.meta.url).pathname), 'pandoc-tpl.html');
fs.writeFileSync(TPL, '$title$\n@@SPLIT@@\n$subtitle$\n@@SPLIT@@\n$abstract$\n@@SPLIT@@\n$body$\n');

const ABS_LABELS = ['Importance', 'Objective', 'Objectives', 'Background', 'Purpose', 'Design, Setting, and Participants', 'Design', 'Methods', 'Methodology', 'Setting', 'Participants', 'Interventions', 'Intervention', 'Exposure', 'Exposures', 'Main Outcomes and Measures', 'Results', 'Findings', 'Observations', 'Evidence Review', 'Conclusions and Relevance', 'Conclusions', 'Conclusion', 'Implications', 'Originality/Value', 'Originality', 'Limitations', 'Practical Implications'];

function pandoc(docx, mediaDir) {
  const out = execFileSync('pandoc', [docx, '-f', 'docx', '-t', 'html5', '--template', TPL, '--mathml', '--wrap=none',
    '--track-changes=accept', '--shift-heading-level-by=1', `--extract-media=${mediaDir}`, '--resource-path=.'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const [title, subtitle, abstract, body] = out.split('@@SPLIT@@').map(s => s.trim());
  return { title, subtitle, abstract, body };
}

// Split body HTML into [{h, id, html}] by top-level <h2>.
function sections(html) {
  const parts = html.split(/(?=<h2[\s>])/);
  return parts.map(p => {
    const m = p.match(/^<h2([^>]*)>([\s\S]*?)<\/h2>/);
    if (!m) return { h: '', id: '', html: p };
    const id = (m[1].match(/id="([^"]*)"/) || [])[1] || slugify(strip(m[2]));
    return { h: strip(m[2]), id, html: p.slice(m[0].length), raw: p };
  });
}
const paras = (html) => [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].trim());

function parseAbstract(html) {
  const ps = paras(html);
  if (!ps.length) return null;
  const secs = []; let structured = false;
  for (const p of ps) {
    const m = p.match(/^<strong>([^<]+?)[:.]?\s*<\/strong>[:.]?\s*([\s\S]*)$/) || p.match(/^([A-Z][A-Za-z ,/]+?):\s+([\s\S]*)$/);
    const label = m && ABS_LABELS.find(l => l.toLowerCase() === m[1].trim().replace(/[:.]$/, '').toLowerCase());
    if (label) { structured = true; secs.push({ heading: label, text: m[2].trim() }); }
    else if (secs.length && structured) secs[secs.length - 1].text += ' ' + p;
    else secs.push({ heading: '', text: p });
  }
  return { structured, sections: secs };
}

function parseKeyPoints(html) {
  const kp = {};
  for (const p of paras(html)) {
    const m = p.replace(/<\/?strong>/g, '').match(/^(Question|Findings|Meaning)\s*[:.]?\s*([\s\S]*)$/i);
    if (m) kp[m[1].toLowerCase()] = m[2].trim();
  }
  return Object.keys(kp).length ? kp : null;
}

function parseRefs(html) {
  let items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/^<p>|<\/p>$/g, '').trim());
  if (!items.length) items = paras(html).map(p => p.replace(/^\[?\d+[\].)]\s*/, ''));
  return items.filter(t => strip(t).length > 3).map(text => {
    const doi = (strip(text).match(/\b(10\.\d{4,9}\/[^\s"<>]+?)(?=[.,;]?(\s|$))/) || [])[1] || '';
    const linked = text.replace(/(?<!["'>\/])(https?:\/\/[^\s<]+[^\s<.,;])/g, '<a href="$1" rel="nofollow">$1</a>');
    return { text: linked, ...(doi ? { doi } : {}) };
  });
}

// Superscript citation numbers → links to references.
function linkCitations(html) {
  return html.replace(/<sup>([\d,\s–\-]+)<\/sup>/g, (m, inner) => {
    const linked = inner.replace(/\d+/g, n => `<a class="xref" href="#ref-${n}">${n}</a>`);
    return `<sup>${linked}</sup>`;
  });
}

async function processImage(src, destDir, base) {
  fs.mkdirSync(destDir, { recursive: true });
  const out = path.join(destDir, base + '.webp'), sm = path.join(destDir, base + '-sm.webp');
  if (sharp && !/\.svg$/i.test(src)) {
    const img = sharp(src, { density: 300 }).flatten({ background: '#ffffff' });
    const metaI = await img.metadata();
    await img.clone().resize({ width: Math.min(2400, metaI.width || 2400), withoutEnlargement: true }).webp({ quality: 88 }).toFile(out);
    await img.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82 }).toFile(sm);
    return { large: base + '.webp', small: base + '-sm.webp' };
  }
  const ext = path.extname(src).toLowerCase();
  fs.copyFileSync(src, path.join(destDir, base + ext));
  return { large: base + ext, small: base + ext };
}

// Wrap image paragraphs + "Figure N." captions, and "Table N." captions + tables.
async function structureDisplays(html, { mediaRoot, figDir, figureFiles }) {
  const figs = [];
  // 1) Figures: <p><img …></p> or <figure>…</figure> followed by caption paragraph.
  const NP = '(?:(?!<\\/p>)[\\s\\S])';
  // Captions written above the image are moved below it first.
  html = html.replace(new RegExp(`(<p>(?:<strong>)?\\s*(?:Figure|Fig\\.?)\\s*\\d+\\s*(?:<\\/strong>)?\\s*[.:]${NP}*<\\/p>)\\s*(<p>\\s*<img [^>]*>\\s*<\\/p>|<figure>[\\s\\S]*?<\\/figure>)`, 'g'), '$2$1');
  const figRe = new RegExp(`(?:<figure>\\s*(<img [^>]*>)[\\s\\S]*?<\\/figure>|<p>\\s*(<img [^>]*>)\\s*<\\/p>)(?:\\s*<p>(?!(?:<strong>)?\\s*(?:Figure|Fig))${NP}{0,200}<\\/p>(?=\\s*<p>(?:<strong>)?\\s*(?:Figure|Fig\\.?)\\s*\\d+\\s*(?:<\\/strong>)?\\s*[.:]))?\\s*(?:<p>((?:<strong>)?\\s*(?:Figure|Fig\\.?)\\s*(\\d+)\\s*(?:<\\/strong>)?\\s*[.:]${NP}*)<\\/p>)?`, 'g');
  let out = '', last = 0, m, auto = 0;
  while ((m = figRe.exec(html))) {
    out += html.slice(last, m.index); last = figRe.lastIndex;
    const img = m[1] || m[2];
    const n = m[4] ? Number(m[4]) : ++auto;
    if (m[4]) auto = n;
    let cap = (m[3] || '').replace(/^(<strong>)?\s*(Figure|Fig\.?)\s*\d+\s*[.:]?\s*(<\/strong>)?\s*[.:]?\s*/i, '').trim();
    const [, capTitle = '', capRest = ''] = cap.replace(/<\/?strong>/g, '').match(/^([^.]+\.)\s*([\s\S]*)$/) || [, cap, ''];
    // Prefer the separately uploaded high-resolution file.
    const hi = figureFiles.find(f => new RegExp(`^fig(ure)?[ _-]?0*${n}\\b`, 'i').test(path.basename(f)));
    const embedded = (img.match(/src="([^"]+)"/) || [])[1];
    const srcFile = hi || (embedded && path.resolve(mediaRoot, embedded.replace(/^.*?media\//, 'media/')));
    let files = null;
    if (srcFile && fs.existsSync(srcFile)) files = await processImage(srcFile, figDir, `figure${n}`);
    figs.push({ n, title: strip(capTitle) });
    const alt = strip(capTitle) || `Figure ${n}`;
    out += `<figure class="fig" id="figure-${n}"><div class="fh"><b>Figure ${n}.</b> ${capTitle}</div>`
      + (files ? `<div class="fi"><img src="figures/${files.small}" data-large="figures/${files.large}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy"></div>` : '')
      + (capRest ? `<figcaption class="fc">${capRest}</figcaption>` : '')
      + (files ? `<div class="fa"><a class="chip" href="figures/${files.large}" target="_blank">View large</a><a class="chip" href="figures/${files.large}" download>Download</a></div>` : '')
      + `</figure>`;
  }
  html = out + html.slice(last);

  // 2) Tables: caption paragraph "Table N." immediately before <table>, optional note after.
  html = html.replace(/(?:<p>((?:<strong>)?\s*Table\s*(\d+)\s*(?:<\/strong>)?\s*[.:](?:(?!<\/p>)[\s\S])*?)<\/p>\s*)?(<table[\s\S]*?<\/table>)(\s*<p>((?:<em>|<strong>)?\s*(?:Note|Notes|Source|Abbreviations?)\b(?:(?!<\/p>)[\s\S])*?)<\/p>)?/g, (all, cap, n, table, _n, note) => {
    const cols = ((table.match(/<tr[\s\S]*?<\/tr>/) || [''])[0].match(/<t[hd][\s>]/g) || []).length;
    const c = (cap || '').replace(/^(<strong>)?\s*Table\s*\d+\s*[.:]?\s*(<\/strong>)?\s*[.:]?\s*/i, '');
    const t = table.replace(/<table[^>]*>/, '<table>').replace(/ style="[^"]*"/g, '').replace(/<colgroup>[\s\S]*?<\/colgroup>/, '');
    return `<div class="tbl${cols > 4 ? ' wide' : ''}"${n ? ` id="table-${n}"` : ''}>${n ? `<div class="fh"><b>Table ${n}.</b> ${c}</div>` : ''}<div class="scroll">${t}</div>${note ? `<div class="fn">${note}</div>` : ''}</div>`;
  });

  // 3) Display equations get their own block.
  html = html.replace(/<p>\s*(<math display="block"[\s\S]*?<\/math>)\s*<\/p>/g, '<div class="eq">$1</div>');
  // 4) Large figures in PDF span both columns.
  html = html.replace(/<figure class="fig"/g, '<figure class="fig wide"');
  return { html, figs };
}

async function ingest(id) {
  const dir = path.join(INCOMING, id);
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const journal = meta.journal || id.split('-')[0].toLowerCase();
  const docx = fs.readdirSync(dir).find(f => /\.docx$/i.test(f));
  if (!docx) throw new Error(`${id}: no .docx in incoming folder`);
  const dest = path.join(CONTENT, 'articles', journal, id);
  const tmp = path.join(dir, '.pandoc');
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const r = pandoc(path.join(dir, docx), tmp);
  // Drop any template guidance lines the author forgot to delete.
  r.body = r.body.replace(/<p>\s*▸[\s\S]*?<\/p>\s*/g, '').replace(/<div data-custom-style="Template Guidance">[\s\S]*?<\/div>/g, '');

  // Front matter from the manuscript.
  let secs = sections(r.body);
  const pick = (re) => { const i = secs.findIndex(s => re.test(s.h)); if (i < 0) return null; const [s] = secs.splice(i, 1); return s; };
  const kpS = pick(/^key\s*points$/i);
  const absS = pick(/^abstract$/i);
  const refS = pick(/^(references|bibliography|works cited)$/i);
  const ackS = pick(/^acknowledge?ments?$/i);
  let pre = secs[0] && !secs[0].h ? secs.shift().html : '';
  // Keywords paragraph may sit in the abstract section or before the first heading.
  let keywords = [];
  const kwRe = /<p>(?:<strong>)?\s*(?:Key\s*words|Keywords)\s*[:.]?\s*(?:<\/strong>)?\s*[:.]?\s*([\s\S]*?)<\/p>/i;
  for (const holder of [absS, { html: pre }, kpS]) {
    if (!holder) continue;
    const k = holder.html.match(kwRe);
    if (k) { keywords = strip(k[1]).split(/[;,]\s*/).map(s => s.trim()).filter(Boolean); holder.html = holder.html.replace(kwRe, ''); break; }
  }
  const abstract = absS ? parseAbstract(absS.html) : (r.abstract ? parseAbstract(r.abstract.startsWith('<p') ? r.abstract : `<p>${r.abstract}</p>`) : null);

  const figDir = path.join(dest, 'figures');
  fs.rmSync(figDir, { recursive: true, force: true });
  const figureFiles = fs.existsSync(path.join(dir, 'figures')) ? fs.readdirSync(path.join(dir, 'figures')).map(f => path.join(dir, 'figures', f)) : [];
  let body = secs.map(s => s.h ? s.raw : s.html).join('\n');
  const disp = await structureDisplays(body, { mediaRoot: tmp, figDir, figureFiles });
  body = linkCitations(disp.html)
    .replace(/<h2 id="([^"]*)"([^>]*)>/g, (m, i, rest) => `<h2 id="${slugify(i) || i}"${rest}>`)
    .replace(/<p>\s*<\/p>/g, '');

  const article = {
    id, journal, status: meta.status || 'proof',
    type: meta.type || 'Original Research',
    subject: meta.subject || [],
    title: meta.title || strip(r.title),
    subtitle: meta.subtitle || strip(r.subtitle) || undefined,
    authors: meta.authors || [],
    affiliations: meta.affiliations || [],
    keyPoints: meta.keyPoints || (kpS ? parseKeyPoints(kpS.html) : null) || undefined,
    abstract: meta.abstract || abstract || undefined,
    keywords: meta.keywords?.length ? meta.keywords : keywords,
    received: meta.received, revised: meta.revised, accepted: meta.accepted, published: meta.published || new Date().toISOString().slice(0, 10),
    volume: meta.volume || '', issue: meta.issue || '', elocator: meta.elocator,
    doi: meta.doi || '', zenodo: meta.zenodo || '',
    license: meta.license || 'CC-BY-4.0',
    info: { ...(meta.info || {}), ...(ackS && !meta.info?.acknowledgments ? { acknowledgments: paras(ackS.html).join(' ') } : {}) },
    references: refS ? parseRefs(refS.html) : (meta.references || []),
    figures: disp.figs,
    previewToken: meta.previewToken,
    ingestedAt: new Date().toISOString(),
  };
  for (const k of ['legacy', 'legacyPdf', 'frozenPdf', 'previousDoi', 'originalPublished', 'firstPage', 'lastPage', 'featured', 'language']) if (meta[k] !== undefined) article[k] = meta[k];
  if (!article.references.length && meta.references?.length) article.references = meta.references;
  if (fs.existsSync(path.join(dir, 'article.pdf'))) fs.copyFileSync(path.join(dir, 'article.pdf'), path.join(dest, 'article.pdf'));
  write(path.join(dest, 'article.json'), JSON.stringify(article, (k, v) => v === undefined ? undefined : v, 2));
  write(path.join(dest, 'body.html'), body.trim() + '\n');
  if (!KEEP) fs.rmSync(dir, { recursive: true, force: true }); else fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ ${id}: ${secs.length} sections, ${disp.figs.length} figures, ${article.references.length} references → ${path.relative(CONTENT, dest)}`);
}

const ids = only.length ? only : (fs.existsSync(INCOMING) ? fs.readdirSync(INCOMING).filter(f => !f.startsWith('.') && fs.statSync(path.join(INCOMING, f)).isDirectory()) : []);
if (!ids.length) console.log('Nothing to ingest.');
for (const id of ids) {
  try { await ingest(id); } catch (e) { console.error(`✗ ${id}: ${e.message}`); process.exitCode = 1; }
}
