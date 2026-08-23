// Sample data only — fabricated vendor codes, PAN/GSTIN, and amounts.
// None of this represents a real company or real filing.

const suppliers = [
  {
    vendorCode: "100001",
    vendorName: "Bharat Steel & Alloys Pvt Ltd",
    pan: "AABCB1234C",
    gstin: "27AABCB1234C1Z5",
    plant: "Plant 1000 - Pune",
    category: "Raw Material",
    email: "sauravsharma079+bharatsteel@gmail.com",
  },
  {
    vendorCode: "100002",
    vendorName: "Precision Tooling Works",
    pan: "AAECP5678D",
    gstin: "27AAECP5678D1Z2",
    plant: "Plant 1000 - Pune",
    category: "Tooling",
    email: "sauravsharma079+precisiontooling@gmail.com",
  },
  {
    vendorCode: "100003",
    vendorName: "SafePack Packaging Solutions",
    pan: "AABCS9012E",
    gstin: "24AABCS9012E1Z8",
    plant: "Plant 2000 - Ahmedabad",
    category: "Packaging",
    email: "sauravsharma079+safepack@gmail.com",
  },
  {
    vendorCode: "100004",
    vendorName: "Apex Auto Components Ltd",
    pan: "AAACA3456F",
    gstin: "29AAACA3456F1Z3",
    plant: "Plant 3000 - Bengaluru",
    category: "Components",
    email: "sauravsharma079+apexauto@gmail.com",
  },
  {
    vendorCode: "100005",
    vendorName: "Reliable MRO Services",
    pan: "AAFCR7890G",
    gstin: "27AAFCR7890G1Z1",
    plant: "Plant 1000 - Pune",
    category: "Machining / MRO",
    email: "sauravsharma079+reliablemro@gmail.com",
  },
];

const invoices = [
  // Bharat Steel — clean, approved + GRN matched
  { vendorCode: "100001", invoiceNo: "5100000123", poNumber: "4500001001", postingDate: "2026-06-12", grnMatched: true, grnNumber: "5000009001", approvalStatus: "Approved", blockReason: null, amount: 842500, currency: "INR" },
  // Bharat Steel — GRN pending
  { vendorCode: "100001", invoiceNo: "5100000124", poNumber: "4500001002", postingDate: "2026-07-02", grnMatched: false, grnNumber: null, approvalStatus: "Pending Approval", blockReason: null, amount: 316200, currency: "INR" },

  // Precision Tooling — blocked, price variance
  { vendorCode: "100002", invoiceNo: "5100000201", poNumber: "4500002001", postingDate: "2026-06-20", grnMatched: true, grnNumber: "5000009045", approvalStatus: "Blocked", blockReason: "Price variance exceeds tolerance vs PO 4500002001", amount: 128900, currency: "INR" },
  { vendorCode: "100002", invoiceNo: "5100000202", poNumber: "4500002002", postingDate: "2026-07-15", grnMatched: true, grnNumber: "5000009088", approvalStatus: "Approved", blockReason: null, amount: 94500, currency: "INR" },

  // SafePack — approved
  { vendorCode: "100003", invoiceNo: "5100000301", poNumber: "4500003001", postingDate: "2026-07-05", grnMatched: true, grnNumber: "5000009102", approvalStatus: "Approved", blockReason: null, amount: 52300, currency: "INR" },

  // Apex Auto — rejected
  { vendorCode: "100004", invoiceNo: "5100000401", poNumber: "4500004001", postingDate: "2026-06-28", grnMatched: false, grnNumber: null, approvalStatus: "Rejected", blockReason: "Duplicate invoice — original 5100000388 already processed", amount: 210000, currency: "INR" },
  { vendorCode: "100004", invoiceNo: "5100000402", poNumber: "4500004002", postingDate: "2026-07-18", grnMatched: true, grnNumber: "5000009150", approvalStatus: "Approved", blockReason: null, amount: 675000, currency: "INR" },

  // Reliable MRO — approved
  { vendorCode: "100005", invoiceNo: "5100000501", poNumber: "4500005001", postingDate: "2026-07-22", grnMatched: true, grnNumber: "5000009177", approvalStatus: "Approved", blockReason: null, amount: 38900, currency: "INR" },
];

const payments = [
  { vendorCode: "100001", invoiceNo: "5100000123", paymentDocNo: "1500000801", status: "Cleared", clearingDate: "2026-06-25", scheduledDate: null, amount: 842500, currency: "INR", bankReference: "UTR2026062500981", holdReason: null },
  { vendorCode: "100001", invoiceNo: "5100000124", paymentDocNo: null, status: "Open", clearingDate: null, scheduledDate: null, amount: 316200, currency: "INR", bankReference: null, holdReason: null },

  { vendorCode: "100002", invoiceNo: "5100000201", paymentDocNo: null, status: "On Hold", clearingDate: null, scheduledDate: null, amount: 128900, currency: "INR", bankReference: null, holdReason: "Invoice blocked — payment cannot proceed until released" },
  { vendorCode: "100002", invoiceNo: "5100000202", paymentDocNo: null, status: "Scheduled", clearingDate: null, scheduledDate: "2026-08-30", amount: 94500, currency: "INR", bankReference: null, holdReason: null },

  { vendorCode: "100003", invoiceNo: "5100000301", paymentDocNo: "1500000855", status: "Cleared", clearingDate: "2026-07-19", scheduledDate: null, amount: 52300, currency: "INR", bankReference: "UTR2026071900234", holdReason: null },

  { vendorCode: "100004", invoiceNo: "5100000402", paymentDocNo: null, status: "Scheduled", clearingDate: null, scheduledDate: "2026-09-05", amount: 675000, currency: "INR", bankReference: null, holdReason: null },

  { vendorCode: "100005", invoiceNo: "5100000501", paymentDocNo: null, status: "Open", clearingDate: null, scheduledDate: null, amount: 38900, currency: "INR", bankReference: null, holdReason: null },
];

const form16 = [
  { vendorCode: "100001", certificateNo: "FORM16A-2025-Q1-100001", financialYear: "2025-26", quarter: "Q1", tdsAmount: 8425, currency: "INR", status: "Available", downloadUrl: "https://mock-sap.example.com/certs/FORM16A-2025-Q1-100001.pdf" },
  { vendorCode: "100001", certificateNo: "FORM16A-2025-Q2-100001", financialYear: "2025-26", quarter: "Q2", tdsAmount: 3162, currency: "INR", status: "Under Processing", downloadUrl: null },

  { vendorCode: "100002", certificateNo: "FORM16A-2025-Q1-100002", financialYear: "2025-26", quarter: "Q1", tdsAmount: 1289, currency: "INR", status: "Available", downloadUrl: "https://mock-sap.example.com/certs/FORM16A-2025-Q1-100002.pdf" },

  { vendorCode: "100003", certificateNo: "FORM16A-2025-Q1-100003", financialYear: "2025-26", quarter: "Q1", tdsAmount: 523, currency: "INR", status: "Available", downloadUrl: "https://mock-sap.example.com/certs/FORM16A-2025-Q1-100003.pdf" },

  { vendorCode: "100004", certificateNo: "FORM16A-2025-Q2-100004", financialYear: "2025-26", quarter: "Q2", tdsAmount: 6750, currency: "INR", status: "Not Yet Generated", downloadUrl: null },

  { vendorCode: "100005", certificateNo: "FORM16A-2025-Q2-100005", financialYear: "2025-26", quarter: "Q2", tdsAmount: 389, currency: "INR", status: "Available", downloadUrl: "https://mock-sap.example.com/certs/FORM16A-2025-Q2-100005.pdf" },
];

module.exports = { suppliers, invoices, payments, form16 };
