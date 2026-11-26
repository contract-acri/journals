// ACRI Journals — policy suite. Each policy becomes /policies/<slug>/.
// Edit wording here; bump site.policyVersion / policyEffective in config/site.json when you change a policy.
export const POLICY_GROUPS = ['Legal & privacy', 'Publishing', 'Research integrity', 'Governance & operations', 'Journal hosting'];

export function policies(site) {
  const E = site.email, P = site.privacyEmail || E, G = site.grievanceEmail || E, ENT = site.legalEntity || 'ACRI Journals';
  const ED = site.editorsEmail || `editor@${site.mailDomain}`, CT = site.officeEmail || E;
  return [
// ------------------------------------------------------------------ Legal & privacy
{ slug: 'privacy', group: 'Legal & privacy', title: 'Privacy Policy', summary: 'What personal data we collect, why, where it is stored and your rights.', html: `
<p>This policy explains how ACRI Journals collects and uses personal data when you read our journals, submit or review a manuscript, serve as an editor, subscribe to email updates or apply to partner with us. ACRI Journals is operated by ${ENT}, Ahmedabad, India, which is the data fiduciary (controller) for this data. We process personal data in line with India's Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules.</p>
<h2>1. Data we collect</h2>
<ul>
<li><b>Account data:</b> name, email, password (stored only as a salted hash), degrees, affiliation, country, ORCID iD, phone (optional), reviewer interests.</li>
<li><b>Manuscript data:</b> manuscript files, title pages, figures, author lists and affiliations, declarations, correspondence, peer-review reports and editorial decisions.</li>
<li><b>Editorial appointment data:</b> role, term, signed agreement (name typed, date and time, browser details) and certificates of service.</li>
<li><b>Email data:</b> your email address, the lists you subscribe to, consent date and source, whether an email was sent, and unsubscribe requests.</li>
<li><b>Partner data:</b> organisation details and contact person details from partner applications.</li>
<li><b>Technical data:</b> our website does not use advertising or analytics cookies. Our hosting provider processes IP addresses and request logs to deliver and protect the site.</li>
</ul>
<h2>2. Why we use it (purposes and legal basis)</h2>
<ul><li>To run peer review and publish articles, which you request when you submit, review or accept an appointment.</li>
<li>To publish author names, affiliations, ORCID iDs and corresponding-author emails with articles. This is part of the scholarly record and is permanent once published.</li>
<li>To send service emails about your submission, review, appointment or account. These cannot be switched off while the activity is ongoing.</li>
<li>To send newsletters, calls for papers and announcements, only with your consent. You can withdraw consent at any time.</li>
<li>To meet legal obligations and to investigate research misconduct under our <a href="/policies/ethics/">ethics policy</a>.</li></ul>
<h2>3. Who processes your data</h2>
<p>We use these service providers, each bound by its own terms and security standards:</p>
<ul>
<li>Google Workspace (Sheets, Drive, Apps Script): editorial database and manuscript files.</li>
<li>Cloudflare: website hosting and delivery.</li>
<li>GitHub: storage of published article content.</li>
<li>Zoho ZeptoMail: service emails.</li>
<li>Our newsletter email provider: campaign emails.</li>
<li>Zenodo (CERN) and DataCite: DOIs and the archived article record.</li>
</ul>
<p>Some providers store data outside India. We do not sell personal data, and we do not share it for advertising.</p>
<h2>4. Peer review confidentiality</h2>
<p>Reviewer identities are not disclosed to authors. Author identities are withheld from reviewers (double-blind review). Reports may be shared, anonymously, with other reviewers of the same manuscript.</p>
<h2>5. How long we keep data</h2>
<p>Published articles and their metadata are kept permanently. Unpublished manuscripts, reviews and editorial correspondence are kept for 7 years after the final decision, then deleted, unless an integrity investigation requires longer. Accounts are kept until you ask us to close them. Unsubscribed email addresses are kept on a suppression list so that we do not email you again.</p>
<h2>6. Your rights</h2>
<p>You may ask to access, correct or erase your personal data, withdraw consent, or nominate another person to exercise your rights. Exceptions apply to the published scholarly record and to records we must keep for integrity or legal reasons. Write to <a href="mailto:${P}">${P}</a>. We reply within 30 days.</p>
<h2>7. Security</h2>
<p>Access to manuscripts is limited by role. Passwords are hashed. Reviewers view manuscripts in a viewer without download, and all traffic is encrypted (HTTPS). No system is perfectly secure: if a breach affects you, we will notify you and the Data Protection Board of India as the law requires.</p>
<h2>8. Children</h2><p>Our services are not directed at children under 18. Authors under 18 need the consent of a parent or guardian, and their institution may be asked to confirm it.</p>
<h2>9. Grievances</h2><p>${site.grievanceOfficer || 'Grievance Officer'}: <a href="mailto:${G}">${G}</a>. If we do not resolve your complaint, you may approach the Data Protection Board of India.</p>
<h2>10. Changes</h2><p>We will post changes here and update the version and date shown below. Material changes are notified by email to account holders.</p>` },

{ slug: 'terms', group: 'Legal & privacy', title: 'Terms of Use', summary: 'The rules for using the ACRI Journals website and portal.', html: `
<p>By using the ACRI Journals website (acriindia.org.in) or the editorial portal, you agree to these terms. ACRI Journals is operated by ${ENT}.</p>
<h2>1. Content and licences</h2><p>Articles are open access under the licence shown on each article, usually CC BY 4.0. Everything else on the site is © ACRI Journals unless stated: the design, logos, the ACRI Journals name and wordmark, journal names, templates and page text. Do not use the ACRI Journals name or marks to imply endorsement.</p>
<h2>2. Accounts</h2><p>Give accurate information, keep your password secret, and tell us about any unauthorised use. One account per person. We may suspend accounts used for fraud, manipulation of peer review, impersonation or abuse.</p>
<h2>3. Acceptable use</h2><ul><li>Do not submit material you do not have the right to submit, or that is plagiarised, fabricated or defamatory.</li><li>Do not attempt to identify anonymous authors or reviewers, or to influence reviewers improperly.</li><li>Do not scrape the portal, probe its security or overload the service. Bulk text and data mining of open-access articles is allowed under their licence.</li><li>Do not upload confidential manuscripts you are reviewing into generative AI tools.</li></ul>
<h2>4. Submissions</h2><p>By submitting, you confirm that your manuscript complies with our <a href="/for-authors/">author guidelines</a> and <a href="/policies/">policies</a>, and you agree to the processing described in the <a href="/policies/privacy/">Privacy Policy</a>.</p>
<h2>5. Disclaimer and liability</h2><p>See the <a href="/policies/disclaimer/">Disclaimer</a>. To the extent the law allows, ACRI Journals is not liable for indirect or consequential losses arising from use of the site.</p>
<h2>6. Governing law</h2><p>These terms are governed by the laws of India. The courts at Ahmedabad, Gujarat have exclusive jurisdiction.</p>
<h2>7. Contact</h2><p><a href="mailto:${E}">${E}</a></p>` },

{ slug: 'cookies', group: 'Legal & privacy', title: 'Cookie Policy', summary: 'We use no tracking cookies.', html: `
<p>The public ACRI Journals website sets <b>no advertising, tracking or analytics cookies</b>.</p>
<ul><li><b>Portal sign-in:</b> when you sign in, your browser stores a session token in local storage, so that you stay signed in. It is removed when you sign out.</li>
<li><b>Hosting and security:</b> our hosting provider (Cloudflare) may set strictly necessary security cookies to protect the site from abuse.</li>
<li><b>Embedded tools:</b> the reviewer document viewer loads a PDF library from a public content delivery network, which does not set cookies.</li></ul>
<p>Because we use only strictly necessary storage, no cookie consent banner is shown. If this changes, we will ask for your consent first.</p>` },

{ slug: 'email', group: 'Legal & privacy', title: 'Email & Communications Policy', summary: 'Which emails we send, from which addresses, and how to unsubscribe.', html: `
<h2>Service emails</h2><p>These are messages about your account, submission, review or appointment, for example submission receipts, decisions, reviewer invitations, proofs and agreement reminders. They come from:</p>
<ul><li><code>no.reply@${site.mailDomain}</code> for account emails.</li>
<li><code>&lt;journal&gt;-no-reply@${site.mailDomain}</code> for journal notifications.</li>
<li><code>${ED}</code> for editorial correspondence (decisions, reviewer invitations, appointments). Our team routes each message to the right editor.</li>
<li><code>${CT}</code> is the journal office: replies to notifications and all general enquiries about any journal reach it.</li></ul>
<p>Service emails cannot be switched off while the related activity is ongoing.</p>
<h2>Newsletters and announcements</h2><p>New-article alerts, issue announcements, calls for papers and event invitations are sent only to people who subscribed, or who have a professional relationship with the journal and can reasonably expect them. Every such email contains a one-click <b>unsubscribe</b> link that takes effect immediately, and a link to resubscribe if you change your mind. We honour unsubscribes across all ACRI Journals lists you choose.</p>
<h2>Our promises</h2><ul><li>Any invitation to submit manuscripts or to review is well targeted, relevant to the recipient's field, truthful about the journal, and unobtrusive.</li><li>We never sell or rent email addresses.</li><li>We do not send messages on behalf of third parties.</li><li>We remove addresses that bounce or complain.</li></ul>
<h2>Phishing warning</h2><p>ACRI Journals will never ask for your password by email or ask you to pay a fee to a personal account. Genuine messages come only from <code>@${site.mailDomain}</code>. Report suspicious emails to <a href="mailto:${E}">${E}</a>.</p>` },

{ slug: 'accessibility', group: 'Legal & privacy', title: 'Accessibility Statement', summary: 'Our commitment to an accessible website and PDFs.', html: `
<p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2, level AA.</p>
<ul><li>Pages use semantic headings and landmarks, keyboard-accessible navigation and sufficient colour contrast.</li><li>Every article is available as HTML as well as PDF, so it works with screen readers.</li><li>PDFs are tagged and include document metadata. Equations are published as MathML.</li><li>Figures carry text alternatives drawn from their captions. We ask authors to avoid colour-only distinctions.</li></ul>
<p>If something is hard to use, write to <a href="mailto:${E}">${E}</a> and we will provide the content in an accessible format.</p>` },

{ slug: 'disclaimer', group: 'Legal & privacy', title: 'Disclaimer', summary: 'Responsibility for published content.', html: `
<p>Articles express the views of their authors. They do not necessarily reflect the views of the editors, the journal or ACRI Journals. Peer review checks scholarly quality but cannot guarantee that every finding is correct. Readers should evaluate the evidence for themselves and should not treat articles as professional, financial, legal or medical advice.</p>
<p>Links to external sites are provided for convenience. We do not endorse, and are not responsible for, their content.</p>` },

// ------------------------------------------------------------------ Publishing
{ slug: 'open-access', group: 'Publishing', title: 'Open Access & Licensing', summary: 'Free to read, authors keep copyright, CC BY 4.0.', html: `
<p>All ACRI Journals articles are <b>open access</b>: free to read, download, share and reuse from the day they are published, with no registration.</p>
<h2>Licence</h2><p>Articles are published under the <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International (CC BY 4.0)</a> licence unless another Creative Commons licence is agreed at acceptance. Anyone may copy, adapt and reuse the work for any purpose, including text and data mining, provided the original authors and source are credited.</p>
<h2>Copyright</h2><p>Authors <b>retain copyright</b>. They grant ACRI Journals a non-exclusive licence to publish the article and to be identified as its original publisher. See <a href="/policies/copyright/">Copyright & permissions</a>.</p>
<h2>Self-archiving</h2><p>Authors may deposit any version (preprint, accepted manuscript or published PDF) in any repository at any time, with a link to the published article.</p>
<h2>Metadata</h2><p>Article metadata is freely available under CC0 through our pages, sitemap, RSS feeds, DOAJ-format exports and Zenodo.</p>
<h2>Website copyright</h2><p>Copyright in the website, its design, page text, templates and the journal and ACRI Journals logos belongs to ${ENT}. This is separate from article copyright, which stays with the authors. Article copyright and licence are stated on the HTML and PDF of every article.</p>
<p>See also <a href="/policies/text-and-data-mining/">Text and data mining and AI</a>.</p>` },

{ slug: 'copyright', group: 'Publishing', title: 'Copyright & Permissions', summary: 'Who owns what, and how to reuse third-party material.', html: `
<ul><li><b>Authors keep copyright</b> in their articles, which are licensed to the public under CC BY 4.0.</li>
<li><b>Third-party material:</b> authors must obtain permission to reuse figures, tables or long quotations they do not own, under terms that allow CC BY publication, and must cite the source in the caption. Material that cannot be licensed this way must be clearly marked as excluded from the article's licence.</li>
<li><b>Reusing our articles:</b> no permission is needed. Cite the authors, the article and its DOI.</li>
<li><b>Journal branding:</b> the names, logos and wordmarks of ACRI Journals and its journals are not covered by the article licence.</li></ul>` },

{ slug: 'peer-review', group: 'Publishing', title: 'Peer Review Policy', summary: 'Double-blind review by at least two independent experts.', html: `
<h2>Model</h2><p>Research articles, reviews and case studies undergo <b>double-blind peer review</b>: authors and reviewers do not know each other's identities. Editorials, perspectives and book reviews may be reviewed only by the editors, and this is stated on the article.</p>
<h2>Process</h2><ol>
<li>The editorial office runs a technical check: completeness, anonymisation, formatting and similarity screening.</li>
<li>The Editor-in-Chief or a Senior Editor screens the manuscript for scope and quality and may decline it without review.</li>
<li>A handling Editor invites at least two independent reviewers.</li>
<li>Reviewers submit structured reports with a recommendation within 21 days.</li>
<li>The handling Editor recommends a decision, and the <b>Editor-in-Chief decides</b>: accept, minor revision, major revision or reject.</li>
<li>Revised manuscripts are usually returned to the original reviewers.</li></ol>
<h2>Reviewer selection</h2><p>Reviewers must have relevant expertise and no conflict of interest. They must not come from the authors' own institution or have collaborated with the authors in the past three years. Authors may suggest or oppose reviewers. Editors are not bound by these suggestions.</p>
<h2>Editors' own papers</h2><p>Manuscripts by an editor of the journal are handled entirely by another editor, and the authoring editor has no access to the review. The article records this.</p>
<h2>Reviewer conduct</h2><ul><li><b>Who reviews:</b> independent external experts in the subject or methods, never members of the editorial office. Editorial board members may review only when they are not handling the manuscript.</li>
<li><b>Number of reviews:</b> at least two per research manuscript.</li>
<li><b>Anonymity:</b> reviewers do not see author identities, and authors do not see reviewer identities. Reviews are not signed and are not published with articles. Editors' decision letters and authors' responses are not published.</li>
<li><b>Confidentiality:</b> manuscripts are confidential. Reviewers must not contact the authors. They may involve a colleague only with the editor's prior permission, and the colleague is named to the editor.</li>
<li><b>AI:</b> reviewers must not upload manuscripts into, or use, generative AI tools to write or edit their reviews.</li>
<li><b>Assignment:</b> reviewers are chosen and invited by the handling editor, not by automated or AI tools. Author-suggested reviewers only widen the pool, and editors are not bound by them.</li>
<li><b>Supplementary material</b> is reviewed together with the manuscript.</li></ul>
<h2>Timelines</h2><p>Reviewers are asked to report within 21 days. We aim for a first decision within 6–8 weeks of submission, and each article shows its received, accepted and published dates. If a manuscript is delayed, we tell the authors why and offer them the option to withdraw it.</p>
<h2>Exceptions</h2><p>If an article in a normally peer-reviewed category did not undergo peer review, the article page says so. Editors receive guidance on selecting reviewers, recognising conflicts of interest, handling inappropriate reviewer comments and communicating revision requests.</p>` },

{ slug: 'fees', group: 'Publishing', title: 'Fees & Waivers', summary: 'What authors pay, if anything, and the waiver policy.', html: `
${site.fees && site.fees.confirmed && !(Number(site.fees.apc) > 0)
  ? `<p>ACRI Journals charges <b>no fees of any kind</b>. There are no submission, review, article processing, page, colour, language-editing or membership charges. Publication costs are met by the publisher, ${ENT}.</p>`
  : site.fees && site.fees.confirmed
  ? `<p>There are no submission or review fees. After acceptance, an article processing charge of <b>${site.fees.currency || 'INR'} ${site.fees.apc}</b> applies. ${site.fees.note || ''}</p><h2>Waivers</h2><p>Full or partial waivers are available to authors from low- and lower-middle-income countries, students, and authors without funding. The corresponding author applies through the portal when submitting, and every author's circumstances are considered. Waivers are decided by the editorial office, not by the editors.</p>`
  : `<p>There are <b>no charges for submission or peer review</b> at any ACRI journal. Any publication charge that applies to a journal is stated on that journal's About page before you submit, together with its waiver policy.</p>`}
<h2>Fees never influence decisions</h2><p>Payment or waiver status is never visible to editors or reviewers, and has no influence on editorial decisions. People who make decisions on articles are not involved in payments or waivers. If ACRI Journals ever introduces fees, they will be announced on this page at least six months in advance and will not apply to manuscripts already submitted.</p>
<p>ACRI Journals never asks for payment to a personal bank account or wallet. If you receive such a request, report it to <a href="mailto:${E}">${E}</a>.</p>` },

{ slug: 'archiving', group: 'Publishing', title: 'Archiving, Preservation & DOIs', summary: 'Every article gets a DOI and a permanent archived copy.', html: `
<ul><li>Every article receives a <b>Digital Object Identifier (DOI)</b> registered through Zenodo (CERN) with DataCite. A DOI never changes and always resolves to the article record.</li>
<li>The final PDF of record is deposited in <b>Zenodo</b>, which commits to preserving records for the lifetime of the CERN repository.</li>
<li>The HTML and PDF versions on ACRI Journals are stored in a versioned repository with off-site copies.</li>
<li><b>Back issues</b> that moved from earlier journal websites keep their original publication dates and volume and issue numbers. Where an article already had a DOI, that DOI is displayed and linked from the new record.</li>
<li>If a journal stops publishing, its articles remain online and archived.</li></ul>
<p>All journals are online-only. There are no print editions, and no content requires registration or payment to read.</p>` },

{ slug: 'advertising', group: 'Publishing', title: 'Advertising & Sponsorship', summary: 'Sponsors never influence editorial decisions.', html: `
<p><b>ACRI Journals does not accept advertising.</b> No advertisements appear on journal pages or articles, and none are linked to content or reader behaviour. Any future change to this would be announced here first, decided by the publisher (never the editors), and kept separate from editorial content.</p><p> Sponsorship of events, special issues or prizes is acknowledged openly. Sponsors have no role in peer review, editorial decisions or content. Sponsored special issues follow the same peer-review standards as regular issues, and any sponsor is disclosed on each article.</p>` },

{ slug: 'partners', group: 'Publishing', title: 'Partnership Policy', summary: 'How organisations partner with ACRI Journals.', html: `
<p>ACRI Journals partners with universities, research institutes, indexing and archiving services, professional bodies, industry and media organisations that share its commitment to open, rigorous research.</p>
<h2>How to apply</h2><p>Organisations apply through the <a href="/portal/#/partner-apply">partner application form</a>. Applications are reviewed by the editorial office, and approved partners are listed on the <a href="/partners/">Partners page</a>.</p>
<h2>Principles</h2><ul><li>Partnerships never give influence over peer review or editorial decisions.</li><li>Partner logos and names are used only as agreed in writing.</li><li>Partners must not imply that ACRI Journals endorses their products.</li><li>Either side may end a partnership with written notice. The partner listing is then removed.</li></ul>` },

// ------------------------------------------------------------------ Research integrity
{ slug: 'ethics', group: 'Research integrity', title: 'Publication Ethics & Malpractice', summary: 'COPE-aligned duties of authors, reviewers, editors and publisher.', html: `
<p>ACRI Journals follows the Core Practices of the <b>Committee on Publication Ethics (COPE)</b> and handles concerns using the COPE flowcharts.</p>
<h2>Authors must</h2><ul><li>Submit original work not published or under consideration elsewhere.</li><li>Report data honestly: no fabrication, falsification or image manipulation.</li><li>Cite sources properly and avoid plagiarism, including self-plagiarism.</li><li>Disclose funding and conflicts of interest, and list only genuine authors.</li><li>Tell the journal promptly about significant errors they find after publication.</li></ul>
<h2>Reviewers must</h2><ul><li>Keep manuscripts confidential.</li><li>Declare conflicts of interest or decline.</li><li>Review objectively and courteously.</li><li>Not use unpublished material for their own work.</li><li>Not upload manuscripts into AI tools.</li></ul>
<h2>Editors must</h2><ul><li>Judge manuscripts only on merit, without regard to the authors' race, gender, religion, nationality, institution or politics.</li><li>Keep the review process confidential.</li><li>Recuse themselves when conflicted.</li><li>Act on misconduct concerns. Editors are bound by the signed <a href="/policies/editorial-independence/">Editorial Agreement</a>.</li></ul>
<h2>Handling allegations</h2><p>We take allegations seriously before and after publication, whoever raises them: readers, reviewers, whistleblowers or claimants. We protect the identity of whistleblowers where possible. Where appropriate, we coordinate with the authors' institutions, following COPE guidance. Concerns may be raised, including anonymously, with <a href="mailto:${E}">${E}</a>. We investigate confidentially, give the authors a chance to respond, may contact their institution, and publish corrections, expressions of concern or retractions as needed. Paper mills, citation manipulation and fake peer review lead to rejection or retraction, and may lead to a ban on submissions.</p>` },

{ slug: 'plagiarism', group: 'Research integrity', title: 'Plagiarism & Similarity Checking', summary: 'Every submission is screened for overlap.', html: `
<p>Every submission is checked for similarity with published and online sources during the technical check. A similarity score is a guide, not a verdict: editors examine where the overlap is and what it is.</p>
<ul><li><b>Minor, attributed overlap</b>, for example in methods, is acceptable.</li><li><b>Substantial unattributed copying</b>, recycled text from the authors' own published work, or disguised translation plagiarism leads to rejection. If found after publication, it leads to correction or retraction.</li><li>Redundant (duplicate) publication is not allowed. Secondary publication, for example a translation, requires both journals' permission and a clear citation of the original.</li></ul>` },

{ slug: 'ai', group: 'Research integrity', title: 'Artificial Intelligence Policy', summary: 'Rules for authors, reviewers and editors using AI tools.', html: `
<h2>Authors</h2><ul><li>AI tools cannot be authors because they cannot take responsibility for the work.</li><li>Any use of generative AI for writing, translation, coding, analysis or images must be described in the "Use of AI tools" declaration and, where relevant, in the Methods.</li><li>Basic grammar and spelling tools do not need to be declared.</li><li>AI-generated images and data are not allowed unless they are the subject of the research and are clearly labelled.</li><li>Authors remain fully responsible for accuracy, originality and citations, including any errors made by AI.</li></ul>
<h2>Reviewers and editors</h2><ul><li>Do not upload manuscripts, reviews or decision letters into generative AI tools. This breaches confidentiality.</li><li>Do not use AI to write review reports or decisions. The judgment must be your own.</li></ul>
<h2>The journal</h2><p>ACRI Journals uses automated tools only for technical tasks such as similarity checks, file conversion and typesetting, never to make editorial decisions.</p>` },

{ slug: 'authorship', group: 'Research integrity', title: 'Authorship & Contributorship', summary: 'Who qualifies as an author and how contributions are recorded.', html: `
<p>Every author must meet all of these criteria:</p><ul><li>a substantial contribution to the conception, design, data, analysis or interpretation;</li><li>drafting or critically revising the work;</li><li>approval of the final version;</li><li>agreement to be accountable for the work.</li></ul>
<p>People who contributed but do not meet these criteria are acknowledged, with their permission. Contributions are recorded using the <b>CRediT</b> taxonomy and published with the article.</p>
<ul><li><b>Corresponding author:</b> handles communication with the journal and makes sure every author has approved the submission. All co-authors receive an email when the manuscript is submitted.</li><li><b>Changes:</b> any change to the author list after submission needs a request explaining the reason and the written agreement of every author, including anyone being removed.</li><li>Ghost, guest and gift authorship are misconduct.</li></ul>
<h2>Authorship disputes</h2><p>We do not adjudicate authorship disputes ourselves. If authors disagree about authorship before publication, we pause the manuscript and ask the authors to resolve the dispute, if necessary through their institution(s). After publication, changes need the agreement of all authors and are made through a published correction. We follow the COPE guidance on authorship disputes.</p>` },

{ slug: 'conflicts', group: 'Research integrity', title: 'Conflicts of Interest', summary: 'Declaring financial and non-financial interests.', html: `
<p>A conflict of interest exists when a relationship or interest could influence, or appear to influence, someone's judgment about a manuscript.</p>
<ul><li><b>Authors</b> declare every relevant financial interest (funding, employment, consultancy, shares, fees) and non-financial interest (personal, political, academic) from the past 3 years. Declarations are published.</li>
<li><b>Reviewers</b> decline invitations when they have a conflict: for example a recent collaboration with the authors, the same institution, competing work, or a personal relationship.</li>
<li><b>Editors</b> declare their interests on appointment in the Editorial Agreement, update them when they change, and recuse themselves from conflicted manuscripts.</li></ul>
<h2>What counts as a conflict</h2><p>Financial interests (funding, employment, consultancy, honoraria, shares, patents); personal relationships; political or religious beliefs that may be relevant; academic or professional rivalry or collaboration; and ownership interests in organisations affected by the work.</p>
<h2>How and when to declare</h2><ul><li>Authors declare all interests on the title page when submitting, and update the declaration if anything changes before publication.</li><li>Reviewers declare interests before accepting an invitation. If a conflict emerges during review, they tell the editor and stop.</li><li>Editors declare interests when appointed and annually afterwards. They recuse themselves from decisions on manuscripts where they have a conflict, and the manuscript is reassigned.</li><li>The journal and the publisher declare their own interests when relevant, for example in articles about ACRI or its initiatives.</li></ul>
<h2>If a conflict was not declared</h2><p>Before publication, the manuscript may be returned, re-reviewed or rejected. After publication, a correction is published. If the undeclared interest calls the findings into question, an expression of concern or retraction may follow, in line with COPE guidance.</p>
<p>Editors and staff are never paid according to the number of articles accepted.</p>` },

{ slug: 'research-ethics', group: 'Research integrity', title: 'Research Ethics & Consent', summary: 'Ethics approval, informed consent and vulnerable groups.', html: `
<ul><li>Research involving human participants, identifiable personal data or human material needs approval from an appropriate ethics committee or institutional review board. Give the approval reference in the manuscript. Where approval was not required, explain why.</li>
<li><b>Informed consent</b> must be obtained and described. Research with children or vulnerable groups needs consent from guardians and assent from participants where possible.</li>
<li>Participants must not be identifiable in the article unless they have given written consent for publication. Every article that contains potentially identifiable material must include a statement that consent for publication was obtained.</li>
<li>Research involving animals must comply with applicable law and institutional animal-ethics approval, and should follow the ARRIVE guidelines.</li>
<li>Where no ethics review board is available to the researchers, the work must follow the Declaration of Helsinki, and the authors must explain this in the manuscript. Authors of research that is exempt from ethics review must provide proof of the exemption, for example a letter from the ethics board.</li>
<li>Research must comply with applicable laws, including the Digital Personal Data Protection Act, 2023 for data collected in India.</li>
<li>Editors may ask to see approval and consent documents, and may reject work that does not meet these standards.</li></ul>` },

{ slug: 'data', group: 'Research integrity', title: 'Data Sharing & Preprints', summary: 'Data availability statements and preprint policy.', html: `
<ul><li>Every research article must include a <b>data sharing statement</b> saying where the data, code and materials can be found, or why they cannot be shared, for example for privacy or legal reasons.</li>
<li>We encourage depositing data and code in public repositories such as Zenodo, OSF or Figshare under open licences, with a DOI cited in the article.</li>
<li>Editors and reviewers may ask for data to check the findings.</li>
<li>We encourage data management according to the <b>FAIR</b> principles (findable, accessible, interoperable, reusable) and, for data about Indigenous peoples and communities, the <b>CARE</b> principles.</li>
<li>Authors should follow the reporting guideline for their study design, for example CONSORT (trials), PRISMA (systematic reviews), STROBE (observational studies), COREQ or SRQR (qualitative research), and CHEERS (economic evaluations). Prospectively register trials and other designs where that is standard practice in the discipline.</li>
<li><b>Preprints</b> are welcome. Posting a preprint before or during review does not count as prior publication. Give its DOI when you submit, and link it to the published version after publication.</li></ul>` },

{ slug: 'corrections', group: 'Research integrity', title: 'Corrections, Retractions & Expressions of Concern', summary: 'How we change the published record, transparently.', html: `
<p>Published articles are part of the permanent scholarly record and are never changed silently.</p>
<ul><li><b>Correction:</b> for errors that do not undermine the findings. A linked notice explains the change, and the article is updated with a note.</li>
<li><b>Expression of concern:</b> published while an investigation is unresolved, or when the evidence is inconclusive.</li>
<li><b>Retraction:</b> for unreliable findings, misconduct, plagiarism, duplicate publication, unethical research or compromised peer review. The original stays online, watermarked "Retracted", with a linked notice giving the reason. Retractions follow the COPE guidelines.</li>
<li><b>Removal:</b> only in exceptional legal or safety cases. Even then the bibliographic record stays, with an explanation.</li></ul>
<p>Report a problem with a published article to the editors at <a href="mailto:${ED}">${ED}</a> or to the journal office at <a href="mailto:${CT}">${CT}</a>.</p>` },

{ slug: 'appeals', group: 'Research integrity', title: 'Appeals & Complaints', summary: 'How to appeal a decision or make a complaint.', html: `
<h2>Appeals</h2><p>Authors may appeal a rejection <b>once</b>, within 30 days of the decision. Write to the editors at <code>${ED}</code>, naming the journal and manuscript ID, and explain why the decision was mistaken, responding point by point to the reports. Disagreeing with the reviewers is not by itself a ground for appeal. The appeal is assessed by an editor who was not involved in the original decision, and may be referred to the Chairperson. The appeal decision is final. The manuscript must not be submitted elsewhere while the appeal is open.</p>
<h2>Complaints</h2><p>Complaints about the editorial process, delays, an editor's or reviewer's conduct, or our services go to <a href="mailto:${E}">${E}</a>. We acknowledge them within 5 working days and aim to resolve them within 30 days. If you are not satisfied, you may refer the matter to COPE. Data protection complaints follow the <a href="/policies/privacy/">Privacy Policy</a>.</p>` },

// ------------------------------------------------------------------ Governance & operations
{ slug: 'editorial-independence', group: 'Governance & operations', title: 'Editorial Independence & Governance', summary: 'Editor roles, terms, signed agreements and independence.', html: `
<h2>Independence</h2><p>Editorial decisions are made by each journal's editors on scholarly merit alone. ACRI Journals and its leadership do not interfere in decisions on individual manuscripts. Commercial, sponsorship and partnership arrangements never influence content.</p>
<h2>Editorial roles</h2><ul>
<li><b>Editor-in-Chief</b> (one or more per journal): sets the journal's direction and makes the final decision on every manuscript.</li>
<li><b>Senior Editors:</b> screen submissions, assign handling editors and oversee the review of their sections.</li>
<li><b>Editors (Associate Editors):</b> handle manuscripts, invite reviewers and recommend decisions.</li>
<li><b>Editorial Board:</b> advises on scope and quality, reviews manuscripts and promotes the journal.</li></ul>
<h2>Appointments and terms</h2><p>Editors are appointed for a <b>fixed term</b>, usually 2 or 3 years, which may be renewed. On appointment, each editor receives and <b>electronically signs the ACRI Journals Editorial Agreement</b>. It covers responsibilities, confidentiality, conflicts of interest, publication ethics, use of AI, data protection and the term of office. Editorial access starts only after the agreement is signed. Editors are reminded before their term ends. When the term ends, their access closes automatically and they receive a certificate of service. The editorial board pages list only current, signed appointments.</p>
<h2>How decisions are made</h2><p>The editorial office checks every submission for completeness. The Editor-in-Chief or a Senior Editor may decline a manuscript without external review if it is out of scope or clearly below the standard. Otherwise a handling Editor manages peer review and recommends a decision. <b>The Editor-in-Chief makes every final decision</b> to accept or reject. Decisions rest on scholarly merit alone, and are never affected by the authors' nationality, ethnicity, political beliefs, race or religion, by any external influence, or by any ability to pay fees. Acceptance is never guaranteed.</p>
<h2>Use of AI by editors</h2><p>Editors and staff use automated tools only for similarity screening, file conversion and typesetting. They do not use generative AI to assess manuscripts, write editorial comments or draft revision requests.</p>
<h2>Owner and editors</h2><p>The journals are owned by ${ENT}. The publisher appoints editors through written agreements, provides the publishing infrastructure, and does not intervene in decisions on individual manuscripts. Editors serve on an honorary basis unless otherwise agreed in writing, and are never paid per accepted article.</p>
<h2>Removal</h2><p>An appointment may be ended early for breach of the agreement or these policies, after the editor has had a chance to respond.</p>` },

{ slug: 'business-model', group: 'Governance & operations', title: 'Business Model & Funding', summary: 'How the journals are funded, and how money is kept away from editorial decisions.', html: `
<p>ACRI Journals is run by ${ENT} as part of its research and education mission. The journals are funded by the publisher. ${site.fees && site.fees.confirmed && !(Number(site.fees.apc) > 0) ? 'Authors pay no fees.' : 'Any author fees are listed in the <a href="/policies/fees/">fees policy</a>.'}</p>
<h2>Other income</h2><p>The journals may receive sponsorship for events, prizes or special issues. Such sponsorship is always disclosed, and sponsors have no role in content or decisions. The journals carry no advertising and sell no reprints. They have <b>no licensing agreements with AI companies</b>, and any such agreement would be announced on this page.</p>
<h2>Independence</h2><p>No source of income influences editorial decisions. Editors do not handle payments or sponsorship, and are not paid per accepted article.</p>` },
{ slug: 'special-issues', group: 'Publishing', title: 'Special Issues, Supplements & Guest Editors', summary: 'How special issues and guest editors work.', html: `
<p>Special issues, supplements and conference proceedings follow the same peer review, ethics and quality standards as regular issues.</p>
<ul><li><b>Proposals</b> are submitted to the Editor-in-Chief, who decides whether to accept them.</li>
<li><b>Guest editors</b> are appointed by the Editor-in-Chief. Before the call for papers opens, they sign the Editorial Agreement for a fixed term, and they are named on the special issue page with their affiliations.</li>
<li>Guest editors handle peer review and recommend decisions. <b>The Editor-in-Chief, or an Editor they nominate, makes the final decision on every paper.</b></li>
<li>A guest editor's own submissions are handled entirely by another editor, and the guest editor has no access to their review.</li>
<li>Any sponsor of a special issue is disclosed on the issue page and on every article, and has no role in peer review or decisions.</li>
<li>Conference papers must be substantially extended and original to be considered. Previously published proceedings are not republished.</li></ul>` },
{ slug: 'post-publication', group: 'Research integrity', title: 'Post-publication Discussion', summary: 'Letters to the editor and comments on published articles.', html: `
<p>We welcome scholarly discussion of published articles.</p>
<ul><li><b>Letters to the editor</b> commenting on an article published in the last 12 months can be submitted through the portal as a "Letter". Letters are reviewed by the editors, and the original authors are invited to reply. Accepted letters and replies are published and linked to the article.</li>
<li>Concerns about errors, data or ethics are handled under our <a href="/policies/corrections/">corrections</a> and <a href="/policies/ethics/">ethics</a> policies, whatever the channel through which they arrive.</li>
<li>Article pages do not host open comment threads.</li></ul>` },
{ slug: 'text-and-data-mining', group: 'Publishing', title: 'Text & Data Mining and AI', summary: 'Mining of our content, including by AI companies.', html: `
<p>Articles are published under CC BY 4.0. Anyone, including companies developing AI systems, may mine, index and reuse article text and data, provided they credit the original authors and source as the licence requires.</p>
<ul><li>Article metadata is dedicated to the public domain (CC0) and is available through our article pages, sitemap, RSS and DOAJ-format exports.</li>
<li>Please crawl responsibly. Our <a href="/robots.txt">robots.txt</a> sets out access rules. Bulk harvesting through the published exports is preferred to scraping.</li>
<li>${ENT} has no licensing agreements with AI companies for journal content. Any such agreement would be disclosed in the <a href="/policies/business-model/">business model</a> policy, and would not affect authors' rights under the CC BY licence.</li>
<li>Manuscripts <b>under review</b> are confidential and are never shared with or mined by AI tools.</li></ul>` },
{ slug: 'inclusion', group: 'Governance & operations', title: 'Diversity, Equity, Inclusion & Accessibility', summary: 'Our commitments in publishing.', html: `
<ul><li>We welcome authors, reviewers and editors of every background, nationality, gender, religion and career stage, and we judge work on its merit alone.</li>
<li>We aim for editorial boards that are diverse in geography, gender, institution and discipline, and we review their composition annually.</li>
<li>We ask authors to use inclusive, bias-free language and to report the demographics of research participants appropriately.</li>
<li>We do not charge fees that would exclude authors with limited resources. See the <a href="/policies/fees/">fees policy</a>.</li>
<li>Our website and articles aim to meet WCAG 2.2 AA. See the <a href="/policies/accessibility/">accessibility statement</a>.</li></ul>` },
// ------------------------------------------------------------------ Journal hosting (schools, colleges, universities)
{ slug: 'journal-hosting', group: 'Journal hosting', title: 'Journal Hosting Policy', summary: 'How schools, colleges and universities can run their own journal on ACRI Journals, free of charge.', html: `
<p>ACRI Journals hosts peer-reviewed, open-access journals run by schools, colleges, universities and research institutes. Hosting is <b>free of charge</b>. This policy explains who can apply, what we provide and the standards every hosted journal must meet.</p>
<h2>1. Who can apply</h2>
<ul><li>Recognised schools, colleges, universities and research institutes, and departments or centres within them.</li>
<li>The application must come from a member of staff using an official institutional email address, with the approval of the head of the institution or department.</li>
<li>Applications from individuals, commercial publishers or organisations that charge authors for publication are not accepted.</li></ul>
<h2>2. What ACRI Journals provides</h2>
<ul><li>A journal website at <code>acriindia.org.in/journals/&lt;journal&gt;/</code>, with the journal's name, colours and the institution's logo.</li>
<li>The ACRI Editorial System (AES) for submission, double-blind peer review, decisions, production and publication, with a branded sign-in page for the journal.</li>
<li>Typeset article pages and PDFs, article-level metadata for Google Scholar and indexers, DOIs through Zenodo (CERN), and long-term preservation.</li>
<li>Guidance and a ready-made pack for the institution's ISSN application.</li></ul>
<h2>3. What the institution provides</h2>
<ul><li>A <b>Journal Admin</b> from its staff, who runs the journal's settings, editorial team and issues in AES.</li>
<li>A qualified <b>Editor-in-Chief</b> and an <b>editorial board</b> of at least five members with their full designation, institution and address.</li>
<li>A clear aims and scope, a publication frequency and a postal address for the publisher.</li></ul>
<h2>4. Standards every hosted journal must meet</h2>
<ul><li>Every research article is peer reviewed by at least two independent reviewers, under the ACRI Journals <a href="/policies/peer-review/">peer review</a>, <a href="/policies/ethics/">ethics</a> and <a href="/policies/plagiarism/">similarity checking</a> policies and the COPE Core Practices.</li>
<li>Articles are open access under CC BY 4.0, and authors keep copyright.</li>
<li>No author is charged any fee for submission, review or publication.</li>
<li>Decisions on manuscripts are made by the journal's editors on merit, under the <a href="/policies/editorial-independence/">editorial independence</a> policy.</li></ul>
<h2>5. How to apply</h2>
<p>Apply through <a href="/start-a-journal/">Start a journal</a>. We review each proposal and reply, usually within two weeks. If approved, AES creates the journal and sends the Journal Admin and Editor-in-Chief personal links to set it up. ACRI Journals may also set up a hosted journal directly at an institution's request.</p>
<h2>6. Going live</h2>
<p>A hosted journal can publish articles only when it meets the ISSN India requirements listed in the <a href="/policies/issn-and-publisher/">ISSN and publisher responsibilities</a>. AES checks this automatically.</p>` },
{ slug: 'partner-journal-terms', group: 'Journal hosting', title: 'Hosted Journal Terms', summary: 'The terms between ACRI Journals and an institution whose journal it hosts.', html: `
<p>These terms apply between ACRI Journals, operated by ${ENT}, and each institution whose journal it hosts ("the Institution"). The Journal Admin accepts them on behalf of the Institution when signing their appointment in AES.</p>
<h2>1. The service</h2><p>ACRI Journals provides the hosting service described in the <a href="/policies/journal-hosting/">Journal Hosting Policy</a>, free of charge, for as long as both parties agree. ACRI Journals may improve or change the platform, keeping the journal's published record intact.</p>
<h2>2. No fees</h2><p>ACRI Journals charges the Institution nothing for hosting. The Institution may not charge authors any submission, processing or publication fee for the hosted journal.</p>
<h2>3. The Institution's commitments</h2><ul><li>Act as publisher of the journal, hold its ISSN and keep its publisher details accurate.</li><li>Keep a Journal Admin, an Editor-in-Chief and an editorial board in place.</li><li>Follow the ACRI Journals editorial, ethics and data protection policies.</li><li>Respond to correspondence from ACRI Journals within a reasonable time.</li></ul>
<h2>4. Accounts and access</h2><p>Everyone uses an ACRI One account. The Journal Admin and the editors can see only their own journal. ACRI Journals administrators can access every hosted journal to maintain the service and uphold these terms.</p>
<h2>5. Content and responsibility</h2><p>The Institution is responsible for the content of its journal and the decisions of its editors. ACRI Journals is responsible for running the platform with reasonable care.</p>
<h2>6. Ending hosting</h2><p>Either party may end hosting with 60 days' written notice. See <a href="/policies/hosting-suspension-and-exit/">Suspension, termination and exit</a>.</p>
<h2>7. Governing law</h2><p>These terms are governed by the laws of India, with exclusive jurisdiction of the courts at Ahmedabad, Gujarat.</p>` },
{ slug: 'issn-and-publisher', group: 'Journal hosting', title: 'ISSN and Publisher Responsibilities', summary: 'The institution is the publisher and holds the ISSN; what the journal website must show.', html: `
<p>In India, ISSNs are assigned by the ISSN National Centre for India at the National Science Library, CSIR-NIScPR, to the <b>publisher</b> of a serial. For a hosted journal, the publisher is the Institution, so the Institution applies for and holds the ISSN in its own name. ACRI Journals is named only as the hosting platform.</p>
<h2>1. What the journal website must show</h2>
<p>Before a hosted journal can publish articles, AES checks that its website shows everything ISSN India and indexing services look for:</p>
<ul><li>The full journal title, acronym and ISO 4 abbreviation.</li><li>Aims and scope, and publication frequency.</li><li>The publisher's name, full postal address and an email or website.</li><li>An Editor-in-Chief and an editorial board of at least five members, each with designation, institution and address.</li><li>The open-access licence and copyright statement (added automatically).</li><li>The ISSN, once assigned (added from the journal's settings).</li></ul>
<h2>2. Applying for the ISSN</h2>
<p>The Journal Admin can download a ready-made ISSN pack from AES (journal particulars, a checklist and a covering letter on the Institution's letterhead). ISSN India usually asks for at least one published issue or a number of published articles before assigning an online ISSN.</p>
<h2>3. Using the ISSN</h2>
<p>The ISSN belongs to the journal title. If the title changes, a new ISSN is needed. If hosting ends, the Institution keeps the ISSN.</p>` },
{ slug: 'hosting-suspension-and-exit', group: 'Journal hosting', title: 'Suspension, Termination and Exit', summary: 'When a hosted journal can be paused, and what happens if hosting ends.', html: `
<h2>1. Suspension</h2><p>ACRI Journals may pause new publication in a hosted journal if it seriously breaches the hosting terms or publication ethics: for example, publishing without peer review, charging authors, plagiarism that is not addressed, or misuse of personal data. We first give the Institution written notice and at least 30 days to put things right, unless the breach causes immediate harm.</p>
<h2>2. Termination</h2><p>Either party may end hosting with 60 days' written notice, or immediately for a serious breach that is not corrected.</p>
<h2>3. Exit</h2><ul><li>Articles already published stay online permanently at their addresses, with their DOIs, as part of the scholarly record.</li><li>The Institution receives an export of its journal's records: published articles, metadata, files, and manuscripts in progress.</li><li>Manuscripts under review are completed or transferred with the authors' agreement.</li><li>The Institution keeps its journal title and ISSN.</li></ul>` },
{ slug: 'hosting-branding', group: 'Journal hosting', title: 'Branding and Naming of Hosted Journals', summary: 'How hosted journals are presented, and what they may not claim.', html: `
<ul><li>A hosted journal is presented as published by its Institution and <b>"Hosted on ACRI Journals"</b>.</li>
<li>It may show the Institution's name and logo, and the ACRI Journals mark as host, but must not describe itself as an ACRI journal or as published by ACRI.</li>
<li>Its acronym must be unique on ACRI Journals and must not imitate another journal's name or acronym.</li>
<li>Hosted journals are listed separately from ACRI's own journals on the ACRI Journals website.</li>
<li>Claims about indexing, impact factors or ISSN must be true and verifiable.</li></ul>` },
{ slug: 'hosting-data-protection', group: 'Journal hosting', title: 'Data Protection for Hosted Journals', summary: 'Who is responsible for personal data in a hosted journal.', html: `
<p>For a hosted journal, the Institution decides why personal data of its authors, reviewers and editors is used, and ACRI Journals processes that data on its behalf to run the platform, under India's Digital Personal Data Protection Act, 2023 and the ACRI Journals <a href="/policies/privacy/">Privacy Policy</a>.</p>
<ul><li>Personal data is used only to run the journal and is never sold or used for advertising.</li><li>Journal Admins and editors may use data from AES only for the journal's work and must keep it confidential.</li><li>Requests to access or correct personal data can be sent through the <a href="/contact/">contact form</a>.</li><li>When hosting ends, data is handled as set out in <a href="/policies/hosting-suspension-and-exit/">Suspension, termination and exit</a>.</li></ul>` },
{ slug: 'child-safeguarding', group: 'Journal hosting', title: 'Child Safeguarding for School Journals', summary: 'Extra rules for journals that publish work by students under 18.', html: `
<p>These rules apply to every journal on ACRI Journals that publishes work by school students, including hosted school journals.</p>
<ul><li><b>Consent:</b> a parent or guardian gives written consent for every author under 18 before review begins.</li>
<li><b>Supervision:</b> every student submission names a teacher or mentor who supervised the work.</li>
<li><b>Privacy:</b> students' email addresses, phone numbers and home addresses are never published. Articles show the student's name, school and class or grade only.</li>
<li><b>Contact:</b> editors and reviewers contact students only through AES, with the supervising teacher copied, and never through personal channels.</li>
<li><b>Research with people:</b> research involving other children needs consent from their parents or guardians and approval from the school.</li>
<li><b>Concerns:</b> any safeguarding concern is reported at once to the school's designated safeguarding lead and to ACRI Journals.</li></ul>` },
  ];
}

export const AGREEMENT_SUMMARY = 'ACRI Journals Editorial Agreement';
