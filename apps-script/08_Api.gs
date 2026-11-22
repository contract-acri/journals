/** HTTP entry points. The portal sends POST with Content-Type text/plain (no CORS preflight). */

const PUBLIC = {
  'public.journals': public_journals, 'public.subscribe': public_subscribe,
  'auth.register': auth_register, 'auth.verify': auth_verify, 'auth.login': auth_login, 'auth.forgot': auth_forgot, 'auth.reset': auth_reset,
  // Reviewer actions are authorised by the secret token in their invitation link.
  'rev.get': rev_get, 'rev.respond': rev_respond, 'rev.file': rev_file, 'rev.save': rev_save,
  // Editors sign their agreement from the emailed link; email preference centre; partner applications.
  'agreement.get': agreement_get, 'agreement.sign': agreement_sign, 'agreement.decline': agreement_decline,
  'public.emailPrefs': public_emailPrefs, 'public.partnerApply': public_partnerApply,
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
    if (m === 'AUTH') return json_({ ok: false, auth: false, error: 'Your session has expired. Please sign in again.' });
    console.error(p.action, m, err && err.stack);
    return json_({ ok: false, error: m });
  }
}
function doGet(e) {
  if (e && e.parameter && e.parameter.lu) { oneClickUnsub_(e.parameter.lu); return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">You have been unsubscribed. <a href="' + portalUrl_('email?t=' + encodeURIComponent(e.parameter.lu)) + '" target="_top">Manage email preferences</a></p>'); }
  return json_({ ok: true, service: CFG.APP + ' EMS', time: now_() });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
