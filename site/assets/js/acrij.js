/* ACRI Journals — site behaviour (progressive enhancement only; every page works without JS). */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Modals
  $$('[data-open]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.open)?.classList.add('on')));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('on'); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal.on,.lightbox.on').forEach(m => m.classList.remove('on')); });

  // Citations
  const cj = $('#cites');
  if (cj) {
    const C = JSON.parse(cj.textContent), box = $('#cbox');
    const show = k => { box.textContent = C[k]; box.classList.toggle('code', k === 'bibtex' || k === 'ris'); $$('.ctabs button').forEach(b => b.classList.toggle('on', b.dataset.ct === k)); };
    $$('.ctabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.ct)));
    show('ama');
    $('[data-copy]')?.addEventListener('click', e => { navigator.clipboard.writeText(box.textContent).then(() => { e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy', 1500); }); });
  }

  // Share
  $$('[data-share]').forEach(b => b.addEventListener('click', async () => {
    const d = { title: document.title, url: location.href.split('#')[0] };
    if (navigator.share) { try { await navigator.share(d); } catch { } }
    else { await navigator.clipboard.writeText(d.url); b.lastChild.textContent = ' Link copied'; setTimeout(() => b.lastChild.textContent = ' Share', 1600); }
  }));

  // Figure lightbox
  const lb = $('#lb');
  if (lb) $$('.fig .fi img').forEach(img => img.addEventListener('click', () => { lb.querySelector('img').src = img.dataset.large || img.src; lb.classList.add('on'); }));
  lb?.addEventListener('click', () => lb.classList.remove('on'));

  // Section nav highlight
  const nav = $('#secnav');
  if (nav && 'IntersectionObserver' in window) {
    const links = new Map($$('a', nav).map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.remove('on')); links.get(e.target.id)?.classList.add('on'); } }), { rootMargin: '-90px 0px -70% 0px' });
    links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // Newsletter → Apps Script
  $$('form[data-api="subscribe"]').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('.nl-msg', f), api = window.ACRIJ_API || document.documentElement.dataset.api;
    msg.textContent = 'Subscribing…';
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'public.subscribe', email: f.email.value, list: f.dataset.list || 'network', source: location.pathname }) }).then(r => r.json());
      msg.textContent = r.ok ? 'Thank you. Please check your inbox to confirm.' : (r.error || 'Something went wrong.');
      if (r.ok) f.reset();
    } catch { msg.textContent = 'Could not reach the server. Please try again later.'; }
  }));

  // Contact form → Apps Script (messages are kept in the editorial portal, not emailed)
  $$('form[data-api="contact"]').forEach(f => {
    const qs = new URLSearchParams(location.search);
    if (qs.get('journal') && f.journal) f.journal.value = qs.get('journal');
    if (qs.get('to') && f.to) f.to.value = qs.get('to');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('.c-msg', f), btn = $('button[type=submit]', f), api = window.ACRIJ_API || document.documentElement.dataset.api;
      const v = (k) => (f[k] ? f[k].value.trim() : '');
      msg.className = 'c-msg'; msg.textContent = 'Sending…'; btn.disabled = true;
      try {
        const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'public.contact', journal: v('journal'), to: v('to'), name: v('name'), email: v('email'), role: v('role'), msId: v('msId'), subject: v('subject'), body: v('body'), website: v('website'), page: location.pathname }) }).then(r => r.json());
        if (r.ok) { f.reset(); msg.className = 'c-msg ok'; msg.innerHTML = 'Thank you. Your message has been received (reference <b>' + r.ref + '</b>). The editorial team will reply to your email address.'; }
        else { msg.className = 'c-msg err'; msg.textContent = r.error || 'Something went wrong.'; }
      } catch { msg.className = 'c-msg err'; msg.textContent = 'Could not reach the server. Please try again later.'; }
      btn.disabled = false;
    });
  });

  // Leaving a hosted journal's pages: the portal goes back to the ACRI Journals look.
  try { if (!document.documentElement.dataset.hosted && !/\/(login|submit)\/$/.test(location.pathname)) sessionStorage.removeItem('aes_brand'); } catch (e) { }

  // Journal hosting application → Apps Script
  $$('form[data-api="hostApply"]').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('.c-msg', f), btn = $('button[type=submit]', f), api = window.ACRIJ_API || document.documentElement.dataset.api;
    const d = { action: 'public.hostApply', agree: !!(f.agree && f.agree.checked) };
    [...f.elements].forEach(el => { if (el.name && el.type !== 'checkbox' && el.type !== 'submit') d[el.name] = el.value.trim(); });
    msg.className = 'c-msg'; msg.textContent = 'Sending…'; btn.disabled = true;
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(d) }).then(x => x.json());
      if (r.ok) { f.reset(); msg.className = 'c-msg ok'; msg.textContent = r.message || 'Thank you. Your application has been received.'; }
      else { msg.className = 'c-msg err'; msg.textContent = r.error || 'Something went wrong.'; }
    } catch { msg.className = 'c-msg err'; msg.textContent = 'Could not reach the server. Please try again later.'; }
    btn.disabled = false;
  }));

  // Search page
  const sr = $('#search-results');
  if (sr) {
    const p = new URLSearchParams(location.search), q = p.get('q') || '', jf = p.get('j') || '';
    const input = $('#search-q'); input.value = q;
    fetch('/search/index.json').then(r => r.json()).then(idx => {
      const run = () => {
        const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        const jsel = $('#search-j').value;
        let res = idx.filter(d => !jsel || d.j === jsel).map(d => {
          const hay = { t: d.t.toLowerCase(), a: d.a.toLowerCase(), k: d.k.toLowerCase(), s: d.s.toLowerCase(), doi: d.doi.toLowerCase() };
          let sc = 0; for (const t of terms) { if (hay.t.includes(t)) sc += 5; if (hay.a.includes(t)) sc += 4; if (hay.k.includes(t)) sc += 3; if (hay.s.includes(t)) sc += 1; if (hay.doi.includes(t)) sc += 6; if (!Object.values(hay).some(v => v.includes(t))) return null; }
          return { d, sc };
        }).filter(Boolean);
        res.sort((a, b) => b.sc - a.sc || b.d.d.localeCompare(a.d.d));
        const e = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        $('#search-count').textContent = `${res.length} result${res.length === 1 ? '' : 's'}${terms.length ? ` for “${input.value}”` : ''}`;
        sr.innerHTML = res.slice(0, 100).map(({ d }) => `<div class="toc-item"><div><span class="atype">${e(d.jc)} · ${e(d.ty || '')}</span><h3><a href="${d.u}">${e(d.t)}</a></h3><div class="meta">${e(d.a)}</div><div class="meta" style="margin-top:6px">${e(d.s.slice(0, 220))}…</div></div><div class="acts"><span class="meta">${d.d}</span></div></div>`).join('');
      };
      if (jf) $('#search-j').value = jf;
      run();
      $('#search-form').addEventListener('submit', ev => { ev.preventDefault(); history.replaceState(null, '', '?q=' + encodeURIComponent(input.value)); run(); });
      $('#search-j').addEventListener('change', run);
    });
  }
})();
