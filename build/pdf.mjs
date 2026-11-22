// ACRI Journals — PDF renderer. Prints each article's print page with headless Chrome.
// PDFs are cached by content hash in .pdfcache/ so unchanged articles are never re-rendered.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT, DIST, readJSON } from './lib.mjs';
import { PDFDocument } from 'pdf-lib';

const CACHE = path.join(ROOT, '.pdfcache');
fs.mkdirSync(CACHE, { recursive: true });
const manifest = readJSON(path.join(DIST, '_print/manifest.json'), []);
const site = readJSON(path.join(ROOT, 'config/site.json'));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const todo = manifest.filter(m => !fs.existsSync(path.join(CACHE, `${m.id}-${m.hash}.pdf`)));
console.log(`PDFs: ${manifest.length} total, ${todo.length} to render, ${manifest.length - todo.length} cached`);

if (todo.length) {
  const { chromium } = await import('playwright');
  const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(f => fs.existsSync(f));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage();
  for (const m of todo) {
    await page.goto(`http://127.0.0.1:${port}${m.html}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const foot = `<div style="width:100%;font:6.8pt Inter,Arial,sans-serif;color:#555;padding:0 16mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact"><span><b style="color:${m.accent}">${esc(m.code)}</b> · ${esc(m.citation)}${m.doi ? ' · doi:' + esc(m.doi) : ''}</span><span style="white-space:nowrap">ACRI Journals · <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    const head = `<div style="width:100%;font:6.8pt Inter,Arial,sans-serif;color:#666;padding:0 16mm;display:flex;justify-content:space-between"><span style="color:${m.accent};font-weight:600">${esc(m.journal)}</span><span style="max-width:55%;text-align:right;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(m.title)}</span></div>`;
    const buf = await page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: foot, preferCSSPageSize: true, tagged: true, outline: true });
    // Stamp document metadata (title, author, subject, keywords) for indexers and readers.
    const doc = await PDFDocument.load(buf);
    const a = readJSON(path.join(ROOT, 'content/articles', m.html.split('/')[2], m.id, 'article.json'), {});
    doc.setTitle(m.title); doc.setAuthor((a.authors || []).map(x => `${x.given} ${x.family}`).join('; '));
    doc.setSubject(`${m.journal}. ${m.citation}${m.doi ? ' doi:' + m.doi : ''}`); doc.setKeywords(a.keywords || []);
    doc.setCreator('ACRI Journals production system'); doc.setProducer(site.publisher); doc.setLanguage(site.language);
    fs.writeFileSync(path.join(CACHE, `${m.id}-${m.hash}.pdf`), await doc.save());
    console.log(`  ✓ ${m.id}`);
  }
  await browser.close();
}
for (const m of manifest) {
  const dst = path.join(DIST, m.out);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(CACHE, `${m.id}-${m.hash}.pdf`), dst);
}
// Prune stale cache entries and remove print sources from the public site.
const live = new Set(manifest.map(m => `${m.id}-${m.hash}.pdf`));
for (const f of fs.readdirSync(CACHE)) if (!live.has(f)) fs.rmSync(path.join(CACHE, f));
fs.rmSync(path.join(DIST, '_print'), { recursive: true, force: true });
server.close();
console.log('PDFs ready.');
