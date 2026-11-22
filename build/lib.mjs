// Shared helpers for the ACRI Journals static build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const CONTENT = path.join(ROOT, 'content');
export const DIST = path.join(ROOT, 'dist');

export const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
export const readText = (p, d = '') => { try { return fs.readFileSync(p, 'utf8'); } catch { return d; } };
export const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
export const copyDir = (src, dst) => { if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true }); };
export const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

export const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const strip = (h = '') => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export const slugify = (s = '') => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00Z'); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
export const fmtMonthYear = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00Z'); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const year = (iso) => iso ? iso.slice(0, 4) : '';
export const slashDate = (iso) => iso ? iso.replace(/-/g, '/') : '';

// ---------- Authors ----------
export const initials = (given = '') => given.split(/[\s-]+/).filter(Boolean).map(g => g[0].toUpperCase()).join('');
export const fullName = (a) => [a.given, a.family].filter(Boolean).join(' ');
export const nameWithDegrees = (a) => fullName(a) + (a.degrees ? ', ' + a.degrees : '');
export function authorsShort(authors = [], max = 3) {
  const names = authors.map(nameWithDegrees);
  if (names.length <= max) return names.join('; ');
  return names.slice(0, max).join('; ') + '; et al';
}
export function authorsTiny(authors = []) {
  if (!authors.length) return '';
  const first = nameWithDegrees(authors[0]);
  return authors.length > 1 ? first + '; et al.' : first;
}

// ---------- Citation strings ----------
export function elocator(a) { return a.elocator || ('e' + a.id.split('-').slice(1).join('')); }
/** Page range for print-era articles, otherwise the electronic article number. */
export function loc(a) { return a.firstPage ? (a.lastPage && a.lastPage !== a.firstPage ? `${a.firstPage}-${a.lastPage}` : String(a.firstPage)) : elocator(a); }
export function doiUrl(a) { return a.doi ? `https://doi.org/${a.doi}` : ''; }

export function citations(a, j, site, url) {
  const au = a.authors || [];
  const y = year(a.published);
  const vol = a.volume || '', iss = a.issue || '', el = loc(a);
  const title = strip(a.title) + (a.subtitle ? ': ' + strip(a.subtitle) : '');
  const doi = a.doi || '';
  const ama = (() => {
    const n = au.length > 6 ? au.slice(0, 3) : au;
    const s = n.map(x => `${x.family} ${initials(x.given)}`).join(', ') + (au.length > 6 ? ', et al' : '');
    return `${s}. ${title}. ${j.abbrev}. ${y};${vol}${iss ? `(${iss})` : ''}:${el}.${doi ? ` doi:${doi}` : ''}`;
  })();
  const apaName = x => `${x.family}, ${initials(x.given).split('').join('. ')}.`;
  const apa = (() => {
    let s;
    if (au.length === 1) s = apaName(au[0]);
    else if (au.length <= 20) s = au.slice(0, -1).map(apaName).join(', ') + ', & ' + apaName(au[au.length - 1]);
    else s = au.slice(0, 19).map(apaName).join(', ') + ', . . . ' + apaName(au[au.length - 1]);
    return `${s} (${y}). ${title}. ${j.name}, ${vol}${iss ? `(${iss})` : ''}, ${el}.${doi ? ` https://doi.org/${doi}` : ` ${url}`}`;
  })();
  const mla = (() => {
    let s = '';
    if (au.length === 1) s = `${au[0].family}, ${au[0].given}`;
    else if (au.length === 2) s = `${au[0].family}, ${au[0].given}, and ${fullName(au[1])}`;
    else if (au.length > 2) s = `${au[0].family}, ${au[0].given}, et al`;
    return `${s}. “${title}.” ${j.name}, vol. ${vol}${iss ? `, no. ${iss}` : ''}, ${y}, ${el}.${doi ? ` https://doi.org/${doi}.` : ''}`;
  })();
  const chicago = (() => {
    let s = '';
    if (au.length) {
      const rest = au.slice(1, 10).map(fullName);
      s = `${au[0].family}, ${au[0].given}`;
      if (au.length > 10) s += ', ' + rest.slice(0, 6).join(', ') + ', et al';
      else if (rest.length) s += (rest.length > 1 ? ', ' + rest.slice(0, -1).join(', ') + ',' : '') + ' and ' + rest[rest.length - 1];
    }
    return `${s}. “${title}.” ${j.name} ${vol}${iss ? `, no. ${iss}` : ''} (${y}): ${el}.${doi ? ` https://doi.org/${doi}.` : ''}`;
  })();
  const harvard = (() => {
    const n = au.map(x => `${x.family}, ${initials(x.given).split('').join('.')}.`);
    const s = n.length > 3 ? n[0] + ' et al.' : n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : (n[0] || '');
    return `${s} (${y}) ‘${title}’, ${j.name}, ${vol}${iss ? `(${iss})` : ''}, ${a.firstPage ? 'pp.' : 'p.'} ${el}.${doi ? ` doi:${doi}.` : ''}`;
  })();
  const key = (au[0]?.family || 'anon').replace(/\W/g, '') + y + (strip(a.title).split(/\s+/)[0] || '').replace(/\W/g, '').toLowerCase();
  const bibtex = `@article{${key},
  author  = {${au.map(x => `${x.family}, ${x.given}`).join(' and ')}},
  title   = {${title}},
  journal = {${j.name}},
  year    = {${y}},
  volume  = {${vol}},
  number  = {${iss}},
  pages   = {${el}},${doi ? `\n  doi     = {${doi}},` : ''}
  url     = {${url}},${j.issn ? `\n  issn    = {${j.issn}},` : ''}
  publisher = {${site.publisher}}
}`;
  const ris = ['TY  - JOUR', ...au.map(x => `AU  - ${x.family}, ${x.given}`), `TI  - ${title}`, `T2  - ${j.name}`, `J2  - ${j.abbrev}`, `PY  - ${y}`, `DA  - ${slashDate(a.published)}`, `VL  - ${vol}`, `IS  - ${iss}`, `SP  - ${el}`, doi ? `DO  - ${doi}` : '', `UR  - ${url}`, j.issn ? `SN  - ${j.issn}` : '', `PB  - ${site.publisher}`, ...(a.keywords || []).map(k => `KW  - ${k}`), `AB  - ${abstractText(a)}`, 'ER  - '].filter(Boolean).join('\r\n');
  return { ama, apa, mla, chicago, harvard, bibtex, ris };
}

export function abstractText(a) {
  const ab = a.abstract;
  if (!ab) return '';
  if (typeof ab === 'string') return strip(ab);
  return (ab.sections || []).map(s => (s.heading ? s.heading + ': ' : '') + strip(s.text)).join(' ');
}

// ---------- Brand ----------
export const WORDMARK = `<b>ACRI</b><i aria-hidden="true"></i><span>JOURNALS</span>`;
// ---------- Brand marks ----------
export const MARK = (navy = '#0B2545', green = '#2E9B63') => `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="${navy}"/><path d="M11 30.5 20 9l9 21.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="13.6" y="22.2" width="12.8" height="3.2" rx="1.6" fill="${green}"/></svg>`;
export const ORCID = `<svg class="orcid" viewBox="0 0 256 256" aria-label="ORCID"><path fill="#A6CE39" d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z"/><path fill="#fff" d="M86.3 186.2H70.9V79.1h15.4v107.1zm22.6 0h41.6c39.6 0 57-28.3 57-53.6 0-27.5-21.5-53.6-56.8-53.6h-41.8v107.2zm15.4-93.3h24.5c34.9 0 42.9 26.5 42.9 39.7 0 21.5-13.7 39.7-43.7 39.7h-23.7V92.9zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1s10.1 4.6 10.1 10.1z"/></svg>`;
export const CCBY = `<svg viewBox="0 0 88 31" aria-label="CC BY 4.0"><rect width="88" height="31" rx="3" fill="#ABB1AA"/><rect x="1" y="1" width="86" height="29" rx="2" fill="#000"/><rect x="1" y="1" width="40" height="29" rx="2" fill="#ABB1AA"/><circle cx="21" cy="15.5" r="11.5" fill="#fff" stroke="#000" stroke-width="2"/><text x="21" y="20" font-family="Arial" font-weight="700" font-size="12" text-anchor="middle">cc</text><text x="64" y="20.5" fill="#fff" font-family="Arial" font-weight="700" font-size="13" text-anchor="middle">BY 4.0</text></svg>`;
export const ICON = {
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></svg>',
  cite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  doi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
};

// ---------- Auto-generated journal logo (same family as the IJBMRS / IJELF emblems) ----------
// Globe in a ring with laurel branches, the journal code in serif capitals and the full name in
// spaced sans capitals. Used for any journal that has no logo file of its own.
function wrapCaps(name, max = 27) {
  const words = name.toUpperCase().split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 4);
}
export function emblemSVG(color = '#0B2545') {
  const cx = 500, cy = 360, gy = cy - 8, s = color, R = 282, G = 210;
  const pt = (deg, r) => [cx + r * Math.cos(deg * Math.PI / 180), gy + r * Math.sin(deg * Math.PI / 180)];
  const branch = (from, to) => {
    const n = 11, step = (to - from) / (n - 1);
    const [x0, y0] = pt(from, R), [x1, y1] = pt(to, R), large = Math.abs(to - from) > 180 ? 1 : 0, sweep = to > from ? 1 : 0;
    let out = `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${s}" stroke-width="8" stroke-linecap="round"/>`;
    for (let i = 0; i < n; i++) {
      const d = from + i * step, sz = 1.05 - i * 0.04, dir = Math.sign(step);
      const tang = d + 90 * dir;                      // direction of travel along the arc
      for (const side of [-1, 1]) {
        const [px, py] = pt(d, R + side * 17 * sz);
        const ang = tang + side * -32 * dir;
        out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(25 * sz).toFixed(1)}" ry="${(9 * sz).toFixed(1)}" transform="rotate(${ang.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="${s}"/>`;
      }
    }
    const [tx, ty] = pt(to, R + 2), ta = to + 90 * Math.sign(to - from);
    out += `<ellipse cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="20" ry="8" transform="rotate(${ta.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" fill="${s}"/>`;
    return out;
  };
  return `<g fill="none" stroke="${s}" stroke-linecap="round">
    <circle cx="${cx}" cy="${cy}" r="338" stroke-width="16"/>
    <circle cx="${cx}" cy="${gy}" r="${G}" stroke-width="15"/>
    <ellipse cx="${cx}" cy="${gy}" rx="${G * 0.5}" ry="${G}" stroke-width="14"/>
    <line x1="${cx}" y1="${gy - G}" x2="${cx}" y2="${gy + G}" stroke-width="14"/>
    <line x1="${cx - G}" y1="${gy}" x2="${cx + G}" y2="${gy}" stroke-width="14"/>
    <path d="M${cx - G * 0.87} ${gy - G * 0.5} Q${cx} ${gy - G * 0.78} ${cx + G * 0.87} ${gy - G * 0.5}" stroke-width="13"/>
    <path d="M${cx - G * 0.87} ${gy + G * 0.5} Q${cx} ${gy + G * 0.22} ${cx + G * 0.87} ${gy + G * 0.5}" stroke-width="13"/>
  </g>${branch(96, 212)}${branch(84, -32)}`;
}
export function journalLogoSVG(j, { color, variant = 'full' } = {}) {
  const c = color || j.logoColor || j.accent || '#0B2545';
  if (variant === 'mark') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 10 700 700" role="img" aria-label="${j.code} emblem">${emblemSVG(c)}</svg>`;
  const lines = wrapCaps(j.name);
  const codeSize = j.code.length > 6 ? Math.round(1250 / j.code.length) : 210;
  const h = 930 + lines.length * 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${h}" role="img" aria-label="${j.name}">${emblemSVG(c)}
  <text x="500" y="895" text-anchor="middle" font-family="Lora, Georgia, 'Times New Roman', serif" font-weight="700" font-size="${codeSize}" letter-spacing="6" fill="${c}">${j.code}</text>
  ${lines.map((l, i) => `<text x="500" y="${960 + i * 64}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="50" letter-spacing="5" fill="${c}">${l.replace(/&/g, '&amp;')}</text>`).join('')}</svg>`;
}
