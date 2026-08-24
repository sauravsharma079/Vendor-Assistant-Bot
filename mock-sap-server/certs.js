// Generates mock Form 16A (quarterly TDS certificate) and Form 26AS
// (annual tax credit statement) PDFs on demand — plausible-looking
// documents for demo/testing, not real tax filings, and rendered per
// request rather than pre-generated (the full mock dataset has ~2,000
// Form 16 records — pre-generating every PDF at startup would be wasteful).

const PDFDocument = require("pdfkit");

const NAVY = "#0f1729";
const GOLD = "#C9A227";
const STEEL = "#5b6b7c";
const BORDER = "#c9ccd1";
const BG = "#f6f7f9";

const DEDUCTOR_NAME = "Veltriance Manufacturing Pvt Ltd";
const DEDUCTOR_NAME_SHORT = "Veltriance Mfg Pvt Ltd"; // fits the 26AS table's narrower Name-of-Deductor column
const DEDUCTOR_TAN = "MUMV12345E";
const DEDUCTOR_PAN = "AABCV6789F";
const DEDUCTOR_ADDRESS = "MIDC Industrial Area, Pune - 411019";

const PAGE_W = 595.28; // A4
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function assessmentYear(financialYear) {
  const [start] = financialYear.split("-").map(Number);
  return `${start + 1}-${String(start + 2).slice(-2)}`;
}

const QUARTER_PERIOD = { Q1: "1 Apr – 30 Jun", Q2: "1 Jul – 30 Sep", Q3: "1 Oct – 31 Dec", Q4: "1 Jan – 31 Mar" };

function money(n, currency) {
  return `${currency} ${Number(n).toLocaleString("en-IN")}`;
}

function pageHeader(doc, title, subtitle) {
  doc.rect(0, 0, PAGE_W, 6).fill(GOLD);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(16).text(title, MARGIN, 40, { width: CONTENT_W, align: "center" });
  doc.fillColor(STEEL).font("Helvetica").fontSize(8.5).text(subtitle, MARGIN, 62, { width: CONTENT_W, align: "center" });
  doc.moveTo(MARGIN, 88).lineTo(PAGE_W - MARGIN, 88).strokeColor(BORDER).lineWidth(1).stroke();
  doc.y = 100;
}

function infoLine(doc, label, value) {
  doc.fontSize(9);
  doc.fillColor(STEEL).font("Helvetica").text(`${label}: `, MARGIN, doc.y, { continued: true });
  doc.fillColor(NAVY).font("Helvetica-Bold").text(value);
}

function labeledBox(doc, x, y, w, h, label, lines) {
  doc.roundedRect(x, y, w, h, 4).strokeColor(BORDER).lineWidth(1).stroke();
  doc.fillColor(STEEL).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x + 12, y + 10);
  doc.fillColor(NAVY).font("Helvetica").fontSize(9.5);
  let ly = y + 28;
  lines.forEach((line) => {
    doc.text(line, x + 12, ly, { width: w - 24 });
    ly += 16;
  });
}

// Simple fixed-row-height table. Every cell is constrained to a single
// line via { height, ellipsis: true } — if a value doesn't fit its
// column, it's truncated with "…" rather than silently wrapping onto a
// second line and overflowing the fixed row height (which happened here
// once already with a long deductor name in a narrow column).
function table(doc, x, y, colWidths, headerRow, rows, fontSize = 8.5) {
  const rowH = 24;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const cellOpts = (w) => ({ width: w - 10, height: rowH - 10, ellipsis: true, lineBreak: false });
  let cy = y;

  doc.rect(x, cy, totalW, rowH).fill(NAVY);
  let cx = x;
  doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#ffffff");
  headerRow.forEach((h, i) => {
    doc.text(h, cx + 5, cy + 8, cellOpts(colWidths[i]));
    cx += colWidths[i];
  });
  cy += rowH;

  doc.font("Helvetica").fontSize(fontSize);
  rows.forEach((row, ri) => {
    if (ri % 2 === 1) doc.rect(x, cy, totalW, rowH).fill(BG);
    doc.strokeColor(BORDER).lineWidth(0.5).rect(x, cy, totalW, rowH).stroke();
    cx = x;
    doc.fillColor(NAVY);
    row.forEach((cell, i) => {
      doc.text(String(cell), cx + 5, cy + 8, cellOpts(colWidths[i]));
      cx += colWidths[i];
    });
    cy += rowH;
  });

  return cy;
}

function footer(doc, text) {
  doc.fontSize(7).fillColor(STEEL).font("Helvetica").text(text, MARGIN, 780, { width: CONTENT_W, align: "center" });
}

function renderForm16A(doc, cert, supplier) {
  pageHeader(
    doc,
    "FORM NO. 16A",
    "Certificate under section 203 of the Income-tax Act, 1961 for Tax Deducted at Source (Non-Salary Payments)"
  );

  infoLine(doc, "Certificate Number", cert.certificateNo);
  doc.moveDown(0.3);
  infoLine(doc, "Last Updated On", new Date().toISOString().slice(0, 10));
  doc.moveDown(1);

  const boxY = doc.y;
  labeledBox(doc, MARGIN, boxY, 235, 110, "Deductor", [
    DEDUCTOR_NAME,
    DEDUCTOR_ADDRESS,
    `TAN: ${DEDUCTOR_TAN}`,
    `PAN: ${DEDUCTOR_PAN}`,
  ]);
  labeledBox(doc, MARGIN + 255, boxY, 240, 110, "Deductee", [
    supplier.vendorName,
    supplier.plant,
    `PAN: ${supplier.pan}`,
    `GSTIN: ${supplier.gstin}`,
  ]);
  doc.y = boxY + 125;

  infoLine(doc, "Financial Year", cert.financialYear);
  doc.moveDown(0.3);
  infoLine(doc, "Assessment Year", assessmentYear(cert.financialYear));
  doc.moveDown(0.3);
  infoLine(doc, "Quarter", `${cert.quarter} (${QUARTER_PERIOD[cert.quarter]})`);
  doc.moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("Summary of Payment and Tax Deducted at Source", MARGIN, doc.y);
  doc.moveDown(0.5);

  const tableBottom = table(
    doc,
    MARGIN,
    doc.y,
    [80, 100, 105, 105, 105],
    ["Quarter", "Receipt No.", "Amount Paid", "TDS Deducted", "TDS Deposited"],
    [
      [
        cert.quarter,
        `RCPT${cert.certificateNo.slice(-6)}`,
        money(cert.paidAmount, cert.currency),
        money(cert.tdsAmount, cert.currency),
        money(cert.tdsAmount, cert.currency),
      ],
    ]
  );
  doc.y = tableBottom + 30;

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text("Verification", MARGIN, doc.y);
  doc.moveDown(0.4);
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(STEEL)
    .text(
      `I, on behalf of ${DEDUCTOR_NAME}, do hereby certify that the information given above is true, complete, and ` +
        `correct, and is based on the books of account, documents, and other available records.`,
      MARGIN,
      doc.y,
      { width: CONTENT_W }
    );
  doc.moveDown(2.5);
  doc.fontSize(9).fillColor(NAVY).font("Helvetica-Bold").text(`For ${DEDUCTOR_NAME}`, MARGIN, doc.y);
  doc.moveDown(2);
  doc.font("Helvetica").text("Authorized Signatory", MARGIN, doc.y);

  footer(doc, "This is a system-generated mock certificate for demonstration purposes only and has no legal or tax validity.");
}

function renderForm26AS(doc, cert, supplier, allCertsForYear) {
  pageHeader(doc, "FORM 26AS", "Annual Tax Statement under section 203AA of the Income-tax Act, 1961");

  infoLine(doc, "PAN", supplier.pan);
  doc.moveDown(0.3);
  infoLine(doc, "Financial Year", cert.financialYear);
  doc.moveDown(0.3);
  infoLine(doc, "Name", supplier.vendorName);
  doc.moveDown(0.3);
  infoLine(doc, "Assessment Year", assessmentYear(cert.financialYear));
  doc.moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("PART A — Details of Tax Deducted at Source", MARGIN, doc.y);
  doc.moveDown(0.5);

  const rows = allCertsForYear.map((c, i) => [
    String(i + 1),
    DEDUCTOR_NAME_SHORT,
    DEDUCTOR_TAN,
    c.quarter,
    money(c.paidAmount, c.currency),
    money(c.tdsAmount, c.currency),
    money(c.tdsAmount, c.currency),
    "F",
  ]);
  const tableBottom = table(
    doc,
    MARGIN,
    doc.y,
    [22, 125, 65, 28, 70, 70, 70, 25],
    ["Sl.", "Name of Deductor", "TAN", "Qtr", "Amount Paid", "TDS Deducted", "TDS Deposited", "St."],
    rows,
    7.5
  );
  doc.y = tableBottom + 20;

  const totalTds = allCertsForYear.reduce((s, c) => s + c.tdsAmount, 0);
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(NAVY)
    .text(`Total TDS for FY ${cert.financialYear}: ${money(totalTds, cert.currency)}`, MARGIN, doc.y);
  doc.moveDown(0.8);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(STEEL)
    .text('Status "F" = Final (regular TDS statement filed by the deductor for this quarter).', MARGIN, doc.y, {
      width: CONTENT_W,
    });

  footer(
    doc,
    "This is a system-generated mock statement for demonstration purposes only and has no legal or tax validity. " +
      "A real Form 26AS is issued exclusively by the Income Tax Department via the TRACES portal."
  );
}

module.exports = { renderForm16A, renderForm26AS, PAGE_W };
