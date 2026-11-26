/** Email lists, campaigns (newsletters, calls for papers, outreach), automations and unsubscribe handling.
 *
 *  Campaigns go through ZeptoMail by default (CAMPAIGN_PROVIDER = zepto) or Brevo (CAMPAIGN_PROVIDER = brevo).
 *  NOTE: ZeptoMail's terms bar bulk/marketing mail (Brevo: set BREVO_KEY and verify journals.acriindia.org
 *  there). Workflow emails (submissions, reviews, decisions, agreements) stay on ZeptoMail. */

const PRESETS = {
  cfp: { label: 'Call for Papers', kicker: 'Call for papers', cta: 'Submit your manuscript' },
  issue: { label: 'New Issue', kicker: 'New issue', cta: 'Read the issue' },
  article: { label: 'New Article Alert', kicker: 'Just published', cta: 'Read the article' },
  digest: { label: 'Research Digest', kicker: 'Latest research', cta: 'See all new articles' },
  announcement: { label: 'Announcement', kicker: 'Announcement', cta: 'Learn more' },
  event: { label: 'Event / Webinar', kicker: 'You are invited', cta: 'Register now' },
  outreach: { label: 'Personal outreach (plain)', kicker: '', cta: '' },
};
const AUTOMATION_TYPES = {
  new_article: 'Email subscribers when an article is published',
  new_issue: 'Email subscribers when an issue is published',
  digest: 'Send a digest of new articles every N days (if any)',
  recurring: 'Re-send a chosen campaign every N days (e.g. call for papers) until the end date',
  review_reminders: 'Automatic reminders to reviewers (invitation and due date)',
};

// ------------------------------------------------------------ lists & contacts
function listName_(list) { if (!list || list === 'network') return 'ACRI Journals (all journals)'; try { return journalRow_(list).name; } catch (e) { return list; } }
function contactRow_(email, list) { return all_('Contacts').find(c => c.email === email && c.list === list) || null; }

function public_subscribe(p) {
  const e = normEmail_(p.email), list = p.list || 'network';
  need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), 'Please enter a valid email.');
  const ex = contactRow_(e, list);
  if (ex && ex.status === 'subscribed') return { ok: true };
  const t = ex ? ex.token : token_();
  if (ex) updateContact_(ex, { status: 'pending', updated: now_() });
  else insert_('Contacts', { email: e, name: p.name || '', list: list, status: 'pending', token: t, source: 'website ' + (p.source || ''), consent: 'double opt-in requested ' + now_(), tags: [], created: now_(), updated: now_(), sentCount: 0 });
  mailTemplate_('subscribe', e, { link: portalUrl_('email?t=' + t + '&confirm=1'), list: listName_(list) });
  return { ok: true };
}
function updateContact_(c, patch) {
  const s = sh_('Contacts'), h = SCHEMA.Contacts;
  const cur = s.getRange(c._row, 1, 1, h.length).getValues()[0];
  h.forEach((k, i) => { if (patch.hasOwnProperty(k)) cur[i] = encode_(k, patch[k]); });
  s.getRange(c._row, 1, 1, h.length).setValues([cur]);
  dbDirty_('Contacts');
}
/** Preference centre behind every email's unsubscribe link. */
function public_emailPrefs(p) {
  const c = all_('Contacts').find(x => x.token === p.t); need_(c && p.t, 'This link is invalid or has expired.');
  const rows = all_('Contacts').filter(x => x.email === c.email);
  const set = (row, st, note) => updateContact_(row, { status: st, updated: now_(), consent: (row.consent || '') + ' | ' + note + ' ' + now_() });
  if (p.op === 'confirm' && c.status !== 'subscribed') set(c, 'subscribed', 'confirmed');
  if (p.op === 'unsubscribe') set(c, 'unsubscribed', 'unsubscribed via link');
  if (p.op === 'unsubscribe_all') rows.forEach(r => set(r, 'unsubscribed', 'unsubscribed from all'));
  if (p.op === 'resubscribe') { const r = p.list ? (rows.find(x => x.list === p.list) || null) : c; if (r) set(r, 'subscribed', 'resubscribed'); }
  const fresh = all_('Contacts').filter(x => x.email === c.email);
  return { ok: true, email: c.email, current: c.list, lists: fresh.map(x => ({ list: x.list, name: listName_(x.list), status: x.status, token: x.token })) };
}
/** RFC 8058 one-click unsubscribe (mail clients POST to the List-Unsubscribe URL). */
function oneClickUnsub_(token) {
  const c = all_('Contacts').find(x => x.token === token);
  if (c) updateContact_(c, { status: 'unsubscribed', updated: now_(), consent: (c.consent || '') + ' | one-click unsubscribe ' + now_() });
}

function mail_lists(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  const counts = {};
  all_('Contacts').forEach(c => { const k = c.list; counts[k] = counts[k] || { list: k, name: listName_(k), subscribed: 0, pending: 0, unsubscribed: 0, bounced: 0 }; counts[k][c.status] = (counts[k][c.status] || 0) + 1; });
  ['network'].concat(all_('Journals').map(j => j.slug)).forEach(k => { counts[k] = counts[k] || { list: k, name: listName_(k), subscribed: 0, pending: 0, unsubscribed: 0, bounced: 0 }; });
  return { ok: true, lists: Object.values(counts) };
}
function anyEic_(u) { return (u.roles.eic || []).length > 0 || (u.roles.jadmin || []).length > 0; }
function mailScope_(u, journal) { need_(isAdmin_(u) || (journal && isLead_(u, journal)), 'Only admins, or the EIC for their own journal, can manage email.'); }

function mail_contacts(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  const q = String(p.q || '').toLowerCase();
  return { ok: true, items: all_('Contacts').filter(c => (!p.list || c.list === p.list) && (!p.status || c.status === p.status) && (!q || (c.email + ' ' + c.name).toLowerCase().indexOf(q) >= 0)).slice(0, 500).map(c => ({ email: c.email, name: c.name, list: c.list, status: c.status, source: c.source, tags: c.tags || [], created: c.created, lastSent: c.lastSent, sentCount: c.sentCount })) };
}
/** Add contacts: one per line, "email" or "email, Name" or "Name <email>". */
function mail_import(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  need_(p.consent, 'Record how these people agreed to receive email (consent), e.g. "Conference attendees ICOY 2027, opted in on registration form".');
  const lines = String(p.text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const existing = {}; all_('Contacts').filter(c => c.list === p.list).forEach(c => existing[c.email] = c);
  const rows = []; let added = 0, skipped = 0, revived = 0;
  lines.forEach(l => {
    const m = l.match(/<([^>]+)>/); let email = m ? m[1] : l.split(/[,;\t]/)[0]; let name = m ? l.replace(m[0], '').replace(/[",]/g, '').trim() : (l.split(/[,;\t]/)[1] || '').trim();
    email = normEmail_(email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; return; }
    const ex = existing[email];
    if (ex) { if (ex.status === 'unsubscribed') { skipped++; return; } if (ex.status !== 'subscribed') { updateContact_(ex, { status: 'subscribed', updated: now_() }); revived++; } else skipped++; return; }
    existing[email] = true;
    rows.push(SCHEMA.Contacts.map(k => encode_(k, { email: email, name: name, list: p.list, status: 'subscribed', token: token_(), source: 'import by ' + u.email, consent: p.consent + ' (' + now_() + ')', tags: (p.tags || '').split(/[;,]/).map(s => s.trim()).filter(Boolean), created: now_(), updated: now_(), sentCount: 0 }[k])));
    added++;
  });
  if (rows.length) { dbDirty_('Contacts'); const s = sh_('Contacts'); s.getRange(s.getLastRow() + 1, 1, rows.length, SCHEMA.Contacts.length).setValues(rows); }
  return { ok: true, added: added, revived: revived, skipped: skipped, note: 'People who unsubscribed earlier were not re-added.' };
}
function mail_setContact(p, u) {
  mailScope_(u, p.list !== 'network' ? p.list : null);
  const c = contactRow_(normEmail_(p.email), p.list); need_(c, 'Contact not found.');
  if (p.remove) { dbDirty_('Contacts'); sh_('Contacts').deleteRow(c._row); return { ok: true }; }
  updateContact_(c, { status: p.status || c.status, name: p.name !== undefined ? p.name : c.name, updated: now_() });
  return { ok: true };
}

// ------------------------------------------------------------ campaigns
function mail_campaigns(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  return { ok: true, presets: PRESETS, items: all_('Campaigns').filter(c => isAdmin_(u) || isLead_(u, c.journal)).map(c => ({ id: c.id, journal: c.journal, name: c.name, subject: c.subject, preset: c.preset, status: c.status, scheduledAt: c.scheduledAt, sentAt: c.sentAt, stats: c.stats || {}, updated: c.updated, audience: c.audience, sender: c.sender, preheader: c.preheader, content: c.content })).reverse() };
}
function mail_saveCampaign(p, u) {
  const c = p.campaign || {}; mailScope_(u, c.journal || null);
  need_(c.subject, 'Add a subject line.');
  need_(PRESETS[c.preset], 'Choose a design.');
  const row = { journal: c.journal || '', name: c.name || c.subject, subject: c.subject, preheader: c.preheader || '', preset: c.preset, content: c.content || {}, sender: c.sender || 'noreply', audience: c.audience || { lists: [c.journal || 'network'] }, updated: now_() };
  if (c.id) {
    const ex = find_('Campaigns', 'id', c.id); need_(ex, 'Campaign not found.');
    need_(['draft', 'template'].indexOf(ex.status) >= 0, 'Sent or scheduled campaigns cannot be edited. Duplicate it instead.');
    update_('Campaigns', 'id', c.id, row); return { ok: true, id: c.id };
  }
  const id = uid_('C');
  insert_('Campaigns', Object.assign(row, { id: id, status: c.status === 'template' ? 'template' : 'draft', createdBy: u.id, created: now_(), stats: {} }));
  return { ok: true, id: id };
}
function mail_preview(p, u) {
  const c = p.campaign || find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.');
  return { ok: true, html: renderCampaign_(c, { name: u.given, token: 'preview' }) };
}
function mail_test(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Save the campaign first.'); mailScope_(u, c.journal || null);
  const r = campaignSend_([{ email: u.email, name: u.given, token: 'test' }], c);
  return { ok: r[0].ok, error: r[0].error, message: r[0].ok ? 'Test sent to ' + u.email : r[0].error };
}
function audienceOf_(c) {
  const lists = (c.audience && c.audience.lists) || [c.journal || 'network'];
  const tags = (c.audience && c.audience.tags) || [];
  const seen = {}, out = [];
  all_('Contacts').forEach(x => {
    if (x.status !== 'subscribed' || lists.indexOf(x.list) < 0 || seen[x.email]) return;
    if (tags.length && !(x.tags || []).some(t => tags.indexOf(t) >= 0)) return;
    seen[x.email] = 1; out.push({ email: x.email, name: x.name, token: x.token });
  });
  // People who unsubscribed from ALL lists are never emailed, even if listed elsewhere.
  return out;
}
function mail_audience(p, u) { const c = p.campaign || find_('Campaigns', 'id', p.id); return { ok: true, count: audienceOf_(c).length }; }
function mail_send(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  need_(c.status === 'draft', 'Only drafts can be sent.');
  need_(campaignProvider_() === 'brevo' ? prop_('BREVO_KEY') : (prop_('ZEPTO_CAMPAIGN_TOKEN') || prop_('ZEPTO_TOKEN')), campaignProvider_() === 'brevo' ? 'Set BREVO_KEY first.' : 'Set ZEPTO_TOKEN (or ZEPTO_CAMPAIGN_TOKEN) first.');
  const n = audienceOf_(c).length; need_(n, 'No subscribed contacts in the selected lists.');
  update_('Campaigns', 'id', c.id, { status: 'scheduled', scheduledAt: p.at || now_(), stats: { total: n, sent: 0, failed: 0 }, updated: now_() });
  return { ok: true, message: (p.at ? 'Scheduled for ' + p.at : 'Sending started') + ' · ' + n + ' recipients. Emails go out in batches every few minutes.' };
}
function mail_stop(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  need_(['scheduled', 'sending'].indexOf(c.status) >= 0, 'This campaign is not sending.');
  update_('Campaigns', 'id', c.id, { status: 'stopped', updated: now_() });
  return { ok: true };
}
function mail_duplicate(p, u) {
  const c = find_('Campaigns', 'id', p.id); need_(c, 'Campaign not found.'); mailScope_(u, c.journal || null);
  const id = uid_('C');
  insert_('Campaigns', { id: id, journal: c.journal, name: c.name + ' (copy)', subject: c.subject, preheader: c.preheader, preset: c.preset, content: c.content, sender: c.sender, audience: c.audience, status: 'draft', createdBy: u.id, created: now_(), updated: now_(), stats: {} });
  return { ok: true, id: id };
}

/** Every 5 minutes: start due campaigns and send the next batch. */
function campaignTick() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const t0 = Date.now();
    all_('Campaigns').forEach(c => {
      if (c.status === 'scheduled' && new Date(c.scheduledAt) <= new Date()) {
        const rec = audienceOf_(c);
        const rows = rec.map(r => SCHEMA.Queue.map(k => encode_(k, { id: uid_('Q'), campaignId: c.id, email: r.email, name: r.name, token: r.token, status: 'queued', ts: now_() }[k])));
        if (rows.length) { dbDirty_('Queue'); const s = sh_('Queue'); s.getRange(s.getLastRow() + 1, 1, rows.length, SCHEMA.Queue.length).setValues(rows); }
        update_('Campaigns', 'id', c.id, { status: 'sending', stats: { total: rows.length, sent: 0, failed: 0 } });
      }
    });
    const sending = all_('Campaigns').filter(c => c.status === 'sending' || c.status === 'stopped');
    if (!sending.length) return;
    const qs = sh_('Queue'), q = all_('Queue');
    sending.forEach(c => {
      const mine = q.filter(x => x.campaignId === c.id && x.status === 'queued');
      dbDirty_('Queue');
      if (c.status === 'stopped') { mine.forEach(x => qs.getRange(x._row, SCHEMA.Queue.indexOf('status') + 1).setValue('cancelled')); return; }
      const stats = c.stats || { total: 0, sent: 0, failed: 0 };
      for (let i = 0; i < mine.length && Date.now() - t0 < 240000; i += 40) {
        const batch = mine.slice(i, i + 40);
        const res = campaignSend_(batch, c);
        res.forEach((r, k) => {
          const x = batch[k];
          qs.getRange(x._row, SCHEMA.Queue.indexOf('status') + 1, 1, 3).setValues([[r.ok ? 'sent' : 'failed', r.error || '', now_()]]);
          r.ok ? stats.sent++ : stats.failed++;
        });
      }
      dbDirty_('Queue');
      const left = all_('Queue').filter(x => x.campaignId === c.id && x.status === 'queued').length;
      update_('Campaigns', 'id', c.id, { stats: stats, status: left ? 'sending' : 'sent', sentAt: left ? '' : now_() });
      if (!left) bumpContacts_(c);
    });
  } finally { lock.releaseLock(); }
}
function bumpContacts_(c) {
  const sent = {}; all_('Queue').filter(x => x.campaignId === c.id && x.status === 'sent').forEach(x => sent[x.email] = 1);
  all_('Contacts').forEach(x => { if (sent[x.email] && (c.audience.lists || []).indexOf(x.list) >= 0) updateContact_(x, { lastSent: now_(), sentCount: (Number(x.sentCount) || 0) + 1 }); });
}

function campaignProvider_() { return String(prop_('CAMPAIGN_PROVIDER', 'brevo')).toLowerCase() === 'zepto' ? 'zepto' : 'brevo'; }
function newsletterFrom_() { return prop_('NEWSLETTER_FROM', 'newsletter@' + mailDomain_()); }
/** Send through the campaign provider (ZeptoMail or Brevo). Returns [{ok, error}] in order. */
function campaignSend_(recipients, c) {
  const prov = campaignProvider_();
  const key = prov === 'brevo' ? prop_('BREVO_KEY') : (prop_('ZEPTO_CAMPAIGN_TOKEN') || prop_('ZEPTO_TOKEN'));
  if (!key) return recipients.map(() => ({ ok: false, error: prov === 'brevo' ? 'BREVO_KEY not set' : 'ZEPTO_TOKEN not set' }));
  const j = c.journal ? journalRow_(c.journal) : null;
  // Every campaign comes from the single newsletter address; only the display name changes per journal.
  const from = { email: newsletterFrom_(), name: j ? j.code + ' · ACRI Journals' : 'ACRI Journals' };
  const replyTo = j ? (c.sender === 'editor' ? j.editorEmail : j.officeEmail) : controllerEmail_();
  const api = ScriptApp.getService().getUrl();
  const reqs = recipients.map(r => {
    const unsub = api + '?lu=' + encodeURIComponent(r.token);
    if (prov === 'zepto') return { url: 'https://' + prop_('ZEPTO_HOST', 'api.zeptomail.in') + '/v1.1/email', method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: /^Zoho-enczapikey/i.test(key) ? key : 'Zoho-enczapikey ' + key, Accept: 'application/json' },
      payload: JSON.stringify({ from: { address: from.email, name: from.name }, to: [{ email_address: { address: r.email, name: r.name || undefined } }], reply_to: [{ address: replyTo }], subject: personalise_(c.subject, r), htmlbody: renderCampaign_(c, r),
        mime_headers: { 'List-Unsubscribe': '<' + unsub + '>, <mailto:' + replyTo + '?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) };
    return { url: 'https://api.brevo.com/v3/smtp/email', method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { 'api-key': key, accept: 'application/json' },
      payload: JSON.stringify({ sender: from, to: [{ email: r.email, name: r.name || undefined }], replyTo: { email: replyTo }, subject: personalise_(c.subject, r), htmlContent: renderCampaign_(c, r),
        headers: { 'List-Unsubscribe': '<' + unsub + '>, <mailto:' + replyTo + '?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, tags: ['campaign', c.id] }) };
  });
  const res = UrlFetchApp.fetchAll(reqs);
  return res.map(x => x.getResponseCode() < 300 ? { ok: true } : { ok: false, error: x.getContentText().slice(0, 200) });
}
function personalise_(s, r) { return String(s || '').replace(/\{\{\s*name\s*\}\}/g, (r && r.name) ? r.name.split(' ')[0] : 'Colleague'); }

// ------------------------------------------------------------ campaign design (shared by preview and send)
function md_(t) {
  const e = esc_(t || '');
  return e.split(/\n{2,}/).map(block => {
    if (/^\s*[-•]\s/.test(block)) return '<ul style="margin:0 0 16px;padding-left:20px">' + block.split('\n').map(l => '<li style="margin:4px 0">' + l.replace(/^\s*[-•]\s/, '') + '</li>').join('') + '</ul>';
    return '<p style="margin:0 0 16px">' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:inherit">$1</a>');
}
function autoItems_(c) {
  const ct = c.content || {};
  if (['issue', 'digest', 'article'].indexOf(c.preset) < 0 || (ct.items && ct.items.length)) return ct.items || [];
  try {
    const idx = JSON.parse(UrlFetchApp.fetch(siteUrl_() + '/search/index.json', { muteHttpExceptions: true }).getContentText() || '[]');
    let list = idx.filter(a => !c.journal || a.j === c.journal);
    if (c.preset === 'issue' && ct.volume) list = list.filter(a => String(a.v) === String(ct.volume) && String(a.i) === String(ct.issue));
    if (c.preset === 'digest' && ct.since) list = list.filter(a => a.d >= ct.since);
    if (c.preset === 'article' && ct.articleUrl) list = list.filter(a => siteUrl_() + a.u === ct.articleUrl);
    return list.slice(0, Number(ct.limit) || 8).map(a => ({ title: a.t, meta: a.a + ' · ' + a.jc + ' · ' + a.ty, text: a.s.slice(0, 220) + (a.s.length > 220 ? '…' : ''), url: siteUrl_() + a.u }));
  } catch (e) { return []; }
}
function renderCampaign_(c, r) {
  const j = c.journal ? journalRow_(c.journal) : null;
  const accent = (j && j.accent) || '#0B2545', ct = c.content || {}, P = PRESETS[c.preset] || PRESETS.announcement;
  const api = ScriptApp.getService().getUrl();
  const prefs = portalUrl_('email?t=' + encodeURIComponent(r.token || ''));
  const unsub = portalUrl_('email?t=' + encodeURIComponent(r.token || '') + '&op=unsubscribe');
  const items = autoItems_(c);
  const cta = ct.ctaUrl || (c.preset === 'cfp' && j ? siteUrl_() + '/portal/#/submit?journal=' + j.slug : (j ? siteUrl_() + '/journals/' + j.slug + '/' : siteUrl_()));
  const font = "font-family:Inter,'Segoe UI',Arial,sans-serif";
  if (c.preset === 'outreach') {
    return '<!doctype html><html><body style="margin:0;background:#fff"><div style="max-width:620px;margin:0 auto;padding:28px 22px;' + font + ';font-size:15px;line-height:1.6;color:#15191E">' +
      (c.preheader ? '<div style="display:none;max-height:0;overflow:hidden">' + esc_(c.preheader) + '</div>' : '') +
      md_(personalise_(ct.body, r)) + (ct.signoff ? md_(ct.signoff) : '') +
      '<p style="margin-top:30px;border-top:1px solid #eee;padding-top:12px;font-size:12px;color:#8A939F">' + (j ? esc_(j.name) + ' · ' : '') + 'ACRI Journals · <a href="' + unsub + '" style="color:#8A939F">Unsubscribe</a></p></div></body></html>';
  }
  const dates = String(ct.dates || '').split('\n').map(l => l.split('|').map(s => s.trim())).filter(x => x[0]);
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#EEF1F5">' +
    (c.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc_(c.preheader) + '</div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:26px 10px"><tr><td align="center">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden">' +
    // header
    '<tr><td style="padding:22px 32px;border-bottom:1px solid #EEF0F3"><table role="presentation" width="100%"><tr><td style="color:#0B2545;line-height:1"><span style="font-family:Georgia,serif;font-weight:700;font-size:22px">ACRI</span><span style="display:inline-block;width:1px;height:17px;background:#1F7A4D;margin:0 10px;vertical-align:-2px"></span><span style="' + font + ';font-weight:700;font-size:10px;letter-spacing:.34em">JOURNALS</span></td>' +
    '<td align="right" style="' + font + ';font-size:12px;color:#5E6875">' + (j ? esc_(j.code) : '') + '</td></tr></table></td></tr>' +
    // hero
    '<tr><td style="background:' + accent + ';padding:38px 32px 34px;color:#fff">' +
    (P.kicker ? '<div style="' + font + ';font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-bottom:12px">' + esc_(ct.kicker || P.kicker) + (j ? ' · ' + esc_(j.code) : '') + '</div>' : '') +
    '<div style="font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:700">' + esc_(personalise_(ct.heading || c.subject, r)) + '</div>' +
    (ct.subheading ? '<div style="' + font + ';font-size:16px;line-height:1.5;margin-top:12px;opacity:.9">' + esc_(ct.subheading) + '</div>' : '') + '</td></tr>' +
    (ct.image ? '<tr><td><img src="' + esc_(ct.image) + '" width="640" style="display:block;width:100%;height:auto" alt=""></td></tr>' : '') +
    // body
    '<tr><td style="padding:30px 32px 8px;' + font + ';font-size:15.5px;line-height:1.65;color:#15191E">' + (ct.greeting !== false ? '<p style="margin:0 0 16px">Dear ' + esc_(personalise_('{{name}}', r)) + ',</p>' : '') + md_(personalise_(ct.body, r)) + '</td></tr>' +
    (dates.length ? '<tr><td style="padding:0 32px 10px"><table role="presentation" width="100%" style="border:1px solid #E2E5E9;border-radius:10px;' + font + ';font-size:14px">' + dates.map((d, i) => '<tr><td style="padding:11px 16px;color:#5E6875;' + (i ? 'border-top:1px solid #EEF0F3;' : '') + 'width:45%">' + esc_(d[0]) + '</td><td style="padding:11px 16px;font-weight:600;' + (i ? 'border-top:1px solid #EEF0F3;' : '') + '">' + esc_(d[1] || '') + '</td></tr>').join('') + '</table></td></tr>' : '') +
    (items.length ? '<tr><td style="padding:6px 32px 4px">' + items.map(it => '<table role="presentation" width="100%" style="border-top:1px solid #EEF0F3"><tr><td style="padding:16px 0"><a href="' + esc_(it.url) + '" style="font-family:Georgia,serif;font-size:18px;line-height:1.3;color:#15191E;text-decoration:none;font-weight:700">' + esc_(it.title) + '</a><div style="' + font + ';font-size:12.5px;color:#5E6875;margin-top:5px">' + esc_(it.meta || '') + '</div>' + (it.text ? '<div style="' + font + ';font-size:14px;color:#2F3742;margin-top:6px;line-height:1.55">' + esc_(it.text) + '</div>' : '') + '</td></tr></table>').join('') + '</td></tr>' : '') +
    (P.cta || ct.ctaLabel ? '<tr><td style="padding:14px 32px 30px"><a href="' + esc_(cta) + '" style="display:inline-block;background:' + accent + ';color:#fff;text-decoration:none;' + font + ';font-weight:600;font-size:15px;padding:13px 22px;border-radius:7px">' + esc_(ct.ctaLabel || P.cta) + ' →</a></td></tr>' : '') +
    (ct.signoff ? '<tr><td style="padding:0 32px 28px;' + font + ';font-size:15px;line-height:1.6;color:#15191E">' + md_(ct.signoff) + '</td></tr>' : '') +
    // footer
    '<tr><td style="background:#0B2545;padding:22px 32px;' + font + ';font-size:12px;line-height:1.6;color:#AEBACB">' +
    'You are receiving this because you subscribed to ' + esc_(listName_(c.journal || 'network')) + ' updates' + (j ? '' : '') + '.<br>' +
    '<a href="' + unsub + '" style="color:#fff">Unsubscribe</a> · <a href="' + prefs + '" style="color:#fff">Email preferences</a> · <a href="' + siteUrl_() + '/policies/email/" style="color:#fff">Email policy</a><br>' +
    'ACRI Journals · Part of ACRIVERSE · <a href="' + siteUrl_() + '" style="color:#AEBACB">' + siteUrl_().replace('https://', '') + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
}

// ------------------------------------------------------------ automations (enable / stop from the admin)
function automationsFor_(slug) { return all_('Automations').filter(a => a.journal === slug); }
function automationOn_(slug, type) { const a = all_('Automations').find(x => x.journal === slug && x.type === type); return a ? String(a.enabled) !== 'false' : type === 'review_reminders'; }
function seedAutomations_(slug) {
  [['review_reminders', true, ''], ['new_article', false, ''], ['new_issue', false, ''], ['digest', false, 30], ['recurring', false, 14]].forEach(([t, on, every]) => {
    if (all_('Automations').some(a => a.journal === slug && a.type === t)) return;
    insert_('Automations', { id: uid_('M'), journal: slug, type: t, name: AUTOMATION_TYPES[t], enabled: on, everyDays: every, campaignId: '', endDate: '', nextRun: '', lastRun: '', config: { includeNetwork: true }, updated: now_() });
  });
}
function mail_automations(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  all_('Journals').forEach(j => seedAutomations_(j.slug)); seedAutomations_('network');
  return { ok: true, types: AUTOMATION_TYPES, items: all_('Automations').filter(a => isAdmin_(u) || isLead_(u, a.journal)).map(a => ({ id: a.id, journal: a.journal, type: a.type, name: a.name, enabled: String(a.enabled) !== 'false', everyDays: a.everyDays, campaignId: a.campaignId, endDate: a.endDate, nextRun: a.nextRun, lastRun: a.lastRun, config: a.config || {} })) };
}
function mail_saveAutomation(p, u) {
  const a = find_('Automations', 'id', p.id); need_(a, 'Automation not found.'); mailScope_(u, a.journal !== 'network' ? a.journal : null);
  const patch = { updated: now_() };
  if (p.enabled !== undefined) patch.enabled = !!p.enabled;
  if (p.everyDays !== undefined) patch.everyDays = Number(p.everyDays) || '';
  if (p.campaignId !== undefined) patch.campaignId = p.campaignId;
  if (p.endDate !== undefined) patch.endDate = p.endDate;
  if (p.config !== undefined) patch.config = p.config;
  if (patch.enabled && !a.nextRun && (a.type === 'digest' || a.type === 'recurring')) patch.nextRun = addDays_(0);
  if (a.type === 'recurring' && patch.enabled) need_(p.campaignId || a.campaignId, 'Choose the campaign to repeat.');
  update_('Automations', 'id', a.id, patch);
  return { ok: true };
}
function queueAuto_(journal, preset, subject, content, lists, delayMin) {
  const id = uid_('C');
  insert_('Campaigns', { id: id, journal: journal === 'network' ? '' : journal, name: '[auto] ' + subject, subject: subject, preheader: '', preset: preset, content: content, sender: 'noreply', audience: { lists: lists }, status: 'scheduled', scheduledAt: new Date(Date.now() + (delayMin || 0) * 60000).toISOString(), createdBy: 'automation', created: now_(), updated: now_(), stats: {} });
  return id;
}
/** Called when an article is published (after the site has had time to build). */
function onArticlePublished_(s) {
  if (!automationOn_(s.journal, 'new_article')) return;
  const a = all_('Automations').find(x => x.journal === s.journal && x.type === 'new_article'), j = journalRow_(s.journal);
  const lists = [s.journal].concat((a.config || {}).includeNetwork ? ['network'] : []);
  queueAuto_(s.journal, 'article', 'New in ' + j.code + ': ' + s.title, { heading: s.title, body: 'A new article has been published in ' + j.name + '.', articleUrl: articleUrl_(s), ctaUrl: articleUrl_(s), limit: 1 }, lists, 15);
}
function onIssuePublished_(journal, volume, issue, label) {
  if (!automationOn_(journal, 'new_issue')) return;
  const j = journalRow_(journal), a = all_('Automations').find(x => x.journal === journal && x.type === 'new_issue');
  queueAuto_(journal, 'issue', j.code + ' Volume ' + volume + ', Issue ' + issue + ' is out', { heading: 'Volume ' + volume + ', Issue ' + issue + (label ? ' · ' + label : ''), body: 'The new issue of ' + j.name + ' is now available, free to read.', volume: volume, issue: issue, ctaUrl: siteUrl_() + '/journals/' + journal + '/issue/' + volume + '/' + issue + '/', limit: 12 }, [journal].concat((a.config || {}).includeNetwork ? ['network'] : []), 15);
}
function automationsTick() {
  const today = today_();
  all_('Automations').forEach(a => {
    try {
      if (String(a.enabled) === 'false' || ['digest', 'recurring'].indexOf(a.type) < 0) return;
      if (a.endDate && String(a.endDate).slice(0, 10) < today) { update_('Automations', 'id', a.id, { enabled: false, updated: now_() }); return; }
      if (a.nextRun && String(a.nextRun).slice(0, 10) > today) return;
      const every = Number(a.everyDays) || 30;
      if (a.type === 'digest') {
        const since = a.lastRun ? String(a.lastRun).slice(0, 10) : addDays_(-every);
        const name = a.journal === 'network' ? 'ACRI Journals' : journalRow_(a.journal).code;
        const c = { journal: a.journal === 'network' ? '' : a.journal, preset: 'digest', content: { since: since, limit: 10 } };
        if (autoItems_(c).length) queueAuto_(a.journal, 'digest', 'New research from ' + name, { heading: 'New research from ' + name, body: 'Here are the articles published since ' + fmtD_(since) + '.', since: since, limit: 10 }, [a.journal], 0);
      }
      if (a.type === 'recurring' && a.campaignId) {
        const src = find_('Campaigns', 'id', a.campaignId);
        if (src) { const id = uid_('C'); insert_('Campaigns', { id: id, journal: src.journal, name: '[repeat] ' + src.name, subject: src.subject, preheader: src.preheader, preset: src.preset, content: src.content, sender: src.sender, audience: src.audience, status: 'scheduled', scheduledAt: now_(), createdBy: 'automation', created: now_(), updated: now_(), stats: {} }); }
      }
      update_('Automations', 'id', a.id, { lastRun: today, nextRun: addDays_(every) });
    } catch (e) { console.error('automation', a.id, e); }
  });
}

Object.assign(TEMPLATES, {
  subscribe: d => ['Please confirm your subscription', `<p>Please confirm that you would like to receive updates from <b>${esc_(d.list || 'ACRI Journals')}</b>: new articles, issues and calls for papers.</p>${btn_(d.link, 'Confirm subscription')}<p style="color:#5E6875;font-size:13px">If you did not sign up, ignore this email. You will not be subscribed.</p>`],
});
