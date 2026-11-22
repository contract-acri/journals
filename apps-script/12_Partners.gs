/** Partner registration: public application → admin approval → listed on /partners/. */

const PARTNER_TYPES = ['Academic partner', 'Indexing & archiving partner', 'Institutional partner', 'Industry partner', 'Media partner', 'Professional body'];

function public_partnerApply(p) {
  need_(p.name && p.contactName && /@/.test(p.contactEmail || ''), 'Please fill in the organisation name, contact person and email.');
  need_(p.agree === true, 'Please accept the partnership policy.');
  const rec = insert_('Partners', { id: uid_('P'), name: String(p.name).trim(), type: PARTNER_TYPES.indexOf(p.type) >= 0 ? p.type : PARTNER_TYPES[0], url: p.url || '', logoUrl: p.logoUrl || '', country: p.country || '', description: String(p.description || '').slice(0, 600),
    contactName: p.contactName, contactEmail: normEmail_(p.contactEmail), contactPhone: p.contactPhone || '', journals: p.journals || [], message: String(p.message || '').slice(0, 2000), status: 'pending', showOnSite: true, order: '', created: now_() });
  mailTemplate_('partner_received', rec.contactEmail, { name: p.contactName, org: rec.name });
  sendMail_(journalStaff_('', 'admin').map(x => x.email), 'New partner application: ' + rec.name, emailShell_('', '', '<p><b>' + esc_(rec.name) + '</b> (' + esc_(rec.type) + ') has applied to partner with ACRI Journals.</p>' + quote_(rec.message || rec.description) + btn_(portalUrl_('admin/partners'), 'Review application')));
  return { ok: true, message: 'Thank you. Your application has been received, and we will reply by email.' };
}

function partner_list(p, u) { need_(isAdmin_(u)); return { ok: true, types: PARTNER_TYPES, items: all_('Partners').map(x => { delete x._row; return x; }).reverse() }; }

function partner_save(p, u) {
  need_(isAdmin_(u));
  const x = p.partner || {}; need_(x.name, 'Name is required.');
  let rec = x.id ? find_('Partners', 'id', x.id) : null;
  const patch = {};
  ['name', 'type', 'url', 'logoUrl', 'country', 'description', 'contactName', 'contactEmail', 'contactPhone', 'order', 'note'].forEach(k => { if (x[k] !== undefined) patch[k] = x[k]; });
  if (x.showOnSite !== undefined) patch.showOnSite = !!x.showOnSite;
  if (x.journals !== undefined) patch.journals = x.journals;
  const prevStatus = rec ? rec.status : '';
  if (x.status) { patch.status = x.status; if (x.status !== prevStatus) { patch.decidedAt = now_(); patch.decidedBy = u.email; } }
  if (rec) rec = update_('Partners', 'id', rec.id, patch);
  else rec = insert_('Partners', Object.assign({ id: uid_('P'), status: 'approved', showOnSite: true, created: now_(), decidedAt: now_(), decidedBy: u.email }, patch));
  if (x.status && x.status !== prevStatus && rec.contactEmail && (x.status === 'approved' || x.status === 'rejected') && x.notify !== false)
    mailTemplate_(x.status === 'approved' ? 'partner_approved' : 'partner_rejected', rec.contactEmail, { name: rec.contactName || rec.name, org: rec.name, note: x.note || '' });
  publishPartners_();
  return { ok: true };
}
function publishPartners_() {
  if (!prop_('GITHUB_TOKEN')) return;
  const list = all_('Partners').filter(x => x.status === 'approved' && String(x.showOnSite) !== 'false')
    .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99))
    .map(x => ({ name: x.name, type: x.type, url: x.url, logoUrl: x.logoUrl, country: x.country, description: x.description, journals: x.journals || [], since: String(x.decidedAt || x.created).slice(0, 4) }));
  ghCommit_([{ path: 'content/partners.json', text: JSON.stringify(list, null, 2) }], 'Partners updated');
}

Object.assign(TEMPLATES, {
  partner_received: d => ['We have received your partnership application', `<p>Dear ${esc_(d.name)},</p><p>Thank you for applying to partner with ACRI Journals on behalf of <b>${esc_(d.org)}</b>. Our team will review the application and reply within 15 working days.</p><p>You can read our <a href="${siteUrl_()}/policies/partners/">partnership policy</a> in the meantime.</p>`],
  partner_approved: d => ['Welcome, ACRI Journals partner', `<p>Dear ${esc_(d.name)},</p><p>We are delighted to confirm <b>${esc_(d.org)}</b> as a partner of ACRI Journals. Your organisation will be listed on our <a href="${siteUrl_()}/partners/">Partners page</a>.</p>${d.note ? quote_(d.note) : ''}<p>We look forward to working together.</p>`],
  partner_rejected: d => ['Your partnership application', `<p>Dear ${esc_(d.name)},</p><p>Thank you for your interest in partnering with ACRI Journals. After careful consideration, we are unable to take forward the application from <b>${esc_(d.org)}</b> at this time.</p>${d.note ? quote_(d.note) : ''}<p>We wish you every success.</p>`],
});
