# ACRI Journals: Setup and Operations Guide

Allow about 90 minutes for the first setup. Do the steps in order.

---

## 0. Domain, publisher and email addresses

- **Website:** `https://acriindia.org.in`.
- **Publisher (shown on every journal, and required by ISSN India and DOAJ):** Ahmedabad Centre for Research and Innovation. Fill in `config/site.json`:
  - `publisherAddress`: the full postal address in India.
  - `publisherCity`, `publisherState`, `publisherPin`.
  - `publisherPhone`.
  - `issnApplicant`: the person named on the ISSN form.

  The ISSN checklist stays red until these are filled in.
- **Fees:** set `fees.confirmed: true`, with `apc: 0` if the journals are free to publish in. The site and policies then say "no fees of any kind", which DOAJ requires to be stated explicitly.
- **Email** (domain `journals.acriindia.org`; verify it in ZeptoMail **and** Brevo):

| Address | Used for |
|---|---|
| `controller@journals.acriindia.org` | **Journal office for every journal.** Receives new-submission alerts, final files, proof responses, replies to notifications and general enquiries. Shown on every journal page. |
| `editor@journals.acriindia.org` | **The single address for all editors.** Decisions, reviewer invitations and appointment letters are sent from it, and replies come back to it. Your team routes each message to the right editor. |
| `no.reply@journals.acriindia.org` | Account emails (verification, password reset) |
| `<journal>-no-reply@journals.acriindia.org` | Journal notifications (submission received, proofs, published). Replies go to controller@. |
| `privacy@`, `grievance@` | Named in the privacy policy |

## 1. GitHub repository

1. Create a repository, for example `acri-india/acri-journals` (private is fine), and push this folder to it.
2. Create a **fine-grained personal access token** (GitHub → Settings → Developer settings):
   - Repository access: only `acri-journals`
   - Permissions: **Contents: Read and write**, **Actions: Read**
   - You will paste it into Apps Script as `GITHUB_TOKEN`.

## 2. Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Upload assets** (Direct Upload). Name the project **`acri-journals`**.
2. Create an API token with the **Cloudflare Pages: Edit** permission. Note your **Account ID**.
3. In GitHub → repo → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push any commit. The **Build and deploy ACRI Journals** action should go green.
5. Pages project → Custom domains → add `acriindia.org.in`. Add a redirect rule from `journals.acriindia.org/*` to `https://acriindia.org.in/$1`.

## 3. Editorial Management System (Apps Script)

1. Create a Google Sheet named **ACRI Journals — EMS**, using the account that should own the system (for example president@acriindia.org).
2. Extensions → Apps Script. Create one script file for each file in `apps-script/` (00_Config … 09_Setup) and paste in its contents.
3. Project Settings → tick **Show "appsscript.json"** → replace its contents with `apps-script/appsscript.json`. This enables the Drive API advanced service, which converts .docx files to PDF for reviewers.
4. Run **`setup()`** once and approve the permissions. This creates the tabs, the Drive folder, the two journals and the triggers (daily reviewer reminders, plus a production watcher every 10 minutes).
5. Project Settings → **Script properties**. Add:

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 1 |
| `GITHUB_REPO` | `acri-india/acri-journals` |
| `ZEPTO_TOKEN` | ZeptoMail Send Mail token (step 4) |
| `ZENODO_TOKEN` | Zenodo token (step 5) |
| `ZENODO_SANDBOX` | `true` while testing, `false` when live |
| `ZENODO_COMMUNITY` | `acri-journals` (optional) |
| `MAIL_PROVIDER` | `auto` (ZeptoMail, falling back to Gmail when ZeptoMail is not set up or fails), `gmail` (always Gmail), or `zepto` (no fallback) |
| `ADMIN_EMAILS` | `president@acriindia.org` (comma-separated; these become admins when they register) |
| `BREVO_KEY` | Brevo API key, for newsletters and campaigns (step 4b) |
| `CONTROLLER_EMAIL` / `EDITORS_EMAIL` | already defaulted to controller@ / editor@journals.acriindia.org |

   `setup()` already sets defaults for `SITE_URL`, `MAIL_DOMAIN`, `SYSTEM_FROM`, `ZEPTO_HOST` and `GITHUB_BRANCH`.

6. Run **`selfTest()`** and read the log. Every line should be OK.
7. **Deploy → New deployment → Web app.** Execute as: *Me*. Who has access: *Anyone*. Copy the `/exec` URL.
8. Paste that URL into `config/site.json → apiUrl`, then commit. The build injects it into the portal and the newsletter form.

   When you change the Apps Script code later, use **Deploy → Manage deployments → Edit → New version**. This keeps the same URL.

## 4a. ZeptoMail (workflow emails only)

1. Create a Mail Agent named "ACRI Journals" and select the **India** data centre. The API host is `api.zeptomail.in`.
2. Add and verify the domain **journals.acriindia.org** (SPF + DKIM).
3. Copy the **Send Mail token** into `ZEPTO_TOKEN`.
4. Portal → Admin → Overview → **Send me a test email**.

ZeptoMail's terms allow **transactional emails only**. Newsletters, calls for papers and outreach must not go through it, or Zoho will block the account. That is why campaigns use a separate provider.

## 4b. Campaign sending (newsletters, calls for papers, outreach)

Campaigns go through ZeptoMail by default (`CAMPAIGN_PROVIDER` = `zepto`). Optionally create a second ZeptoMail Agent for campaigns and set its token as `ZEPTO_CAMPAIGN_TOKEN`. ZeptoMail's terms bar bulk marketing mail; if the account is warned or blocked, set `CAMPAIGN_PROVIDER` = `brevo` and follow these steps:


1. Create a Brevo account and verify the domain **journals.acriindia.org** (DKIM + DMARC).
2. Settings → SMTP & API → create an API key → set it as `BREVO_KEY`.
3. Admin → Email & campaigns → create a campaign → **Send test to me**.

Every campaign email carries:
- a one-click **unsubscribe** (also as `List-Unsubscribe` headers, which Gmail and Yahoo require);
- a link to the **email preferences** page, where people can resubscribe or leave every list.

Unsubscribed addresses are never emailed again and are not re-added by imports. Only add contacts who have agreed to hear from you: record the consent source when importing. Brevo's free plan has a daily sending cap, so upgrade for large lists.

If you would rather use **Zoho Campaigns**, the sending code is in one function (`campaignSend_` in `11_Mailing.gs`) and can be swapped.

## 5. Zenodo (DOIs)

- When the EIC **accepts** a manuscript, the system creates a Zenodo draft and **reserves a DOI**. The DOI is printed on the article page and the PDF.
- After **publication**, the admin clicks **Register DOI on Zenodo**. The system uploads the final PDF, adds full metadata with a link back to the article page, and publishes the record. The DOI then resolves.
- **Test first on the sandbox.** Create an account and token at sandbox.zenodo.org with the scopes `deposit:write` and `deposit:actions`, and keep `ZENODO_SANDBOX=true`. Sandbox DOIs are not real.
- **For live DOIs,** use an ACRI institutional zenodo.org account, create the token, and set `ZENODO_SANDBOX=false`. Optionally create a Zenodo community called `acri-journals` and set `ZENODO_COMMUNITY`.
- Zenodo DOIs use Zenodo's prefix (`10.5281/zenodo.…`). If ACRI later joins Crossref for its own prefix, the metadata is already in place.

## 6. People, roles and the editorial team

1. Register at `/portal/` with an address listed in `ADMIN_EMAILS`. That account becomes admin. Admin → People only controls the admin flag and disabled accounts.
2. **Editorial roles are appointments.** Go to Admin → **Editorial team**, choose the journal, and appoint people as **Editor-in-Chief** (as many as you need), **Senior Editor**, **Editor** (with an optional title such as "Associate Editor — Finance") or **Editorial Board Member**. Each appointment has a start and end date.
3. The person receives an appointment letter from `editor-<journal>@`. If they have no account yet, it includes a set-password link. They open the **Editorial Agreement** and sign it electronically by typing their name.
   - The agreement covers role, term, duties, confidentiality, conflicts, ethics, AI, data protection, termination and governing law.
   - Their access starts only after they sign. A signed PDF is emailed to them and copied to the editorial office, and they appear on the journal's board page automatically.
   - Unsigned appointments get one reminder after 7 days.
4. **Term end:** reminders go out 30 and 7 days before. On the end date, access closes automatically, a **Certificate of Editorial Service** (PDF) is emailed, and the board page updates.
   - **Renew** sends a new agreement for the next term.
   - **End** closes the term early: either a normal ending with a certificate, or a removal for breach without one.
5. EICs can appoint Senior Editors, Editors and Board members for their own journal. Only admins appoint EICs.
6. Honorary names without portal access go in Admin → Journals → *Extra people on the board page*.

| Role | What they do |
|---|---|
| **Author** | Everyone. Submits, tracks status, revises, uploads final files and approves proofs. |
| **Reviewer** | No account needed: they work from the secure link in their invitation. They view the manuscript in a viewer that does not allow downloads, then score and recommend. |
| **Editorial Board Member** | Listed on the board page. Can be assigned as handling editor and invited to review. |
| **Editor** (handling or associate editor) | Handles assigned manuscripts: invites and chases reviewers, and recommends a decision. |
| **Senior Editor** | Sees the journal's whole queue, assigns handling editors and invites reviewers. |
| **Editor-in-Chief** (one or more) | Everything a Senior Editor can do, plus desk rejections and final decisions. |
| **Admin / Editorial Office** | Runs the technical check, production, publication and DOI registration. Manages journals, issues and roles. |

## 7. The editorial workflow

```
Author submits ─▶ Technical check (office) ─┬─▶ returned to author ─▶ resubmits
                                             └─▶ EIC screening ─┬─▶ desk reject
                                                                └─▶ handling editor ─▶ reviewers (≥2)
  ◀── Decision by EIC: Accept / Minor revision / Major revision / Reject (reviewer comments sent anonymously)
Accept ─▶ DOI reserved ─▶ author uploads final .docx + figures ─▶ office clicks "Send to production"
       ─▶ GitHub Action converts Word → web article + PDF (2–4 min) ─▶ author gets proof links
       ─▶ author approves ─▶ office publishes (volume/issue or New Online) ─▶ "Register DOI"
```

Manuscript IDs follow the existing IJBMRS format: `IJBMRS-2026-020`. IJBMRS numbering for 2026 continues from 020, because 019 was the last number in the old system. Change this in Admin → Journals → *Next manuscript number*.

## 8. The article standard (what authors submit, what readers get)

- **Authors submit:** the anonymised manuscript (.docx from the template), a title page (.docx) and figures as separate files of at least 300 dpi. The templates are at `/downloads/`, and the full guidelines are at `/for-authors/`.
- **The converter reads Word styles:**
  - *Title* and *Heading 1/2/3* for structure.
  - "Key Points", "Abstract" (with bold labels), "Keywords:" and "References" (a numbered list).
  - "Figure N." captions under images and "Table N." captions above tables.
  - Superscript citation numbers, which become links to the references.
  - Word equations, which become MathML.
- **Images:** the separately uploaded high-resolution figure wins over the image embedded in Word. Each figure becomes a 2400 px WebP for print and "View large", plus a 960 px WebP for the page.
- **Web article:** JAMA-style layout with section navigation, Key Points, structured abstract, figure lightbox, "Cite this" in 7 formats with .bib and .ris files, Article Information and linked references.
- **PDF of record:** A4. The first page has the journal header, an article info column and the abstract box. The body is set in two columns of Lora 9.6 pt. Figures span both columns, tables use three rules, and a running footer carries the citation, DOI and page numbers. It is generated from the same source as the web page, so the two always match.
- **Fixing an article after conversion:** Manuscript → Production → **Edit article source**. Edit `article.json` or `body.html` and save. The site rebuilds automatically.

## 9. Back issues (IJBMRS Vol. 1 and Vol. 2, IJELF)

**IJBMRS Volume 1, Issue 1 (December 2025)** is already set up as an issue. Add Volume 2 in Admin → Issues, and tick "Don't send the new-issue email" for back issues.

There are two ways to add the papers, both in Admin → **Back issues**:

1. **One by one:** fill in the form and upload the original PDF, which stays the PDF of record. The form asks for:
   - title, authors and affiliations, abstract and keywords;
   - volume, issue, the **original publication date**, and pages;
   - the old DOI, if any.

   You can also upload the Word file, which gives the article a full-text web page like new articles. You can edit any article later from the same screen.
2. **In bulk:** paste a CSV (template at `/downloads/back-issues-template.csv`, or `legacy/ijbmrs-template.csv`) with one row per paper. The `pdf` column can point at the existing `files.ijbmrs.org` link.

**New DOIs for old papers:** after an article is live, click **Register new DOI**. Zenodo mints a DOI with the **original publication date**. If the paper already had a DOI, it is recorded on the new DOI as the same work (DataCite `IsIdenticalTo`) and shown on the article page as "Original DOI". Before you do this for papers that already have a working DOI, read the note in the summary: two DOIs for one article is discouraged.

**Old websites:** add Cloudflare redirect rules:
- `ijbmrs.org/*` → `https://acriindia.org.in/journals/ijbmrs/`
- `ijelf.acriindia.org/*` → `.../journals/ijelf/`

Keep `files.ijbmrs.org` online until Google Scholar has re-indexed. Then add the site in Google Search Console, submit `/sitemap.xml`, and send the Google Scholar inclusion request.

## 9b. Email automations

Admin → Email & campaigns → **Automations**. Each journal, plus the network, can turn these on or off at any time:
- new-article alerts;
- new-issue alerts;
- a digest every N days;
- a **recurring campaign**, such as a call for papers every 14 days until a deadline;
- reviewer reminders.

## 9c. Partners

Organisations apply at `/portal/#/partner-apply`, which is linked from `/partners/` and the About page. Approve or reject them in Admin → **Partners**: they get an email, and approved partners appear on `/partners/`. You can also add partners directly.

## 9e. Journal logos

Each journal shows its own logo alongside "An ACRI | JOURNALS publication": in the journal header, on the About page, in the menus and cards, on the PDF header and in emails. The IJBMRS and IJELF logos are installed. A **new journal automatically gets a logo** in the same globe-and-laurel style, in its own colour, built from its code and full name. To replace it, upload a transparent PNG or an SVG in Admin → Journals → Logos (full logo, emblem only, and optionally white versions). "Use generated" switches back.

## 9f. ISSN & indexing readiness

Admin → **ISSN & indexing**. Each journal gets live checklists for:
- **ISSN India** (NSL, CSIR-NIScPR rules);
- **DOAJ** (COPE/OASPA/WAME Principles v5);
- **Google Scholar**;
- **Web of Science (ESCI)**;
- **Scopus**.

Items marked "auto" are checked from real data: board size and completeness, institutional (non-Gmail) emails, members abroad for "International" titles, articles in the first issue, publisher address, fees, DOIs, abstracts, skipped issues. You tick the rest yourself.

**ISSN workflow:** Not applied → **Ready to apply** (set automatically each morning when every required item passes; admins are emailed) → Applied → EB verification mails sent → Provisional ISSN → Confirmed.
- **ISSN application pack:** every field of the ISSN India online form, prefilled with copy buttons. It also lists the enclosures to post, and drafts the email to the ISSN office with the board's institutional profile links.
- **Mark as applied:** every board member is emailed to expect a verification email from the ISSN office and to answer it within 3 days.
- **Provisional ISSN:** enter the number and it appears on the website and PDFs. When the next issue is published, admins are emailed the confirmation letter to send.

**Board details ISSN India needs:** designation, department, institution, full postal address, institutional email and a profile link on the institution's website. Collect these in the appointment form or ask editors to complete their profile. They appear on the Editorial Board page. Note that ISSN India does not accept students or research fellows on the board of a scholarly journal. Management roles such as Chairperson are listed separately under "Publisher & journal management".

**IJELF (new, no ISSN):** an online ISSN can only be requested after the first issue is published with at least 5 original articles (10 for an annual journal), and with at least 5 complete board members, some of them abroad because the title is "International". **IJBMRS (has e-ISSN 3139-115X):** inform ISSN India of the new website URL and publisher details from controller@, because the checklist requires it.

## 9d. Policies

There are 28 policies at `/policies/`, in `build/policies.mjs`: privacy (DPDP Act 2023), terms, cookies, email, accessibility, disclaimer, open access, copyright, peer review, fees, archiving, advertising, partnerships, ethics (COPE), plagiarism, AI, authorship, conflicts, research ethics, data, corrections, appeals, and editorial independence. **Have a lawyer review the privacy policy, terms and fees policy before launch.** Bump `policyVersion` and `policyEffective` in `config/site.json` whenever you change them.

## 10. Adding a new journal

Admin → Journals → **Add a new journal**. Fill in the slug (URL), code, name, colour, ISSN, frequency (Monthly, Bi-monthly, Quarterly and so on), scope, subjects and article types, then save. Its `<slug>-no-reply@` and `editor-<slug>@` addresses are created automatically, as are its email list and automations. Appoint its editors in Editorial team. The journal's website appears in about 3 minutes, and it shows up in the submission form straight away.

## Costs

GitHub, Cloudflare Pages, Apps Script and Zenodo are free at this scale. ZeptoMail is pay-as-you-go: it bills per email credit, and journal workflow volumes are small. Brevo's free tier covers small lists, and larger campaigns need a paid plan.

## Contact messages (journal office and Editors-in-Chief)

The website has a contact form at `/contact/` (linked from every journal's About and Editorial Board pages and the footer).
Messages are stored in the **Messages** sheet and handled in the portal under **Admin → Messages**. They are not emailed.
Admins (the journal office) see every message; an Editor-in-Chief sees messages addressed to the EIC of their own journal.
The office can pass a message to the EIC. Replies typed in the portal are emailed to the sender, and the dashboard shows a banner when new messages arrive.
Run `setup()` once after updating the code so the Messages sheet is created.

## Admin → Settings

Every connection key (GitHub, ZeptoMail, Zenodo, Brevo, addresses, admin emails, website address) and the public website details
(publisher, address, phone, home-page text, fees, grievance contacts) can be changed in the portal under **Admin → Settings**.
Keys are write-only: after saving, the portal shows only whether a key is set and its last four characters.
Website details are written to `config/site.json` in GitHub, which rebuilds the site. "Run connection checks" runs `selfTest()`.
