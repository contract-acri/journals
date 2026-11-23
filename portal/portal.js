/* ACRI Journals — Editorial Portal (author · reviewer · handling editor · EIC · editorial office/admin)
   Single-page app. Talks to the Apps Script web app. No build step, no dependencies
   (pdf.js is loaded on demand from cdnjs for the secure reviewer viewer). */
(() => {
  'use strict';
  const API = window.ACRIJ_API;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { token: localStorage.getItem('acrij_t'), user: JSON.parse(localStorage.getItem('acrij_u') || 'null'), journals: null };
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtT = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const DEC = { accept: 'Accept', minor: 'Minor revision', major: 'Major revision', reject: 'Reject', desk_reject: 'Decline without review' };
  const KIND = { manuscript: 'Anonymised manuscript', titlepage: 'Title page', figure: 'Figure', supplementary: 'Supplementary', cover: 'Cover letter', response: 'Response to reviewers', final: 'Final manuscript', final_figure: 'Final figure', proof_corrections: 'Proof corrections' };
  const STRUCT = {
    'Original Research': ['Importance', 'Objective', 'Design, Setting, and Participants', 'Main Outcomes and Measures', 'Results', 'Conclusions and Relevance'],
    'Review Article': ['Importance', 'Observations', 'Conclusions and Relevance'],
  };

  // ---------------------------------------------------------------- api
  // Read-only lookups are cached for a short time, so moving between tabs does not hit the server again.
  const CACHEABLE = { 'adm.journals': 60, 'public.journals': 300, 'sig.list': 60, 'me.tools': 60, 'team.list': 20, 'auth.me': 20 };
  const memo = new Map();
  const BUSY = /too many|timed? ?out|lock|try again|service (is )?(unavailable|error)|exceeded|failed to fetch|network|load failed|internal error|unexpected token/i;
  async function api(action, data = {}) {
    if (!API || /PASTE_/.test(API)) throw aesErr('The portal is not connected yet: set ACRIJ_API in /portal/index.html.', 'AES-CFG-001');
    const key = CACHEABLE[action] ? action + JSON.stringify(data) : '';
    if (key && memo.has(key) && memo.get(key).t > Date.now()) return memo.get(key).r;
    if (!CACHEABLE[action]) memo.clear(); // any change clears the cache
    let r, lastErr; progress(1);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt) { busy(true, attempt); await new Promise(ok => setTimeout(ok, 1200 * attempt * attempt)); }
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, ...data }) });
        r = await res.json();
        if (!r.ok && BUSY.test(r.error || '') && attempt < 2) { lastErr = new Error(r.error); continue; }
        break;
      } catch (e) { lastErr = e; r = null; if (!BUSY.test(String(e.message || e)) && !(e instanceof SyntaxError)) break; }
    }
    busy(false); progress(-1);
    if (!r) throw aesErr('The server is busy or your connection dropped. Please try again in a moment.', 'AES-NET-001');
    if (r.aes) { S.aes = r.aes; const v = document.getElementById('aesv'); if (v) v.textContent = 'AES ' + r.aes; }
    if (key && r.ok) memo.set(key, { t: Date.now() + CACHEABLE[action] * 1000, r });
    if (!r.ok) {
      if (r.auth === false) { setSession(null); go('login?next=' + encodeURIComponent(location.hash.slice(2))); }
      throw aesErr(r.error || 'Something went wrong.', r.code || 'AES-SYS-500', r.ref);
    }
    return r;
  }
  /** AES errors carry a code (see /aes/errors/) and, for system faults, a reference the admin can look up. */
  function aesErr(msg, code, ref) { const e = new Error(msg); e.code = code; e.ref = ref || ''; return e; }
  const codeTag = (e) => e && e.code ? ` <a class="aescode" href="/aes/errors/#${esc(e.code)}" target="_blank" title="What does this mean?">${esc(e.code)}${e.ref ? ' · ' + esc(e.ref) : ''}</a>` : '';
  let inflight = 0;
  function progress(d) { inflight = Math.max(0, inflight + d); let b = document.getElementById('aesbar'); if (!b) { b = document.createElement('div'); b.id = 'aesbar'; document.body.appendChild(b); } b.className = inflight ? 'on' : ''; }
  function busy(on, n) { let b = document.getElementById('busybar'); if (!b) { b = document.createElement('div'); b.id = 'busybar'; b.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);background:#0B2545;color:#fff;padding:8px 14px;border-radius:999px;font:600 13px Inter,Arial,sans-serif;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.2);display:none'; document.body.appendChild(b); } b.textContent = 'Server busy, retrying… (' + (n || 1) + ')'; b.style.display = on ? 'block' : 'none'; }
  function setSession(t, u) {
    S.token = t; S.user = u || null;
    if (t) { localStorage.setItem('acrij_t', t); localStorage.setItem('acrij_u', JSON.stringify(u)); } else { localStorage.removeItem('acrij_t'); localStorage.removeItem('acrij_u'); }
    nav();
  }
  function toast(m, err, e) { const t = $('#toast'); t.innerHTML = esc(m) + (e && e.code ? `<small style="display:block;opacity:.8;margin-top:3px">${esc(e.code)}${e.ref ? ' · ref ' + esc(e.ref) : ''}</small>` : ''); t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast', 3800); }
  const go = (h) => { if (location.hash === '#/' + h) route(); else location.hash = '#/' + h; };
  async function run(btn, fn) {
    const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Working…'; }
    try { return await fn(); } catch (e) { if (/of null|of undefined/i.test(String(e.message))) { toast('Refreshing the page…'); memo.clear(); setTimeout(route, 300); return; } toast(e.message, true, e); throw e; } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  }
  /** Crop any photo to a centred 400×400 JPEG in the browser, so uploads are small and consistent. */
  const squarePhoto = (file) => new Promise((ok, no) => { const img = new Image(); img.onload = () => { const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 400; c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 3, s, s, 0, 0, 400, 400); ok({ data: c.toDataURL('image/jpeg', 0.86).split(',')[1], mime: 'image/jpeg' }); URL.revokeObjectURL(img.src); }; img.onerror = () => no(new Error('That file is not an image we can read.')); img.src = URL.createObjectURL(file); });
  const fileToB64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
  function download(name, mime, b64) { const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const st = (s, label) => `<span class="st s-${esc(s)}">${esc(label || s)}</span>`;
  const isAdmin = () => S.user?.roles?.admin;
  const eicOf = () => S.user?.roles?.eic || [];
  const FREQ = ['Monthly', 'Bi-monthly', 'Quarterly', 'Triannual', 'Biannual', 'Annual', 'Continuous publication'];
  const ROLE_LABEL = { eic: 'Editor-in-Chief', senior: 'Senior Editor', editor: 'Editor', board: 'Editorial Board Member' };

  // ---------------------------------------------------------------- nav + router
  function nav() {
    const u = S.user, h = location.hash;
    $('#pnav').innerHTML = u ? `<a href="#/" class="${h === '#/' || h === '' ? 'on' : ''}">Dashboard</a><a href="#/submit">New submission</a>${isAdmin() ? '<a href="#/admin">Admin</a>' : eicOf().length ? '<a href="#/admin/messages">Journal admin</a>' : ''}${isAdmin() || ['eic', 'senior', 'editor', 'board'].some(r => (u.roles?.[r] || []).length) ? '<a href="#/tools">Editor tools</a>' : ''}<a href="#/profile">Profile</a><span class="who">${esc(u.name)}</span><button id="logout">Sign out</button>`
      : `<a href="#/login">Sign in</a><a href="#/register">Create account</a>`;
    $('#logout')?.addEventListener('click', async () => { try { await api('auth.logout'); } catch { } setSession(null); go('login'); });
  }
  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  // Each navigation gets a number. A slow page that finishes after you have moved on is ignored,
  // instead of breaking the page you are now on ("Cannot set properties of null").
  let SEQ = 0; const RETRIED = {};
  async function route() {
    const my = ++SEQ, here = location.hash;
    nav(); window.scrollTo(0, 0);
    const { parts, q } = parse(), p0 = parts[0] || '';
    const open = { login: vLogin, register: vRegister, forgot: vForgot, reset: vReset, verify: vVerify, review: vReview, subscribe: vSubscribe, agreement: vAgreement, email: vEmailPrefs, 'partner-apply': vPartnerApply };
    try {
      if (open[p0]) return await open[p0](q);
      if (!S.token) return go('login?next=' + encodeURIComponent(location.hash.slice(2)));
      if (p0 === '') return await vDash(q);
      if (p0 === 'submit') return await vSubmit(q);
      if (p0 === 'ms') return await vMs(parts[1], q);
      if (p0 === 'admin') return await vAdmin(parts[1] || 'overview', q);
      if (p0 === 'profile') return await vProfile();
      if (p0 === 'tools') return await vTools(q);
      app.innerHTML = '<div class="empty">Page not found.</div>';
      delete RETRIED[here];
    } catch (e) {
      if (my !== SEQ) return; // you already moved to another page
      const msg = String(e && e.message || e);
      if (/of null|of undefined|is not defined|busy|connection dropped/i.test(msg) && !RETRIED[here]) { RETRIED[here] = 1; memo.clear(); app.innerHTML = '<div class="loading">Reloading…</div>'; setTimeout(() => { if (my === SEQ) route(); }, 700); return; }
      delete RETRIED[here];
      console.error(e);
      const ui = /of null|of undefined/i.test(msg); if (ui) { e = aesErr('This page did not load completely.', 'AES-UI-001'); }
      app.innerHTML = `<div class="panel errpanel" style="max-width:680px"><div class="msg err">${esc(e.message)}</div>${e.code ? `<p class="meta">Error code <b>${esc(e.code)}</b>${e.ref ? ` · reference <b>${esc(e.ref)}</b> (quote it when you contact the office)` : ''} · <a href="/aes/errors/#${esc(e.code)}" target="_blank">What does this mean?</a></p>` : ''}<div style="display:flex;gap:10px"><button class="btn btn-primary" id="retry">Try again</button><a class="btn btn-ghost" href="#/">Back to dashboard</a></div></div>`;
      document.getElementById('retry').onclick = () => { memo.clear(); route(); };
    }
  }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- auth views
  const ONE = '<div class="onebrand" aria-label="ACRI One"><b>ACRI</b><i></i><span>ONE</span></div>';
  function authShell(title, lead, inner) { const one = /ACRI One/.test(title); app.innerHTML = `<div class="auth panel">${one ? ONE : ''}<h1>${title}</h1><p class="lead">${lead}</p><div id="m"></div>${inner}</div>`; }
  const showMsg = (m, cls = 'err') => { $('#m').innerHTML = `<div class="msg ${cls}">${esc(m)}</div>`; };

  function vLogin(q) {
    if (S.token) return go(q.next || '');
    authShell('Sign in with ACRI One', 'Your ACRI One account works for authors, reviewers and editors across every ACRI journal.',
      `<form id="f"><div class="f"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="f"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center">Sign in</button>
      <div class="links"><a href="#/forgot">Forgot password?</a><a href="#/register">Create an account</a></div></form>`);
    $('#f').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const r = await api('auth.login', { email: e.target.email.value, password: e.target.password.value }); setSession(r.token, r.user); go(q.next || ''); }).catch(er => showMsg(er.message)); };
  }
  function vRegister() {
    authShell('Create your ACRI One account', 'One account to submit manuscripts, review and serve as an editor across ACRI journals.',
      `<form id="f"><div class="row2"><div class="f"><label>First name</label><input name="given" required></div><div class="f"><label>Last name</label><input name="family" required></div></div>
      <div class="f"><label>Email</label><input name="email" type="email" required></div>
      <div class="row2"><div class="f"><label>Degrees</label><input name="degrees" placeholder="e.g. PhD, MBA"></div><div class="f"><label>ORCID iD</label><input name="orcid" placeholder="0000-0000-0000-0000"></div></div>
      <div class="f"><label>Institution / affiliation</label><input name="affiliation" required></div>
      <div class="f"><label>Password</label><input name="password" type="password" minlength="8" required><small>At least 8 characters.</small></div>
      <label class="chk"><input type="checkbox" name="reviewer"> I am willing to review manuscripts in my area</label>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px">Create account</button>
      <div class="links"><span></span><a href="#/login">I already have an account</a></div></form>`);
    $('#f').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { const r = await api('auth.register', { given: f.given.value, family: f.family.value, email: f.email.value, degrees: f.degrees.value, orcid: f.orcid.value, affiliation: f.affiliation.value, password: f.password.value, reviewer: f.reviewer.checked }); f.outerHTML = ''; showMsg(r.message, 'ok'); }).catch(er => showMsg(er.message)); };
  }
  function vForgot() {
    authShell('Reset your ACRI One password', 'We will email you a link to choose a new password.', `<form id="f"><div class="f"><label>Email</label><input name="email" type="email" required></div><button class="btn btn-primary">Send reset link</button></form>`);
    $('#f').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const r = await api('auth.forgot', { email: e.target.email.value }); showMsg(r.message, 'ok'); }).catch(er => showMsg(er.message)); };
  }
  function vReset(q) {
    authShell('Choose a new ACRI One password', '', `<form id="f"><div class="f"><label>New password</label><input name="p" type="password" minlength="8" required></div><button class="btn btn-primary">Save password</button></form>`);
    $('#f').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const r = await api('auth.reset', { token: q.token, password: e.target.p.value }); showMsg(r.message, 'ok'); setTimeout(() => go('login'), 1500); }).catch(er => showMsg(er.message)); };
  }
  async function vVerify(q) { authShell('Verifying…', '', ''); try { const r = await api('auth.verify', { token: q.token }); authShell('Email verified', '', `<div class="msg ok">${esc(r.message)}</div><a class="btn btn-primary" href="#/login">Sign in</a>`); } catch (e) { showMsg(e.message); } }
  async function vSubscribe(q) { authShell('Newsletter', '', ''); try { const r = await api('public.confirm', { token: q.token, unsubscribe: q.u }); showMsg(r.message, 'ok'); } catch (e) { showMsg(e.message); } }

  // ---------------------------------------------------------------- dashboard
  async function vDash(q) {
    app.innerHTML = '<div class="loading">Loading your dashboard…</div>';
    const d = await api('dash'); S.journals = d.journals; setSession(S.token, d.user);
    const tabs = [['author', 'My submissions', d.author]];
    if (d.reviews?.length) tabs.push(['reviews', 'My reviews', d.reviews]);
    if (d.editor) tabs.push(['editor', 'Handling', d.editor]);
    if (d.eic) tabs.push(['eic', 'Editor-in-Chief', d.eic.filter(x => ['with_editor', 'under_review', 'reviews_complete', 'revision'].includes(x.status))]);
    if (d.office) tabs.push(['office', 'Technical check', d.office]);
    if (d.production) tabs.push(['production', 'Production', d.production]);
    const cur = q.tab || (d.office?.length ? 'office' : d.eic ? 'eic' : d.editor?.length ? 'editor' : d.reviews?.some(r => ['invited', 'accepted'].includes(r.status)) ? 'reviews' : 'author');
    const jn = (s) => (d.journals.find(j => j.slug === s) || {}).code || s;
    const table = (k, rows) => {
      if (!rows.length) return `<div class="empty">${k === 'author' ? 'You have no submissions yet. <a href="#/submit">Start a new submission →</a>' : 'Nothing here right now.'}</div>`;
      if (k === 'reviews') return `<table class="list"><thead><tr><th>Manuscript</th><th>Journal</th><th>Status</th><th>Due</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-go="review?token=${esc(r.token)}"><td><div class="t">${esc(r.title)}</div><div class="meta">${esc(r.subId)}</div></td><td>${esc(jn(r.journal))}</td><td>${st(r.status === 'submitted' ? 'submitted-r' : r.status, r.status)}</td><td>${esc(r.due || '—')}</td></tr>`).join('')}</tbody></table>`;
      return `<table class="list"><thead><tr><th>Manuscript</th><th>Journal</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows.map(s => `<tr class="click" data-go="${s.status === 'draft' ? 'submit?id=' + esc(s.id) : 'ms/' + esc(s.id)}"><td><div class="t">${esc(s.title)}</div><div class="meta">${s.status === 'draft' ? 'Draft' : esc(s.id)} · ${esc(s.type || '')}${s.version > 1 ? ' · v' + s.version : ''}${k !== 'author' && s.author ? ' · ' + esc(s.author) : ''}</div></td><td>${esc(jn(s.journal))}</td><td>${st(s.status, s.statusLabel)}</td><td class="meta">${fmt(s.updated)}</td></tr>`).join('')}</tbody></table>`;
    };
    app.innerHTML = `<div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap"><div><span class="kicker">Dashboard</span><h1 style="font:600 30px var(--serif);margin:6px 0 0">Welcome, ${esc(d.user.given || d.user.name)}</h1></div><a class="btn btn-primary" href="#/submit">+ New submission</a></div>
      ${d.newMessages ? `<div class="msg info" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>You have <b>${d.newMessages} new message${d.newMessages > 1 ? 's' : ''}</b> from the website contact form.</span><a class="btn btn-primary" href="#/admin/messages">Open messages</a></div>` : ''}
      ${(d.pendingAgreements || []).map(a => `<div class="msg info" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>You have been appointed <b>${esc(a.role)}</b> of ${esc((d.journals.find(j => j.slug === a.journal) || {}).code || a.journal)}. Please sign the Editorial Agreement to activate your access.</span><a class="btn btn-primary" href="#/agreement?token=${esc(a.token)}">Review & sign</a></div>`).join('')}
      <div class="panel"><div class="tabs">${tabs.map(([k, l, r]) => `<button data-tab="${k}" class="${k === cur ? 'on' : ''}">${l}<span class="n">${r.length}</span></button>`).join('')}</div>${table(cur, (tabs.find(t => t[0] === cur) || tabs[0])[2])}</div>`;
    $$('[data-tab]').forEach(b => b.onclick = () => go('?tab=' + b.dataset.tab));
    $$('[data-go]').forEach(r => r.onclick = () => go(r.dataset.go));
  }

  // ---------------------------------------------------------------- submission wizard
  async function vSubmit(q) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const pj = await api('public.journals'); const J = pj.journals;
    let F = { journal: q.journal || '', type: '', subject: [], title: '', subtitle: '', abstract: '', keywords: [], authors: [], affiliations: [], declarations: {}, coverLetter: '', files: [], status: 'draft', version: 1 };
    let id = q.id || null;
    if (id) { const r = await api('sub.get', { id }); F = Object.assign(F, r.sub); if (typeof F.abstract === 'string') { try { F.abstract = JSON.parse(F.abstract); } catch { } } }
    if (!F.authors.length) { const u = S.user; F.affiliations = [{ id: 1, name: u.affiliation || '' }]; F.authors = [{ given: u.given, family: u.family, degrees: u.degrees || '', email: u.email, orcid: u.orcid || '', affiliations: [1], corresponding: true }]; }
    if (id && !['draft', 'returned', 'revision'].includes(F.status)) return go('ms/' + id);
    let step = Number(q.step || 0);
    const STEPS = ['Journal', 'Article', 'Authors', 'Files', 'Declarations', 'Review & submit'];
    const jObj = () => J.find(j => j.slug === F.journal) || {};
    const isRev = F.status === 'revision';

    const collect = () => {
      const f = $('#wf'); if (!f) return;
      const v = (n) => f.elements[n]?.value ?? '';
      if (step === 0) { F.journal = v('journal') || F.journal; F.type = v('type'); F.subject = $$('[name=subject]:checked', f).map(x => x.value); }
      if (step === 1) {
        F.title = v('title'); F.subtitle = v('subtitle'); F.keywords = v('keywords').split(/[;,]/).map(s => s.trim()).filter(Boolean);
        const heads = STRUCT[F.type];
        F.abstract = heads ? { structured: true, sections: heads.map((h, i) => ({ heading: h, text: v('abs' + i).trim() })) } : v('abs');
      }
      if (step === 2) {
        F.affiliations = $$('.aff', f).map((el, i) => ({ id: i + 1, name: el.value.trim() })).filter(a => a.name);
        F.authors = $$('.au-row', f).map((row, i) => ({
          given: $('[data-k=given]', row).value.trim(), family: $('[data-k=family]', row).value.trim(), degrees: $('[data-k=degrees]', row).value.trim(), email: $('[data-k=email]', row).value.trim(), orcid: $('[data-k=orcid]', row).value.trim(),
          affiliations: $$('[data-k=aff]:checked', row).map(x => Number(x.value)), corresponding: $('[data-k=corr]', row).checked,
        }));
      }
      if (step === 4) {
        const d = F.declarations || {};
        ['original', 'ethics', 'consent', 'license'].forEach(k => d[k] = f.elements[k].checked);
        ['contributions', 'conflicts', 'funding', 'ethicsStatement', 'dataSharing', 'aiUse', 'acknowledgments', 'suggested', 'preprint'].forEach(k => d[k] = v(k));
        F.declarations = d; F.coverLetter = v('coverLetter');
      }
    };
    const save = async (quiet) => {
      collect();
      const r = await api('sub.save', { id, sub: F });
      if (!id) { id = r.id; history.replaceState(null, '', '#/submit?id=' + id + '&step=' + step); }
      if (!quiet) toast('Draft saved');
    };
    const goStep = async (n) => { try { await save(true); step = n; draw(); window.scrollTo(0, 0); } catch (e) { toast(e.message, true); } };

    function draw() {
      const j = jObj();
      let body = '';
      if (step === 0) body = `<h2>Choose a journal and article type</h2>
        <div class="f"><label>Journal</label><select name="journal" ${F.status !== 'draft' ? 'disabled' : ''}><option value="">Select a journal…</option>${J.map(x => `<option value="${x.slug}" ${x.slug === F.journal ? 'selected' : ''}>${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select></div>
        <div class="f"><label>Article type</label><select name="type">${(j.articleTypes || ['Original Research']).map(t => `<option ${t === F.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><small>See word limits in the <a href="/for-authors/#types" target="_blank">author guidelines</a>.</small></div>
        <div class="f"><label>Subject areas</label><div>${(j.subjects || []).map(s => `<label class="chk" style="display:inline-flex;margin-right:16px"><input type="checkbox" name="subject" value="${esc(s)}" ${F.subject?.includes(s) ? 'checked' : ''}>${esc(s)}</label>`).join('') || '<small>Choose a journal first.</small>'}</div></div>`;
      if (step === 1) {
        const heads = STRUCT[F.type]; const ab = F.abstract || '';
        const secText = (h) => (ab.sections || []).find(s => s.heading === h)?.text || '';
        body = `<h2>Title and abstract</h2><div class="f"><label>Title</label><input name="title" value="${esc(F.title)}" maxlength="300" required><small>Specific and informative, under 25 words. Do not include author names.</small></div>
        <div class="f"><label>Subtitle (optional)</label><input name="subtitle" value="${esc(F.subtitle || '')}"></div>
        ${heads ? `<div class="msg info">${esc(F.type)} articles need a structured abstract (350 words maximum).</div>${heads.map((h, i) => `<div class="f"><label>${esc(h)}</label><textarea name="abs${i}" style="min-height:70px">${esc(secText(h))}</textarea></div>`).join('')}`
          : `<div class="f"><label>Abstract</label><textarea name="abs" style="min-height:180px">${esc(typeof ab === 'string' ? ab : (ab.sections || []).map(s => s.text).join('\n\n'))}</textarea></div>`}
        <div class="f"><label>Keywords</label><input name="keywords" value="${esc((F.keywords || []).join('; '))}" placeholder="keyword one; keyword two; …"><small>4–6 keywords separated by semicolons.</small></div>`;
      }
      if (step === 2) body = `<h2>Authors and affiliations</h2><div class="msg info">These details are kept from reviewers (double-blind review). They appear on the published article exactly as you enter them here.</div>
        <h3>Affiliations</h3><div id="affs">${(F.affiliations.length ? F.affiliations : [{ name: '' }]).map((a, i) => `<div class="f" style="flex-direction:row;align-items:center;gap:8px"><b style="width:22px">${i + 1}</b><input class="aff inp" value="${esc(a.name)}" placeholder="Department, Institution, City, Country"><button type="button" class="mini danger" data-rmaff="${i}">✕</button></div>`).join('')}</div>
        <button type="button" class="mini" id="addaff">+ Add affiliation</button>
        <h3 style="margin-top:26px">Authors (in order)</h3>${F.authors.map((a, i) => `<div class="au-row"><div class="hd">Author ${i + 1}<span><button type="button" class="mini" data-up="${i}">↑</button><button type="button" class="mini" data-dn="${i}">↓</button><button type="button" class="mini danger" data-rm="${i}">Remove</button></span></div>
          <div class="row3"><div class="f"><label>First name(s)</label><input data-k="given" value="${esc(a.given)}"></div><div class="f"><label>Last name</label><input data-k="family" value="${esc(a.family)}"></div><div class="f"><label>Degrees</label><input data-k="degrees" value="${esc(a.degrees)}" placeholder="PhD"></div></div>
          <div class="row2"><div class="f"><label>Email</label><input data-k="email" type="email" value="${esc(a.email)}"></div><div class="f"><label>ORCID iD</label><input data-k="orcid" value="${esc(a.orcid)}" placeholder="0000-0000-0000-0000"></div></div>
          <div class="f"><label>Affiliations</label><div>${F.affiliations.map((f, k) => `<label class="chk" style="display:inline-flex;margin-right:14px"><input type="checkbox" data-k="aff" value="${k + 1}" ${(a.affiliations || []).includes(k + 1) ? 'checked' : ''}>${k + 1}. ${esc((f.name || '').slice(0, 40))}</label>`).join('')}</div></div>
          <label class="chk"><input type="radio" name="corr" data-k="corr" ${a.corresponding ? 'checked' : ''}> Corresponding author</label></div>`).join('')}
        <button type="button" class="btn btn-ghost" id="addau">+ Add author</button>`;
      if (step === 3) {
        const files = (F.files || []).filter(f => String(f.version) === String(F.version) || ['figure', 'supplementary'].includes(f.kind) && F.status === 'draft');
        const slot = (kind, title, help, req, multi, accept) => `<div class="slot ${req ? 'req' : ''}"><b>${title}</b><small>${help}</small>
          <div class="files">${files.filter(f => f.kind === kind).map(f => `<div class="file"><span class="nm">${esc(f.name)}</span><span class="meta">${Math.round(f.size / 1024)} KB</span><button type="button" class="mini danger" data-rmf="${f.id}">Remove</button></div>`).join('')}</div>
          <input type="file" data-kind="${kind}" ${multi ? 'multiple' : ''} accept="${accept}" style="margin-top:10px"></div>`;
        body = `<h2>Upload files</h2><p class="meta">Download the <a href="/downloads/ACRI-Journals-Manuscript-Template.docx">manuscript template</a> and <a href="/downloads/ACRI-Journals-Title-Page-Template.docx">title page template</a>. Maximum 25 MB per file.</p>
          ${isRev ? slot('response', 'Response to reviewers', 'A point-by-point response to every reviewer comment (.docx or .pdf).', true, false, '.docx,.pdf') : ''}
          ${slot('manuscript', isRev ? 'Revised anonymised manuscript' : 'Anonymised manuscript', 'Word (.docx) from the template. No author names, affiliations or acknowledgments.', true, false, '.docx')}
          ${isRev ? '' : slot('titlepage', 'Title page', 'Word (.docx): authors, affiliations, corresponding author and declarations.', true, false, '.docx')}
          ${slot('figure', 'Figures', 'One high-resolution file per figure (PNG, JPG, TIFF, SVG or PDF), named Figure1, Figure2…', false, true, '.png,.jpg,.jpeg,.tif,.tiff,.svg,.pdf,.eps')}
          ${slot('supplementary', 'Supplementary material', 'Optional appendices, questionnaires or data.', false, true, '')}
          ${isRev ? '' : slot('cover', 'Cover letter', 'Optional.', false, false, '.docx,.pdf')}`;
      }
      if (step === 4) {
        const d = F.declarations || {};
        const ta = (k, l, help, ph) => `<div class="f"><label>${l}</label><textarea name="${k}" style="min-height:70px" placeholder="${esc(ph || '')}">${esc(d[k] || '')}</textarea>${help ? `<small>${help}</small>` : ''}</div>`;
        body = `<h2>Declarations</h2>
          <label class="chk"><input type="checkbox" name="original" ${d.original ? 'checked' : ''}> This manuscript is original, has not been published before and is not under consideration elsewhere.</label>
          <label class="chk"><input type="checkbox" name="ethics" ${d.ethics ? 'checked' : ''}> The research complies with the ACRI Journals <a href="/policies/ethics/" target="_blank">ethics policy</a>, including ethics approval and informed consent where applicable.</label>
          <label class="chk"><input type="checkbox" name="consent" ${d.consent ? 'checked' : ''}> All authors have approved the manuscript and agreed to its submission.</label>
          <label class="chk"><input type="checkbox" name="license" ${d.license ? 'checked' : ''}> If accepted, the article will be published open access under CC BY 4.0, and the authors keep copyright.</label>
          <h3>Statements (published with the article)</h3>
          ${ta('contributions', 'Author contributions', 'Use CRediT roles, e.g. "Conceptualization: Shah, Mehta. Formal analysis: Mehta."')}
          ${ta('conflicts', 'Conflict of interest disclosures', '', 'None reported.')}
          ${ta('funding', 'Funding', '', 'None.')}
          ${ta('ethicsStatement', 'Ethics approval', 'Approving body and reference number, or why approval was not needed.')}
          ${ta('dataSharing', 'Data sharing statement')}
          ${ta('aiUse', 'Use of AI tools', 'Describe any generative AI use, or write "None".')}
          ${ta('acknowledgments', 'Acknowledgments')}
          <h3>For the editor (not published)</h3>
          ${ta('suggested', 'Suggested or opposed reviewers', 'Names, emails and reasons (optional).')}
          ${ta('preprint', 'Preprint', 'DOI of any preprint (optional).')}
          <div class="f"><label>Cover letter / message to the editor</label><textarea name="coverLetter">${esc(F.coverLetter || '')}</textarea></div>`;
      }
      if (step === 5) {
        const ab = F.abstract || {};
        body = `<h2>Review and submit</h2><dl class="kv"><dt>Journal</dt><dd>${esc(j.name || '—')}</dd><dt>Type</dt><dd>${esc(F.type)}</dd><dt>Title</dt><dd><b>${esc(F.title)}</b></dd>
          <dt>Abstract</dt><dd>${typeof ab === 'string' ? esc(ab) : (ab.sections || []).map(s => `<p style="margin:0 0 6px"><b>${esc(s.heading)}</b> ${esc(s.text)}</p>`).join('')}</dd>
          <dt>Keywords</dt><dd>${esc((F.keywords || []).join('; '))}</dd>
          <dt>Authors</dt><dd>${F.authors.map(a => esc(`${a.given} ${a.family}${a.corresponding ? ' (corresponding)' : ''}`)).join('; ')}</dd>
          <dt>Files</dt><dd>${(F.files || []).filter(f => String(f.version) === String(F.version)).map(f => esc(KIND[f.kind] + ': ' + f.name)).join('<br>') || '<span style="color:#B42318">No files uploaded</span>'}</dd></dl>
          <div class="msg info" style="margin-top:18px">After you submit you cannot edit the manuscript unless the editorial office returns it to you.</div>
          <button type="button" class="btn btn-green" id="submit">Submit manuscript</button>`;
      }
      app.innerHTML = `<div class="page-h"><span class="kicker">${isRev ? 'Revision ' + F.version + ' · ' + esc(id) : F.status === 'returned' ? 'Corrections · ' + esc(id) : 'New submission'}</span><h1 style="font:600 30px var(--serif);margin:6px 0 0">${esc(F.title || 'Submit a manuscript')}</h1></div>
        <div class="steps">${STEPS.map((s, i) => `<button data-step="${i}" class="${i === step ? 'on' : i < step ? 'done' : ''}"><b>Step ${i + 1}</b>${s}</button>`).join('')}</div>
        <form class="panel" id="wf" onsubmit="return false">${body}
        <div class="actions" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:18px">
          <span>${step > 0 ? '<button type="button" class="btn btn-ghost" id="prev">← Back</button>' : ''}</span>
          <span style="display:flex;gap:10px"><button type="button" class="btn btn-ghost" id="savedraft">Save draft</button>${step < 5 ? '<button type="button" class="btn btn-primary" id="next">Continue →</button>' : ''}</span></div></form>`;
      bind();
    }
    function bind() {
      $$('[data-step]').forEach(b => b.onclick = () => goStep(+b.dataset.step));
      $('#prev')?.addEventListener('click', () => goStep(step - 1));
      $('#next')?.addEventListener('click', (e) => { if (step === 0) { collect(); if (!F.journal) return toast('Choose a journal.', true); } run(e.target, () => goStep(step + 1)); });
      $('#savedraft').onclick = (e) => run(e.target, () => save());
      $('[name=journal]')?.addEventListener('change', () => { collect(); draw(); });
      $('[name=type]')?.addEventListener('change', () => collect());
      $('#addaff')?.addEventListener('click', () => { collect(); F.affiliations.push({ id: F.affiliations.length + 1, name: '' }); draw(); });
      $$('[data-rmaff]').forEach(b => b.onclick = () => { collect(); const i = +b.dataset.rmaff; F.affiliations.splice(i, 1); F.authors.forEach(a => a.affiliations = (a.affiliations || []).filter(x => x !== i + 1).map(x => x > i + 1 ? x - 1 : x)); draw(); });
      $('#addau')?.addEventListener('click', () => { collect(); F.authors.push({ given: '', family: '', degrees: '', email: '', orcid: '', affiliations: [], corresponding: false }); draw(); });
      $$('[data-rm]').forEach(b => b.onclick = () => { collect(); if (F.authors.length > 1) F.authors.splice(+b.dataset.rm, 1); draw(); });
      $$('[data-up]').forEach(b => b.onclick = () => { collect(); const i = +b.dataset.up; if (i > 0) [F.authors[i - 1], F.authors[i]] = [F.authors[i], F.authors[i - 1]]; draw(); });
      $$('[data-dn]').forEach(b => b.onclick = () => { collect(); const i = +b.dataset.dn; if (i < F.authors.length - 1) [F.authors[i + 1], F.authors[i]] = [F.authors[i], F.authors[i + 1]]; draw(); });
      $$('input[type=file][data-kind]').forEach(inp => inp.onchange = async () => {
        try {
          if (!id) await save(true);
          for (const file of inp.files) {
            if (file.size > 25 * 1024 * 1024) { toast(file.name + ' is larger than 25 MB.', true); continue; }
            toast('Uploading ' + file.name + '…');
            const r = await api('sub.upload', { id, kind: inp.dataset.kind, name: file.name, mime: file.type, data: await fileToB64(file) });
            if (['manuscript', 'titlepage', 'cover', 'response'].includes(inp.dataset.kind)) F.files = F.files.filter(f => !(f.kind === inp.dataset.kind && String(f.version) === String(F.version)));
            F.files.push(r.file);
          }
          toast('Uploaded'); draw();
        } catch (e) { toast(e.message, true); }
      });
      $$('[data-rmf]').forEach(b => b.onclick = () => run(b, async () => { await api('sub.removeFile', { fileId: b.dataset.rmf }); F.files = F.files.filter(f => f.id !== b.dataset.rmf); draw(); }));
      $('#submit')?.addEventListener('click', (e) => run(e.target, async () => { await save(true); const r = await api('sub.submit', { id }); toast('Submitted. Your manuscript ID is ' + r.id); go('ms/' + r.id); }));
    }
    draw();
  }

  // ---------------------------------------------------------------- manuscript page
  async function vMs(id) {
    app.innerHTML = '<div class="loading">Loading manuscript…</div>';
    const { sub: s } = await api('sub.get', { id });
    const R = s.role, staff = R !== 'author';
    document.documentElement.style.setProperty('--accent', s.accent || '#0B2545');
    const ab = s.abstract || '';
    const absHtml = typeof ab === 'string' ? `<p>${esc(ab)}</p>` : (ab.sections || []).map(x => `<p style="margin:0 0 8px">${x.heading ? `<b>${esc(x.heading)}</b> ` : ''}${esc(x.text)}</p>`).join('');
    const filesHtml = (s.files || []).sort((a, b) => b.version - a.version).map(f => `<div class="file"><span class="k">v${f.version} · ${esc(KIND[f.kind] || f.kind)}</span><span class="nm">${esc(f.name)}</span><button class="mini" data-dl="${f.id}">Download</button>${/\.docx$/i.test(f.name) ? `<button class="mini" data-pdf="${f.id}">PDF</button>` : ''}</div>`).join('') || '<div class="empty">No files.</div>';
    const authors = (s.authors || []).map(a => `${esc(a.given)} ${esc(a.family)}${a.degrees ? ', ' + esc(a.degrees) : ''}${a.corresponding ? ' <span class="meta">(corresponding · ' + esc(a.email) + ')</span>' : ''}`).join('<br>');

    // Reviews
    let revHtml = '';
    if (staff) {
      revHtml = (s.reviews || []).length ? s.reviews.slice().sort((a, b) => b.version - a.version || a.number - b.number).map(r => `<div class="rev"><div class="hd"><span><b>Reviewer ${r.number}</b> · v${r.version} · ${esc(r.reviewer?.name || '')} <span class="meta">${esc(r.reviewer?.email || '')}</span></span>${st(r.status === 'submitted' ? 'submitted-r' : r.status, r.status)}</div>
        <div class="meta">Invited ${fmt(r.invitedAt)}${r.due ? ' · due ' + esc(r.due) : ''}${r.submittedAt ? ' · submitted ' + fmt(r.submittedAt) : ''}${r.reminders ? ' · ' + r.reminders + ' reminder(s)' : ''}</div>
        ${r.status === 'submitted' ? `<p style="margin:10px 0 0"><b>Recommendation:</b> ${esc(DEC[r.recommendation] || r.recommendation)}${r.scores ? ' · ' + Object.entries(r.scores).map(([k, v]) => esc(k) + ' ' + esc(v) + '/5').join(', ') : ''}</p><div class="txt">${esc(r.toAuthor)}</div>${r.toEditor ? `<p class="meta" style="margin:10px 0 0"><b>Confidential to editor:</b></p><div class="txt" style="background:#FFF8E1">${esc(r.toEditor)}</div>` : ''}` : ''}
        ${['invited', 'accepted'].includes(r.status) && ['admin', 'eic', 'editor'].includes(R) ? `<div class="actions" style="margin-top:10px"><button class="mini" data-rv="remind" data-id="${r.id}">Send reminder</button><button class="mini" data-rv="extend" data-id="${r.id}">Extend due date</button><button class="mini danger" data-rv="cancel" data-id="${r.id}">Cancel</button></div>` : ''}</div>`).join('') : '<div class="empty">No reviewers invited yet.</div>';
    } else if ((s.reviews || []).length) {
      revHtml = s.reviews.map(r => `<div class="rev"><b>Reviewer ${r.number}</b> <span class="meta">· version ${r.version}</span><div class="txt">${esc(r.toAuthor)}</div></div>`).join('');
    }
    const hist = (s.history || []).slice().reverse().map(h => `<li><div><b>${esc(String(h.action).replace(/_/g, ' '))}</b>${h.by ? ' · ' + esc(h.by) : ''}</div><div class="ts">${fmtT(h.ts)}</div>${h.detail ? `<div class="d">${esc(h.detail)}</div>` : ''}</li>`).join('');

    // Action panels
    const A = [];
    if (R === 'author') {
      if (['returned', 'revision'].includes(s.status)) A.push(`<div class="panel"><h3>${s.status === 'revision' ? 'Revision requested' : 'Corrections needed'}</h3><p style="font-size:14px">${s.status === 'revision' ? 'Read the decision letter and reviewer comments, then upload your revised manuscript and a response to the reviewers.' : 'Please make the corrections listed in the history and resubmit.'}</p><a class="btn btn-accent" href="#/submit?id=${esc(s.id)}&step=3">Open submission</a></div>`);
      if (s.status === 'accepted') A.push(`<div class="panel"><h3>Final files</h3><p style="font-size:14px">Congratulations on your acceptance${s.doi ? `. Your DOI is reserved: <b>${esc(s.doi)}</b>` : ''}. Upload the final, non-anonymised manuscript (.docx, from the template) and each figure as a high-resolution file.</p>
        <div class="slot req"><b>Final manuscript (.docx)</b><input type="file" data-up="final" accept=".docx"></div><div class="slot"><b>Final figures</b><small>Figure1.png, Figure2.png…</small><input type="file" data-up="final_figure" multiple accept=".png,.jpg,.jpeg,.tif,.tiff,.svg,.pdf,.eps"></div>
        ${s.flags?.finalReady ? '<div class="msg ok">Final files submitted. The editorial office will prepare your proofs.</div>' : '<button class="btn btn-green" id="finalsub">Submit final files</button>'}</div>`);
      if (s.status === 'proof') A.push(`<div class="panel"><h3>Check your proofs</h3><p style="font-size:14px">Check names, affiliations, figures, tables and references in both versions.</p><div class="actions" style="margin-top:0"><a class="btn btn-ghost" target="_blank" href="${esc(s.proofUrl)}">Web proof ↗</a><a class="btn btn-ghost" target="_blank" href="${esc(s.proofPdf)}">PDF proof ↗</a></div>
        <div class="f" style="margin-top:16px"><label>Corrections (if any)</label><textarea id="pnote" placeholder="Section, paragraph, current text → corrected text"></textarea></div><div class="actions"><button class="btn btn-green" id="papprove">Approve proofs</button><button class="btn btn-ghost" id="pcorr">Send corrections</button></div></div>`);
      if (s.status === 'published') A.push(`<div class="panel"><h3>Published</h3><a class="btn btn-accent" target="_blank" href="${esc(s.articleUrl)}">View article ↗</a>${s.doi ? `<p class="meta" style="margin-top:10px">DOI: <a href="https://doi.org/${esc(s.doi)}">${esc(s.doi)}</a></p>` : ''}<h3 style="margin-top:18px">Certificates of publication</h3><p class="meta">Signed on the ACRI Journals letterhead, one for each author.</p><div style="display:flex;gap:8px;flex-wrap:wrap">${(s.authors || []).map((a, n) => `<button class="btn btn-ghost" data-cert="${n}">⤓ ${esc(((a.given || '') + ' ' + (a.family || '')).trim())}</button>`).join('')}</div></div>`);
      if (!['published', 'withdrawn', 'rejected', 'desk_rejected', 'production', 'proof', 'proof_approved'].includes(s.status)) A.push(`<div class="panel"><button class="mini danger" id="withdraw">Withdraw manuscript</button></div>`);
    }
    if (R === 'admin' && s.status === 'submitted') A.push(`<div class="panel"><h3>Technical check</h3><p style="font-size:14px">Check: template used, anonymised, title page complete, figures readable, references formatted, declarations complete, similarity check.</p><div class="f"><label>Note</label><textarea id="tnote" placeholder="Required when returning to the author"></textarea></div><div class="actions"><button class="btn btn-green" id="tpass">Pass → send to EIC</button><button class="btn btn-ghost" id="tret">Return to author</button></div></div>`);
    if (['admin', 'eic'].includes(R) && ['with_editor', 'under_review', 'reviews_complete', 'revision'].includes(s.status)) A.push(`<div class="panel"><h3>Handling editor</h3><p style="font-size:14px">${s.editor ? 'Current: <b>' + esc(s.editor.name) + '</b>' : 'Not assigned.'}</p><div class="f"><select id="edsel">${(s.boardMembers || []).map(b => `<option value="${b.id}" ${s.editor?.id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div><button class="btn btn-ghost" id="assign">Assign</button></div>`);
    if (['admin', 'eic', 'editor'].includes(R) && ['with_editor', 'under_review', 'reviews_complete'].includes(s.status)) A.push(`<div class="panel"><h3>Invite a reviewer</h3><div class="f"><input id="rvemail" class="inp" type="email" placeholder="Reviewer email"></div><div class="row2"><div class="f"><input id="rvgiven" class="inp" placeholder="First name"></div><div class="f"><input id="rvfamily" class="inp" placeholder="Last name"></div></div><div class="f"><input id="rvaff" class="inp" placeholder="Affiliation"></div><button class="btn btn-primary" id="invite">Send invitation</button><label class="chk" style="margin-top:6px;font-size:13px"><input type="checkbox" id="rvforce"> Invite anyway (ignore the reviewer's pause or limit)</label>${(s.boardMembers || []).length ? `<div class="meta" style="margin-top:10px">Board members (click to use): ${(s.boardMembers || []).map(b => `<button type="button" class="mini" data-bm="${esc(b.email)}" title="${b.paused ? 'Paused until ' + b.paused : 'Reviews in ' + b.reviewDays + ' days, max ' + b.reviewMax + ' at a time'}">${esc(b.name)}${b.paused ? ' (paused)' : ' · ' + b.reviewDays + 'd'}</button>`).join(' ')}</div>` : ''}<p class="meta" style="margin:10px 0 0">Names are only needed for people without an ACRI Journals account.</p></div>`);
    if (R === 'editor' && ['under_review', 'reviews_complete'].includes(s.status)) A.push(`<div class="panel"><h3>Recommendation to EIC</h3><div class="f"><select id="recsel">${Object.entries(DEC).filter(([k]) => k !== 'desk_reject').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="f"><textarea id="recnote" placeholder="Reasoning"></textarea></div><button class="btn btn-ghost" id="recommend">Send recommendation</button></div>`);
    if (s.canDecide && ['with_editor', 'under_review', 'reviews_complete'].includes(s.status)) A.push(`<div class="panel"><h3>Decision</h3><div class="f"><select id="decsel">${Object.entries(DEC).filter(([k]) => k !== 'desk_reject' || s.status === 'with_editor').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="f"><label>Letter to the author</label><textarea id="decletter" style="min-height:160px"></textarea></div><label class="chk"><input type="checkbox" id="increv" checked> Include reviewer comments</label><button class="btn btn-accent" id="decide">Send decision</button></div>`);
    if (R === 'admin' && ['accepted', 'production', 'proof', 'proof_approved', 'published'].includes(s.status)) A.push(`<div class="panel"><h3>Production</h3><dl class="kv" style="grid-template-columns:90px 1fr;font-size:13.5px"><dt>DOI</dt><dd>${s.doi ? esc(s.doi) : '<i>not reserved</i>'}</dd><dt>Final files</dt><dd>${s.flags?.finalReady ? 'received' : 'awaiting author'}</dd>${s.proofUrl ? `<dt>Proof</dt><dd><a target="_blank" href="${esc(s.proofUrl)}">web</a> · <a target="_blank" href="${esc(s.proofPdf)}">PDF</a></dd>` : ''}</dl>
      <div class="actions">${!s.doi ? '<button class="mini" id="reserve">Reserve DOI</button>' : ''}${['accepted', 'production', 'proof'].includes(s.status) ? `<button class="mini" id="psend">${s.status === 'accepted' ? 'Send to production' : 'Re-run conversion'}</button>` : ''}${s.status === 'production' ? '<button class="mini" id="pcheck">Check proof status</button>' : ''}${['proof', 'proof_approved', 'published'].includes(s.status) ? '<button class="mini" id="psrc">Edit article source</button>' : ''}</div>
      ${['proof', 'proof_approved'].includes(s.status) ? `<h3>Publish</h3><div class="row2"><div class="f"><label>Volume</label><input id="pvol" class="inp" placeholder="blank = New Online"></div><div class="f"><label>Issue</label><input id="piss" class="inp"></div></div><div class="f"><label>Publication date</label><input id="pdate" class="inp" type="date" value="${new Date().toISOString().slice(0, 10)}"></div><label class="chk"><input type="checkbox" id="pfeat"> Feature on the home page</label>${s.status === 'proof' ? '<div class="msg info">The author has not approved the proofs yet.</div>' : ''}<button class="btn btn-green" id="publish">Publish article</button>` : ''}
      ${s.status === 'published' ? `<div class="actions"><a class="btn btn-ghost" target="_blank" href="${esc(s.articleUrl)}">View live ↗</a><button class="btn btn-primary" id="regdoi">Register DOI on Zenodo</button></div>` : ''}<div id="srcbox"></div></div>`);
    if (staff) A.push(`<div class="panel"><h3>Internal note</h3><div class="f"><textarea id="note" style="min-height:70px" placeholder="Visible to editors only"></textarea></div><button class="mini" id="addnote">Add note</button></div>`);

    const d = s.declarations || {};
    app.innerHTML = `<div class="crumbs"><a href="#/">Dashboard</a> › ${esc(s.journalCode)} › ${esc(s.id)}</div>
      <div class="page-h"><span class="kicker" style="color:${esc(s.accent)}">${esc(s.journalCode)} · ${esc(s.type)} · v${s.version}</span><h1 style="font:600 30px/1.25 var(--serif);margin:8px 0 10px">${esc(s.title)}</h1>${st(s.status, s.statusLabel)} <span class="meta">${esc(s.id)}${s.submittedAt ? ' · submitted ' + fmt(s.submittedAt) : ''}</span></div>
      <div class="dgrid"><div>
        <div class="panel"><div class="tabs"><button class="on" data-t="ov">Overview</button><button data-t="files">Files</button><button data-t="rev">Reviews${(s.reviews || []).length ? `<span class="n">${s.reviews.length}</span>` : ''}</button>${staff ? '<button data-t="decl">Declarations</button>' : ''}</div>
          <div data-p="ov"><h3>Abstract</h3>${absHtml}<h3>Keywords</h3><p>${esc((s.keywords || []).join('; '))}</p><h3>Authors</h3><p>${authors}</p>${staff && s.coverLetter ? `<h3>Cover letter</h3><div class="txt" style="white-space:pre-wrap">${esc(s.coverLetter)}</div>` : ''}</div>
          <div data-p="files" hidden><div class="files">${filesHtml}</div></div>
          <div data-p="rev" hidden>${revHtml || '<div class="empty">Reviewer comments appear here after the editor\'s decision.</div>'}</div>
          ${staff ? `<div data-p="decl" hidden><dl class="kv">${[['Contributions', d.contributions], ['Conflicts', d.conflicts], ['Funding', d.funding], ['Ethics', d.ethicsStatement], ['Data sharing', d.dataSharing], ['AI use', d.aiUse], ['Suggested reviewers', d.suggested], ['Preprint', d.preprint]].map(([k, v]) => `<dt>${k}</dt><dd style="white-space:pre-wrap">${esc(v || '—')}</dd>`).join('')}</dl></div>` : ''}
        </div>
      </div><aside class="side">${A.join('')}<div class="panel"><h3>History</h3><ul class="tl">${hist || '<li>No activity yet.</li>'}</ul></div></aside></div>`;

    // bindings
    $$('[data-t]').forEach(b => b.onclick = () => { $$('[data-t]').forEach(x => x.classList.toggle('on', x === b)); $$('[data-p]').forEach(p => p.hidden = p.dataset.p !== b.dataset.t); });
    $$('[data-dl],[data-pdf]').forEach(b => b.onclick = () => run(b, async () => { const r = await api('file.get', { fileId: b.dataset.dl || b.dataset.pdf, pdf: !!b.dataset.pdf }); download(r.name, r.mime, r.data); }));
    $$('[data-cert]').forEach(b => b.onclick = () => run(b, async () => { const r = await api('cert.get', { subId: id, author: Number(b.dataset.cert) }); download(r.name, r.mime, r.data); }));
    const act = (sel, fn) => $(sel)?.addEventListener('click', (e) => run(e.target, fn).then(() => vMs(id)).catch(() => { }));
    act('#tpass', () => api('ed.tech', { id, pass: true, note: $('#tnote').value }));
    act('#tret', () => api('ed.tech', { id, pass: false, note: $('#tnote').value }));
    act('#assign', () => api('ed.assign', { id, editorId: $('#edsel').value }));
    act('#invite', () => api('ed.invite', { id, email: $('#rvemail').value, given: $('#rvgiven').value, family: $('#rvfamily').value, affiliation: $('#rvaff').value, force: !!$('#rvforce')?.checked }).then(() => toast('Invitation sent')));
    $$('[data-bm]').forEach(b => b.onclick = () => { $('#rvemail').value = b.dataset.bm; $('#rvemail').focus(); });
    act('#recommend', () => api('ed.note', { id, recommend: $('#recsel').value, note: $('#recnote').value }));
    act('#decide', () => { if (!confirm('Send this decision to the authors now?')) throw new Error('Cancelled'); return api('ed.decide', { id, decision: $('#decsel').value, letter: $('#decletter').value, includeReviews: $('#increv').checked }); });
    act('#addnote', () => api('ed.note', { id, note: $('#note').value }));
    act('#withdraw', () => { const r = prompt('Reason for withdrawing (sent to the editorial office):'); if (r === null) throw new Error('Cancelled'); return api('sub.withdraw', { id, reason: r }); });
    act('#finalsub', () => api('sub.final', { id }));
    act('#papprove', () => api('sub.proof', { id, approve: true }));
    act('#pcorr', () => api('sub.proof', { id, approve: false, note: $('#pnote').value }).then(() => toast('Corrections sent')));
    act('#reserve', () => api('prod.reserve', { id }));
    act('#psend', () => api('prod.send', { id }).then(r => toast(r.message)));
    act('#pcheck', () => api('prod.check', { id }).then(r => { const it = r.items?.[0] || {}; if (it.ready) return toast('Proofs sent to author.'); const b = r.build; const failed = b && b.conclusion === 'failure'; toast(failed ? 'The website build FAILED, so the proof was not made. Open GitHub → Actions to see why.' : (it.stage || 'Not ready yet.') + (b ? ' Build: ' + b.status + (b.conclusion ? ' / ' + b.conclusion : '') : ''), failed); if (failed && b.url) window.open(b.url, '_blank'); }));
    act('#publish', () => { if (!confirm('Publish this article now? It will be public in a few minutes.')) throw new Error('Cancelled'); return api('prod.publish', { id, volume: $('#pvol').value, issue: $('#piss').value, published: $('#pdate').value, featured: $('#pfeat').checked }).then(r => toast(r.message)); });
    act('#regdoi', () => api('prod.doi', { id }).then(r => toast('DOI registered: ' + r.doi)));
    $$('[data-rv]').forEach(b => b.onclick = () => run(b, async () => { const op = b.dataset.rv; let due; if (op === 'extend') { due = prompt('New due date (YYYY-MM-DD):'); if (!due) return; } if (op === 'cancel' && !confirm('Cancel this review?')) return; await api('ed.review', { reviewId: b.dataset.id, op, due }); toast('Done'); vMs(id); }));
    $$('input[data-up]').forEach(inp => inp.onchange = async () => { try { for (const f of inp.files) { toast('Uploading ' + f.name + '…'); await api('sub.upload', { id, kind: inp.dataset.up, name: f.name, mime: f.type, data: await fileToB64(f) }); } toast('Uploaded'); vMs(id); } catch (e) { toast(e.message, true); } });
    $('#psrc')?.addEventListener('click', (e) => run(e.target, async () => {
      const r = await api('prod.source', { id });
      $('#srcbox').innerHTML = `<h3>article.json</h3><textarea class="inp code" id="srcA">${esc(r.article)}</textarea><h3>body.html</h3><textarea class="inp code" id="srcB">${esc(r.body)}</textarea><button class="btn btn-primary" id="srcsave" style="margin-top:10px">Save & rebuild</button>`;
      $('#srcsave').onclick = (ev) => run(ev.target, async () => { await api('prod.saveSource', { id, article: $('#srcA').value, body: $('#srcB').value }); toast('Saved. The site is rebuilding.'); });
    }));
  }

  // ---------------------------------------------------------------- reviewer
  async function vReview(q) {
    app.innerHTML = '<div class="loading">Loading review…</div>';
    const { review: r } = await api('rev.get', { token: q.token });
    const m = r.ms; document.documentElement.style.setProperty('--accent', m.accent || '#0B2545');
    const ab = m.abstract || '';
    const absHtml = typeof ab === 'string' ? `<p>${esc(ab)}</p>` : (ab.sections || []).map(x => `<p style="margin:0 0 8px">${x.heading ? `<b>${esc(x.heading)}</b> ` : ''}${esc(x.text)}</p>`).join('');
    const head = `<div class="page-h"><span class="kicker" style="color:${esc(m.accent)}">${esc(m.code)} · Peer review · ${esc(m.id)}${r.version > 1 ? ' (revision ' + r.version + ')' : ''}</span><h1 style="font:600 28px/1.25 var(--serif);margin:8px 0 10px">${esc(m.title)}</h1>${st(r.status === 'submitted' ? 'submitted-r' : r.status, r.status)}${r.due ? ` <span class="meta">Due ${esc(r.due)}</span>` : ''}</div>`;
    if (r.status === 'invited') {
      app.innerHTML = head + `<div class="dgrid"><div class="panel"><h2>Invitation to review</h2><p class="meta">${esc(m.type)} · ${esc(m.journal)}</p><h3>Abstract</h3>${absHtml}<p><b>Keywords:</b> ${esc((m.keywords || []).join('; '))}</p></div>
        <aside class="side"><div class="panel"><h3>Your response</h3><p style="font-size:14px">If you accept, the report is due in 21 days. Please decline if you have a conflict of interest.</p>
        <button class="btn btn-green" id="acc" style="width:100%;justify-content:center;${q.a === 'decline' ? 'opacity:.6' : ''}">Accept invitation</button>
        <div class="f" style="margin-top:16px"><label>If declining: reason (optional)</label><textarea id="why" style="min-height:60px"></textarea></div><div class="f"><label>Suggest another reviewer (optional)</label><input id="sug" class="inp" placeholder="Name and email"></div>
        <button class="btn btn-ghost" id="dec" style="width:100%;justify-content:center">Decline invitation</button></div></aside></div>`;
      $('#acc').onclick = (e) => run(e.target, async () => { await api('rev.respond', { token: q.token, accept: true }); toast('Thank you! The manuscript is now available.'); go('review?token=' + q.token); });
      $('#dec').onclick = (e) => run(e.target, async () => { await api('rev.respond', { token: q.token, accept: false, reason: $('#why').value, suggest: $('#sug').value }); app.innerHTML = head + '<div class="panel"><div class="msg ok">Thank you for letting us know. You have declined this invitation.</div></div>'; });
      return;
    }
    if (['declined', 'expired'].includes(r.status)) { app.innerHTML = head + '<div class="panel"><div class="msg info">This invitation is closed. Thank you.</div></div>'; return; }
    const sc = r.scores || {}, ro = r.status === 'submitted';
    const crit = [['originality', 'Originality'], ['methods', 'Methodology'], ['analysis', 'Analysis & evidence'], ['clarity', 'Clarity'], ['relevance', 'Relevance to journal']];
    app.innerHTML = head + `<div class="dgrid"><div>
      <div class="panel"><div class="tabs"><button class="on" data-t="ms">Manuscript</button><button data-t="info">Abstract</button><button data-t="form">Your report</button>${r.others ? '<button data-t="others">Other reviews</button>' : ''}</div>
        <div data-p="ms"><div class="files" style="margin-bottom:14px">${(r.files || []).map(f => `<div class="file"><span class="k">${esc(KIND[f.kind] || f.kind)}</span><span class="nm">${esc(f.name)}</span><button class="mini" data-view="${f.id}">Open</button></div>`).join('')}</div><div class="viewer" id="viewer"><div class="empty" style="color:#ddd">Choose a file to open it here.</div></div><p class="meta" style="margin-top:8px">The manuscript is confidential. It opens in this secure viewer and cannot be downloaded.</p></div>
        <div data-p="info" hidden><h3>Abstract</h3>${absHtml}</div>
        <div data-p="form" hidden><form id="rf">
          <h3>Scores (1 = poor, 5 = excellent)</h3><div class="scores">${crit.map(([k, l]) => `<div class="f"><label>${l}</label><select name="${k}" ${ro ? 'disabled' : ''}><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option ${String(sc[k]) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`).join('')}</div>
          <h3>Recommendation</h3><div class="f"><select name="recommendation" ${ro ? 'disabled' : ''}><option value="">Choose…</option>${['accept', 'minor', 'major', 'reject'].map(k => `<option value="${k}" ${r.recommendation === k ? 'selected' : ''}>${DEC[k]}</option>`).join('')}</select></div>
          <div class="f"><label>Comments to the authors</label><textarea name="toAuthor" style="min-height:260px" ${ro ? 'readonly' : ''} placeholder="Summary of the paper and its contribution; major concerns; minor points (cite sections, tables or lines).">${esc(r.toAuthor || '')}</textarea><small>Shared with the authors anonymously. Do not include your name.</small></div>
          <div class="f"><label>Confidential comments to the editor</label><textarea name="toEditor" ${ro ? 'readonly' : ''}>${esc(r.toEditor || '')}</textarea></div>
          ${ro ? '<div class="msg ok">Report submitted. Thank you.</div>' : '<div class="actions"><button type="button" class="btn btn-ghost" id="rsave">Save draft</button><button type="button" class="btn btn-green" id="rsubmit">Submit report</button></div>'}
        </form></div>
        ${r.others ? `<div data-p="others" hidden>${r.others.map(o => `<div class="rev"><b>Reviewer ${o.number}</b> · ${esc(DEC[o.recommendation] || '')}<div class="txt">${esc(o.toAuthor)}</div></div>`).join('') || '<div class="empty">No other reviews.</div>'}</div>` : ''}
      </div></div>
      <aside class="side"><div class="panel"><h3>Guidance</h3><p style="font-size:14px">Assess whether the question matters, whether the methods answer it, whether the conclusions follow from the evidence, and whether the paper is clearly written. Be specific and constructive.</p><a href="/for-reviewers/" target="_blank">Reviewer guidelines ↗</a></div></aside></div>`;
    $$('[data-t]').forEach(b => b.onclick = () => { $$('[data-t]').forEach(x => x.classList.toggle('on', x === b)); $$('[data-p]').forEach(p => p.hidden = p.dataset.p !== b.dataset.t); });
    $$('[data-view]').forEach(b => b.onclick = () => run(b, async () => { const f = await api('rev.file', { token: q.token, fileId: b.dataset.view }); await showPdf(f); }));
    const payload = (submit) => { const f = $('#rf'); return { token: q.token, submit, scores: Object.fromEntries(crit.map(([k]) => [k, f.elements[k].value])), recommendation: f.recommendation.value, toAuthor: f.toAuthor.value, toEditor: f.toEditor.value }; };
    $('#rsave')?.addEventListener('click', (e) => run(e.target, async () => { await api('rev.save', payload(false)); toast('Draft saved'); }));
    $('#rsubmit')?.addEventListener('click', (e) => { if (!confirm('Submit your report? You will not be able to edit it afterwards.')) return; run(e.target, async () => { await api('rev.save', payload(true)); toast('Thank you, your report has been submitted.'); vReview(q); }); });
    if (r.files?.length && !ro) $('[data-view]')?.click();
  }
  async function showPdf(f) {
    const v = $('#viewer'); v.innerHTML = '<div class="empty" style="color:#ddd">Rendering…</div>';
    if (!/pdf/i.test(f.mime)) { if (/^image\//.test(f.mime)) { v.innerHTML = `<img src="data:${f.mime};base64,${f.data}" style="max-width:100%;display:block;margin:auto" oncontextmenu="return false">`; } else v.innerHTML = '<div class="empty" style="color:#ddd">This file type cannot be previewed.</div>'; return; }
    if (!window.pdfjsLib) {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    v.innerHTML = '';
    v.oncontextmenu = () => false;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), vp = page.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; v.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  }

  // ---------------------------------------------------------------- profile
  async function vProfile() {
    const { user: u } = await api('auth.me');
    app.innerHTML = `<div class="page-h"><span class="kicker">Account</span><h1 style="font:600 30px var(--serif);margin:6px 0 0">Your profile</h1></div><form class="panel" id="pf" style="max-width:760px">
      <div class="row3"><div class="f"><label>First name</label><input name="given" value="${esc(u.given)}"></div><div class="f"><label>Last name</label><input name="family" value="${esc(u.family)}"></div><div class="f"><label>Degrees</label><input name="degrees" value="${esc(u.degrees)}"></div></div>
      <div class="row2"><div class="f"><label>Affiliation</label><input name="affiliation" value="${esc(u.affiliation)}"></div><div class="f"><label>ORCID iD</label><input name="orcid" value="${esc(u.orcid)}"></div></div>
      <div class="row2"><div class="f"><label>Country</label><input name="country" value="${esc(u.country)}"></div><div class="f"><label>Phone</label><input name="phone" value="${esc(u.phone)}"></div></div>
      <div class="row2"><div class="f"><label>Designation</label><input name="designation" value="${esc(u.designation)}" placeholder="e.g. Associate Professor"></div><div class="f"><label>Department</label><input name="department" value="${esc(u.department)}"></div></div>
      <div class="row2"><div class="f"><label>Institutional email</label><input name="instEmail" value="${esc(u.instEmail)}"></div><div class="f"><label>Institutional profile link</label><input name="profileUrl" value="${esc(u.profileUrl)}"></div></div>
      <div class="f"><label>Full institutional postal address</label><input name="instAddress" value="${esc(u.instAddress)}"></div>
      <div class="f"><label>Short bio (shown on the editorial board page if you are a board member)</label><textarea name="bio" rows="3" maxlength="600">${esc(u.bio || '')}</textarea></div>
      <label class="chk"><input type="checkbox" name="reviewer" ${u.reviewer ? 'checked' : ''}> I am willing to review</label>
      <div class="f"><label>Review subject areas</label><input name="subjects" value="${esc((u.subjects || []).join('; '))}" placeholder="e.g. entrepreneurship; finance"></div>
      <h3>Reviewing preferences</h3><p class="meta" style="margin-top:-6px">Editors see these before inviting you, and your review deadline follows them.</p>
      <div class="row3"><div class="f"><label>Days I need for a review</label><select name="reviewDays">${[7, 10, 14, 21, 30, 45, 60].map(d => `<option ${Number(u.reviewDays) === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div class="f"><label>Most reviews at a time</label><select name="reviewMax">${[0, 1, 2, 3, 4, 5].map(d => `<option value="${d}" ${Number(u.reviewMax) === d ? 'selected' : ''}>${d === 0 ? 'No limit' : d}</option>`).join('')}</select></div><div class="f"><label>Not available until</label><input type="date" name="reviewPauseUntil" value="${esc(u.reviewPauseUntil || '')}"></div></div>
      <div class="f"><label>Note for editors (optional)</label><input name="reviewNote" value="${esc(u.reviewNote || '')}" placeholder="e.g. on leave in December; quantitative papers preferred"></div>
      ${['eic', 'senior', 'editor', 'board'].some(r => (S.user?.roles?.[r] || []).length) || isAdmin() ? `<h3>Board page photo</h3><div style="display:flex;gap:12px;align-items:center"><img id="phprev" src="${esc(u.photo || '')}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:#EEF1F5;${u.photo ? '' : 'visibility:hidden'}"><input type="file" id="phfile" accept="image/*" class="inp"><button type="button" class="btn btn-ghost" id="phsave">Save photo</button></div>` : ''}
      <h3>Change password</h3><div class="row2"><div class="f"><input name="currentPassword" type="password" placeholder="Current password" class="inp"></div><div class="f"><input name="newPassword" type="password" placeholder="New password" class="inp"></div></div>
      <button class="btn btn-primary">Save profile</button></form>`;
    $('#phsave')?.addEventListener('click', (e) => run(e.target, async () => { const f = $('#phfile').files[0]; if (!f) return toast('Choose a photo first.', true); const ph = await squarePhoto(f); $('#phprev').src = 'data:image/jpeg;base64,' + ph.data; $('#phprev').style.visibility = 'visible'; const r = await api('me.photo', ph); toast(r.message); }));
    $('#pf').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { const r = await api('auth.profile', { given: f.given.value, family: f.family.value, degrees: f.degrees.value, affiliation: f.affiliation.value, orcid: f.orcid.value, country: f.country.value, phone: f.phone.value, designation: f.designation.value, department: f.department.value, instEmail: f.instEmail.value, profileUrl: f.profileUrl.value, instAddress: f.instAddress.value, bio: f.bio.value, reviewer: f.reviewer.checked, reviewDays: f.reviewDays.value, reviewMax: f.reviewMax.value, reviewPauseUntil: f.reviewPauseUntil.value, reviewNote: f.reviewNote.value, subjects: f.subjects.value.split(/[;,]/).map(s => s.trim()).filter(Boolean), currentPassword: f.currentPassword.value, newPassword: f.newPassword.value }); setSession(S.token, r.user); toast('Profile saved'); }); };
  }

  // ---------------------------------------------------------------- admin
  async function vAdmin(tab, q) {
    const adm = isAdmin();
    if (!adm && !eicOf().length) return go('');
    const T = adm ? [['overview', 'Overview'], ['manuscripts', 'Manuscripts'], ['team', 'Editorial team'], ['journals', 'Journals'], ['issues', 'Issues'], ['backissues', 'Back issues'], ['indexing', 'ISSN & indexing'], ['email', 'Email & campaigns'], ['messages', 'Messages'], ['letters', 'Letters & email'], ['partners', 'Partners'], ['users', 'People'], ['settings', 'Settings']]
      : [['messages', 'Messages'], ['team', 'Editorial team'], ['indexing', 'ISSN & indexing'], ['email', 'Email & campaigns']];
    if (!T.some(t => t[0] === tab)) tab = T[0][0];
    app.innerHTML = `<div class="page-h"><span class="kicker">${adm ? 'Administration' : 'Journal administration'}</span><h1 style="font:600 30px var(--serif);margin:6px 0 0">ACRI Journals admin</h1></div><div class="panel"><div class="tabs">${T.map(([k, l]) => `<button data-at="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="adm"><div class="loading">Loading…</div></div></div>`;
    $$('[data-at]').forEach(b => b.onclick = () => go('admin/' + b.dataset.at));
    const box = $('#adm');
    const J = adm ? (await api('adm.journals')).items : (await api('public.journals')).journals.filter(j => eicOf().includes(j.slug));
    const jsel = (name, val, withNet) => `<select name="${name}" class="inp" style="width:auto">${withNet ? `<option value="network" ${val === 'network' ? 'selected' : ''}>All journals (network)</option>` : ''}${J.map(j => `<option value="${j.slug}" ${val === j.slug ? 'selected' : ''}>${esc(j.code)}</option>`).join('')}</select>`;
    const T2 = { overview: tOverview, manuscripts: tManuscripts, users: tUsers, team: tTeam, journals: tJournals, issues: tIssues, backissues: tBack, email: tEmail, partners: tPartners, indexing: tIndexing, messages: tMessages, settings: tSettings, letters: tLetters };
    await T2[tab](box, q, J, jsel);
  }

  async function tOverview(box) {
    const o = await api('adm.overview');
    box.innerHTML = `<div class="grid4" style="margin-bottom:22px">${[['Manuscripts', o.total], ['Under review', (o.counts.under_review || 0) + (o.counts.reviews_complete || 0)], ['In production', (o.counts.accepted || 0) + (o.counts.production || 0) + (o.counts.proof || 0) + (o.counts.proof_approved || 0)], ['Published', o.counts.published || 0], ['People', o.users], ['Reviewers', o.reviewers], ['Subscribers', o.subscribers], ['Technical check', o.counts.submitted || 0]].map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      <h3>Integrations</h3><div class="cfg">${[['GitHub', o.config.github], ['ZeptoMail (workflow email)', o.config.zepto], ['Zenodo (DOIs)', o.config.zenodo]].map(([l, ok]) => `<span class="${ok ? 'y' : 'n'}">${l}</span>`).join('')}<span>Repo: <code>${esc(o.config.repo || '—')}</code></span><span>Zenodo: ${o.config.sandbox === 'true' ? '<b>sandbox</b> (test DOIs)' : 'production'}</span><span>Site: ${esc(o.config.site)}</span></div>
      <h3>Last site build</h3><p style="font-size:14px">${o.build && !o.build.error ? `${esc(o.build.title || '')} · <b>${esc(o.build.status)}</b> ${esc(o.build.conclusion || '')} · ${fmtT(o.build.updated)} · <a href="${esc(o.build.url)}" target="_blank">open</a>` : esc(o.build?.error || 'Unknown')}</p>
      <div class="actions"><button class="btn btn-ghost" id="rebuild">Rebuild website</button><button class="btn btn-ghost" id="testmail">Send me a test email</button></div>
      <h3>Recent workflow emails</h3><table class="list"><tbody>${o.mail.map(m => `<tr><td class="meta">${fmtT(m.ts)}</td><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td>${st(m.status === 'sent' ? 'published' : 'rejected', m.status)}${m.detail ? `<div class="meta">${esc(m.detail)}</div>` : ''}</td></tr>`).join('')}</tbody></table>`;
    $('#rebuild').onclick = (e) => run(e.target, async () => { await api('adm.rebuild'); toast('Rebuild started'); });
    $('#testmail').onclick = (e) => run(e.target, async () => { const r = await api('adm.testEmail'); toast('Email ' + (r.result?.status || 'queued')); });
  }

  async function tManuscripts(box) {
    const r = await api('adm.subs', {});
    box.innerHTML = `<table class="list"><thead><tr><th>Manuscript</th><th>Journal</th><th>Status</th><th>Updated</th></tr></thead><tbody>${r.items.map(s => `<tr class="click" data-go="ms/${esc(s.id)}"><td><div class="t">${esc(s.title)}</div><div class="meta">${esc(s.id)} · ${esc(s.type || '')} · ${esc(s.author || '')}</div></td><td>${esc(s.journal.toUpperCase())}</td><td>${st(s.status, s.statusLabel)}</td><td class="meta">${fmt(s.updated)}</td></tr>`).join('') || '<tr><td class="empty">No manuscripts yet.</td></tr>'}</tbody></table>`;
    $$('[data-go]').forEach(x => x.onclick = () => go(x.dataset.go));
  }

  async function tUsers(box) {
    const draw = async (qq) => {
      const r = await api('adm.users', { q: qq });
      $('#ulist').innerHTML = r.items.map(u => `<div class="rev" data-u="${u.id}"><div class="hd"><span><b>${esc(u.name)}</b> <span class="meta">${esc(u.email)} · ${esc(u.affiliation || '')}</span></span><span class="meta">${['eic', 'senior', 'editor', 'board'].filter(k => (u.roles[k] || []).length).map(k => ROLE_LABEL[k] + ' (' + u.roles[k].join(', ').toUpperCase() + ')').join(' · ')}${u.reviewer ? ' · Reviewer' : ''}</span></div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:14px;margin-top:6px"><label class="chk" style="margin:0"><input type="checkbox" data-r="admin" ${u.roles.admin ? 'checked' : ''}> Admin / editorial office</label>
        <select data-r="status" class="mini"><option ${u.status !== 'disabled' ? 'selected' : ''} value="active">active</option><option ${u.status === 'disabled' ? 'selected' : ''} value="disabled">disabled</option></select><button class="mini" data-save>Save</button><span class="meta">Editorial roles are given in <a href="#/admin/team">Editorial team</a>.</span></div></div>`).join('') || '<div class="empty">No people found.</div>';
      $$('[data-save]').forEach(b => b.onclick = () => { const row = b.closest('[data-u]'); run(b, async () => { await api('adm.roles', { userId: row.dataset.u, status: $('[data-r=status]', row).value, roles: { admin: $('[data-r=admin]', row).checked } }); toast('Saved'); }); });
    };
    box.innerHTML = `<div class="sbox" style="margin-bottom:16px"><input id="uq" class="inp" placeholder="Search name, email or institution"><button class="btn btn-primary" id="ugo">Search</button></div><div id="ulist"></div>`;
    $('#ugo').onclick = () => draw($('#uq').value); draw('');
  }

  // ---------- editorial team
  async function tTeam(box, q, J, jsel) {
    const cur = q.j || J[0]?.slug;
    const r = await api('team.list', { journal: cur });
    const today = new Date().toISOString().slice(0, 10), plus2 = new Date(Date.now() + 2 * 365 * 864e5).toISOString().slice(0, 10);
    const rows = r.items.filter(a => a.journal === cur);
    const sc = { pending: 'proof', active: 'published', ended: 'draft', declined: 'rejected', revoked: 'rejected', withdrawn: 'draft' };
    box.innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><b>Journal</b> ${jsel('j', cur)}</div>
      <div class="msg info">Every appointment is for a fixed term. The person receives the Editorial Agreement by email and must sign it before their editorial access starts. Reminders go out 30 and 7 days before the term ends. When it ends, access closes automatically and a certificate of service is emailed to them. The website's editorial board updates on its own.</div>
      <table class="list"><thead><tr><th>Name</th><th>Role</th><th>Term</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(a => `<tr data-a="${a.id}"><td><b>${esc(a.name)}</b><div class="meta">${esc(a.email)} · ${esc(a.affiliation || '')}</div></td><td>${esc(a.roleLabel)}${a.title ? `<div class="meta">${esc(ROLE_LABEL[a.role])}</div>` : ''}</td><td class="meta">${esc(a.start)} → ${esc(a.end)}</td>
        <td>${st(sc[a.status] || 'draft', a.status)}${a.signedAt ? `<div class="meta">signed ${fmt(a.signedAt)}</div>` : ''}${a.endReason ? `<div class="meta">${esc(a.endReason)}</div>` : ''}</td>
        <td style="white-space:nowrap">${a.status === 'pending' ? `${a.link ? `<button class="mini" data-copy="${esc(a.link)}">Copy link</button> <a class="mini" target="_blank" href="https://wa.me/?text=${encodeURIComponent('Please confirm your details and join the editorial board of ' + (J.find(j => j.slug === a.journal)?.name || '') + ': ' + a.link)}">WhatsApp</a> ` : ''}<button class="mini" data-op="resend">Resend</button> <button class="mini danger" data-op="withdraw">Withdraw</button>${a.expires ? `<div class="meta">link valid until ${fmt(a.expires)}</div>` : ''}` : ''}${a.status === 'active' ? `<button class="mini" data-op="renew">Renew</button> <button class="mini" data-op="site">${a.showOnSite ? 'Hide' : 'Show'} on site</button> <button class="mini danger" data-op="end">End</button>` : ''}${adm && a.agreementFileId ? ` <button class="mini" data-file="${a.agreementFileId}">Agreement</button>` : ''}${adm && a.certificateFileId ? ` <button class="mini" data-file="${a.certificateFileId}">Certificate</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No appointments yet.</td></tr>'}</tbody></table>
      <h3 style="margin-top:28px">Appoint an editor</h3><form id="apf" class="rev">
      <div class="row3"><div class="f"><label>Role</label><select name="role">${Object.entries(ROLE_LABEL).filter(([k]) => adm || k !== 'eic').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="f"><label>Title shown (optional)</label><input name="title" placeholder="e.g. Associate Editor, Section Editor — Finance"></div><div class="f"><label>Email</label><input name="email" type="email" required></div></div>
      <div class="row3"><div class="f"><label>First name</label><input name="given"></div><div class="f"><label>Last name</label><input name="family"></div><div class="f"><label>Degrees</label><input name="degrees" placeholder="PhD"></div></div>
      <div class="row3"><div class="f"><label>Designation</label><input name="designation" placeholder="e.g. Professor"></div><div class="f"><label>Department</label><input name="department"></div><div class="f"><label>Country</label><input name="country" value="India"></div></div>
      <div class="row2"><div class="f"><label>Institutional email (not Gmail/Yahoo)</label><input name="instEmail" type="email"></div><div class="f"><label>Institutional profile link</label><input name="profileUrl" type="url" placeholder="https://university.edu/faculty/…"></div></div>
      <div class="f"><label>Full institutional postal address</label><input name="instAddress" placeholder="Department, Institution, Street, City, PIN, Country"></div>
      <p class="meta" style="margin-top:-4px">ISSN India and indexing services need these details on the board page for every member: designation, institution, full address, institutional email and profile link.</p>
      <div class="row3"><div class="f"><label>Institution</label><input name="affiliation"></div><div class="f"><label>Term starts</label><input name="start" type="date" value="${today}"></div><div class="f"><label>Term ends</label><input name="end" type="date" value="${plus2}"></div></div>
      <div class="row3"><div class="f"><label>Link valid for</label><select name="days">${[[1, '24 hours'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(([d, l]) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="chk"><input type="checkbox" name="show" checked> Show on the journal's editorial board page once signed</label><p class="meta"><b>Only the email and role are required.</b> The person fills in their own name, photo, designation, institution, address, profile link and reviewing preferences from their personal link. Anything you enter here is pre-filled for them to check.</p>
      <button class="btn btn-primary">Send appointment & agreement</button></form>
      <h3 style="margin-top:32px">Bring across your existing editorial board</h3>
      <p class="meta">Paste one row per member, with this header row first. Each person gets a personal link to confirm their details, set their reviewing preferences and password, and sign the agreement. Their membership starts when they sign. <b>role</b> is eic, senior, editor or board.</p>
      <form id="imf"><textarea name="csv" class="inp" rows="7" style="font-family:monospace;font-size:12.5px">role,title,given,family,email,degrees,designation,department,affiliation,instAddress,instEmail,profileUrl,country,orcid,start,end
board,,Asha,Mehta,asha.mehta@university.edu,PhD,Professor,Department of Management,Gujarat University,"Navrangpura, Ahmedabad 380009, India",asha.mehta@university.edu,https://university.edu/faculty/asha-mehta,India,,${today},${plus2}</textarea>
      <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap"><label>Links valid for <select name="days">${[[1, '24 hours'], [3, '3 days'], [7, '7 days'], [14, '14 days']].map(([d, l]) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="btn btn-primary">Send links to all</button></div><div id="imr" style="margin-top:10px"></div></form>
      <h3 style="margin-top:32px">Recommendations from the board</h3><div id="recs"><div class="loading">Loading…</div></div>`;
    $('#imf').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { const r2 = await api('team.import', { journal: cur, csv: f.csv.value, days: f.days.value }); $('#imr').innerHTML = `<div class="msg ${r2.sent ? 'ok' : 'err'}">${r2.sent} link(s) sent.</div>` + r2.results.filter(x => !x.ok).map(x => `<div class="msg err">Row ${x.row} (${esc(x.email)}): ${esc(x.error)}</div>`).join(''); if (r2.sent) setTimeout(() => vAdmin('team', { j: cur }), 2500); }); };
    (async () => { const rr = await api('rec.list', {}); const L = rr.items.filter(x => x.journal === cur); $('#recs').innerHTML = L.length ? `<table class="list"><thead><tr><th>Recommended</th><th>Type</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>${L.map(x => `<tr><td><b>${esc(x.name)}</b><div class="meta">${esc([x.email, x.affiliation].filter(Boolean).join(' · '))}${x.url ? ` · <a href="${esc(x.url)}" target="_blank">link</a>` : ''}</div>${x.note ? `<div class="meta">${esc(x.note)}</div>` : ''}</td><td>${esc(rr.kinds[x.kind] || x.kind)}</td><td class="meta">${esc(x.byName)}<br>${fmt(x.created)}</td><td>${st(x.status === 'new' ? 'submitted' : x.status === 'contacted' ? 'proof' : x.status === 'accepted' || x.status === 'done' ? 'published' : 'draft', x.status)}</td><td style="white-space:nowrap">${x.email ? `<button class="mini" data-ri="${x.id}">Send invitation</button> ` : ''}<select class="mini" data-rs="${x.id}">${['new', 'contacted', 'accepted', 'declined', 'done'].map(o => `<option ${o === x.status ? 'selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No recommendations yet. Board members can send them from Editor tools.</div>';
      $$('[data-ri]').forEach(b => b.onclick = () => run(b, async () => { const msg = prompt('Add a personal line to the invitation (optional):', ''); if (msg === null) return; const x = await api('rec.update', { id: b.dataset.ri, op: 'invite', message: msg }); toast(x.message); }));
      $$('[data-rs]').forEach(sl => sl.onchange = () => api('rec.update', { id: sl.dataset.rs, status: sl.value }).then(() => toast('Updated.'))); })().catch(e => { $('#recs').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });
    $('[name=j]').onchange = (e) => go('admin/team?j=' + e.target.value);
    $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copied. Share it only with this person.'); } catch { prompt('Copy this personal link:', b.dataset.copy); } });
    $('#apf').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { await api('team.appoint', { journal: cur, role: f.role.value, title: f.title.value, email: f.email.value, given: f.given.value, family: f.family.value, degrees: f.degrees.value, affiliation: f.affiliation.value, designation: f.designation.value, department: f.department.value, country: f.country.value, instEmail: f.instEmail.value, profileUrl: f.profileUrl.value, instAddress: f.instAddress.value, start: f.start.value, end: f.end.value, showOnSite: f.show.checked, days: f.days.value }); toast('Appointment sent for signature'); vAdmin('team', { j: cur }); }); };
    $$('[data-op]').forEach(b => b.onclick = () => run(b, async () => {
      const id = b.closest('[data-a]').dataset.a, a = rows.find(x => x.id === id), op = b.dataset.op;
      if (op === 'resend') { const d = prompt('Send a new link valid for how many days? (1, 3, 7, 14 or 30)', '7'); if (!d) return; await api('team.resend', { id, days: Number(d) }); }
      if (op === 'withdraw' && confirm('Withdraw this appointment?')) await api('team.end', { id, reason: 'Withdrawn' });
      if (op === 'site') await api('team.update', { id, showOnSite: !a.showOnSite });
      if (op === 'renew') { const end = prompt('Renew until (YYYY-MM-DD)? A new agreement will be sent for signature.', new Date(new Date(a.end).getTime() + 2 * 365 * 864e5).toISOString().slice(0, 10)); if (!end) return; await api('team.renew', { id, end }); }
      if (op === 'end') { const reason = prompt('Reason for ending this appointment early (shared with the editor):', 'Stepped down'); if (reason === null) return; const revoke = confirm('Is this a removal for breach? OK = removal (no certificate). Cancel = normal ending (certificate issued).'); await api('team.end', { id, reason, revoke }); }
      toast('Done'); vAdmin('team', { j: cur });
    }));
    $$('[data-file]').forEach(b => b.onclick = () => run(b, async () => { const f = await api('team.file', { fileId: b.dataset.file }); download(f.name, f.mime, f.data); }));
  }

  // ---------- journals
  async function tJournals(box, q, J) {
    const edit = (j = {}) => `<form class="rev jf"><div class="row3"><div class="f"><label>Slug (URL)</label><input name="slug" value="${esc(j.slug || '')}" ${j.slug ? 'readonly' : ''} placeholder="e.g. ijelf"></div><div class="f"><label>Code</label><input name="code" value="${esc(j.code || '')}"></div><div class="f"><label>Accent colour</label><input name="accent" type="color" value="${esc(j.accent || '#0B2545')}"></div></div>
      <div class="f"><label>Full name</label><input name="name" value="${esc(j.name || '')}"></div>
      <div class="row2"><div class="f"><label>Abbreviation (ISO 4)</label><input name="abbrev" value="${esc(j.abbrev || '')}"></div><div class="f"><label>Frequency</label><select name="frequency">${FREQ.map(f => `<option ${f === j.frequency ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
      <div class="row3"><div class="f"><label>Scope</label><select name="scopeType"><option value="international" ${j.scopeType !== 'national' ? 'selected' : ''}>International</option><option value="national" ${j.scopeType === 'national' ? 'selected' : ''}>National</option></select><small>An "International" title needs board members from institutions abroad (ISSN India rule).</small></div><div class="f"><label>Starting year</label><input name="startYear" value="${esc(j.startYear || j.since || new Date().getFullYear())}"></div><div class="f"><label>Subject area (as on the ISSN form)</label><input name="subjectArea" value="${esc(j.subjectArea || '')}"></div></div>
      <div class="row3"><div class="f"><label>e-ISSN (if assigned)</label><input name="issnOnline" value="${esc(j.issnOnline || '')}" placeholder="leave blank until assigned"></div><div class="f"><label>p-ISSN (if print)</label><input name="issnPrint" value="${esc(j.issnPrint || '')}"></div><div class="f"><label>Languages</label><input name="languages" value="${esc((j.languages || ['English']).join(', '))}"></div></div>
      ${j.slug ? `<div class="f"><label>Logos</label><div class="files">${[['logo', 'Full logo (emblem + name)'], ['mark', 'Emblem only (square)'], ['logo-white', 'Full logo, white (optional)'], ['mark-white', 'Emblem, white (optional)']].map(([k, l]) => `<div class="file"><img src="/assets/journals/${esc(j.slug)}/${k}.png" onerror="this.src='/assets/journals/${esc(j.slug)}/${k}.svg'" style="width:44px;height:44px;object-fit:contain;background:${k.includes('white') ? esc(j.accent) : '#fff'};border-radius:6px"><span class="nm">${l}</span><input type="file" accept=".png,.svg" data-logo="${k}" style="max-width:190px"><button type="button" class="mini" data-logodel="${k}">Use generated</button></div>`).join('')}</div><small>Without an uploaded logo, the site automatically generates one in the ACRI Journals globe-and-laurel style, in the journal's colour. Upload a transparent PNG (at least 1000 px) or an SVG.</small></div>` : '<p class="meta">A logo in the ACRI Journals house style is generated automatically for every new journal. You can upload your own after saving.</p>'}
      <div class="row2"><div class="f"><label>No-reply sender (notifications)</label><input name="noReplyEmail" value="${esc(j.noReplyEmail || '')}" placeholder="${esc((j.slug || 'slug') + '-no-reply@journals.acriindia.org')}"></div><div class="f"><label>Editors' address (decisions, reviewers)</label><input name="editorEmail" value="${esc(j.editorEmail || '')}" placeholder="editor@journals.acriindia.org"></div></div>
      <div class="f"><label>Journal office (submission alerts, replies, enquiries)</label><input name="officeEmail" value="${esc(j.officeEmail || '')}" placeholder="controller@journals.acriindia.org"></div>
      <div class="row2"><div class="f"><label>Home school / unit</label><input name="school" value="${esc(j.school || '')}"></div><div class="f"><label>Previous website</label><input name="legacyUrl" value="${esc(j.legacyUrl || '')}"></div></div>
      <div class="f"><label>Aims and scope</label><textarea name="scope">${esc(j.scope || '')}</textarea></div>
      <div class="row2"><div class="f"><label>Subjects (one per line)</label><textarea name="subjects">${esc((j.subjects || []).join('\n'))}</textarea></div><div class="f"><label>Article types (one per line)</label><textarea name="articleTypes">${esc((j.articleTypes || []).join('\n'))}</textarea></div></div>
      <div class="f"><label>Extra people on the board page (honorary, without portal access): Role | Name | Affiliation | ORCID</label><textarea name="boardExtra">${esc((j.boardExtra || []).map(b => [b.role, b.name, b.affiliation || '', b.orcid || ''].join(' | ')).join('\n'))}</textarea><small>Editors appointed through Editorial team appear on the board page automatically.</small></div>
      <div class="row2"><label class="chk"><input type="checkbox" name="active" ${j.active !== false ? 'checked' : ''}> Active (shown on the site)</label><div class="f"><label>Next manuscript number this year (optional)</label><input name="serial" placeholder="e.g. 20"></div></div>
      <button class="btn btn-primary">Save & publish to website</button></form>`;
    box.innerHTML = J.map(j => `<details style="margin-bottom:10px"><summary style="cursor:pointer;font:600 16px var(--serif);padding:10px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${esc(j.accent)};margin-right:8px"></span>${esc(j.code)} — ${esc(j.name)} <span class="meta">· ${esc(j.frequency || '')}</span></summary>${edit(j)}</details>`).join('') + `<details><summary style="cursor:pointer;font:600 16px var(--serif);padding:10px 0">+ Add a new journal</summary>${edit()}</details>`;
    $$('.jf').forEach(f => f.onsubmit = (e) => {
      e.preventDefault(); const v = (n) => f.elements[n].value.trim(); const lines = (n) => v(n).split('\n').map(s => s.trim()).filter(Boolean);
      const j = { slug: v('slug'), code: v('code'), name: v('name'), accent: v('accent'), abbrev: v('abbrev'), issn: v('issnOnline'), issnOnline: v('issnOnline'), issnPrint: v('issnPrint'), scopeType: v('scopeType'), startYear: v('startYear'), subjectArea: v('subjectArea'), languages: v('languages').split(',').map(x => x.trim()).filter(Boolean), formats: ['Online'], frequency: v('frequency'), noReplyEmail: v('noReplyEmail'), editorEmail: v('editorEmail'), officeEmail: v('officeEmail'), school: v('school'), legacyUrl: v('legacyUrl'), scope: v('scope'), subjects: lines('subjects'), articleTypes: lines('articleTypes'), active: f.elements.active.checked,
        boardExtra: lines('boardExtra').map(l => { const [role, name, affiliation, orcid] = l.split('|').map(s => (s || '').trim()); return { role, group: role, name, affiliation, orcid }; }) };
      const old = J.find(x => x.slug === j.slug); if (old) { j.serialStart = old.serialStart || {}; j.since = old.since; }
      if (v('serial')) j.serialStart = Object.assign({}, j.serialStart, { [new Date().getFullYear()]: Number(v('serial')) });
      run(e.submitter, async () => { const r = await api('adm.saveJournal', { journal: j }); toast(r.message || 'Saved. The website is rebuilding.'); });
    });
    $$('[data-logo]').forEach(inp => inp.onchange = () => { const f = inp.files[0]; if (!f) return; const slug = inp.closest('form').elements.slug.value; run(null, async () => { const r = await api('adm.logo', { journal: slug, kind: inp.dataset.logo, name: f.name, mime: f.type, data: await fileToB64(f) }); toast(r.message); }); });
    $$('[data-logodel]').forEach(b => b.onclick = () => { const slug = b.closest('form').elements.slug.value; if (confirm('Remove this uploaded logo and use the generated one?')) run(b, async () => { const r = await api('adm.logo', { journal: slug, kind: b.dataset.logodel }); toast(r.message); }); });
  }

  async function tIssues(box, q, J) {
    box.innerHTML = `<form class="rev" id="isf"><div class="row3"><div class="f"><label>Journal</label><select name="journal">${J.map(j => `<option value="${j.slug}">${esc(j.code)}</option>`).join('')}</select></div><div class="f"><label>Volume</label><input name="volume" type="number" min="1"></div><div class="f"><label>Issue</label><input name="issue" type="number" min="1"></div></div>
      <div class="row3"><div class="f"><label>Year</label><input name="year" value="${new Date().getFullYear()}"></div><div class="f"><label>Label</label><input name="label" placeholder="e.g. December 2025 or Jan–Feb 2027"></div><div class="f"><label>Status</label><select name="status"><option value="open">Open (collecting articles)</option><option value="published">Published</option></select></div></div>
      <div class="f"><label>Issue title / theme (optional)</label><input name="title"></div><div class="f"><label>Full-issue PDF URL (optional)</label><input name="pdf"></div>
      <label class="chk"><input type="checkbox" name="silent"> Don't send the "new issue" email for this one (e.g. back issues)</label><button class="btn btn-primary">Save issue</button></form>
      ${J.map(j => `<h3>${esc(j.code)}</h3>${(j.issues || []).map(i => `<div class="file"><span class="k">Vol ${esc(i.volume)} · No ${esc(i.issue)}</span><span class="nm">${esc(i.label || i.year)} ${esc(i.title || '')}</span>${st(i.status === 'published' ? 'published' : 'draft', i.status)}</div>`).join('') || '<p class="meta">No issues yet.</p>'}`).join('')}`;
    $('#isf').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { await api('adm.saveIssue', { issue: Object.assign(Object.fromEntries(['journal', 'volume', 'issue', 'year', 'label', 'status', 'title', 'pdf'].map(k => [k, f.elements[k].value])), { silent: f.silent.checked }) }); toast('Issue saved'); vAdmin('issues', {}); }); };
  }

  // ---------- ISSN & indexing readiness
  async function tIndexing(box, q, J, jsel) {
    const cur = q.j || J[0]?.slug;
    const { r, stages } = await api('idx.readiness', { journal: cur });
    const L = r.lists, adm = isAdmin();
    const stage = r.issnStatus || 'not_applied';
    const flow = ['not_applied', 'ready', 'applied', 'verification', 'provisional', 'assigned'];
    box.innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap"><b>Journal</b> ${jsel('j', cur)}<span class="meta">${r.stats.articles} articles · ${r.stats.issues} issues · ${r.stats.eb} board members (${r.stats.foreignEb} abroad)</span></div>
      <div class="rev" style="border-color:var(--navy)"><div class="hd"><span><b>ISSN (online)</b> ${r.issnOnline ? '· ' + esc(r.issnOnline) : ''}</span>${st({ assigned: 'published', provisional: 'proof', ready: 'published', applied: 'proof', verification: 'proof' }[stage] || 'draft', stages[stage] || stage)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${flow.map(k => `<span class="chip" style="${k === stage ? 'background:var(--navy);color:#fff;border-color:var(--navy)' : ''}">${esc(stages[k])}</span>`).join('<span class="meta">→</span>')}</div>
        ${adm ? `<div class="actions" style="margin-top:6px">${!r.issnOnline ? `<button class="btn btn-primary" id="pack">Open ISSN application pack</button>` : ''}${['not_applied', 'ready'].includes(stage) && !r.issnOnline ? '<button class="btn btn-ghost" data-stage="applied">Mark as applied</button>' : ''}${stage === 'applied' ? '<button class="btn btn-ghost" data-stage="verification">EB verification mails sent</button>' : ''}${['applied', 'verification'].includes(stage) ? '<button class="btn btn-ghost" data-stage="provisional">Provisional ISSN received</button>' : ''}${stage === 'provisional' ? '<button class="btn btn-green" data-stage="assigned">ISSN confirmed</button>' : ''}</div>` : ''}
        ${r.issnApp && Object.keys(r.issnApp).length ? `<p class="meta" style="margin:10px 0 0">${Object.entries(r.issnApp).map(([k, v]) => esc(k) + ': ' + esc(v)).join(' · ')}</p>` : ''}
        <div id="packbox"></div></div>
      <div class="grid4" style="margin:18px 0">${Object.entries(L).map(([k, l]) => `<a class="stat" href="#ix-${k}" style="text-decoration:none;color:inherit"><b>${l.score.done}/${l.score.total}</b><span>${esc(l.title)}${l.score.ready ? ' · <span style="color:var(--green);font-weight:700">ready</span>' : ''}</span></a>`).join('')}</div>
      ${Object.entries(L).map(([k, l]) => `<h3 id="ix-${k}">${esc(l.title)}</h3>${l.items.map(it => `<div class="file" style="align-items:flex-start"><span style="font-size:18px;line-height:1;color:${it.ok ? 'var(--green)' : '#B42318'}">${it.ok ? '✓' : '○'}</span><span class="nm"><b style="font-weight:${it.ok ? 500 : 600}">${esc(it.label)}</b>${it.detail ? `<div class="meta">${esc(it.detail)}</div>` : ''}</span>${it.auto ? '<span class="meta" title="Checked automatically from live data">auto</span>' : `<label class="chk" style="margin:0;white-space:nowrap"><input type="checkbox" data-tick="${esc(it.key)}" ${it.ok ? 'checked' : ''}> done</label>`}</div>`).join('')}`).join('')}
      <p class="meta" style="margin-top:16px">Readiness is re-checked every morning. When a journal without an ISSN passes every required item, its status changes to "Ready to apply" and admins get an email.</p>`;
    $('[name=j]').onchange = (e) => go('admin/indexing?j=' + e.target.value);
    $$('[data-tick]').forEach(c => c.onchange = () => run(null, async () => { await api('idx.tick', { journal: cur, key: c.dataset.tick, ok: c.checked }); toast('Saved'); }));
    $$('[data-stage]').forEach(b => b.onclick = () => {
      const st2 = b.dataset.stage; let app = {}, issn;
      if (st2 === 'applied') { const n = prompt('ISSN application / reference number (from nsl.niscpr.res.in):'); if (n === null) return; app.applicationNo = n; if (!confirm('Mark as applied? All Editorial Board members will be emailed to expect, and answer within 3 days, a verification email from the ISSN office.')) return; }
      if (st2 === 'provisional' || st2 === 'assigned') { issn = prompt('ISSN (format 1234-567X):', r.issnOnline || ''); if (!issn) return; }
      run(b, async () => { await api('idx.stage', { journal: cur, stage: st2, app, issn }); toast('Updated'); vAdmin('indexing', { j: cur }); });
    });
    $('#pack')?.addEventListener('click', (e) => run(e.target, async () => {
      const p = await api('idx.pack', { journal: cur });
      $('#packbox').innerHTML = `<h3>ISSN India online form (prefilled)</h3><p class="meta">Open <a href="${esc(p.applyUrl)}" target="_blank">nsl.niscpr.res.in</a> → Apply Online. The form times out after 20 minutes, so keep this page open and copy each value across.</p>
        <table class="list"><tbody>${p.form.map(([k, v]) => `<tr><td class="meta" style="width:34%">${esc(k)}</td><td>${v ? esc(v) : '<span style="color:#B42318">missing: fill in before applying</span>'}</td><td>${v ? `<button class="mini" data-copy="${esc(v)}">Copy</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <h3>Post these enclosures</h3><ul style="font-size:14px">${p.enclosures.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>Email the board's profile links to the ISSN office</h3><textarea class="inp code" style="min-height:220px">${esc(p.email)}</textarea>`;
      $$('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied')));
    }));
  }

  // ---------- back issues
  async function tBack(box, q, J, jsel) {
    const cur = q.j || J[0]?.slug;
    box.innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap"><b>Journal</b> ${jsel('j', cur)}<button class="btn btn-primary" id="biadd">+ Add a back-issue article</button><button class="btn btn-ghost" id="bibulk">Bulk import (CSV)</button></div>
      <div class="msg info">Back issues keep their <b>original publication date, volume and issue</b>. Upload the original PDF (it stays the PDF of record), and optionally the Word file so the article also gets a full-text web page. <b>Register new DOI</b> mints a Zenodo DOI dated to the original publication and records any old DOI as the same work.</div>
      <div id="biform"></div><div id="bilist"><div class="loading">Loading…</div></div>`;
    $('[name=j]').onchange = (e) => go('admin/backissues?j=' + e.target.value);
    $('#biadd').onclick = () => biForm({ journal: cur, id: (J.find(j => j.slug === cur)?.code || '') + '-' + new Date().getFullYear() + '-', license: 'CC-BY-4.0', type: 'Original Research' }, true);
    $('#bibulk').onclick = () => {
      $('#biform').innerHTML = `<div class="rev"><h3>Bulk import</h3><p class="meta">Columns: <code>id, journal, type, title, authors, affiliations, abstract, keywords, volume, issue, published, doi, pdf</code>. Optional: <code>firstPage, lastPage, license</code>. Authors: <code>Given Family, PhD [1]; Given Family [1,2]</code>. Affiliations: <code>1=Dept, Univ | 2=Dept, Univ</code>. The <code>pdf</code> column takes a public URL (e.g. files.ijbmrs.org). <a href="/downloads/back-issues-template.csv">Download the template</a>.</p><textarea id="bicsv" class="inp code" style="min-height:220px" placeholder="Paste CSV including the header row"></textarea><div class="actions"><button class="btn btn-primary" id="bigo">Import</button></div><div id="bires"></div></div>`;
      $('#bigo').onclick = (e) => run(e.target, async () => { const r = await api('bi.bulk', { csv: $('#bicsv').value }); $('#bires').innerHTML = r.results.map(x => `<div class="file"><span class="k">${x.ok ? '✓' : '✗'}</span><span class="nm">${esc(x.id)}</span><span class="meta">${esc(x.error || 'saved')}</span></div>`).join(''); toast('Import finished. The site is rebuilding.'); });
    };
    const r = await api('bi.list', { journal: cur });
    $('#bilist').innerHTML = `<table class="list"><thead><tr><th>Article</th><th>Issue</th><th>Published</th><th>DOI</th><th></th></tr></thead><tbody>${r.items.map(a => `<tr data-id="${esc(a.id)}"><td><div class="t">${esc(a.title || a.id)}</div><div class="meta">${esc(a.id)}${a.live ? '' : ' · building…'}</div></td><td class="meta">${a.volume ? 'Vol ' + esc(a.volume) + ' · No ' + esc(a.issue) : 'New Online'}</td><td class="meta">${esc(a.published)}</td><td class="meta">${a.doi ? esc(a.doi) : '—'}${a.previousDoi ? `<div>prev. ${esc(a.previousDoi)}</div>` : ''}</td><td style="white-space:nowrap"><button class="mini" data-edit>Edit</button> ${/zenodo/.test(a.doi || '') && a.previousDoi !== undefined && a.previousDoi !== '' ? '' : '<button class="mini" data-doi>Register new DOI</button>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No articles yet for this journal.</td></tr>'}</tbody></table>`;
    $$('[data-edit]').forEach(b => b.onclick = () => run(b, async () => { const g = await api('bi.get', { journal: cur, id: b.closest('[data-id]').dataset.id }); biForm(g.article, false); window.scrollTo(0, 0); }));
    $$('[data-doi]').forEach(b => b.onclick = () => { const id = b.closest('[data-id]').dataset.id; const primary = confirm('Register a NEW Zenodo DOI for ' + id + '?\n\nOK = the new DOI becomes the main DOI (the old one is kept and shown as "Original DOI").\nCancel = do nothing.'); if (!primary) return; run(b, async () => { const x = await api('bi.doi', { journal: cur, id }); toast('DOI registered: ' + x.doi); vAdmin('backissues', { j: cur }); }); });
  }
  function biForm(a, isNew) {
    const affLines = (a.affiliations || []).map(f => `${f.id} = ${f.name}`).join('\n');
    const auLines = (a.authors || []).map(x => `${x.given} ${x.family}${x.degrees ? ', ' + x.degrees : ''} [${(x.affiliations || []).join(',')}]${x.email ? ' | ' + x.email : ''}${x.orcid ? ' | ' + x.orcid : ''}${x.corresponding ? ' | *' : ''}`).join('\n');
    const absText = typeof a.abstract === 'string' ? a.abstract : (a.abstract?.sections || []).map(s => (s.heading ? s.heading + ': ' : '') + s.text).join('\n');
    $('#biform').innerHTML = `<form class="rev" id="bif"><h3>${isNew ? 'Add back-issue article' : 'Edit ' + esc(a.id)}</h3>
      <div class="row3"><div class="f"><label>Article ID</label><input name="id" value="${esc(a.id || '')}" ${isNew ? '' : 'readonly'} placeholder="IJBMRS-2025-001"></div><div class="f"><label>Type</label><input name="type" value="${esc(a.type || '')}"></div><div class="f"><label>Licence</label><select name="license">${['CC-BY-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-ND-4.0'].map(l => `<option ${l === a.license ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="f"><label>Title</label><input name="title" value="${esc(a.title || '')}"></div><div class="f"><label>Subtitle</label><input name="subtitle" value="${esc(a.subtitle || '')}"></div>
      <div class="f"><label>Authors: one per line, "Given Family, Degrees [affiliation numbers] | email | ORCID | *" (the * marks the corresponding author)</label><textarea name="authors" style="min-height:100px">${esc(auLines)}</textarea></div>
      <div class="f"><label>Affiliations: one per line, "1 = Department, Institution, City, Country"</label><textarea name="affs" style="min-height:70px">${esc(affLines)}</textarea></div>
      <div class="f"><label>Abstract (for a structured abstract, start lines with "Objective:", "Methods:" and so on)</label><textarea name="abstract" style="min-height:120px">${esc(absText)}</textarea></div>
      <div class="f"><label>Keywords (separated by semicolons)</label><input name="keywords" value="${esc((a.keywords || []).join('; '))}"></div>
      <div class="row3"><div class="f"><label>Volume</label><input name="volume" value="${esc(a.volume || '')}"></div><div class="f"><label>Issue</label><input name="issue" value="${esc(a.issue || '')}"></div><div class="f"><label>Original publication date</label><input name="published" type="date" value="${esc(a.published || '')}"></div></div>
      <div class="row3"><div class="f"><label>First page</label><input name="firstPage" value="${esc(a.firstPage || '')}"></div><div class="f"><label>Last page</label><input name="lastPage" value="${esc(a.lastPage || '')}"></div><div class="f"><label>Existing / original DOI</label><input name="doi" value="${esc(a.previousDoi || a.doi || '')}" placeholder="10.xxxx/…"></div></div>
      <div class="row2"><div class="f"><label>Received</label><input name="received" type="date" value="${esc(a.received || '')}"></div><div class="f"><label>Accepted</label><input name="accepted" type="date" value="${esc(a.accepted || '')}"></div></div>
      <div class="f"><label>References (one per line, optional)</label><textarea name="refs" style="min-height:90px">${esc((a.references || []).map(r => r.text.replace(/<[^>]+>/g, '')).join('\n'))}</textarea></div>
      <div class="row2"><div class="slot"><b>Original PDF</b><small>${isNew ? 'Required unless you upload Word' : 'Upload only to replace'}</small><input type="file" name="pdf" accept=".pdf"></div><div class="slot"><b>Word file (optional)</b><small>Gives the article a full-text web page</small><input type="file" name="docx" accept=".docx"></div></div>
      <div class="actions"><button class="btn btn-green">Save article</button><button type="button" class="btn btn-ghost" id="bicancel">Cancel</button></div></form>`;
    $('#bicancel').onclick = () => $('#biform').innerHTML = '';
    $('#bif').onsubmit = (e) => {
      e.preventDefault(); const f = e.target, v = (n) => f.elements[n].value.trim();
      const affs = v('affs').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => { const m = l.match(/^(\d+)\s*[=.)]\s*(.+)$/); return m ? { id: Number(m[1]), name: m[2] } : { id: i + 1, name: l }; });
      const authors = v('authors').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
        const [main, email = '', orcid = '', star = ''] = l.split('|').map(s => s.trim());
        const am = main.match(/\[([\d,\s]*)\]/); const nm = main.replace(/\[.*?\]/, '').split(','); const parts = nm[0].trim().split(/\s+/); const family = parts.pop();
        return { given: parts.join(' '), family, degrees: (nm[1] || '').trim(), affiliations: am ? am[1].split(',').map(Number).filter(Boolean) : (affs.length ? [1] : []), email, orcid, corresponding: star === '*' || [email, orcid].includes('*') || (i === 0 && !/\*/.test(v('authors'))) };
      });
      const absLines = v('abstract').split('\n').map(l => l.trim()).filter(Boolean);
      const structured = absLines.length > 1 && absLines.every(l => /^[A-Z][A-Za-z ,&/]{2,40}:\s/.test(l));
      const abstract = structured ? { structured: true, sections: absLines.map(l => { const i = l.indexOf(':'); return { heading: l.slice(0, i), text: l.slice(i + 1).trim() }; }) } : v('abstract');
      const art = { id: v('id').toUpperCase(), journal: a.journal, type: v('type') || 'Original Research', title: v('title'), subtitle: v('subtitle') || undefined, authors, affiliations: affs, abstract, keywords: v('keywords').split(';').map(s => s.trim()).filter(Boolean),
        volume: v('volume'), issue: v('issue'), published: v('published'), firstPage: v('firstPage'), lastPage: v('lastPage'), received: v('received') || undefined, accepted: v('accepted') || undefined, license: v('license'),
        references: v('refs').split('\n').map(s => s.trim()).filter(Boolean).map(t => ({ text: t, doi: (t.match(/10\.\d{4,9}\/\S+[^\s.,;]/) || [])[0] })) };
      if (a.zenodo) { art.doi = a.doi; art.previousDoi = v('doi') && v('doi') !== a.doi ? v('doi') : a.previousDoi; art.zenodo = a.zenodo; } else art.doi = v('doi');
      run(e.submitter, async () => {
        const pdf = f.pdf.files[0] ? await fileToB64(f.pdf.files[0]) : null, docx = f.docx.files[0] ? await fileToB64(f.docx.files[0]) : null;
        const r = await api('bi.save', { article: art, pdf, docx }); toast(r.message); $('#biform').innerHTML = '';
      });
    };
  }

  // ---------- email & campaigns
  async function tEmail(box, q, J, jsel) {
    const sub = q.s || 'campaigns';
    box.innerHTML = `<div class="tabs" style="margin-top:-6px">${[['campaigns', 'Campaigns'], ['contacts', 'Lists & contacts'], ['automations', 'Automations']].map(([k, l]) => `<button data-es="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</div><div id="es"></div>`;
    $$('[data-es]').forEach(b => b.onclick = () => go('admin/email?s=' + b.dataset.es));
    const es = $('#es');
    if (sub === 'contacts') return eContacts(es, q, J, jsel);
    if (sub === 'automations') return eAutomations(es, J);
    if (q.c) return eCompose(es, q.c === 'new' ? null : q.c, J);
    const r = await api('mail.campaigns');
    es.innerHTML = `<div class="actions" style="margin:0 0 16px"><a class="btn btn-primary" href="#/admin/email?c=new">+ New campaign</a></div>
      <div class="msg info">Campaigns are sent through ZeptoMail (or Brevo if CAMPAIGN_PROVIDER = brevo). Send only to people who opted in. Every email has a one-click unsubscribe link, and people who unsubscribe are never emailed again unless they resubscribe themselves.</div>
      <table class="list"><thead><tr><th>Campaign</th><th>List</th><th>Status</th><th>Sent</th><th></th></tr></thead><tbody>${r.items.map(c => `<tr data-c="${c.id}"><td><div class="t">${esc(c.subject)}</div><div class="meta">${esc((r.presets[c.preset] || {}).label || c.preset)} · ${esc(c.name)}</div></td><td class="meta">${esc((c.audience?.lists || []).join(', ').toUpperCase())}</td><td>${st({ draft: 'draft', scheduled: 'proof', sending: 'proof', sent: 'published', stopped: 'rejected', template: 'draft' }[c.status] || 'draft', c.status)}${c.scheduledAt && c.status === 'scheduled' ? `<div class="meta">${fmtT(c.scheduledAt)}</div>` : ''}</td><td class="meta">${c.stats?.total ? `${c.stats.sent || 0}/${c.stats.total}${c.stats.failed ? ' · ' + c.stats.failed + ' failed' : ''}` : '—'}${c.sentAt ? `<div>${fmt(c.sentAt)}</div>` : ''}</td>
        <td style="white-space:nowrap">${c.status === 'draft' ? '<button class="mini" data-ce>Edit</button> ' : ''}<button class="mini" data-cd>Duplicate</button>${['scheduled', 'sending'].includes(c.status) ? ' <button class="mini danger" data-cs>Stop</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No campaigns yet.</td></tr>'}</tbody></table>`;
    $$('[data-ce]').forEach(b => b.onclick = () => go('admin/email?c=' + b.closest('[data-c]').dataset.c));
    $$('[data-cd]').forEach(b => b.onclick = () => run(b, async () => { const x = await api('mail.duplicate', { id: b.closest('[data-c]').dataset.c }); go('admin/email?c=' + x.id); }));
    $$('[data-cs]').forEach(b => b.onclick = () => { if (confirm('Stop sending this campaign? Emails already sent cannot be recalled.')) run(b, async () => { await api('mail.stop', { id: b.closest('[data-c]').dataset.c }); toast('Stopped'); vAdmin('email', {}); }); });
  }
  async function eCompose(es, id, J) {
    const r = await api('mail.campaigns'); const P = r.presets;
    const c = id ? r.items.find(x => x.id === id) : { preset: 'cfp', journal: J[0]?.slug || '', sender: 'noreply', audience: { lists: [J[0]?.slug || 'network'] }, content: {} };
    const lists = await api('mail.lists');
    const ct = c.content || {};
    es.innerHTML = `<div class="dgrid" style="grid-template-columns:1fr 1fr"><form id="cf">
      <div class="row2"><div class="f"><label>Journal (branding & sender)</label><select name="journal">${isAdmin() ? '<option value="">ACRI Journals (network)</option>' : ''}${J.map(j => `<option value="${j.slug}" ${c.journal === j.slug ? 'selected' : ''}>${esc(j.code)}</option>`).join('')}</select></div><div class="f"><label>Design</label><select name="preset">${Object.entries(P).map(([k, v]) => `<option value="${k}" ${c.preset === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div></div>
      <div class="row2"><div class="f"><label>From</label><input class="inp" disabled value="newsletter@journals.acriindia.org (sent by Brevo)"><input type="hidden" name="sender" value="newsletter"><div class="meta">Replies go to the journal office (controller@) or the editors.</div></div><div class="f"><label>Internal name</label><input name="name" value="${esc(c.name || '')}"></div></div>
      <div class="f"><label>Send to lists</label><div>${lists.lists.map(l => `<label class="chk" style="display:inline-flex;margin-right:14px"><input type="checkbox" name="lists" value="${esc(l.list)}" ${(c.audience?.lists || []).includes(l.list) ? 'checked' : ''}>${esc(l.list === 'network' ? 'Network' : l.list.toUpperCase())} <span class="meta">&nbsp;(${l.subscribed || 0})</span></label>`).join('')}</div><small id="aud"></small></div>
      <div class="f"><label>Subject line</label><input name="subject" value="${esc(c.subject || '')}" placeholder="Call for papers: Volume 3, Issue 1"></div>
      <div class="f"><label>Preview text (shown after the subject in inboxes)</label><input name="preheader" value="${esc(c.preheader || '')}"></div>
      <div class="row2"><div class="f"><label>Heading</label><input name="heading" value="${esc(ct.heading || '')}"></div><div class="f"><label>Small label above heading (optional)</label><input name="kicker" value="${esc(ct.kicker || '')}"></div></div>
      <div class="f"><label>Subheading (optional)</label><input name="subheading" value="${esc(ct.subheading || '')}"></div>
      <div class="f"><label>Message</label><textarea name="body" style="min-height:180px">${esc(ct.body || '')}</textarea><small>Use **bold**, *italic*, [link text](https://…), "- " for bullet points, and a blank line between paragraphs. {{name}} inserts the first name.</small></div>
      <div class="f"><label>Key details: one per line, "Label | Value" (deadlines, dates, venue)</label><textarea name="dates" style="min-height:70px">${esc(ct.dates || '')}</textarea></div>
      <div class="row3"><div class="f"><label>Issue: volume</label><input name="volume" value="${esc(ct.volume || '')}"></div><div class="f"><label>Issue: number</label><input name="issue" value="${esc(ct.issue || '')}"></div><div class="f"><label>Digest: articles since</label><input name="since" type="date" value="${esc(ct.since || '')}"></div></div>
      <div class="f"><label>Image URL (optional, 1280 px wide)</label><input name="image" value="${esc(ct.image || '')}"></div>
      <div class="row2"><div class="f"><label>Button text</label><input name="ctaLabel" value="${esc(ct.ctaLabel || '')}" placeholder="Default for the design"></div><div class="f"><label>Button link</label><input name="ctaUrl" value="${esc(ct.ctaUrl || '')}" placeholder="Default: journal page or submission form"></div></div>
      <div class="f"><label>Sign-off</label><textarea name="signoff" style="min-height:60px">${esc(ct.signoff || '')}</textarea></div>
      <div class="actions"><button type="button" class="btn btn-ghost" id="csave">Save draft</button><button type="button" class="btn btn-ghost" id="ctest">Send test to me</button><button type="button" class="btn btn-green" id="csend">Send now</button></div>
      <div class="row2" style="margin-top:12px"><div class="f"><label>…or schedule for</label><input type="datetime-local" name="at" class="inp"></div><div class="f" style="justify-content:flex-end"><button type="button" class="btn btn-primary" id="csched">Schedule</button></div></div>
      </form><div><div class="meta" style="margin-bottom:6px">Live preview</div><iframe id="pv" style="width:100%;height:1100px;border:1px solid var(--line);border-radius:10px;background:#EEF1F5"></iframe></div></div>`;
    let cid = id;
    const gather = () => { const f = $('#cf'), v = n => f.elements[n].value; return { id: cid, journal: v('journal'), preset: v('preset'), sender: v('sender'), name: v('name') || v('subject'), subject: v('subject'), preheader: v('preheader'), audience: { lists: $$('[name=lists]:checked', f).map(x => x.value) }, content: { heading: v('heading'), kicker: v('kicker'), subheading: v('subheading'), body: v('body'), dates: v('dates'), volume: v('volume'), issue: v('issue'), since: v('since'), image: v('image'), ctaLabel: v('ctaLabel'), ctaUrl: v('ctaUrl'), signoff: v('signoff') } }; };
    let t; const preview = () => { clearTimeout(t); t = setTimeout(async () => { try { const g = gather(); const p = await api('mail.preview', { campaign: Object.assign({}, g, { subject: g.subject || 'Subject' }) }); $('#pv').srcdoc = p.html; const a = await api('mail.audience', { campaign: g }); $('#aud').textContent = a.count + ' subscribed recipients (duplicates removed)'; } catch (e) { } }, 600); };
    $('#cf').addEventListener('input', preview); $('#cf').addEventListener('change', preview); preview();
    const save = async () => { const r = await api('mail.save', { campaign: gather() }); cid = r.id; history.replaceState(null, '', '#/admin/email?c=' + cid); return cid; };
    $('#csave').onclick = (e) => run(e.target, async () => { await save(); toast('Draft saved'); });
    $('#ctest').onclick = (e) => run(e.target, async () => { await save(); const r = await api('mail.test', { id: cid }); toast(r.message || r.error, !r.ok); });
    $('#csend').onclick = (e) => { if (!confirm('Send this campaign now to everyone in the selected lists?')) return; run(e.target, async () => { await save(); const r = await api('mail.send', { id: cid }); toast(r.message); go('admin/email'); }); };
    $('#csched').onclick = (e) => { const at = $('#cf').elements.at.value; if (!at) return toast('Pick a date and time.', true); run(e.target, async () => { await save(); const r = await api('mail.send', { id: cid, at: new Date(at).toISOString() }); toast(r.message); go('admin/email'); }); };
  }
  async function eContacts(es, q, J, jsel) {
    const L = (await api('mail.lists')).lists; const cur = q.l || L[0]?.list || 'network';
    es.innerHTML = `<div class="grid4" style="margin-bottom:18px">${L.map(l => `<a class="stat" href="#/admin/email?s=contacts&l=${esc(l.list)}" style="text-decoration:none;color:inherit;${l.list === cur ? 'border-color:var(--navy)' : ''}"><b>${l.subscribed || 0}</b><span>${esc(l.list === 'network' ? 'Network list' : l.list.toUpperCase())} · ${l.pending || 0} pending · ${l.unsubscribed || 0} unsubscribed</span></a>`).join('')}</div>
      <div class="dgrid"><div><div class="sbox" style="margin-bottom:12px"><input id="cq" class="inp" placeholder="Search email or name"><select id="cst" class="inp" style="width:auto"><option value="">All statuses</option><option>subscribed</option><option>pending</option><option>unsubscribed</option></select><button class="btn btn-primary" id="cgo">Filter</button></div><div id="clist"></div></div>
      <aside><div class="rev"><h3>Add contacts to ${esc(cur === 'network' ? 'Network' : cur.toUpperCase())}</h3><div class="f"><textarea id="imp" style="min-height:160px" placeholder="one per line:\nname@uni.edu\nname@uni.edu, Dr Asha Patel\nAsha Patel <name@uni.edu>"></textarea></div>
      <div class="f"><label>Consent / source (required)</label><input id="impc" class="inp" placeholder="e.g. Opted in at ICOY 2027 registration"></div><div class="f"><label>Tags (optional)</label><input id="impt" class="inp" placeholder="authors; reviewers; ahmedabad"></div><button class="btn btn-primary" id="impgo">Add contacts</button>
      <p class="meta" style="margin-top:10px">Only add people who agreed to hear from you, or who have a professional relationship with the journal. Cold, purchased or scraped lists damage deliverability and are not allowed. People who unsubscribed are never re-added.</p></div></aside></div>`;
    const draw = async () => {
      const r = await api('mail.contacts', { list: cur, q: $('#cq').value, status: $('#cst').value });
      $('#clist').innerHTML = `<table class="list"><thead><tr><th>Contact</th><th>Status</th><th>Source</th><th></th></tr></thead><tbody>${r.items.map(c => `<tr data-e="${esc(c.email)}"><td><b>${esc(c.email)}</b><div class="meta">${esc(c.name || '')}${(c.tags || []).length ? ' · ' + esc(c.tags.join(', ')) : ''}</div></td><td>${st(c.status === 'subscribed' ? 'published' : c.status === 'pending' ? 'proof' : 'rejected', c.status)}${c.sentCount ? `<div class="meta">${c.sentCount} sent</div>` : ''}</td><td class="meta">${esc(c.source || '')}<div>${fmt(c.created)}</div></td><td style="white-space:nowrap">${c.status === 'subscribed' ? '<button class="mini" data-cs="unsubscribed">Unsubscribe</button>' : ''} <button class="mini danger" data-crm>Delete</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No contacts.</td></tr>'}</tbody></table>`;
      $$('[data-cs]').forEach(b => b.onclick = () => run(b, async () => { await api('mail.setContact', { list: cur, email: b.closest('[data-e]').dataset.e, status: b.dataset.cs }); draw(); }));
      $$('[data-crm]').forEach(b => b.onclick = () => { if (confirm('Delete this contact permanently? (To stop emails but remember the opt-out, use Unsubscribe instead.)')) run(b, async () => { await api('mail.setContact', { list: cur, email: b.closest('[data-e]').dataset.e, remove: true }); draw(); }); });
    };
    $('#cgo').onclick = draw; draw();
    $('#impgo').onclick = (e) => run(e.target, async () => { const r = await api('mail.import', { list: cur, text: $('#imp').value, consent: $('#impc').value, tags: $('#impt').value }); toast(`${r.added} added, ${r.revived} reactivated, ${r.skipped} skipped`); $('#imp').value = ''; draw(); });
  }
  async function eAutomations(es, J) {
    const r = await api('mail.automations'), camps = (await api('mail.campaigns')).items.filter(c => ['draft', 'sent', 'template'].includes(c.status));
    const groups = {}; r.items.forEach(a => (groups[a.journal] ||= []).push(a));
    es.innerHTML = `<div class="msg info">Switch automations on or off at any time. Recurring and digest emails run each morning. New-article and new-issue alerts go out about 15 minutes after publication, once the page is live.</div>` + Object.entries(groups).map(([jn, items]) => `<h3>${esc(jn === 'network' ? 'Network (all journals)' : jn.toUpperCase())}</h3>${items.map(a => `<div class="rev" data-m="${a.id}"><div class="hd"><span><b>${esc(r.types[a.type] || a.type)}</b></span>${st(a.enabled ? 'published' : 'draft', a.enabled ? 'On' : 'Off')}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;font-size:14px">
      ${['digest', 'recurring'].includes(a.type) ? `<div class="f" style="margin:0"><label>Every (days)</label><input class="inp" data-k="everyDays" type="number" min="1" value="${esc(a.everyDays || '')}" style="width:100px"></div><div class="f" style="margin:0"><label>Stop after</label><input class="inp" data-k="endDate" type="date" value="${esc(String(a.endDate || '').slice(0, 10))}"></div>` : ''}
      ${a.type === 'recurring' ? `<div class="f" style="margin:0"><label>Campaign to repeat</label><select class="inp" data-k="campaignId"><option value="">Choose…</option>${camps.map(c => `<option value="${c.id}" ${a.campaignId === c.id ? 'selected' : ''}>${esc(c.subject)}</option>`).join('')}</select></div>` : ''}
      ${['new_article', 'new_issue'].includes(a.type) && jn !== 'network' ? `<label class="chk" style="margin:0 0 10px"><input type="checkbox" data-k="net" ${a.config?.includeNetwork ? 'checked' : ''}> Also send to the network list</label>` : ''}
      <button class="btn ${a.enabled ? 'btn-ghost' : 'btn-green'}" data-tog>${a.enabled ? 'Stop' : 'Enable'}</button><button class="btn btn-ghost" data-sv>Save</button>
      ${a.lastRun ? `<span class="meta">Last run ${esc(String(a.lastRun).slice(0, 10))}${a.nextRun ? ' · next ' + esc(String(a.nextRun).slice(0, 10)) : ''}</span>` : ''}</div></div>`).join('')}`).join('');
    const save = (row, extra) => { const g = k => $(`[data-k=${k}]`, row); const a = r.items.find(x => x.id === row.dataset.m); return api('mail.saveAutomation', Object.assign({ id: a.id, everyDays: g('everyDays')?.value, endDate: g('endDate')?.value, campaignId: g('campaignId')?.value, config: Object.assign({}, a.config, g('net') ? { includeNetwork: g('net').checked } : {}) }, extra)); };
    $$('[data-tog]').forEach(b => b.onclick = () => { const row = b.closest('[data-m]'); const a = r.items.find(x => x.id === row.dataset.m); run(b, async () => { await save(row, { enabled: !a.enabled }); toast(a.enabled ? 'Stopped' : 'Enabled'); vAdmin('email', { s: 'automations' }); }); });
    $$('[data-sv]').forEach(b => b.onclick = () => run(b, async () => { await save(b.closest('[data-m]'), {}); toast('Saved'); }));
  }

  // ---------- partners
  async function tPartners(box) {
    const r = await api('partner.list');
    const form = (x = {}) => `<form class="rev pf" data-id="${esc(x.id || '')}"><div class="row3"><div class="f"><label>Organisation</label><input name="name" value="${esc(x.name || '')}"></div><div class="f"><label>Type</label><select name="type">${r.types.map(t => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="f"><label>Status</label><select name="status">${['pending', 'approved', 'rejected', 'ended'].map(s => `<option ${s === (x.status || 'approved') ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <div class="row3"><div class="f"><label>Website</label><input name="url" value="${esc(x.url || '')}"></div><div class="f"><label>Logo URL</label><input name="logoUrl" value="${esc(x.logoUrl || '')}"></div><div class="f"><label>Country</label><input name="country" value="${esc(x.country || '')}"></div></div>
      <div class="f"><label>Short description (public)</label><textarea name="description" style="min-height:60px">${esc(x.description || '')}</textarea></div>
      <div class="row3"><div class="f"><label>Contact person</label><input name="contactName" value="${esc(x.contactName || '')}"></div><div class="f"><label>Contact email</label><input name="contactEmail" value="${esc(x.contactEmail || '')}"></div><div class="f"><label>Display order</label><input name="order" value="${esc(x.order || '')}"></div></div>
      ${x.message ? `<div class="f"><label>Their message</label><div class="txt" style="white-space:pre-wrap;font-size:14px">${esc(x.message)}</div></div>` : ''}
      <div class="f"><label>Note to send with approval / rejection (optional)</label><input name="note" value=""></div>
      <label class="chk"><input type="checkbox" name="showOnSite" ${x.showOnSite !== false && String(x.showOnSite) !== 'false' ? 'checked' : ''}> Show on the Partners page</label><button class="btn btn-primary">Save</button></form>`;
    box.innerHTML = `<p class="meta">Partner applications come from <a href="#/partner-apply" target="_blank">the public form</a>. Approving a partner emails them and lists them on <a href="/partners/" target="_blank">/partners/</a>.</p>
      ${r.items.map(x => `<details style="margin-bottom:8px" ${x.status === 'pending' ? 'open' : ''}><summary style="cursor:pointer;padding:10px 0;font:600 16px var(--serif)">${esc(x.name)} <span class="meta">· ${esc(x.type)}</span> ${st({ pending: 'proof', approved: 'published', rejected: 'rejected', ended: 'draft' }[x.status], x.status)}</summary>${form(x)}</details>`).join('') || '<div class="empty">No partners yet.</div>'}
      <details><summary style="cursor:pointer;padding:10px 0;font:600 16px var(--serif)">+ Add a partner directly</summary>${form()}</details>`;
    $$('.pf').forEach(f => f.onsubmit = (e) => { e.preventDefault(); const v = n => f.elements[n].value; run(e.submitter, async () => { await api('partner.save', { partner: { id: f.dataset.id || undefined, name: v('name'), type: v('type'), status: v('status'), url: v('url'), logoUrl: v('logoUrl'), country: v('country'), description: v('description'), contactName: v('contactName'), contactEmail: v('contactEmail'), order: v('order'), note: v('note'), showOnSite: f.elements.showOnSite.checked } }); toast('Saved. The Partners page is updating.'); vAdmin('partners', {}); }); });
  }

  // ---------------------------------------------------------------- public: agreement, email preferences, partner application
  async function vTools(q) {
    const t = await api('me.tools'), v = q.v || 'letters';
    const tabs = [['letters', 'My letterhead'], ['register', 'My letters'], ['recommend', 'Recommend'], ['signature', 'My signature']];
    app.innerHTML = `<div class="page-h"><span class="kicker">Editorial board</span><h1 style="font:600 30px var(--serif);margin:6px 0 0">Editor tools</h1></div>
      <div class="tabs" style="margin-bottom:16px">${tabs.map(([k, l]) => `<button data-tv="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tb" class="panel"></div>`;
    $$('[data-tv]').forEach(b => b.onclick = () => go('tools?v=' + b.dataset.tv));
    const box = $('#tb'), jopts = t.journals.map(j => `<option value="${j.slug}">${esc(j.code)}: ${esc(j.name)}</option>`).join('');
    const help = '<div class="meta">Blank line = new paragraph · "- " for bullets · **bold** · *italic* · [link text](https://…)</div>';
    if (v === 'letters') {
      box.innerHTML = `${t.hasSignature ? '' : '<div class="msg info">Add your signature under "My signature" so it appears on your letters.</div>'}<div class="lgrid"><form id="lf">
        <p class="meta">Letters are written on your journal's letterhead, "From the desk of" you, and signed by you. Each gets a reference number and is kept in the journal's register.</p>
        <div class="grid2" style="gap:4px 14px"><div class="f"><label>Type</label><select name="kind" class="inp"><option value="letter">Letter</option><option value="certificate">Certificate / to whom it may concern</option></select></div><div class="f"><label>Date</label><input type="date" name="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="f"><label>Journal letterhead</label><select name="journal" class="inp">${jopts}</select></div>
        <div class="f"><label>To (name and address, one per line)</label><textarea name="to" rows="4" class="inp"></textarea></div>
        <div class="f"><label>Subject</label><input name="subject" class="inp"></div>
        <div class="f"><label>Text</label><textarea name="body" rows="12" class="inp" placeholder="Dear …,"></textarea>${help}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="lprev">Preview</button><button class="btn btn-primary">Save, number and download PDF</button></div></form>
        <div><div class="meta" style="margin-bottom:6px">Preview</div><iframe id="lpv" style="width:100%;height:900px;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe></div></div>`;
      const data = () => { const F = $('#lf').elements; return { kind: F.kind.value, date: F.date.value, journal: F.journal.value, to: F.to.value, subject: F.subject.value, body: F.body.value, signatory: 'me' }; };
      const prev = async () => { const r = await api('letter.preview', { letter: data() }); $('#lpv').srcdoc = r.html.replace('<style>', '<style>body{max-width:760px;margin:24px auto;padding:0 28px}'); };
      $('#lprev').onclick = (e) => run(e.target, prev);
      $('#lf').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const r = await api('letter.create', { letter: data() }); download(r.name, 'application/pdf', r.data); toast('Saved as ' + r.ref + '.'); go('tools?v=register'); }); };
      prev().catch(() => { });
    }
    if (v === 'register') {
      const r = await api('letter.list');
      box.innerHTML = r.items.length ? `<table class="list"><thead><tr><th>Reference</th><th>Subject</th><th>Date</th><th></th></tr></thead><tbody>${r.items.map(l => `<tr><td><b>${esc(l.ref)}</b><div class="meta">${esc(l.type)} · ${esc(String(l.journal || '').toUpperCase())}</div></td><td>${esc(l.subject)}</td><td class="meta">${fmt(l.date)}</td><td><button class="btn btn-ghost" data-lf="${esc(l.fileId)}">PDF</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">You have not written any letters yet.</div>';
      $$('[data-lf]').forEach(b => b.onclick = () => run(b, async () => { const x = await api('letter.file', { fileId: b.dataset.lf }); download(x.name, x.mime, x.data); }));
    }
    if (v === 'recommend') {
      const r = await api('rec.list', { mine: true });
      box.innerHTML = `<p>Know a researcher who should publish with us, a good reviewer, a future board member, or a paper we should consider? Tell the editorial office. They may contact the person and mention that you recommended them.</p>
        <form id="rf" class="grid2" style="gap:4px 14px;max-width:820px"><div class="f"><label>Journal</label><select name="journal" class="inp">${jopts}</select></div><div class="f"><label>I am recommending</label><select name="kind" class="inp">${Object.entries(r.kinds).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
        <div class="f"><label>Name (person, or paper title)</label><input name="name" class="inp"></div><div class="f"><label>Email (if known)</label><input name="email" type="email" class="inp"></div>
        <div class="f"><label>Institution</label><input name="affiliation" class="inp"></div><div class="f"><label>Link (profile, paper, preprint)</label><input name="url" class="inp" placeholder="https://"></div>
        <div class="f" style="grid-column:1/-1"><label>Why? (for the editors)</label><textarea name="note" rows="3" class="inp"></textarea></div><div><button class="btn btn-primary">Send recommendation</button></div></form>
        <h3 style="margin-top:26px">My recommendations</h3>${r.items.length ? `<table class="list"><tbody>${r.items.map(x => `<tr><td><b>${esc(x.name)}</b><div class="meta">${esc(r.kinds[x.kind] || x.kind)} · ${esc(String(x.journal).toUpperCase())} · ${fmt(x.created)}</div></td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">None yet.</div>'}`;
      $('#rf').onsubmit = (e) => { e.preventDefault(); const F = e.target.elements; run(e.submitter, async () => { const x = await api('rec.submit', { journal: F.journal.value, kind: F.kind.value, name: F.name.value, email: F.email.value, affiliation: F.affiliation.value, url: F.url.value, note: F.note.value }); toast(x.message); go('tools?v=recommend'); }); };
    }
    if (v === 'signature') {
      box.innerHTML = `<p>Your signature appears on letters you write on the journal letterhead. Use a PNG with a transparent background if you can: sign on white paper, photograph it, and remove the background.</p>
        ${t.signature ? `<div style="margin:12px 0"><img src="${t.signature}" style="height:64px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px"></div>` : '<div class="msg info">No signature yet.</div>'}
        <form id="sf"><input type="file" name="img" accept="image/png,image/jpeg" class="inp"><div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary">Upload signature</button>${t.signature ? '<button type="button" class="btn btn-ghost" id="srm">Remove</button>' : ''}</div></form>`;
      $('#sf').onsubmit = (e) => { e.preventDefault(); const f = e.target.img.files[0]; if (!f) return toast('Choose an image first.', true); run(e.submitter, async () => { await api('me.signature', { image: await fileToB64(f), mime: f.type }); toast('Signature saved.'); go('tools?v=signature'); }); };
      $('#srm')?.addEventListener('click', (e) => run(e.target, async () => { await api('me.signature', { image: '' }); toast('Removed.'); go('tools?v=signature'); }));
    }
  }

  async function vAgreement(q) {
    app.innerHTML = '<div class="loading">Loading agreement…</div>';
    const { agreement: a } = await api('agreement.get', { token: q.token });
    document.documentElement.style.setProperty('--accent', a.accent || '#0B2545');
    const signed = a.status === 'active';
    app.innerHTML = `<div class="page-h"><span class="kicker" style="color:${esc(a.accent)}">${esc(a.code)} · Editorial appointment</span><h1 style="font:600 30px var(--serif);margin:6px 0 4px">${esc(a.role)}, ${esc(a.journal)}</h1><p class="meta">Term: ${esc(a.start)} – ${esc(a.end)} · ${esc(a.name)} (${esc(a.email)})</p></div>
      <div class="dgrid"><div class="panel prose" style="font:15.5px/1.65 var(--serif);max-width:none">${a.html}</div>
      <aside class="side"><div class="panel">${signed ? `<div class="msg ok">Signed by <b>${esc(a.signedName)}</b> on ${fmtT(a.signedAt)}. Your appointment is active.</div><a class="btn btn-primary" href="#/">Open the portal</a>`
        : a.status !== 'pending' ? `<div class="msg info">This appointment is ${esc(a.status)}.</div>`
        : `${a.expires ? `<p class="meta" style="color:#B42318">This personal link is valid until ${fmtT(a.expires)}.</p>` : ''}<form id="agf"><h3>1. Your details on the board page</h3><p class="meta" style="margin-top:-6px">Shown on the journal's editorial board page and shared with ISSN India and indexing services.</p>
        <div class="row2"><div class="f"><label>First name *</label><input name="given" class="inp" value="${esc(a.profile.given)}"></div><div class="f"><label>Last name *</label><input name="family" class="inp" value="${esc(a.profile.family)}"></div></div>
        <div class="f"><label>Photo for the board page</label><div style="display:flex;gap:12px;align-items:center"><img id="phprev" src="${esc(a.profile.photo || '')}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:#EEF1F5;${a.profile.photo ? '' : 'visibility:hidden'}"><input type="file" id="phfile" accept="image/*" class="inp"></div><div class="meta">A clear head-and-shoulders photo. It is cropped to a square.</div></div>
        <div class="f"><label>Short bio (2–4 sentences)</label><textarea name="bio" class="inp" rows="4" maxlength="600" placeholder="Research interests, current work and a notable achievement.">${esc(a.profile.bio || '')}</textarea><div class="meta">Shown under your name on the board page. Up to 600 characters.</div></div>
        <div class="f"><label>Designation *</label><input name="designation" class="inp" value="${esc(a.profile.designation)}" placeholder="e.g. Professor"></div>
        <div class="f"><label>Department</label><input name="department" class="inp" value="${esc(a.profile.department)}"></div>
        <div class="f"><label>Institution *</label><input name="affiliation" class="inp" value="${esc(a.profile.affiliation)}"></div>
        <div class="f"><label>Full institutional address *</label><textarea name="instAddress" class="inp" rows="2">${esc(a.profile.instAddress)}</textarea></div>
        <div class="f"><label>Institutional email</label><input name="instEmail" class="inp" value="${esc(a.profile.instEmail)}" placeholder="name@university.edu (not Gmail, Yahoo, Outlook…)"></div>
        <div class="f"><label>Institutional profile link</label><input name="profileUrl" class="inp" value="${esc(a.profile.profileUrl)}" placeholder="https://"></div>
        <div class="row2"><div class="f"><label>Degrees</label><input name="degrees" class="inp" value="${esc(a.profile.degrees)}" placeholder="PhD"></div><div class="f"><label>Country</label><input name="country" class="inp" value="${esc(a.profile.country)}"></div></div>
        <div class="f"><label>ORCID iD</label><input name="orcid" class="inp" value="${esc(a.profile.orcid)}"></div>
        <h3>2. Reviewing</h3><label class="chk"><input type="checkbox" name="reviewer" ${a.prefs.reviewer ? 'checked' : ''}> I am willing to review manuscripts</label>
        <div class="row2"><div class="f"><label>Days I need per review</label><select name="reviewDays" class="inp">${[7, 10, 14, 21, 30, 45, 60].map(d => `<option ${a.prefs.reviewDays === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div class="f"><label>Reviews at a time</label><select name="reviewMax" class="inp">${[1, 2, 3, 4, 5, 0].map(d => `<option value="${d}" ${a.prefs.reviewMax === d ? 'selected' : ''}>${d === 0 ? 'No limit' : d}</option>`).join('')}</select></div></div>
        <div class="f"><label>Your signature (optional, for letters you write as an editor)</label><input type="file" id="sigfile" accept="image/png,image/jpeg" class="inp"><div class="meta">PNG with a transparent background works best. You can add it later in Editor tools.</div></div>
        ${a.needsPassword ? '<h3>3. Your portal password</h3><div class="f"><input name="password" type="password" class="inp" placeholder="At least 8 characters" autocomplete="new-password"></div>' : ''}
        <h3>${a.needsPassword ? '4' : '3'}. Sign</h3></form><div id="m"></div><div class="f"><label>Type your full name</label><input id="sgn" class="inp" value=""></div><label class="chk"><input type="checkbox" id="agr"> I have read and agree to the ACRI Journals Editorial Agreement and the ACRI Journals policies.</label><button class="btn btn-green" id="sign" style="width:100%;justify-content:center;margin-top:10px">I agree and sign</button>

        <h3 style="margin-top:26px">Not able to accept?</h3><div class="f"><textarea id="why" placeholder="Reason (optional)" style="min-height:60px"></textarea></div><button class="btn btn-ghost" id="decl">Decline appointment</button>`}</div></aside></div>`;
    const PH = {};
    $('#phfile')?.addEventListener('change', async (ev) => { const f = ev.target.files[0]; if (!f) return; Object.assign(PH, await squarePhoto(f)); $('#phprev').src = 'data:image/jpeg;base64,' + PH.data; $('#phprev').style.visibility = 'visible'; });
    $('#sign')?.addEventListener('click', (e) => { if (!$('#agr').checked) return toast('Please tick the box to confirm that you agree.', true); run(e.target, async () => { const F = $('#agf').elements; const profile = { given: F.given.value, family: F.family.value, bio: F.bio.value }; ['designation', 'department', 'affiliation', 'instAddress', 'instEmail', 'profileUrl', 'degrees', 'country', 'orcid'].forEach(k => profile[k] = F[k].value);
      const r = await api('agreement.sign', { token: q.token, name: $('#sgn').value, agree: true, ua: navigator.userAgent, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, profile, prefs: { reviewer: F.reviewer.checked, reviewDays: F.reviewDays.value, reviewMax: F.reviewMax.value }, password: F.password ? F.password.value : '', photo: PH.data ? PH : null, signature: $('#sigfile').files[0] ? { data: await fileToB64($('#sigfile').files[0]), mime: $('#sigfile').files[0].type } : null }); toast(r.message); vAgreement(q); }); });
    $('#decl')?.addEventListener('click', (e) => { if (!confirm('Decline this appointment?')) return; run(e.target, async () => { const r = await api('agreement.decline', { token: q.token, reason: $('#why').value }); app.innerHTML = `<div class="auth panel"><div class="msg ok">${esc(r.message)}</div></div>`; }); });
  }
  async function vEmailPrefs(q) {
    app.innerHTML = '<div class="loading">Updating your email preferences…</div>';
    const op = q.confirm ? 'confirm' : q.op;
    const show = (r, note) => {
      app.innerHTML = `<div class="auth panel" style="max-width:560px"><span class="kicker">Email preferences</span><h1 style="margin-top:8px">${esc(r.email)}</h1>${note ? `<div class="msg ok">${note}</div>` : ''}
        ${r.lists.map(l => `<div class="file"><span class="nm"><b>${esc(l.name)}</b></span>${st(l.status === 'subscribed' ? 'published' : l.status === 'pending' ? 'proof' : 'draft', l.status)}${l.status === 'subscribed' ? `<button class="mini" data-u="${esc(l.token)}">Unsubscribe</button>` : `<button class="mini" data-r="${esc(l.list)}">Resubscribe</button>`}</div>`).join('')}
        <div class="actions"><button class="btn btn-ghost" id="all">Unsubscribe from all ACRI Journals emails</button></div><p class="meta" style="margin-top:14px">Service emails about your own submissions, reviews or appointments are not affected. See our <a href="/policies/email/">email policy</a>.</p></div>`;
      $$('[data-u]').forEach(b => b.onclick = () => run(b, async () => show(await api('public.emailPrefs', { t: b.dataset.u, op: 'unsubscribe' }), 'Unsubscribed.')));
      $$('[data-r]').forEach(b => b.onclick = () => run(b, async () => show(await api('public.emailPrefs', { t: q.t, op: 'resubscribe', list: b.dataset.r }), 'Welcome back! You are subscribed again.')));
      $('#all').onclick = (e) => run(e.target, async () => show(await api('public.emailPrefs', { t: q.t, op: 'unsubscribe_all' }), 'You have been unsubscribed from all ACRI Journals emails.'));
    };
    try {
      const r = await api('public.emailPrefs', { t: q.t, op });
      show(r, op === 'confirm' ? 'Subscription confirmed. Thank you!' : op === 'unsubscribe' ? `You have been unsubscribed from ${esc(r.lists.find(l => l.list === r.current)?.name || 'this list')}. Changed your mind? Use Resubscribe below.` : '');
    } catch (e) { app.innerHTML = `<div class="auth panel"><div class="msg err">${esc(e.message)}</div></div>`; }
  }
  async function tLetters(box, q, J) {
    const v = q.v || 'compose';
    const sub = [['compose', 'Write an email'], ['letter', 'Letterhead letter / notice'], ['register', 'Letters register'], ['sent', 'Sent emails'], ['certs', 'Certificates'], ['signatories', 'Signatories']];
    const sigs = (await api('sig.list')).items.filter(x => x.active);
    const sigOpts = (sel) => `<option value="none">No signature</option>${sigs.map((x, i) => `<option value="${x.id}" ${(sel ? sel === x.id : i === 0) ? 'selected' : ''}>${esc(x.name)}, ${esc(x.designation)}</option>`).join('')}`;
    const jOpts = (sel) => `<option value="">ACRI Journals (network letterhead)</option>${J.map(j => `<option value="${j.slug}" ${sel === j.slug ? 'selected' : ''}>${esc(j.code)}: ${esc(j.name)}</option>`).join('')}`;
    const head = `<div class="tabs" style="margin:0 0 16px">${sub.map(([k, l]) => `<button data-lv="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>${sigs.length ? '' : '<div class="msg err">Add a signatory with a signature image first (Signatories), so letters and certificates can be signed.</div>'}`;
    const wire = () => $$('[data-lv]', box).forEach(b => b.onclick = () => go('admin/letters?v=' + b.dataset.lv));
    const help = '<div class="meta">Blank line = new paragraph · start a line with "- " for bullets · **bold** · *italic* · [link text](https://…)</div>';

    if (v === 'compose') {
      const reg = (await api('letter.list')).items.slice(0, 40);
      box.innerHTML = head + `<form id="mc" class="grid2" style="gap:4px 18px">
        <div class="f"><label>From</label><select name="from" class="inp"><option value="office">Journal office (replies → controller@)</option><option value="editor">Editors (editor@)</option><option value="system">ACRI Journals (no.reply@)</option></select></div>
        <div class="f"><label>Journal (sets the colours and sender name)</label><select name="journal" class="inp">${jOpts(q.j)}</select></div>
        <div class="f" style="grid-column:1/-1"><label>To (separate several with commas)</label><input name="to" class="inp" value="${esc(q.to || '')}" placeholder="issnindia.niscpr@csir.res.in"></div>
        <div class="f"><label>Cc</label><input name="cc" class="inp"></div><div class="f"><label>Bcc</label><input name="bcc" class="inp"></div>
        <div class="f" style="grid-column:1/-1"><label>Subject</label><input name="subject" class="inp"></div>
        <div class="f" style="grid-column:1/-1"><label>Message</label><textarea name="body" rows="11" class="inp" placeholder="Dear Sir/Madam,"></textarea>${help}</div>
        <div class="f"><label>Sign as</label><select name="signatory" class="inp">${sigOpts()}</select></div>
        <div class="f"><label>Attach files from your computer</label><input type="file" name="files" multiple class="inp"></div>
        <div class="f" style="grid-column:1/-1"><label>Attach letters from the register</label><div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px">${reg.length ? reg.map(l => `<label class="chk" style="font-weight:400"><input type="checkbox" data-att="${esc(l.fileId)}"> ${esc(l.ref)} · ${esc(l.subject || l.type)}</label>`).join('') : '<span class="meta">No letters yet. Create one under "Letterhead letter / notice".</span>'}</div></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary">Send email</button></div></form>`;
      wire();
      $('#mc').onsubmit = (e) => { e.preventDefault(); const F = e.target.elements; run(e.submitter, async () => {
        const files = []; for (const f of F.files.files) { if (f.size > 10e6) throw new Error(f.name + ' is larger than 10 MB.'); files.push({ name: f.name, mime: f.type || 'application/octet-stream', data: await fileToB64(f) }); }
        const r = await api('mail.compose', { from: F.from.value, journal: F.journal.value, to: F.to.value, cc: F.cc.value, bcc: F.bcc.value, subject: F.subject.value, body: F.body.value, signatory: F.signatory.value, attachments: files, letterIds: $$('[data-att]', box).filter(c => c.checked).map(c => c.dataset.att) });
        toast(r.message, !r.ok); if (r.ok) go('admin/letters?v=sent'); }); };
    }

    if (v === 'letter') {
      box.innerHTML = head + `<div class="lgrid"><form id="lf">
        <div class="grid2" style="gap:4px 14px"><div class="f"><label>Type</label><select name="kind" class="inp"><option value="letter">Letter</option><option value="notice">Notice</option><option value="certificate">Certificate / to whom it may concern</option></select></div>
        <div class="f"><label>Date</label><input type="date" name="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="f"><label>Letterhead</label><select name="journal" class="inp">${jOpts()}</select></div>
        <div class="f"><label>To (name and address, one per line)</label><textarea name="to" rows="4" class="inp" placeholder="The Head&#10;ISSN National Centre India&#10;CSIR-NIScPR, New Delhi 110067"></textarea></div>
        <div class="f"><label>Subject</label><input name="subject" class="inp"></div>
        <div class="f"><label>Text</label><textarea name="body" rows="12" class="inp" placeholder="Dear Sir/Madam,"></textarea>${help}</div>
        <div class="f"><label>Signed by</label><select name="signatory" class="inp">${sigOpts()}</select></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="lprev">Preview</button><button class="btn btn-primary">Save, number and download PDF</button></div>
        <p class="meta">Saving gives the document a reference number (e.g. ACRIJ/2026/LTR/001), stores the PDF in Drive and adds it to the register, so you can attach it to an email.</p></form>
        <div><div class="meta" style="margin-bottom:6px">Preview</div><iframe id="lpv" style="width:100%;height:900px;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe></div></div>`;
      wire();
      const data = () => { const F = $('#lf').elements; return { kind: F.kind.value, date: F.date.value, journal: F.journal.value, to: F.to.value, subject: F.subject.value, body: F.body.value, signatory: F.signatory.value }; };
      const prev = async () => { const r = await api('letter.preview', { letter: data() }); $('#lpv').srcdoc = r.html.replace('<style>', '<style>body{max-width:760px;margin:24px auto;padding:0 28px}'); };
      $('#lprev').onclick = (e) => run(e.target, prev);
      $('#lf').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const r = await api('letter.create', { letter: data() }); download(r.name, 'application/pdf', r.data); toast('Saved as ' + r.ref + '.'); go('admin/letters?v=register'); }); };
      prev().catch(() => { });
    }

    if (v === 'register') {
      const r = await api('letter.list');
      box.innerHTML = head + (r.items.length ? `<table class="list"><thead><tr><th>Reference</th><th>Subject</th><th>To</th><th>Date</th><th></th></tr></thead><tbody>${r.items.map(l => `<tr><td><b>${esc(l.ref)}</b><div class="meta">${esc(l.type)}${l.journal ? ' · ' + esc(l.journal.toUpperCase()) : ''}</div></td><td>${esc(l.subject)}</td><td class="meta" style="white-space:pre-line">${esc(String(l.to || '').split('\n').slice(0, 2).join('\n'))}</td><td class="meta">${fmt(l.date)}</td><td><button class="btn btn-ghost" data-lf="${esc(l.fileId)}">PDF</button> <button class="btn btn-ghost" data-le="${esc(l.fileId)}">Email</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No letters yet.</div>');
      wire();
      $$('[data-lf]', box).forEach(b => b.onclick = () => run(b, async () => { const x = await api('letter.file', { fileId: b.dataset.lf }); download(x.name, x.mime, x.data); }));
      $$('[data-le]', box).forEach(b => b.onclick = () => { go('admin/letters?v=compose'); setTimeout(() => { const c = $(`[data-att="${b.dataset.le}"]`); if (c) c.checked = true; }, 900); });
    }

    if (v === 'sent') {
      const r = await api('mail.sent');
      box.innerHTML = head + (r.items.length ? `<table class="list"><thead><tr><th>Subject</th><th>To</th><th>Attachments</th><th>Status</th><th>Sent</th></tr></thead><tbody>${r.items.map(m => `<tr><td><b>${esc(m.subject)}</b><div class="meta">from ${esc(m.from)} · by ${esc(m.by)}</div></td><td class="meta">${esc(m.to)}${m.cc ? '<br>cc ' + esc(m.cc) : ''}</td><td class="meta">${esc(m.attachments || '–')}</td><td>${m.status === 'sent' ? st('published', 'sent') : st('rejected', 'failed')}${m.detail ? `<div class="meta">${esc(m.detail).slice(0, 120)}</div>` : ''}</td><td class="meta">${fmtT(m.ts)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No emails sent from the portal yet.</div>');
      wire();
    }

    if (v === 'certs') {
      box.innerHTML = head + `<p>Certificates of publication are made automatically for every author when an article is published, attached to the "published" email, and downloadable by authors in their portal. Here you can download them for any article, including back issues.</p>
        <form id="cf" class="grid2" style="gap:4px 14px;max-width:760px"><div class="f"><label>Journal</label><select name="journal" class="inp">${J.map(j => `<option value="${j.slug}">${esc(j.code)}</option>`).join('')}</select></div><div class="f"><label>Article ID</label><input name="id" class="inp" placeholder="IJBMRS-2026-004"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px"><button class="btn btn-primary">Show certificates</button><button type="button" class="btn btn-ghost" id="creset">Re-make (after a correction)</button></div></form><div id="cl" style="margin-top:16px"></div>`;
      wire();
      const val = () => { const F = $('#cf').elements; return { journal: F.journal.value, articleId: F.id.value.trim().toUpperCase() }; };
      $('#cf').onsubmit = (e) => { e.preventDefault(); run(e.submitter, async () => { const p = val(); const r = await api('cert.get', Object.assign({ list: true }, p)); $('#cl').innerHTML = r.items.map(x => `<button class="btn btn-ghost" data-cd="${x.author}" style="margin:0 8px 8px 0">⤓ ${esc(x.name)} <span class="meta">${esc(x.ref)}</span></button>`).join(''); $$('[data-cd]', box).forEach(b => b.onclick = () => run(b, async () => { const f = await api('cert.get', Object.assign({ author: Number(b.dataset.cd) }, p)); download(f.name, f.mime, f.data); })); }); };
      $('#creset').onclick = (e) => run(e.target, async () => { if (!confirm('Delete and re-make the certificates for this article?')) return; await api('cert.reset', val()); toast('Done. Click "Show certificates" to make new ones.'); });
    }

    if (v === 'signatories') {
      const r = await api('sig.list');
      box.innerHTML = head + `<p>People who sign letters, notices and certificates. The first active signatory signs certificates of publication.</p>
        ${r.items.map(x => `<div class="panel" style="border:1px solid var(--line);display:flex;gap:18px;align-items:center;margin-bottom:10px">${x.image ? `<img src="${x.image}" style="height:54px;max-width:200px;background:#fff">` : '<span class="meta">No signature image</span>'}<div style="flex:1"><b>${esc(x.name)}</b><div class="meta">${esc(x.designation)}${x.org ? ', ' + esc(x.org) : ''} · order ${esc(x.order || '–')}${x.active ? '' : ' · inactive'}</div></div><button class="btn btn-ghost" data-se="${x.id}">Edit</button></div>`).join('')}
        <form id="sgf" class="panel grid2" style="border:1px solid var(--line);gap:4px 14px;margin-top:14px"><input type="hidden" name="id">
        <div class="f"><label>Name</label><input name="name" class="inp" placeholder="Fenil Pritesh Shah"></div>
        <div class="f"><label>Designation</label><input name="designation" class="inp" placeholder="President"></div>
        <div class="f"><label>Organisation</label><input name="org" class="inp" value="Ahmedabad Centre for Research and Innovation"></div>
        <div class="f"><label>Order (1 signs certificates)</label><input name="order" type="number" class="inp" value="1"></div>
        <div class="f"><label>Signature image (PNG with transparent background, or JPG)</label><input name="img" type="file" accept="image/png,image/jpeg" class="inp"></div>
        <div class="f"><label class="chk" style="margin-top:28px"><input type="checkbox" name="active" checked> Active</label></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary">Save signatory</button></div></form>`;
      wire();
      $$('[data-se]', box).forEach(b => b.onclick = () => { const x = r.items.find(y => y.id === b.dataset.se), F = $('#sgf').elements; F.id.value = x.id; F.name.value = x.name; F.designation.value = x.designation; F.org.value = x.org || ''; F.order.value = x.order || ''; F.active.checked = x.active; F.name.focus(); });
      $('#sgf').onsubmit = (e) => { e.preventDefault(); const F = e.target.elements; run(e.submitter, async () => { const f = F.img.files[0]; await api('sig.save', { signatory: { id: F.id.value, name: F.name.value, designation: F.designation.value, org: F.org.value, order: F.order.value, active: F.active.checked, image: f ? await fileToB64(f) : '', mime: f ? f.type : '' } }); toast('Signatory saved.'); go('admin/letters?v=signatories'); }); };
    }
  }

  async function tSettings(box) {
    const r = await api('set.get');
    const groups = (list, key) => list.reduce((m, x) => ((m[x.group] = m[x.group] || []).push(x), m), {});
    const field = (x) => {
      const id = 'p_' + x.key;
      if (x.type === 'secret') return `<div class="f"><label for="${id}">${esc(x.label)} ${x.set ? `<span class="st s-published">set ${esc(x.hint)}</span>` : '<span class="st s-rejected">not set</span>'}</label><input id="${id}" name="${x.key}" type="password" autocomplete="new-password" class="inp" placeholder="${x.set ? 'Leave empty to keep the current value' : 'Paste the value'}">${x.set ? `<label class="chk" style="font-weight:400;font-size:13px;margin-top:6px"><input type="checkbox" data-clear="${x.key}"> Remove this value</label>` : ''}${x.help ? `<div class="meta">${esc(x.help)}</div>` : ''}</div>`;
      if (x.type === 'select') return `<div class="f"><label for="${id}">${esc(x.label)}</label><select id="${id}" name="${x.key}" class="inp">${(x.options || []).map(o => `<option ${o === x.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${x.help ? `<div class="meta">${esc(x.help)}</div>` : ''}</div>`;
      return `<div class="f"><label for="${id}">${esc(x.label)}</label><input id="${id}" name="${x.key}" class="inp" value="${esc(x.value)}">${x.help ? `<div class="meta">${esc(x.help)}</div>` : ''}</div>`;
    };
    const sfield = (x) => {
      const id = 's_' + x.path.replace(/\W/g, '_');
      if (x.type === 'bool') return `<div class="f"><label class="chk"><input type="checkbox" data-site="${x.path}" ${x.value ? 'checked' : ''}> ${esc(x.label)}</label></div>`;
      if (x.type === 'textarea') return `<div class="f" style="grid-column:1/-1"><label for="${id}">${esc(x.label)}</label><textarea id="${id}" data-site="${x.path}" rows="3" class="inp">${esc(x.value ?? '')}</textarea></div>`;
      return `<div class="f"><label for="${id}">${esc(x.label)}</label><input id="${id}" data-site="${x.path}" class="inp" ${x.type === 'number' ? 'type="number" min="0"' : ''} value="${esc(x.value ?? '')}"></div>`;
    };
    const G = groups(r.props), SG = groups(r.site);
    box.innerHTML = `<div class="msg info">Everything the system connects to, and the details shown on the public website. Keys are stored securely in Apps Script and are never shown again after saving: only their last four characters.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 18px"><button class="btn" id="stest">Run connection checks</button><button class="btn btn-ghost" id="smail">Send me a test email</button><button class="btn btn-ghost" id="sbuild">Rebuild the website</button></div>
      <div id="sres"></div>
      <form id="sf">
        <h2 style="font:600 22px var(--serif);margin:10px 0 4px">Website details</h2><p class="meta" style="margin:0 0 12px">Saved to the website's settings file in GitHub. The site rebuilds automatically.</p>
        ${r.siteError ? `<div class="msg err">${esc(r.siteError)}</div>` : Object.entries(SG).map(([g, xs]) => `<fieldset class="sset"><legend>${esc(g)}</legend><div class="sgrid">${xs.map(sfield).join('')}</div></fieldset>`).join('')}
        <h2 style="font:600 22px var(--serif);margin:26px 0 4px">Connections</h2><p class="meta" style="margin:0 0 12px">GitHub, Zoho ZeptoMail, Zenodo and system addresses. Changes apply immediately.</p>
        ${Object.entries(G).map(([g, xs]) => `<fieldset class="sset"><legend>${esc(g)}</legend><div class="sgrid">${xs.map(field).join('')}</div></fieldset>`).join('')}
        <fieldset class="sset"><legend>Web app</legend><div class="meta">Portal API address (set in the website code): <code style="word-break:break-all">${esc(r.webapp || '')}</code></div></fieldset>
        <div style="position:sticky;bottom:0;background:#fff;padding:14px 0;border-top:1px solid var(--line);margin-top:10px"><button class="btn btn-primary">Save settings</button></div>
      </form>
      <h2 style="font:600 22px var(--serif);margin:30px 0 4px">Error log</h2><p class="meta" style="margin:0 0 10px">System faults with their AES code and reference, newest first. Form and permission messages are not logged. <a href="/aes/errors/" target="_blank">What the codes mean</a></p><div id="elog"><div class="loading">Loading…</div></div>`;
    api('err.list').then(x => { $('#elog') && ($('#elog').innerHTML = x.items.length ? `<table class="list"><thead><tr><th>Reference</th><th>Code</th><th>Action</th><th>Message</th><th>When</th></tr></thead><tbody>${x.items.map(e => `<tr><td><code>${esc(e.ref)}</code></td><td><a class="aescode" href="/aes/errors/#${esc(e.code)}" target="_blank">${esc(e.code)}</a></td><td class="meta">${esc(e.action)}</td><td style="max-width:420px">${esc(e.message)}</td><td class="meta">${fmtT(e.ts)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No errors logged. 🎉</div>'); }).catch(() => { $('#elog') && ($('#elog').innerHTML = '<div class="meta">Run setup() once to create the Errors sheet.</div>'); });
    const showChecks = (c) => { $('#sres').innerHTML = `<div class="panel" style="border:1px solid var(--line);margin-bottom:18px"><table class="list"><tbody>${Object.entries(c).map(([k, v]) => { const t = typeof v === 'object' && v ? (v.error ? 'ERROR: ' + v.error : JSON.stringify(v)) : String(v); const bad = /error|missing|false|401|403|404/i.test(t); return `<tr><td style="width:160px;font-weight:600">${esc(k)}</td><td>${bad ? '<span class="st s-rejected">check</span> ' : '<span class="st s-published">ok</span> '}${esc(t)}</td></tr>`; }).join('')}</tbody></table></div>`; };
    $('#stest').onclick = (e) => run(e.target, async () => { const x = await api('set.test'); showChecks(x.checks); });
    $('#smail').onclick = (e) => run(e.target, async () => { const x = await api('adm.testEmail', {}); toast(x.result ? (x.result.status === 'sent' ? 'Test email sent: ' + (x.result.detail || 'ok') : 'Failed: ' + x.result.detail) : 'Sent.', x.result && x.result.status !== 'sent'); });
    $('#sbuild').onclick = (e) => run(e.target, async () => { await api('adm.rebuild'); toast('Rebuild started. The site updates in 3–5 minutes.'); });
    $('#sf').onsubmit = (e) => {
      e.preventDefault();
      const props = {}; r.props.forEach(x => { const el = e.target.elements[x.key]; if (el) props[x.key] = el.value; });
      const clear = $$('[data-clear]', box).filter(c => c.checked).map(c => c.dataset.clear);
      const site = {}; $$('[data-site]', box).forEach(el => site[el.dataset.site] = el.type === 'checkbox' ? el.checked : el.value);
      run(e.submitter, async () => { const x = await api('set.save', { props, clear, site: r.siteError ? {} : site }); toast(x.message); go('admin/settings'); });
    };
  }

  async function tMessages(box, q, J) {
    const r = await api('msg.list', { status: q.s || 'open' });
    const jn = (s) => s ? ((J.find(j => j.slug === s) || {}).code || s.toUpperCase()) : 'General';
    const badge = (s) => st({ new: 'submitted', read: 'with_editor', replied: 'published', closed: 'draft' }[s] || 'draft', s);
    const filt = [['open', 'Open'], ['new', 'New'], ['replied', 'Replied'], ['closed', 'Closed'], ['', 'All']];
    const cur = r.items.find(m => m.id === q.m);
    box.innerHTML = `<div class="msg info">Messages sent through the website contact form to the journal office or an Editor-in-Chief. They are kept here, not emailed. Your reply is sent to the writer by email.</div>
      <div class="tabs" style="margin:6px 0 12px">${filt.map(([k, l]) => `<button data-mf="${k}" class="${(q.s ?? 'open') === k ? 'on' : ''}">${l}${k === 'new' && r.unread ? `<span class="n">${r.unread}</span>` : ''}</button>`).join('')}</div>
      ${cur ? `<div class="panel" style="margin:0 0 16px;border:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><span class="kicker">${esc(cur.id)} · ${esc(jn(cur.journal))} · for ${esc(cur.toLabel)}</span><h2 style="font:600 22px var(--serif);margin:6px 0">${esc(cur.subject)}</h2>
        <div class="meta">${esc(cur.name)} &lt;${esc(cur.email)}&gt;${cur.role ? ' · ' + esc(cur.role) : ''}${cur.msId ? ' · Manuscript ' + esc(cur.msId) : ''} · ${fmtT(cur.created)}</div></div><div>${badge(cur.status)}</div></div>
        <div style="white-space:pre-wrap;background:#F6F7F9;border-radius:8px;padding:14px 16px;margin:14px 0;font-size:15px;line-height:1.6">${esc(cur.body)}</div>
        ${cur.reply ? `<div class="meta" style="margin-bottom:6px">Replies sent</div><div style="white-space:pre-wrap;border-left:3px solid var(--line);padding:6px 14px;margin-bottom:14px;font-size:14px">${esc(cur.reply)}</div>` : ''}
        <form id="mrep"><div class="f"><label>Reply to ${esc(cur.name)} (sent by email from the ${cur.to === 'eic' ? 'editors' : 'journal office'} address)</label><textarea name="reply" rows="6" class="inp"></textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-rc="0">Send reply</button><button class="btn" data-rc="1">Send reply & close</button>
        ${cur.status === 'closed' ? '<button type="button" class="btn btn-ghost" data-mo="reopen">Reopen</button>' : '<button type="button" class="btn btn-ghost" data-mo="close">Close without reply</button>'}
        ${isAdmin() && cur.to !== 'eic' && cur.journal ? '<button type="button" class="btn btn-ghost" data-mo="forward">Pass to Editor-in-Chief</button>' : ''}</div></form>
        <div class="f" style="margin-top:14px"><label>Internal note (not sent)</label><textarea id="mnote" rows="2" class="inp">${esc(cur.note || '')}</textarea><button class="btn btn-ghost" id="msave" style="margin-top:6px">Save note</button></div></div>` : ''}
      ${r.items.length ? `<table class="list"><thead><tr><th>Message</th><th>Journal</th><th>For</th><th>Status</th><th>Received</th></tr></thead><tbody>${r.items.map(m => `<tr class="click" data-m="${esc(m.id)}" style="${m.status === 'new' ? 'font-weight:600' : ''}${cur && cur.id === m.id ? ';background:#F3F6FA' : ''}"><td><div class="t">${esc(m.subject)}</div><div class="meta">${esc(m.name)} · ${esc(m.id)}${m.msId ? ' · ' + esc(m.msId) : ''}</div></td><td>${esc(jn(m.journal))}</td><td>${esc(m.toLabel)}</td><td>${badge(m.status)}</td><td class="meta">${fmt(m.created)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No messages here.</div>'}`;
    const here = (extra) => 'admin/messages?s=' + encodeURIComponent(q.s ?? 'open') + (extra || '');
    $$('[data-mf]', box).forEach(b => b.onclick = () => go('admin/messages?s=' + b.dataset.mf));
    $$('[data-m]', box).forEach(t => t.onclick = async () => { const m = r.items.find(x => x.id === t.dataset.m); if (m && m.status === 'new') { try { await api('msg.update', { id: m.id, op: 'read' }); } catch { } } go(here('&m=' + t.dataset.m)); });
    if (cur) {
      $$('[data-rc]', box).forEach(b => b.onclick = (e) => { e.preventDefault(); run(b, async () => { await api('msg.update', { id: cur.id, op: 'reply', reply: $('#mrep').elements.reply.value, close: b.dataset.rc === '1' }); toast('Reply sent to ' + cur.email); route(); }); });
      $$('[data-mo]', box).forEach(b => b.onclick = () => run(b, async () => { await api('msg.update', { id: cur.id, op: b.dataset.mo }); toast(b.dataset.mo === 'forward' ? 'Passed to the Editor-in-Chief.' : 'Updated.'); go(here()); }));
      $('#msave').onclick = (e) => run(e.target, async () => { await api('msg.update', { id: cur.id, op: 'note', note: $('#mnote').value }); toast('Note saved.'); });
      if (cur.status === 'new') api('msg.update', { id: cur.id, op: 'read' }).catch(() => { });
    }
  }

  async function vPartnerApply() {
    const types = ['Academic partner', 'Indexing & archiving partner', 'Institutional partner', 'Industry partner', 'Media partner', 'Professional body'];
    app.innerHTML = `<div class="auth panel" style="max-width:720px"><span class="kicker">Partnerships</span><h1 style="margin-top:8px">Partner with ACRI Journals</h1><p class="lead">Tell us about your organisation and how you would like to work with us. Please read the <a href="/policies/partners/" target="_blank">partnership policy</a> first.</p><div id="m"></div>
      <form id="pa"><div class="row2"><div class="f"><label>Organisation name</label><input name="name" required></div><div class="f"><label>Type of partnership</label><select name="type">${types.map(t => `<option>${t}</option>`).join('')}</select></div></div>
      <div class="row2"><div class="f"><label>Website</label><input name="url" type="url" placeholder="https://"></div><div class="f"><label>Country</label><input name="country"></div></div>
      <div class="f"><label>Logo URL (optional)</label><input name="logoUrl" type="url"></div>
      <div class="f"><label>About your organisation (shown publicly if approved)</label><textarea name="description" maxlength="600"></textarea></div>
      <div class="row3"><div class="f"><label>Contact person</label><input name="contactName" required></div><div class="f"><label>Email</label><input name="contactEmail" type="email" required></div><div class="f"><label>Phone</label><input name="contactPhone"></div></div>
      <div class="f"><label>What would you like to do together?</label><textarea name="message"></textarea></div>
      <label class="chk"><input type="checkbox" name="agree"> I have read the partnership policy and am authorised to apply for this organisation.</label>
      <button class="btn btn-primary">Submit application</button></form></div>`;
    $('#pa').onsubmit = (e) => { e.preventDefault(); const f = e.target; run(e.submitter, async () => { const r = await api('public.partnerApply', Object.assign(Object.fromEntries(['name', 'type', 'url', 'country', 'logoUrl', 'description', 'contactName', 'contactEmail', 'contactPhone', 'message'].map(k => [k, f.elements[k].value])), { agree: f.agree.checked })); f.outerHTML = ''; showMsg(r.message, 'ok'); }).catch(er => showMsg(er.message)); };
  }

  route();
})();
