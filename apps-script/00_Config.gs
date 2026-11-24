/**
 * ACRI Journals — Editorial Management System (Apps Script backend)
 * ------------------------------------------------------------------
 * Bound to the "ACRI Journals — EMS" Google Sheet. Deployed as a Web App
 * (Execute as: Me, Who has access: Anyone). The static site and portal call it
 * with fetch(POST, text/plain JSON). Secrets live in Script Properties, never in code.
 *
 * Script Properties (Project Settings → Script properties):
 *   GITHUB_TOKEN      fine-grained PAT with Contents: Read & write on the repo
 *   GITHUB_REPO       e.g.  acri-india/acri-journals
 *   GITHUB_BRANCH     main
 *   ZEPTO_TOKEN       ZeptoMail "Send Mail" token (with or without the "Zoho-enczapikey " prefix)
 *   ZEPTO_HOST        api.zeptomail.in   (India data centre; use api.zeptomail.com for US)
 *   ZENODO_TOKEN      Zenodo personal access token (scopes: deposit:write, deposit:actions)
 *   ZENODO_SANDBOX    true while testing (uses sandbox.zenodo.org), false in production
 *   SITE_URL          https://acriindia.org.in
 *   DRIVE_ROOT_ID     ID of the Drive folder that stores manuscript files
 *   MAIL_DOMAIN       journals.acriindia.org   (verified in ZeptoMail AND the campaign provider)
 *   SYSTEM_FROM       no.reply@journals.acriindia.org
 *   CAMPAIGN_PROVIDER zepto | brevo             (zepto: campaigns via ZeptoMail. Note ZeptoMail's terms bar bulk/marketing mail)
 *   ZEPTO_CAMPAIGN_TOKEN  optional Send Mail token of a SEPARATE ZeptoMail agent for campaigns (else ZEPTO_TOKEN)
 *   BREVO_KEY         Brevo API key (v3), only if CAMPAIGN_PROVIDER = brevo
 */

/** AES: the ACRI Editorial System. Bump the version with every code update. */
const AES = { NAME: 'AES', FULL: 'ACRI Editorial System', VERSION: '2.0.0' };

const CFG = {
  APP: 'ACRI Journals',
  PUBLISHER: 'ACRI Journals',
  LEGAL_ENTITY: 'Ahmedabad Centre for Research and Innovation',
  SESSION_HOURS: 12,
  REVIEW_DAYS: 21,
  INVITE_DAYS: 5,
  PROOF_DAYS: 3,
  MAX_UPLOAD_MB: 25,
  PBKDF_ROUNDS: 2000,
};

function prop_(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v === null || v === '' ? (d === undefined ? '' : d) : v; }
function siteUrl_() { return prop_('SITE_URL', 'https://acriindia.org.in').replace(/\/$/, ''); }
function mailDomain_() { return prop_('MAIL_DOMAIN', 'journals.acriindia.org'); }
function editorsEmail_() { return prop_('EDITORS_EMAIL', 'editor@' + mailDomain_()); }
function controllerEmail_() { return prop_('CONTROLLER_EMAIL', 'controller@' + mailDomain_()); }
function systemFrom_() { return prop_('SYSTEM_FROM', 'no.reply@' + mailDomain_()); }
function portalUrl_(hash) { return siteUrl_() + '/portal/' + (hash ? '#/' + hash : ''); }

/** Sheet schema. Columns are created by setup(); add new columns at the END only. */
const SCHEMA = {
  Users: ['id', 'email', 'given', 'family', 'degrees', 'affiliation', 'country', 'orcid', 'phone', 'passHash', 'salt', 'verified', 'verifyToken', 'resetToken', 'resetExpires', 'reviewer', 'subjects', 'roles', 'status', 'created', 'lastLogin', 'designation', 'department', 'instAddress', 'profileUrl', 'instEmail', 'reviewDays', 'reviewMax', 'reviewPauseUntil', 'reviewNote', 'signatureFileId', 'photo', 'bio', 'pageSlug', 'scholarUrl', 'linkedinUrl', 'website', 'showEmail', 'pageOff'],
  Sessions: ['token', 'userId', 'expires', 'created'],
  Journals: ['slug', 'code', 'name', 'fromEmail', 'fromName', 'eicEmail', 'active', 'json', 'updated'],
  Submissions: ['id', 'journal', 'year', 'serial', 'status', 'type', 'subject', 'title', 'subtitle', 'abstract', 'keywords', 'authors', 'affiliations', 'declarations', 'coverLetter', 'submitterId', 'editorId', 'version', 'created', 'updated', 'submittedAt', 'decision', 'decisionAt', 'acceptedAt', 'doi', 'zenodoId', 'previewToken', 'volume', 'issue', 'published', 'flags'],
  Files: ['id', 'subId', 'version', 'kind', 'name', 'mime', 'size', 'driveId', 'pdfId', 'uploadedBy', 'created', 'active'],
  Reviews: ['id', 'subId', 'version', 'reviewerId', 'number', 'status', 'invitedBy', 'invitedAt', 'respondedAt', 'due', 'submittedAt', 'scores', 'recommendation', 'toAuthor', 'toEditor', 'reminders', 'token'],
  Activity: ['ts', 'subId', 'userId', 'action', 'detail', 'author'],
  Issues: ['journal', 'volume', 'issue', 'year', 'label', 'title', 'status', 'pdf'],
  Subscribers: ['email', 'status', 'token', 'journals', 'created'],
  EmailLog: ['ts', 'to', 'subject', 'status', 'detail'],
  Appointments: ['id', 'userId', 'journal', 'role', 'title', 'start', 'end', 'status', 'token', 'agreementVersion', 'signedAt', 'signedName', 'signMeta', 'agreementFileId', 'showOnSite', 'order', 'reminded', 'endedAt', 'endReason', 'certificateFileId', 'renewalOf', 'createdBy', 'created', 'expires', 'transfer'],
  Contacts: ['email', 'name', 'list', 'status', 'token', 'source', 'consent', 'tags', 'created', 'updated', 'lastSent', 'sentCount'],
  Campaigns: ['id', 'journal', 'name', 'subject', 'preheader', 'preset', 'content', 'sender', 'audience', 'status', 'scheduledAt', 'createdBy', 'created', 'updated', 'stats', 'sentAt'],
  Queue: ['id', 'campaignId', 'email', 'name', 'token', 'status', 'error', 'ts'],
  Automations: ['id', 'journal', 'type', 'name', 'enabled', 'everyDays', 'campaignId', 'endDate', 'nextRun', 'lastRun', 'config', 'updated'],
  Signatories: ['id', 'name', 'designation', 'org', 'fileId', 'order', 'active', 'created'],
  Letters: ['id', 'ref', 'type', 'journal', 'to', 'subject', 'body', 'signatory', 'date', 'fileId', 'createdBy', 'created'],
  Certificates: ['id', 'articleId', 'journal', 'author', 'name', 'ref', 'fileId', 'created'],
  SentMail: ['id', 'ts', 'by', 'from', 'to', 'cc', 'bcc', 'subject', 'body', 'attachments', 'status', 'detail'],
  Recommendations: ['id', 'journal', 'kind', 'name', 'email', 'affiliation', 'url', 'note', 'by', 'byName', 'status', 'created', 'updated', 'handledBy'],
  Errors: ['ref', 'ts', 'code', 'action', 'message', 'user', 'detail'],
  Messages: ['id', 'journal', 'to', 'name', 'email', 'role', 'msId', 'subject', 'body', 'status', 'created', 'readAt', 'readBy', 'reply', 'repliedAt', 'repliedBy', 'note', 'meta'],
  Partners: ['id', 'name', 'type', 'url', 'logoUrl', 'country', 'description', 'contactName', 'contactEmail', 'contactPhone', 'journals', 'message', 'status', 'showOnSite', 'order', 'created', 'decidedAt', 'decidedBy', 'note'],
};

/** Submission statuses and who sees what. */
const STATUS = {
  draft: 'Draft',
  submitted: 'Submitted — technical check',
  returned: 'Returned to author for corrections',
  with_editor: 'With Editor-in-Chief',
  under_review: 'Under peer review',
  reviews_complete: 'Reviews complete — awaiting decision',
  revision: 'Revision requested',
  accepted: 'Accepted — awaiting final files',
  production: 'In production',
  proof: 'Proofs ready for author',
  proof_approved: 'Proofs approved — scheduled',
  published: 'Published',
  rejected: 'Rejected',
  desk_rejected: 'Declined without review',
  withdrawn: 'Withdrawn',
};
/** What the AUTHOR sees (hides internal steps). */
const AUTHOR_STATUS = {
  submitted: 'Submitted', with_editor: 'With editor', under_review: 'Under review', reviews_complete: 'Under review',
};

/** Editorial roles, in display order. Permissions: eic > senior > editor > board. */
const ROLES = {
  eic: { label: 'Editor-in-Chief', plural: 'Editors-in-Chief', rank: 1 },
  senior: { label: 'Senior Editor', plural: 'Senior Editors', rank: 2 },
  editor: { label: 'Editor', plural: 'Editors', rank: 3 },
  board: { label: 'Editorial Board Member', plural: 'Editorial Board', rank: 4 },
};
const AGREEMENT_VERSION = '1.0';

const FILE_KINDS = {
  manuscript: 'Anonymised manuscript', titlepage: 'Title page', figure: 'Figure', supplementary: 'Supplementary file',
  cover: 'Cover letter', response: 'Response to reviewers', final: 'Final manuscript (non-anonymised)', final_figure: 'Final figure',
  proof_corrections: 'Proof corrections',
};
