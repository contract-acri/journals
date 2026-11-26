/** Contact messages for the journal office (controller) and Editors-in-Chief.
 *  Sent from the website's contact form, stored in the "Messages" sheet and handled in the portal
 *  (Admin → Messages). They are NOT emailed to the office or the EIC. Only the reply to the sender goes by email. */

const MSG_TO = { office: 'Journal office', eic: 'Editor-in-Chief' };

function public_contact(p) {
  if (String(p.website || '').trim()) return { ok: true, ref: 'MSG' }; // spam trap
  const email = normEmail_(p.email), name = String(p.name || '').trim(), subject = String(p.subject || '').trim(), body = String(p.body || '').trim();
  need_(name.length >= 2, 'Please enter your name.');
  need_(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Please enter a valid email address.');
  need_(subject.length >= 3, 'Please add a subject.');
  need_(body.length >= 10, 'Please write your message.');
  const journal = String(p.journal || '');
  if (journal) need_(find_('Journals', 'slug', journal), 'Unknown journal.');
  const c = CacheService.getScriptCache(), k = 'CT:' + email, n = Number(c.get(k) || 0);
  need_(n < 5, 'You have sent several messages in a short time. Please wait an hour and try again.');
  c.put(k, String(n + 1), 3600);
  const id = 'MSG-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd') + '-' + uid_().slice(0, 5).toUpperCase();
  insert_('Messages', { id: id, journal: journal, to: MSG_TO[p.to] ? p.to : 'office', name: name.slice(0, 120), email: email, role: String(p.role || '').slice(0, 40), msId: String(p.msId || '').trim().slice(0, 40),
    subject: subject.slice(0, 200), body: body.slice(0, 5000), status: 'new', created: now_(), meta: String(p.page || '').slice(0, 200) });
  return { ok: true, ref: id };
}

/** Who sees which messages: admins (the journal office / controller) see everything;
 *  an Editor-in-Chief sees messages addressed to the EIC of their own journal(s). */
function canSeeMsg_(u, m) { return isAdmin_(u) || (m.to === 'eic' && m.journal && isLead_(u, m.journal)); }
function msgView_(m) { const o = Object.assign({}, m); delete o._row; o.toLabel = MSG_TO[m.to] || m.to; return o; }

function msg_list(p, u) {
  need_(isAdmin_(u) || anyEic_(u), 'Not allowed.');
  const items = all_('Messages').filter(m => canSeeMsg_(u, m) && (!p.status || (p.status === 'open' ? m.status !== 'closed' : m.status === p.status)) && (!p.journal || m.journal === p.journal));
  return { ok: true, items: items.map(msgView_).reverse(), unread: items.filter(m => m.status === 'new').length };
}
function msg_count_(u) {
  if (!(isAdmin_(u) || anyEic_(u))) return 0;
  try { return all_('Messages').filter(m => m.status === 'new' && canSeeMsg_(u, m)).length; } catch (e) { return 0; }
}

/** op: read | close | reopen | note | reply | forward (office → EIC) */
function msg_update(p, u) {
  const m = find_('Messages', 'id', p.id); need_(m && canSeeMsg_(u, m), 'Message not found.');
  const patch = {};
  if (p.op === 'read' && m.status === 'new') Object.assign(patch, { status: 'read', readAt: now_(), readBy: u.email });
  if (p.op === 'close') patch.status = 'closed';
  if (p.op === 'reopen') patch.status = 'read';
  if (p.op === 'note') patch.note = String(p.note || '').slice(0, 2000);
  if (p.op === 'forward') { need_(isAdmin_(u) && m.journal, 'Choose a journal for this message first.'); Object.assign(patch, { to: 'eic', status: 'new', note: ((m.note || '') + '\n[' + today_() + '] Passed to the Editor-in-Chief by ' + u.email).trim() }); }
  if (p.op === 'journal') { need_(isAdmin_(u), 'Not allowed.'); patch.journal = p.journal || ''; }
  if (p.op === 'reply') {
    const text = String(p.reply || '').trim(); need_(text.length >= 5, 'Write your reply.');
    const j = m.journal ? journalRow_(m.journal) : null;
    const who = m.to === 'eic' ? 'Editor-in-Chief' + (j ? ', ' + j.name : '') : 'Editorial Office' + (j ? ', ' + j.name : ', ACRI Journals');
    const inner = '<p>Dear ' + esc_(m.name) + ',</p>' + quote_(text).replace('background:#F6F7F9;border-left:3px solid #C9CED5', 'background:#fff;border-left:3px solid ' + ((j && j.accent) || '#0B2545')) +
      '<p>' + esc_(who) + '</p><hr style="border:0;border-top:1px solid #EEF0F3;margin:22px 0"><p style="color:#5E6875;font-size:13px">Your message (' + m.id + ', ' + fmtD_(m.created) + '):<br><b>' + esc_(m.subject) + '</b></p>' + quote_(m.body) +
      '<p style="color:#5E6875;font-size:13px">To write again, please use the <a href="' + siteUrl_() + '/contact/' + (m.journal ? '?journal=' + m.journal : '') + '">contact form</a> and quote ' + m.id + '.</p>';
    const snd = m.to === 'eic' && j ? { from: j.editorEmail, fromName: j.code + ' Editor-in-Chief', replyTo: j.editorEmail } : j ? { from: j.noReplyEmail, fromName: j.code + ' Editorial Office', replyTo: j.officeEmail } : { from: systemFrom_(), fromName: 'ACRI Journals', replyTo: controllerEmail_() };
    sendMail_(m.email, 'Re: ' + m.subject + ' [' + m.id + ']', emailShell_(j ? j.accent : '', j ? j.name : '', inner), snd);
    Object.assign(patch, { reply: ((m.reply ? m.reply + '\n\n---\n' : '') + '[' + now_() + ' ' + u.email + ']\n' + text), repliedAt: now_(), repliedBy: u.email, status: p.close ? 'closed' : 'replied' });
  }
  if (Object.keys(patch).length) update_('Messages', 'id', m.id, patch);
  return { ok: true };
}
