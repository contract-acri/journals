/** HTTP entry points. The portal sends POST with Content-Type text/plain (no CORS preflight). */

const PUBLIC = {
  'public.journals': public_journals, 'public.subscribe': public_subscribe,
  'auth.register': auth_register, 'auth.verify': auth_verify, 'auth.login': auth_login, 'auth.forgot': auth_forgot, 'auth.reset': auth_reset,
  // Reviewer actions are authorised by the secret token in their invitation link.
  'rev.get': rev_get, 'rev.respond': rev_respond, 'rev.file': rev_file, 'rev.save': rev_save,
  // Editors sign their agreement from the emailed link; email preference centre; partner applications.
  'agreement.get': agreement_get, 'agreement.sign': agreement_sign, 'agreement.decline': agreement_decline,
  'public.emailPrefs': public_emailPrefs, 'public.partnerApply': public_partnerApply, 'public.contact': public_contact,
};
const PRIVATE = {
  'auth.logout': (p, u) => auth_logout(p), 'auth.me': auth_me, 'auth.profile': auth_profile,
  'dash': dash,
  'sub.save': sub_save, 'sub.upload': sub_upload, 'sub.removeFile': sub_removeFile, 'sub.submit': sub_submit, 'sub.withdraw': sub_withdraw,
  'sub.final': sub_finalSubmit, 'sub.proof': sub_proofRespond, 'sub.list': sub_list, 'sub.get': sub_get, 'file.get': file_get,
  'ed.tech': ed_techCheck, 'ed.assign': ed_assign, 'ed.invite': ed_inviteReviewer, 'ed.review': ed_reviewAction, 'ed.note': ed_note, 'ed.decide': ed_decide,
  'prod.send': prod_send, 'prod.check': prod_check, 'prod.source': prod_source, 'prod.saveSource': prod_saveSource, 'prod.publish': prod_publish,
  'prod.doi': prod_registerDoi, 'prod.reserve': prod_reserveDoi,
  'adm.overview': adm_overview, 'adm.subs': adm_allSubs, 'adm.users': adm_users, 'adm.roles': adm_setRoles, 'adm.journals': adm_journals,
  'adm.saveJournal': adm_saveJournal, 'adm.saveIssue': adm_saveIssue, 'adm.testEmail': adm_testEmail, 'adm.rebuild': adm_rebuild,
  'team.list': team_list, 'team.appoint': team_appoint, 'team.resend': team_resend, 'team.update': team_update, 'team.end': team_end, 'team.renew': team_renew, 'team.file': team_file,
  'mail.lists': mail_lists, 'mail.contacts': mail_contacts, 'mail.import': mail_import, 'mail.setContact': mail_setContact,
  'mail.campaigns': mail_campaigns, 'mail.save': mail_saveCampaign, 'mail.preview': mail_preview, 'mail.test': mail_test, 'mail.audience': mail_audience,
  'mail.send': mail_send, 'mail.stop': mail_stop, 'mail.duplicate': mail_duplicate, 'mail.automations': mail_automations, 'mail.saveAutomation': mail_saveAutomation,
  'msg.list': msg_list, 'msg.update': msg_update, 'err.list': err_list, 'set.get': set_get, 'set.save': set_save, 'set.test': set_test,
  'sig.list': sig_list, 'sig.save': sig_save, 'letter.preview': letter_preview, 'letter.create': letter_create, 'letter.list': letter_list, 'letter.file': letter_file,
  'team.import': team_import, 'rec.submit': rec_submit, 'rec.list': rec_list, 'rec.update': rec_update, 'me.signature': me_signature, 'me.tools': me_tools, 'me.photo': me_photo,
  'cert.get': cert_get, 'cert.reset': cert_reset, 'mail.compose': mail_compose, 'mail.sent': mail_sent,
  'partner.list': partner_list, 'partner.save': partner_save,
  'idx.readiness': idx_readiness, 'idx.tick': idx_tick, 'idx.pack': idx_issnPack, 'idx.stage': idx_issnStage, 'adm.logo': adm_logo,
  'bi.list': bi_list, 'bi.get': bi_get, 'bi.save': bi_save, 'bi.bulk': bi_bulk, 'bi.doi': bi_registerDoi,
};

function doPost(e) {
  let p = {};
  // RFC 8058 one-click unsubscribe from mail clients: POST <exec>?lu=<token>
  if (e && e.parameter && e.parameter.lu) { try { oneClickUnsub_(e.parameter.lu); } catch (x) { } return json_({ ok: true }); }
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const a = p.action;
    if (PUBLIC[a]) return json_(PUBLIC[a](p));
    if (PRIVATE[a]) { const u = session_(p.token); return json_(PRIVATE[a](p, u)); }
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    const m = String(err && err.message || err);
    if (m === 'AUTH') return json_({ ok: false, auth: false, code: 'AES-AUTH-401', error: 'Your session has expired. Please sign in again.' });
    const code = aesCode_(m), ref = 'E' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd') + '-' + uid_().slice(0, 5).toUpperCase();
    console.error(code, ref, p.action, m, err && err.stack);
    // User mistakes (forms, permissions) are not logged; system faults are, so admins can trace them by reference.
    if (!/^AES-(VAL|AUTH|LINK)-/.test(code)) { try { insert_('Errors', { ref: ref, ts: now_(), code: code, action: p.action || '', message: m.slice(0, 500), user: (p.token ? 'signed-in' : 'public'), detail: String(err && err.stack || '').slice(0, 1500) }); } catch (e) { } }
    return json_({ ok: false, error: m, code: code, ref: ref });
  }
}
/** Map an error message to an AES error code (catalogue: /aes/errors/ on the website). */
function aesCode_(m) {
  const R = [
    [/Incorrect email or password/i, 'AES-AUTH-410'], [/verify your email/i, 'AES-AUTH-412'],
    [/expired on|link (has )?expired|reset link has expired/i, 'AES-LINK-410'], [/link is invalid|invalid or has|already been used|has been replaced/i, 'AES-LINK-404'],
    [/GitHub 401|GitHub 403|Bad credentials/i, 'AES-GH-401'], [/GitHub 404/i, 'AES-GH-404'], [/GitHub (409|422)/i, 'AES-GH-409'], [/GitHub \d{3}/i, 'AES-GH-500'],
    [/Zenodo (401|403)/i, 'AES-ZEN-401'], [/Zenodo (400|422)/i, 'AES-ZEN-400'], [/Zenodo 404|PDF could not be found/i, 'AES-ZEN-404'], [/Zenodo/i, 'AES-ZEN-500'],
    [/not live yet|wait for the (website )?build|site build/i, 'AES-SITE-424'],
    [/ZeptoMail 401|BREVO_KEY|ZEPTO_TOKEN|unauthori[sz]ed/i, 'AES-MAIL-401'], [/ZeptoMail 4\d\d|sender|not verified/i, 'AES-MAIL-422'], [/daily (email )?(quota|limit)|Service invoked too many times for one day: email/i, 'AES-MAIL-429'],
    [/Missing sheet/i, 'AES-SHEET-404'], [/No item with the given ID|DriveApp|Access denied: Drive/i, 'AES-DRIVE-404'],
    [/too many times|timed out|Exceeded maximum execution|Lock|Service (Spreadsheets|unavailable)|try again later/i, 'AES-SRV-429'],
    [/permission|not allowed|admins only|only (an |the )?(admin|editor|editorial)|editorial office only|not your/i, 'AES-AUTH-403'],
    [/can no longer|already (submitted|signed|invited|responded)|not awaiting|is not (sending|active|open)|only drafts|at this stage|cannot be (edited|withdrawn|changed)/i, 'AES-VAL-409'],
    [/^(please|enter|choose|add|write|upload|set|check|this |the |name|title|journal|slug|code|password|article id|repository|.+ (is|are) (required|not valid|too large))/i, 'AES-VAL-422'],
  ];
  for (const [re, c] of R) if (re.test(m)) return c;
  return 'AES-SYS-500';
}
function err_list(p, u) { need_(isAdmin_(u), 'Admins only.'); return { ok: true, items: all_('Errors').map(x => { delete x._row; return x; }).reverse().slice(0, 100) }; }
function doGet(e) {
  if (e && e.parameter && e.parameter.lu) { oneClickUnsub_(e.parameter.lu); return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">You have been unsubscribed. <a href="' + portalUrl_('email?t=' + encodeURIComponent(e.parameter.lu)) + '" target="_top">Manage email preferences</a></p>'); }
  return json_({ ok: true, service: AES.NAME + ' · ' + AES.FULL, version: AES.VERSION, time: now_() });
}
function json_(o) { o.aes = AES.VERSION; return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
