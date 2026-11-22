// Generates the author-facing Word templates. Run: node templates/src/make-templates.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, LineNumberRestartFormat, Footer, PageNumber, LevelFormat } from 'docx';

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const NAVY = '0B2545', GREY = '6B7280';
const styles = {
  default: { document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } } },
  paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 36, bold: true, color: '111111' }, paragraph: { spacing: { after: 120 } } },
    { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', run: { size: 28, italics: true, color: '333333' }, paragraph: { spacing: { after: 240 } } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, italics: true }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true } },
    { id: 'Guide', name: 'Template Guidance', basedOn: 'Normal', run: { size: 20, color: GREY, italics: true, font: 'Arial' }, paragraph: { spacing: { after: 120, line: 276 } } },
  ],
};
const numbering = { config: [{ reference: 'refs', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 540 } } } }] }] };
const P = (t, o = {}) => new Paragraph({ ...o, children: Array.isArray(t) ? t : [new TextRun(t)] });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const G = (t) => new Paragraph({ style: 'Guide', children: [new TextRun('▸ ' + t)] });
const B = (label, text) => P([new TextRun({ text: label + ': ', bold: true }), new TextRun(text)]);
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'ACRI Journals manuscript · page ', size: 16, color: GREY, font: 'Arial' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: 'Arial' })] })] });
const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };
const cell = (t, bold) => new TableCell({ width: { size: 2340, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [P([new TextRun({ text: t, bold, size: 20 })], { spacing: { line: 240, after: 0 } })] });

// ---------------- Manuscript template
const ms = new Document({
  creator: 'ACRI Journals', title: 'ACRI Journals Manuscript Template', styles, numbering,
  sections: [{ properties: { page, lineNumbers: { countBy: 1, restart: LineNumberRestartFormat.CONTINUOUS } }, footers: { default: footer }, children: [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Title of the Manuscript in Title Case, Specific and Informative')] }),
    new Paragraph({ style: 'Subtitle', children: [new TextRun('Optional Subtitle, for Example the Study Design')] }),
    G('ACRI Journals manuscript template, v1.0. Replace the grey guidance and placeholder text. Keep the Word styles (Title, Heading 1, Heading 2): the production system reads them to build your web article and PDF. Delete every ▸ line before you submit.'),
    G('This is the ANONYMISED manuscript. Do not put author names, affiliations, acknowledgments or self-identifying references here. They go on the separate title page.'),
    H1('Key Points'),
    G('Original Research only, 100 words in total. Delete this section for other article types.'),
    B('Question', 'What question did this study address, in one sentence?'),
    B('Findings', 'What was found, with the main number, in one or two sentences?'),
    B('Meaning', 'What does it mean for practice, policy or research?'),
    H1('Abstract'),
    G('Structured abstract, 350 words maximum. Start each paragraph with its bold label. Reviews use Importance, Observations, and Conclusions and Relevance. Case studies and perspectives use one unstructured paragraph without labels.'),
    B('Importance', 'Why the question matters.'),
    B('Objective', 'The aim of the study.'),
    B('Design, Setting, and Participants', 'Study design, setting, dates and participants.'),
    B('Main Outcomes and Measures', 'Primary and secondary outcomes.'),
    B('Results', 'Main results with numbers, effect sizes and 95% CIs.'),
    B('Conclusions and Relevance', 'What the findings mean.'),
    B('Keywords', 'keyword one; keyword two; keyword three; keyword four'),
    H1('Introduction'),
    P('Start your main text here. Cite references with superscript numbers, in the order of first citation, like this.'),
    P([new TextRun('Example citation.'), new TextRun({ text: '1,2', superScript: true })]),
    H1('Methods'),
    H2('Study Design'),
    P('Use Heading 2 for subsections and Heading 3 for sub-subsections. Do not number headings.'),
    H2('Statistical Analysis'),
    P('Write equations with Word\'s equation editor (Insert → Equation), not as images.'),
    H1('Results'),
    P('Figure 1 shows … (cite every figure and table in the text).'),
    G('Insert the figure image here on its own line (Insert → Picture), then put the caption in the next paragraph exactly as below. Also upload the figure as a separate high-resolution file named Figure1.png.'),
    P([new TextRun({ text: '[Figure 1 image]', color: GREY })], { alignment: AlignmentType.CENTER }),
    P([new TextRun({ text: 'Figure 1. ', bold: true }), new TextRun('Short Title of the Figure in Title Case. '), new TextRun('Description of what is shown. Define every abbreviation used in the figure.')]),
    G('Put the table caption in the paragraph ABOVE the table. Use Word\'s table tool, never an image. Put notes in the paragraph directly below, starting "Note."'),
    P([new TextRun({ text: 'Table 1. ', bold: true }), new TextRun('Characteristics of the Participants')]),
    new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2340, 2340, 2340, 2340], rows: [
      new TableRow({ tableHeader: true, children: [cell('Characteristic', true), cell('Group A (n = 100)', true), cell('Group B (n = 100)', true), cell('Overall (N = 200)', true)] }),
      new TableRow({ children: [cell('Age, mean (SD), y'), cell('34.1 (3.8)'), cell('33.4 (4.0)'), cell('33.7 (3.9)')] }),
      new TableRow({ children: [cell('Women, No. (%)'), cell('52 (52.0)'), cell('49 (49.0)'), cell('101 (50.5)')] }),
    ] }),
    P('Note. SD indicates standard deviation.'),
    H1('Discussion'),
    P('Interpret the findings, compare them with previous work, and state the strengths and limitations.'),
    H1('Conclusions'),
    P('One short paragraph.'),
    H1('References'),
    G('AMA style (11th edition). One reference per paragraph in a numbered list. Include DOIs. List up to 6 authors, then "et al".'),
    new Paragraph({ numbering: { reference: 'refs', level: 0 }, children: [new TextRun('Author AA, Author BB. Title of the article. '), new TextRun({ text: 'Abbrev Journal Name', italics: true }), new TextRun('. 2025;12(3):45-67. doi:10.xxxx/xxxxx')] }),
    new Paragraph({ numbering: { reference: 'refs', level: 0 }, children: [new TextRun('Author CC. '), new TextRun({ text: 'Title of the Book', italics: true }), new TextRun('. 2nd ed. Publisher; 2024.')] }),
    new Paragraph({ numbering: { reference: 'refs', level: 0 }, children: [new TextRun('Organisation Name. Title of the web page or report. Published March 1, 2025. Accessed June 1, 2026. https://example.org')] }),
  ] }],
});

// ---------------- Title page template
const tp = new Document({
  creator: 'ACRI Journals', title: 'ACRI Journals Title Page Template', styles,
  sections: [{ properties: { page }, footers: { default: footer }, children: [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Title of the Manuscript (Same as in the Manuscript)')] }),
    G('Title page: this file is NOT sent to reviewers. Fill in every section.'),
    H1('Authors'),
    G('List every author in order: Full name, degrees; affiliation number(s); email; ORCID iD.'),
    P([new TextRun('Firstname M. Lastname, PhD'), new TextRun({ text: '1', superScript: true }), new TextRun('; name@institution.edu; ORCID 0000-0000-0000-0000')]),
    P([new TextRun('Second A. Author, MBA'), new TextRun({ text: '1,2', superScript: true }), new TextRun('; email; ORCID')]),
    H1('Affiliations'),
    P('1. Department, Institution, City, State, Country'),
    P('2. Department, Institution, City, State, Country'),
    H1('Corresponding Author'),
    P('Name, full postal address, email, phone.'),
    H1('Word Counts'),
    P('Abstract: ___ words. Main text: ___ words. Tables: ___. Figures: ___.'),
    H1('Author Contributions'),
    G('Use CRediT roles, e.g. Conceptualization: Lastname, Author. Formal analysis: Author. Writing (original draft): Lastname.'),
    H1('Conflict of Interest Disclosures'), P('None reported.'),
    H1('Funding/Support'), P('Funder name, grant number, and the funder\'s role in the study. Or "None."'),
    H1('Ethics Approval'), P('Approving committee and reference number, and how informed consent was obtained. Or why approval was not required.'),
    H1('Data Sharing Statement'), P('Where and how the data and code can be accessed.'),
    H1('Use of AI Tools'), P('Describe any use of generative AI, or write "None."'),
    H1('Acknowledgments'), P('People who helped but do not meet authorship criteria, with their permission.'),
  ] }],
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'ACRI-Journals-Manuscript-Template.docx'), await Packer.toBuffer(ms));
fs.writeFileSync(path.join(OUT, 'ACRI-Journals-Title-Page-Template.docx'), await Packer.toBuffer(tp));
console.log('Templates written to templates/public/');
