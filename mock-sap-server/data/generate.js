// Deterministic (seeded) generator for additional vendors, each with one or
// more requisition -> PO -> GRN -> invoice -> payment -> GL chains plus a
// contract and Form 16 records. Seeded so the dataset is identical across
// restarts, which matters for demoing/testing against it.
//
// The first DENSE_VENDOR_COUNT generated vendors get 20-25 chains each
// (a real transaction history); the rest get one chain each (still gives
// every vendor at least a first purchase on record). Dates are spread
// across the full FY2025-26 window with a realistic PR -> PO -> GRN ->
// invoice -> payment progression, not clustered into one or two months.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260823);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

const PREFIXES = ["Shakti", "Ganga", "Vishwa", "Nova", "Dynamic", "Continental", "Meridian", "Catalyst", "Spark", "Swift", "United", "Orion", "Zenith", "Everest", "Sunrise"];
const LEGAL_SUFFIXES = ["Pvt Ltd", "Industries", "Solutions", "Works", "Enterprises", "Group"];

const CATEGORIES = [
  { name: "Raw Material", word: "Metals" },
  { name: "Tooling", word: "Tooling" },
  { name: "Packaging", word: "Packaging" },
  { name: "Components", word: "Components" },
  { name: "Machining / MRO", word: "MRO Services" },
  { name: "Electronics", word: "Electronics" },
  { name: "Logistics", word: "Logistics" },
  { name: "Consulting Services", word: "Consulting" },
];

const PLANTS = [
  { name: "Plant 1000 - Pune", stateCode: "27" },
  { name: "Plant 2000 - Ahmedabad", stateCode: "24" },
  { name: "Plant 3000 - Bengaluru", stateCode: "29" },
  { name: "Plant 4000 - Chennai", stateCode: "33" },
  { name: "Plant 5000 - Noida", stateCode: "09" },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const randLetters = (n) => Array.from({ length: n }, () => pick(LETTERS.split(""))).join("");
const randDigits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join("");

function makePan() {
  return `${randLetters(5)}${randDigits(4)}${randLetters(1)}`;
}

function makeGstin(pan, stateCode) {
  return `${stateCode}${pan}1Z${randInt(0, 9)}`;
}

// --- Dates spread across FY2025-26, with a realistic PR -> PO -> GRN ->
// invoice -> payment progression per chain. The PR base date is capped
// well before "today" so that every downstream date that represents
// something already-happened (PO, GRN, invoice, and a Cleared payment's
// clearing date) never lands in the future — only a Scheduled payment's
// date is allowed past today, since that's genuinely a future date.
const FY_START = new Date(2025, 3, 1).getTime(); // 2025-04-01
const TODAY = new Date(2026, 7, 24).getTime(); // 2026-08-24
const MAX_CHAIN_SPAN_DAYS = 5 + 15 + 5; // PO offset + GRN offset + invoice offset (upper bounds)
const REQ_BASE_END = TODAY - MAX_CHAIN_SPAN_DAYS * 24 * 60 * 60 * 1000;

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function randomBaseMs() {
  return FY_START + rand() * (REQ_BASE_END - FY_START);
}
function addDaysMs(ms, days) {
  return ms + days * 24 * 60 * 60 * 1000;
}

const INVOICE_OUTCOMES = ["Approved", "Approved", "Approved", "Pending Approval", "Blocked", "Rejected"];

function buildAdditionalDataset() {
  const suppliers = [];
  const contracts = [];
  const requisitions = [];
  const purchaseOrders = [];
  const goodsReceipts = [];
  const invoices = [];
  const payments = [];
  const glPostings = [];
  const form16 = [];

  const VENDOR_COUNT = 995; // + 5 curated hero vendors = 1,000 suppliers total
  const DENSE_VENDOR_COUNT = 100; // first 100 generated vendors get a real transaction history
  let chainSeq = 0; // global counter -> guarantees unique doc numbers across every chain

  for (let i = 0; i < VENDOR_COUNT; i++) {
    const vendorCode = String(100006 + i);
    const category = pick(CATEGORIES);
    const plant = pick(PLANTS);
    const name = `${pick(PREFIXES)} ${category.word} ${pick(LEGAL_SUFFIXES)}`;
    const pan = makePan();
    const gstin = makeGstin(pan, plant.stateCode);

    suppliers.push({
      vendorCode,
      vendorName: name,
      pan,
      gstin,
      plant: plant.name,
      category: category.name,
      email: "info@veltriance.com",
    });

    const unitPrice = randInt(500, 15000);
    contracts.push({
      contractId: `CT-${vendorCode}`,
      vendorCode,
      material: category.name,
      unitPrice,
      unit: "per unit",
      currency: "INR",
      paymentTerms: pick(["Net 30", "Net 45", "Net 60"]),
      validFrom: "2025-04-01",
      validTo: "2026-03-31",
      status: "Active",
    });

    const chainCount = i < DENSE_VENDOR_COUNT ? randInt(20, 25) : 1;

    for (let c = 0; c < chainCount; c++) {
      chainSeq += 1;
      const k = chainSeq;

      const poNumber = String(4500100000 + k);
      const reqNo = `PR-${poNumber}`;
      const grnNumber = String(5000100000 + k);
      const invoiceNo = String(5100100000 + k);
      const paymentDocNo = String(1500100000 + k);

      const quantity = randInt(5, 100);
      const totalValue = quantity * unitPrice;

      // Realistic progression: PR -> PO (+1-5d) -> GRN (+3-15d) -> invoice (+0-5d) -> payment (+15-45d)
      const reqMs = randomBaseMs();
      const poMs = addDaysMs(reqMs, randInt(1, 5));
      const grnMs = addDaysMs(poMs, randInt(3, 15));
      const invoiceMs = addDaysMs(grnMs, randInt(0, 5));

      const reqDate = fmtDate(reqMs);
      const poDate = fmtDate(poMs);
      const grnDate = fmtDate(grnMs);
      const invoiceDate = fmtDate(invoiceMs);

      requisitions.push({
        requisitionNo: reqNo,
        vendorCode,
        plant: plant.name,
        description: `${category.name} — bulk supply`,
        quantity,
        unit: "unit",
        estimatedValue: totalValue,
        currency: "INR",
        status: "Converted to PO",
        createdDate: reqDate,
        poNumber,
      });

      const outcome = pick(INVOICE_OUTCOMES);
      const poStatus = outcome === "Rejected" || outcome === "Pending Approval" ? "Open" : "Completed";

      purchaseOrders.push({
        poNumber,
        requisitionNo: reqNo,
        vendorCode,
        plant: plant.name,
        description: `${category.name} — bulk supply`,
        quantity,
        unit: "unit",
        unitPrice,
        totalValue,
        currency: "INR",
        status: poStatus,
        createdDate: poDate,
        expectedDeliveryDate: fmtDate(addDaysMs(poMs, randInt(5, 20))),
      });

      const hasGrn = outcome !== "Pending Approval";
      let grnNumberOut = null;
      if (hasGrn) {
        grnNumberOut = grnNumber;
        goodsReceipts.push({
          grnNumber,
          poNumber,
          vendorCode,
          receivedDate: grnDate,
          quantityOrdered: quantity,
          quantityReceived: quantity,
          unit: "unit",
          status: "Full",
          inspectionStatus: "Accepted",
        });
      }

      const invoiceAmount = outcome === "Blocked" ? Math.round(totalValue * 1.08) : totalValue;
      const blockReason =
        outcome === "Blocked"
          ? `Price variance exceeds tolerance vs PO ${poNumber}`
          : outcome === "Rejected"
          ? `Duplicate or unmatched invoice — see PO ${poNumber}`
          : null;

      invoices.push({
        vendorCode,
        invoiceNo,
        poNumber,
        postingDate: invoiceDate,
        grnMatched: hasGrn,
        grnNumber: grnNumberOut,
        approvalStatus: outcome,
        blockReason,
        amount: invoiceAmount,
        currency: "INR",
      });

      glPostings.push({
        documentNo: `GL${invoiceNo}`,
        vendorCode,
        reference: invoiceNo,
        referenceType: "Invoice",
        postingDate: invoiceDate,
        glAccount: "211000",
        glAccountName: "Trade Payables - Domestic Suppliers",
        debitCredit: "Credit",
        amount: invoiceAmount,
        currency: "INR",
      });

      // Payments only make sense once an invoice isn't rejected outright.
      if (outcome !== "Rejected") {
        let paymentStatus;
        if (outcome === "Blocked") paymentStatus = "On Hold";
        else if (outcome === "Pending Approval") paymentStatus = "Open";
        else paymentStatus = pick(["Cleared", "Cleared", "Scheduled"]);

        // Cleared = already happened, so it can't be dated in the future;
        // Scheduled is legitimately a future date and is left unclamped.
        const clearingMs = Math.min(addDaysMs(invoiceMs, randInt(15, 45)), TODAY);
        const scheduledMs = addDaysMs(invoiceMs, randInt(20, 40));
        const clearingDate = paymentStatus === "Cleared" ? fmtDate(clearingMs) : null;
        const scheduledDate = paymentStatus === "Scheduled" ? fmtDate(scheduledMs) : null;

        payments.push({
          vendorCode,
          invoiceNo,
          paymentDocNo: paymentStatus === "Cleared" ? paymentDocNo : null,
          status: paymentStatus,
          clearingDate,
          scheduledDate,
          amount: invoiceAmount,
          currency: "INR",
          bankReference: paymentStatus === "Cleared" ? `UTR2026${randDigits(8)}` : null,
          holdReason: paymentStatus === "On Hold" ? "Invoice blocked — payment cannot proceed until released" : null,
        });

        if (paymentStatus === "Cleared") {
          glPostings.push({
            documentNo: `GL${paymentDocNo}`,
            vendorCode,
            reference: paymentDocNo,
            referenceType: "Payment",
            postingDate: clearingDate,
            glAccount: "100100",
            glAccountName: "Bank Current Account",
            debitCredit: "Credit",
            amount: invoiceAmount,
            currency: "INR",
          });
        }
      }
    }

    // Form 16 — two quarters per vendor (unrelated to chain count; a
    // withholding certificate is a quarterly aggregate, not per-invoice).
    ["Q1", "Q2"].forEach((quarter, qi) => {
      const baseAmount = unitPrice * randInt(20, 80);
      const tdsAmount = Math.round(baseAmount * 0.01 * (qi === 0 ? 1 : 0.4));
      const status = pick(["Available", "Available", "Under Processing", "Not Yet Generated"]);
      form16.push({
        vendorCode,
        certificateNo: `FORM16A-2025-${quarter}-${vendorCode}`,
        financialYear: "2025-26",
        quarter,
        tdsAmount,
        currency: "INR",
        status,
        downloadUrl: status === "Available" ? `https://mock-sap.example.com/certs/FORM16A-2025-${quarter}-${vendorCode}.pdf` : null,
      });
    });
  }

  return { suppliers, contracts, requisitions, purchaseOrders, goodsReceipts, invoices, payments, glPostings, form16 };
}

module.exports = { buildAdditionalDataset };
