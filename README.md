# ACRI Journals

**ACRI Journals** (acriindia.org.in), part of ACRIVERSE, is an open-access journal network built the way JAMA Network groups its journals: one brand, one submission system and one production standard, with many journals under it. It launches with **IJBMRS** and **IJELF**, and admin can add more journals from the portal.

## How it works

```
 Authors / Reviewers / Editors
            │  (portal at /portal/, fetch → Apps Script)
            ▼
 ┌──────────────────────────┐      emails       ┌────────────┐
 │ Apps Script + Google Sheet│ ───────────────▶ │  ZeptoMail │
 │ (EMS: workflow, roles,    │      DOIs         ├────────────┤
 │  files in Google Drive)   │ ───────────────▶ │   Zenodo   │
 └────────────┬─────────────┘                   └────────────┘
              │ one Git commit per action (send to production, publish, journal edits)
              ▼
 ┌──────────────────────────┐   GitHub Action: ingest (pandoc) → build (static HTML)
 │   GitHub repository       │   → typeset PDFs (headless Chrome) → deploy
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐
 │ Cloudflare Pages          │  acriindia.org.in: plain, fast HTML with Google Scholar
 │ (static site + PDFs)      │  meta tags, JSON-LD, sitemap and RSS. No Apps Script on read.
 └──────────────────────────┘
```

**Why this is fast and citable:** readers and Google Scholar only ever hit static files on Cloudflare. Apps Script handles only the editorial workflow behind the portal. Every article page carries `citation_*` (Highwire) tags, Dublin Core, PRISM and schema.org `ScholarlyArticle` metadata, plus BibTeX/RIS downloads. Zotero, Mendeley, MyBib and Google Scholar pick these up without running any JavaScript.

## Folders

| Path | What it is |
|---|---|
| `config/site.json` | Network name, site URL, Apps Script URL |
| `content/journals/<slug>/journal.json` | One file per journal: name, ISSN, colour, scope, board. Edited from Admin → Journals. |
| `content/journals/<slug>/issues.json` | Issues (written by Admin → Issues) |
| `content/articles/<slug>/<ID>/` | Published articles: `article.json`, `body.html`, `figures/` |
| `content/incoming/<ID>/` | Manuscripts sent to production (converted automatically, then removed) |
| `content/pages/` | Network pages: About, For Authors, For Reviewers, Policies, Search |
| `site/assets/` | Design system: CSS, fonts (Lora + Inter, OFL), JS, logo |
| `portal/` | Editorial portal: author, reviewer, editors, EIC and admin, plus editorial team and agreements, email campaigns, back issues and partners |
| `build/policies.mjs` | The policy suite (23 pages) |
| `content/partners.json` | Approved partners (written by Admin → Partners) |
| `apps-script/` | Backend. Paste into the Apps Script project bound to the EMS Google Sheet. |
| `build/` | `ingest.mjs` (Word → article), `build.mjs` (site), `pdf.mjs` (PDFs), `import-legacy.mjs` (back issues) |
| `templates/` | Author templates (.docx) served at `/downloads/` |
| `samples/` | A test manuscript for checking the pipeline |

## Commands

```bash
npm install                 # once
npm run test:sample         # convert the sample manuscript in samples/
npm run build && npm run pdf
npm run serve               # preview at http://localhost:8080
```

You need pandoc 3.x and Google Chrome installed locally. The GitHub Action installs both.

Set-up steps for GitHub, Cloudflare, Apps Script, ZeptoMail and Zenodo are in **[docs/SETUP.md](docs/SETUP.md)**.
