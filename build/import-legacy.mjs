// Import already-published articles (e.g. IJBMRS Volumes 1–2 from ijbmrs.org) into ACRI Journals.
// Usage: node build/import-legacy.mjs legacy/ijbmrs.csv
//
// CSV columns (header row required, UTF-8):
//   id, journal, type, title, authors, affiliations, abstract, keywords, volume, issue, published, doi, pdf
//   - authors:      "Given Family, Degree; Given Family"     (semicolon-separated; first is corresponding)
//   - affiliations: one affiliation for all authors, or "1=Dept, Univ | 2=Dept, Univ" with authors as "Given Family [1,2]"
//   - keywords:     semicolon-separated
//   - published:    YYYY-MM-DD
//   - pdf:          a file path (relative to the CSV) or an https:// URL to the existing PDF
// Each article becomes content/articles/<journal>/<id>/ with article.json and article.pdf (kept as the PDF of record).
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT, write } from './lib.mjs';

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...data] = rows.filter(r => r.some(x => x.trim()));
  return data.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] || '').trim()])));
}

const csvPath = process.argv[2];
if (!csvPath) { console.error('Usage: node build/import-legacy.mjs <file.csv>'); process.exit(1); }
const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
for (const r of rows) {
  const journal = (r.journal || r.id.split('-')[0]).toLowerCase();
  const dir = path.join(CONTENT, 'articles', journal, r.id);
  const affMap = new Map();
  if (/\d=/.test(r.affiliations)) r.affiliations.split('|').forEach(s => { const [k, ...v] = s.split('='); affMap.set(Number(k.trim()), v.join('=').trim()); });
  else if (r.affiliations) affMap.set(1, r.affiliations);
  const authors = r.authors.split(';').map(s => s.trim()).filter(Boolean).map((s, i) => {
    const m = s.match(/\[([\d,\s]+)\]/); const affs = m ? m[1].split(',').map(Number) : (affMap.size ? [1] : []);
    const [name, degrees = ''] = s.replace(/\[.*?\]/, '').split(',').map(x => x.trim());
    const parts = name.split(/\s+/); const family = parts.pop(); const given = parts.join(' ');
    return { given, family, degrees, affiliations: affs, corresponding: i === 0 };
  });
  const article = {
    id: r.id, journal, status: 'published', type: r.type || 'Original Research', title: r.title, authors,
    affiliations: [...affMap].map(([id, name]) => ({ id, name })), abstract: r.abstract, keywords: r.keywords ? r.keywords.split(';').map(s => s.trim()).filter(Boolean) : [],
    published: r.published, volume: r.volume, issue: r.issue, doi: r.doi, license: 'CC-BY-4.0', legacyPdf: true, references: [], info: {},
  };
  write(path.join(dir, 'article.json'), JSON.stringify(article, null, 2));
  if (!fs.existsSync(path.join(dir, 'body.html'))) write(path.join(dir, 'body.html'), '');
  if (r.pdf) {
    const dst = path.join(dir, 'article.pdf');
    if (/^https?:/.test(r.pdf)) {
      const res = await fetch(r.pdf);
      if (!res.ok) { console.warn(`  ! ${r.id}: could not download ${r.pdf} (${res.status})`); continue; }
      fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    } else fs.copyFileSync(path.resolve(path.dirname(csvPath), r.pdf), dst);
  }
  console.log(`✓ ${r.id} — ${r.title.slice(0, 70)}`);
}
console.log(`Imported ${rows.length} articles. Commit content/articles and push to publish.`);
