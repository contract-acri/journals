/** Branded transactional emails, sent through ZeptoMail. Edit wording here. */

function emailShell_(accent, journalName, inner) {
  accent = accent || '#0B2545';
  return '<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#15191E">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F8;padding:28px 12px"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E2E5E9">' +
    '<tr><td style="background:#0B2545;padding:18px 28px"><table role="presentation" width="100%"><tr>' +
    '<td style="color:#fff;line-height:1"><span style="font-family:Georgia,\'Times New Roman\',serif;font-weight:700;font-size:21px;letter-spacing:.01em">ACRI</span><span style="display:inline-block;width:1px;height:16px;background:#6FCF97;margin:0 10px;vertical-align:-2px"></span><span style="font-family:Arial,sans-serif;font-weight:700;font-size:10px;letter-spacing:.34em">JOURNALS</span></td>' +
    '<td align="right" style="color:#C9D3E0;font-size:12px">' + (journalName || '') + '</td></tr></table></td></tr>' +
    '<tr><td style="height:4px;background:' + accent + '"></td></tr>' +
    '<tr><td style="padding:30px 28px 10px;font-size:15px;line-height:1.6">' + inner + '</td></tr>' +
    '<tr><td style="padding:18px 28px 26px;font-size:12px;color:#5E6875;border-top:1px solid #EEF0F3">' +
    'ACRI Journals · Part of ACRIVERSE · Ahmedabad, India<br><a href="' + siteUrl_() + '" style="color:#5E6875">' + siteUrl_().replace('https://', '') + '</a> · <a href="' + siteUrl_() + '/policies/privacy/" style="color:#5E6875">Privacy</a> · This message was sent by the ACRI Journals editorial system.</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function btn_(href, label, accent) { return '<p style="margin:22px 0"><a href="' + href + '" style="background:' + (accent || '#0B2545') + ';color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">' + label + '</a></p>'; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function quote_(s) { return '<div style="background:#F6F7F9;border-left:3px solid #C9CED5;padding:12px 16px;margin:14px 0;white-space:pre-wrap;font-size:14px">' + esc_(s) + '</div>'; }

const TEMPLATES = {
  verify: d => ['Verify your ACRI Journals account', `<p>Dear ${esc_(d.name)},</p><p>Welcome to ACRI Journals. Please confirm your email address to activate your account.</p>${btn_(d.link, 'Verify email')}<p style="color:#5E6875;font-size:13px">If you did not create this account, you can ignore this email.</p>`],
  reset: d => ['Reset your ACRI Journals password', `<p>Dear ${esc_(d.name)},</p><p>We received a request to reset your password. This link is valid for one hour.</p>${btn_(d.link, 'Choose a new password')}<p style="color:#5E6875;font-size:13px">If you did not ask for this, you can ignore this email.</p>`],
  submitted_author: d => [`Submission received: ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for submitting your manuscript to <b>${esc_(d.journal)}</b>.</p><p><b>Manuscript ID:</b> ${d.id}<br><b>Title:</b> ${esc_(d.title)}</p><p>The editorial office will run a technical check within about five working days. You can follow every stage in the author portal.</p>${btn_(d.link, 'View submission', d.accent)}<p>Please quote the manuscript ID in all correspondence.</p><p>Editorial Office<br>${esc_(d.journal)}</p>`],
  submitted_coauthor: d => [`You are listed as an author on ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>${esc_(d.submitter)} has submitted a manuscript to <b>${esc_(d.journal)}</b> listing you as a co-author.</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p>If you are not aware of this submission or did not agree to be an author, please reply to this email.</p>`],
  submitted_office: d => [`[${d.code}] New submission ${d.id}`, `<p>A new manuscript has been submitted to ${esc_(d.journal)}.</p><p><b>${d.id}</b> · ${esc_(d.type)}<br>${esc_(d.title)}<br>Submitted by ${esc_(d.name)}</p>${btn_(d.link, 'Open technical check', d.accent)}`],
  returned: d => [`Action needed: ${d.id} returned for corrections`, `<p>Dear ${esc_(d.name)},</p><p>The editorial office has checked your submission <b>${d.id}</b> and needs some corrections before it can go to the editor:</p>${quote_(d.note)}<p>Please make the changes and resubmit from the portal.</p>${btn_(d.link, 'Update submission', d.accent)}<p>Editorial Office<br>${esc_(d.journal)}</p>`],
  to_editor: d => [`[${d.code}] ${d.id} ready for editor screening`, `<p>Manuscript <b>${d.id}</b> has passed the technical check and is ready for screening.</p><p>${esc_(d.title)}</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  editor_assigned: d => [`[${d.code}] You are handling editor for ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>The Editor-in-Chief has assigned you as handling editor for:</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p>Please invite at least two reviewers from the portal.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  review_invite: d => [`Invitation to review for ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>You are invited to review the following manuscript for <b>${esc_(d.journal)}</b>:</p><p><b>${esc_(d.title)}</b><br><span style="color:#5E6875">${esc_(d.type)} · ${d.id}</span></p><p style="font-size:14px">${d.abstract}</p><p>If you accept, we ask for your report within <b>${d.days || CFG.REVIEW_DAYS} days</b>. The manuscript opens securely in the reviewer portal.</p>${btn_(d.accept, 'Accept invitation', d.accent)}<p><a href="${d.decline}" style="color:#5E6875">Decline invitation</a></p><p style="color:#5E6875;font-size:13px">Please decline if you have a conflict of interest. Manuscripts under review are confidential.</p>`],
  review_reminder: d => [`Reminder: review for ${d.id} is due ${d.due}`, `<p>Dear ${esc_(d.name)},</p><p>This is a friendly reminder that your review of <b>${esc_(d.title)}</b> (${d.id}) is due on <b>${d.due}</b>.</p>${btn_(d.link, 'Open review', d.accent)}<p>If you need more time, please reply to this email.</p>`],
  invite_reminder: d => [`Reminder: invitation to review ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>We have not yet heard whether you can review <b>${esc_(d.title)}</b> for ${esc_(d.journal)}.</p>${btn_(d.accept, 'Accept invitation', d.accent)}<p><a href="${d.decline}" style="color:#5E6875">Decline</a></p>`],
  review_thanks: d => [`Thank you for your review of ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>Thank you for reviewing <b>${esc_(d.title)}</b> for ${esc_(d.journal)}. We are grateful for your time and expertise. We will let you know the editor's decision.</p>`],
  review_in: d => [`[${d.code}] Review received for ${d.id} (${d.count})`, `<p>A review has been submitted for <b>${d.id}</b>. ${d.count} received.</p><p>Recommendation: <b>${esc_(d.rec)}</b></p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  reviewer_status: d => [`[${d.code}] Reviewer ${d.what} for ${d.id}`, `<p>${esc_(d.reviewer)} has ${d.what} the invitation to review <b>${d.id}</b>.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  decision: d => [`Decision on your manuscript ${d.id}`, `<p>Dear ${esc_(d.name)},</p><p>The editors of <b>${esc_(d.journal)}</b> have reached a decision on your manuscript:</p><p><b>${esc_(d.title)}</b> (${d.id})</p><p style="font-size:17px"><b>Decision: ${esc_(d.decision)}</b></p>${d.letter ? quote_(d.letter) : ''}${d.reviews || ''}${d.action ? btn_(d.link, d.action, d.accent) : btn_(d.link, 'View in portal', d.accent)}<p>${esc_(d.editor)}<br>${esc_(d.journal)}</p>`],
  decision_reviewer: d => [`Decision on ${d.id}, which you reviewed`, `<p>Dear ${esc_(d.name)},</p><p>Thank you again for reviewing <b>${esc_(d.title)}</b>. The editor's decision was: <b>${esc_(d.decision)}</b>. You can read the other reviewers' anonymised comments in the portal.</p>${btn_(d.link, 'View in portal', d.accent)}`],
  revision_in: d => [`[${d.code}] Revised manuscript received: ${d.id} (v${d.version})`, `<p>The authors have submitted revision ${d.version} of <b>${d.id}</b>.</p>${btn_(d.link, 'Open manuscript', d.accent)}`],
  accepted: d => [`Accepted: ${d.id}. Please upload final files`, `<p>Dear ${esc_(d.name)},</p><p>Congratulations! Your manuscript <b>${esc_(d.title)}</b> has been accepted for publication in <b>${esc_(d.journal)}</b>.</p>${d.doi ? `<p>Your article's DOI has been reserved: <b>${d.doi}</b>. It will become active when the article is published.</p>` : ''}<p>Please upload your final files within 7 days: the non-anonymised manuscript (.docx, using the ACRI Journals template) and each figure as a separate high-resolution file.</p>${btn_(d.link, 'Upload final files', d.accent)}`],
  final_in: d => [`[${d.code}] Final files received: ${d.id}`, `<p>The authors have uploaded final files for <b>${d.id}</b>. It is ready to send to production.</p>${btn_(d.link, 'Open production', d.accent)}`],
  proof: d => [`Proofs ready: ${d.id}. Please check within ${CFG.PROOF_DAYS} days`, `<p>Dear ${esc_(d.name)},</p><p>The proofs of your article <b>${esc_(d.title)}</b> are ready. Please check the web version and the PDF carefully: author names, affiliations, figures, tables and references.</p>${btn_(d.link, 'Review proofs', d.accent)}<p>Approve the proofs, or list your corrections, in the portal within ${CFG.PROOF_DAYS} days. Only corrections of errors can be accepted at this stage.</p>`],
  proof_response: d => [`[${d.code}] Proofs ${d.what}: ${d.id}`, `<p>The author has ${d.what} the proofs for <b>${d.id}</b>.</p>${d.note ? quote_(d.note) : ''}${btn_(d.link, 'Open production', d.accent)}`],
  published: d => [`Published: ${d.title}`, `<p>Dear ${esc_(d.name)},</p><p>Your article is now published in <b>${esc_(d.journal)}</b> and free to read.</p><p><b>${esc_(d.title)}</b><br>${d.doi ? 'DOI: <a href="https://doi.org/' + d.doi + '">' + d.doi + '</a>' : ''}</p>${btn_(d.url, 'Read your article', d.accent)}<p>Please share it widely. The article page has ready-made citations in every major style.</p>${d.certs ? '<p>Your <b>Certificate' + (d.certs > 1 ? 's' : '') + ' of Publication</b> ' + (d.certs > 1 ? 'are' : 'is') + ' attached, one for each author. You can download them again at any time from the author portal.</p>' : ''}`],
  role_granted: d => [`You have been added to ${d.journal}`, `<p>Dear ${esc_(d.name)},</p><p>You have been given the <b>${esc_(d.role)}</b> role for ${esc_(d.journal)} on ACRI Journals.</p>${btn_(d.link, 'Open the portal')}`],
  subscribe: d => ['Confirm your ACRI Journals subscription', `<p>Please confirm that you would like to receive new research from ACRI Journals.</p>${btn_(d.link, 'Confirm subscription')}<p style="color:#5E6875;font-size:13px">If you did not sign up, ignore this email.</p>`],
};

/** Which address each email comes from.
 *  system  → no.reply@journals.acriindia.org            (accounts, newsletter confirmations)
 *  journal → <slug>-no-reply@journals.acriindia.org     (notifications; replies go to controller@ — the journal office)
 *  editor  → editor@journals.acriindia.org              (decisions, reviewer correspondence, appointments; routed by the team) */
const SENDER = {
  verify: 'system', reset: 'system', subscribe: 'system', role_granted: 'system',
  returned: 'editor', review_invite: 'editor', review_reminder: 'editor', invite_reminder: 'editor', review_thanks: 'editor',
  decision: 'editor', decision_reviewer: 'editor', accepted: 'editor', editor_assigned: 'editor',
  appoint: 'editor', appoint_signed: 'editor', term_reminder: 'editor', term_ended: 'editor', appoint_declined: 'editor',
  partner_received: 'system', partner_approved: 'system', partner_rejected: 'system',
};
function senderFor_(key, j) {
  const cls = j ? (SENDER[key] || 'journal') : 'system';
  if (cls === 'editor') return { from: j.editorEmail, fromName: j.code + ' Editors', replyTo: j.editorEmail };
  if (cls === 'journal') return { from: j.noReplyEmail, fromName: j.code + ' · ' + j.name.slice(0, 40), replyTo: j.officeEmail };
  return { from: systemFrom_(), fromName: CFG.APP, replyTo: controllerEmail_() };
}
/** Render + send. ctx.journal (slug) picks the journal's sender addresses and accent colour. */
function mailTemplate_(key, to, data, ctx) {
  ctx = ctx || {};
  const j = ctx.journal ? journalRow_(ctx.journal) : null;
  data.accent = data.accent || (j ? j.accent : '#0B2545');
  const [subject, inner] = TEMPLATES[key](data);
  const snd = senderFor_(key, j);
  sendMail_(to, subject, emailShell_(data.accent, j ? j.name : '', inner), Object.assign(snd, { cc: ctx.cc, attachments: ctx.attachments }));
}
