/** Accounts, sessions and roles. One account works across all journals.
 *  roles JSON: { admin: true, eic: ["ijbmrs"], board: ["ijbmrs","ijelf"] }  (author is implicit) */

function hashPw_(pw, salt) {
  let bytes = Utilities.newBlob(salt + '::' + pw).getBytes();
  for (let i = 0; i < 1000; i++) bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  return Utilities.base64Encode(bytes);
}
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function publicUser_(u) {
  if (!u) return null;
  if (u.roles && !Array.isArray(u.roles.senior)) { try { u = Object.assign({}, u, { roles: effectiveRoles_(u) }); } catch (e) { } }
  return { id: u.id, email: u.email, given: u.given, family: u.family, name: (u.given + ' ' + u.family).trim(), degrees: u.degrees, affiliation: u.affiliation, country: u.country, orcid: u.orcid, phone: u.phone, reviewer: String(u.reviewer) === 'true' || u.reviewer === true, subjects: u.subjects || [], designation: u.designation || '', department: u.department || '', instAddress: u.instAddress || '', profileUrl: u.profileUrl || '', instEmail: u.instEmail || '', reviewDays: Number(u.reviewDays) || 21, reviewMax: Number(u.reviewMax) || 2, reviewPauseUntil: u.reviewPauseUntil ? String(u.reviewPauseUntil).slice(0, 10) : '', reviewNote: u.reviewNote || '', hasSignature: !!u.signatureFileId, roles: u.roles || {}, verified: String(u.verified) === 'true' || u.verified === true };
}
function nameOf_(u) { return u ? (u.given + ' ' + u.family).trim() : ''; }

function auth_register(p) {
  const email = normEmail_(p.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (!p.password || p.password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (!p.given || !p.family) throw new Error('Please enter your first and last name.');
  return withLock_(() => {
    if (find_('Users', 'email', email)) throw new Error('An account with this email already exists. Sign in or reset your password.');
    const salt = token_().slice(0, 16), vt = token_();
    const admins = prop_('ADMIN_EMAILS', '').split(',').map(normEmail_);
    const u = {
      id: uid_('U'), email: email, given: p.given.trim(), family: p.family.trim(), degrees: p.degrees || '', affiliation: p.affiliation || '', country: p.country || 'India', orcid: (p.orcid || '').replace(/^https?:\/\/orcid.org\//, ''),
      phone: p.phone || '', passHash: hashPw_(p.password, salt), salt: salt, verified: false, verifyToken: vt, reviewer: !!p.reviewer, subjects: p.subjects || [],
      roles: admins.indexOf(email) >= 0 ? { admin: true } : {}, status: 'active', created: now_(),
    };
    insert_('Users', u);
    mailTemplate_('verify', u.email, { name: u.given, link: portalUrl_('verify?token=' + vt) });
    return { ok: true, message: 'Account created. We have sent a verification link to ' + email + '.' };
  });
}

function auth_verify(p) {
  const u = find_('Users', 'verifyToken', p.token);
  if (!u || !p.token) throw new Error('This verification link is invalid or has already been used.');
  update_('Users', 'id', u.id, { verified: true, verifyToken: '' });
  return { ok: true, message: 'Email verified. You can now sign in.' };
}

function auth_login(p) {
  const u = find_('Users', 'email', normEmail_(p.email));
  if (!u || hashPw_(p.password || '', u.salt) !== u.passHash) throw new Error('Incorrect email or password.');
  if (u.status === 'disabled') throw new Error('This account has been disabled. Contact the editorial office.');
  if (!(String(u.verified) === 'true' || u.verified === true)) {
    mailTemplate_('verify', u.email, { name: u.given, link: portalUrl_('verify?token=' + (u.verifyToken || '')) });
    throw new Error('Please verify your email first. We have sent the link again.');
  }
  const t = token_();
  const exp = new Date(Date.now() + CFG.SESSION_HOURS * 3600e3).toISOString();
  insert_('Sessions', { token: t, userId: u.id, expires: exp, created: now_() });
  CacheService.getScriptCache().put('S:' + t, u.id, 21600);
  update_('Users', 'id', u.id, { lastLogin: now_() });
  return { ok: true, token: t, user: publicUser_(u) };
}

function auth_logout(p) {
  CacheService.getScriptCache().remove('S:' + p.token);
  try { remove_('Sessions', 'token', p.token); } catch (e) { }
  return { ok: true };
}

function auth_forgot(p) {
  const u = find_('Users', 'email', normEmail_(p.email));
  if (u) {
    const t = token_();
    update_('Users', 'id', u.id, { resetToken: t, resetExpires: new Date(Date.now() + 3600e3).toISOString() });
    mailTemplate_('reset', u.email, { name: u.given, link: portalUrl_('reset?token=' + t) });
  }
  return { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
}

function auth_reset(p) {
  const u = find_('Users', 'resetToken', p.token);
  if (!u || !p.token || new Date(u.resetExpires) < new Date()) throw new Error('This reset link has expired. Request a new one.');
  if (!p.password || p.password.length < 8) throw new Error('Password must be at least 8 characters.');
  const salt = token_().slice(0, 16);
  update_('Users', 'id', u.id, { passHash: hashPw_(p.password, salt), salt: salt, resetToken: '', resetExpires: '', verified: true });
  return { ok: true, message: 'Password updated. Please sign in.' };
}

/** Resolve the session token → user row, or throw. */
function session_(token) {
  if (!token) throw new Error('AUTH');
  const c = CacheService.getScriptCache();
  let uid = c.get('S:' + token);
  if (!uid) {
    const s = find_('Sessions', 'token', token);
    if (!s || new Date(s.expires) < new Date()) throw new Error('AUTH');
    uid = s.userId; c.put('S:' + token, uid, 21600);
  }
  const u = find_('Users', 'id', uid);
  if (!u || u.status === 'disabled') throw new Error('AUTH');
  u.roles = effectiveRoles_(u);
  return u;
}

/** Editorial roles come ONLY from active, signed, in-term appointments. Admin is a user flag. */
function effectiveRoles_(u) {
  const r = { admin: !!(u.roles && u.roles.admin), eic: [], senior: [], editor: [], board: [] };
  const today = today_();
  all_('Appointments').forEach(a => {
    if (a.userId !== u.id || a.status !== 'active') return;
    if (a.start && String(a.start).slice(0, 10) > today) return;
    if (a.end && String(a.end).slice(0, 10) < today) return;
    if (r[a.role] && r[a.role].indexOf(a.journal) < 0) r[a.role].push(a.journal);
  });
  return r;
}
function isAdmin_(u) { return !!(u.roles && u.roles.admin); }
function isEic_(u, j) { return isAdmin_(u) || ((u.roles.eic || []).indexOf(j) >= 0); }
function isSenior_(u, j) { return isEic_(u, j) || ((u.roles.senior || []).indexOf(j) >= 0); }
function isBoard_(u, j) { return isSenior_(u, j) || ((u.roles.editor || []).indexOf(j) >= 0) || ((u.roles.board || []).indexOf(j) >= 0); }
function need_(cond, msg) { if (!cond) throw new Error(msg || 'You do not have permission to do this.'); }

function auth_me(p, u) {
  const out = publicUser_(u);
  out.pendingAgreements = where_('Appointments', a => a.userId === u.id && a.status === 'pending').map(a => ({ id: a.id, token: a.token, journal: a.journal, role: a.role }));
  return { ok: true, user: out };
}

function auth_profile(p, u) {
  const patch = {};
  ['given', 'family', 'degrees', 'affiliation', 'country', 'phone', 'designation', 'department', 'instAddress', 'profileUrl', 'instEmail'].forEach(k => { if (p[k] !== undefined) patch[k] = String(p[k]).trim(); });
  if (p.orcid !== undefined) patch.orcid = String(p.orcid).replace(/^https?:\/\/orcid.org\//, '').trim();
  if (p.reviewer !== undefined) patch.reviewer = !!p.reviewer;
  Object.assign(patch, reviewPrefs_(p));
  if (p.subjects !== undefined) patch.subjects = p.subjects;
  if (p.newPassword) {
    need_(hashPw_(p.currentPassword || '', u.salt) === u.passHash, 'Your current password is incorrect.');
    need_(p.newPassword.length >= 8, 'Password must be at least 8 characters.');
    patch.salt = token_().slice(0, 16); patch.passHash = hashPw_(p.newPassword, patch.salt);
  }
  return { ok: true, user: publicUser_(update_('Users', 'id', u.id, patch)) };
}
