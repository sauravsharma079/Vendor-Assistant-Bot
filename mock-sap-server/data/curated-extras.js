// Purchase Requisition -> PO -> Goods Receipt -> Invoice chain, plus
// contracts and GL postings, for the 5 curated "hero" vendors in
// records.js. Numbers here are deliberately linked to the invoices in
// records.js (same PO/GRN numbers) so the modules cross-reference cleanly.

const contracts = [
  { contractId: "CT-100001", vendorCode: "100001", material: "Raw Material", unitPrice: 68500, unit: "per MT", currency: "INR", paymentTerms: "Net 45", validFrom: "2025-04-01", validTo: "2026-03-31", status: "Active" },
  { contractId: "CT-100002", vendorCode: "100002", material: "Tooling", unitPrice: 12500, unit: "per set", currency: "INR", paymentTerms: "Net 30", validFrom: "2025-04-01", validTo: "2026-03-31", status: "Active" },
  { contractId: "CT-100003", vendorCode: "100003", material: "Packaging", unitPrice: 850, unit: "per 1000 units", currency: "INR", paymentTerms: "Net 30", validFrom: "2025-04-01", validTo: "2026-03-31", status: "Active" },
  { contractId: "CT-100004", vendorCode: "100004", material: "Components", unitPrice: 4200, unit: "per lot", currency: "INR", paymentTerms: "Net 45", validFrom: "2025-04-01", validTo: "2026-03-31", status: "Active" },
  { contractId: "CT-100005", vendorCode: "100005", material: "Machining / MRO", unitPrice: 3900, unit: "per service call", currency: "INR", paymentTerms: "Net 30", validFrom: "2025-04-01", validTo: "2026-03-31", status: "Active" },
];

const requisitions = [
  { requisitionNo: "PR-4500001001", vendorCode: "100001", plant: "Plant 1000 - Pune", description: "Cold-rolled steel coils", quantity: 12, unit: "MT", estimatedValue: 822000, currency: "INR", status: "Converted to PO", createdDate: "2026-05-28", poNumber: "4500001001" },
  { requisitionNo: "PR-4500001002", vendorCode: "100001", plant: "Plant 1000 - Pune", description: "Alloy steel bars", quantity: 5, unit: "MT", estimatedValue: 316200, currency: "INR", status: "Converted to PO", createdDate: "2026-06-20", poNumber: "4500001002" },
  { requisitionNo: "PR-4500002001", vendorCode: "100002", plant: "Plant 1000 - Pune", description: "Injection mould set", quantity: 10, unit: "set", estimatedValue: 120000, currency: "INR", status: "Converted to PO", createdDate: "2026-06-05", poNumber: "4500002001" },
  { requisitionNo: "PR-4500002002", vendorCode: "100002", plant: "Plant 1000 - Pune", description: "Precision jigs", quantity: 7, unit: "set", estimatedValue: 94500, currency: "INR", status: "Converted to PO", createdDate: "2026-07-01", poNumber: "4500002002" },
  { requisitionNo: "PR-4500003001", vendorCode: "100003", plant: "Plant 2000 - Ahmedabad", description: "Corrugated shipping cartons", quantity: 60, unit: "1000 units", estimatedValue: 51000, currency: "INR", status: "Converted to PO", createdDate: "2026-06-25", poNumber: "4500003001" },
  { requisitionNo: "PR-4500004001", vendorCode: "100004", plant: "Plant 3000 - Bengaluru", description: "Precision drive shafts", quantity: 50, unit: "lot", estimatedValue: 210000, currency: "INR", status: "Converted to PO", createdDate: "2026-06-10", poNumber: "4500004001" },
  { requisitionNo: "PR-4500004002", vendorCode: "100004", plant: "Plant 3000 - Bengaluru", description: "Sensor housing assemblies", quantity: 160, unit: "lot", estimatedValue: 672000, currency: "INR", status: "Converted to PO", createdDate: "2026-07-10", poNumber: "4500004002" },
  { requisitionNo: "PR-4500005001", vendorCode: "100005", plant: "Plant 1000 - Pune", description: "Preventive maintenance — CNC line", quantity: 10, unit: "service call", estimatedValue: 39000, currency: "INR", status: "Converted to PO", createdDate: "2026-07-15", poNumber: "4500005001" },
];

const purchaseOrders = [
  { poNumber: "4500001001", requisitionNo: "PR-4500001001", vendorCode: "100001", plant: "Plant 1000 - Pune", description: "Cold-rolled steel coils", quantity: 12, unit: "MT", unitPrice: 68500, totalValue: 822000, currency: "INR", status: "Completed", createdDate: "2026-06-01", expectedDeliveryDate: "2026-06-10" },
  { poNumber: "4500001002", requisitionNo: "PR-4500001002", vendorCode: "100001", plant: "Plant 1000 - Pune", description: "Alloy steel bars", quantity: 5, unit: "MT", unitPrice: 63240, totalValue: 316200, currency: "INR", status: "Open", createdDate: "2026-06-22", expectedDeliveryDate: "2026-07-05" },
  { poNumber: "4500002001", requisitionNo: "PR-4500002001", vendorCode: "100002", plant: "Plant 1000 - Pune", description: "Injection mould set", quantity: 10, unit: "set", unitPrice: 12000, totalValue: 120000, currency: "INR", status: "Completed", createdDate: "2026-06-07", expectedDeliveryDate: "2026-06-18" },
  { poNumber: "4500002002", requisitionNo: "PR-4500002002", vendorCode: "100002", plant: "Plant 1000 - Pune", description: "Precision jigs", quantity: 7, unit: "set", unitPrice: 13500, totalValue: 94500, currency: "INR", status: "Completed", createdDate: "2026-07-03", expectedDeliveryDate: "2026-07-14" },
  { poNumber: "4500003001", requisitionNo: "PR-4500003001", vendorCode: "100003", plant: "Plant 2000 - Ahmedabad", description: "Corrugated shipping cartons", quantity: 60, unit: "1000 units", unitPrice: 871.67, totalValue: 52300, currency: "INR", status: "Completed", createdDate: "2026-06-27", expectedDeliveryDate: "2026-07-02" },
  { poNumber: "4500004001", requisitionNo: "PR-4500004001", vendorCode: "100004", plant: "Plant 3000 - Bengaluru", description: "Precision drive shafts", quantity: 50, unit: "lot", unitPrice: 4200, totalValue: 210000, currency: "INR", status: "Open", createdDate: "2026-06-12", expectedDeliveryDate: "2026-06-26" },
  { poNumber: "4500004002", requisitionNo: "PR-4500004002", vendorCode: "100004", plant: "Plant 3000 - Bengaluru", description: "Sensor housing assemblies", quantity: 160, unit: "lot", unitPrice: 4218.75, totalValue: 675000, currency: "INR", status: "Completed", createdDate: "2026-07-12", expectedDeliveryDate: "2026-07-20" },
  { poNumber: "4500005001", requisitionNo: "PR-4500005001", vendorCode: "100005", plant: "Plant 1000 - Pune", description: "Preventive maintenance — CNC line", quantity: 10, unit: "service call", unitPrice: 3890, totalValue: 38900, currency: "INR", status: "Completed", createdDate: "2026-07-17", expectedDeliveryDate: "2026-07-21" },
];

const goodsReceipts = [
  { grnNumber: "5000009001", poNumber: "4500001001", vendorCode: "100001", receivedDate: "2026-06-11", quantityOrdered: 12, quantityReceived: 12, unit: "MT", status: "Full", inspectionStatus: "Accepted" },
  { grnNumber: "5000009045", poNumber: "4500002001", vendorCode: "100002", receivedDate: "2026-06-19", quantityOrdered: 10, quantityReceived: 10, unit: "set", status: "Full", inspectionStatus: "Accepted" },
  { grnNumber: "5000009088", poNumber: "4500002002", vendorCode: "100002", receivedDate: "2026-07-15", quantityOrdered: 7, quantityReceived: 7, unit: "set", status: "Full", inspectionStatus: "Accepted" },
  { grnNumber: "5000009102", poNumber: "4500003001", vendorCode: "100003", receivedDate: "2026-07-03", quantityOrdered: 60, quantityReceived: 60, unit: "1000 units", status: "Full", inspectionStatus: "Accepted" },
  { grnNumber: "5000009150", poNumber: "4500004002", vendorCode: "100004", receivedDate: "2026-07-19", quantityOrdered: 160, quantityReceived: 160, unit: "lot", status: "Full", inspectionStatus: "Accepted" },
  { grnNumber: "5000009177", poNumber: "4500005001", vendorCode: "100005", receivedDate: "2026-07-21", quantityOrdered: 10, quantityReceived: 10, unit: "service call", status: "Full", inspectionStatus: "Accepted" },
];

const glPostings = [
  { documentNo: "GL5100000123", vendorCode: "100001", reference: "5100000123", referenceType: "Invoice", postingDate: "2026-06-12", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 842500, currency: "INR" },
  { documentNo: "GL1500000801", vendorCode: "100001", reference: "1500000801", referenceType: "Payment", postingDate: "2026-06-25", glAccount: "100100", glAccountName: "Bank Current Account", debitCredit: "Credit", amount: 842500, currency: "INR" },
  { documentNo: "GL5100000124", vendorCode: "100001", reference: "5100000124", referenceType: "Invoice", postingDate: "2026-07-02", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 316200, currency: "INR" },
  { documentNo: "GL5100000201", vendorCode: "100002", reference: "5100000201", referenceType: "Invoice", postingDate: "2026-06-20", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 128900, currency: "INR" },
  { documentNo: "GL5100000202", vendorCode: "100002", reference: "5100000202", referenceType: "Invoice", postingDate: "2026-07-15", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 94500, currency: "INR" },
  { documentNo: "GL5100000301", vendorCode: "100003", reference: "5100000301", referenceType: "Invoice", postingDate: "2026-07-05", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 52300, currency: "INR" },
  { documentNo: "GL1500000855", vendorCode: "100003", reference: "1500000855", referenceType: "Payment", postingDate: "2026-07-19", glAccount: "100100", glAccountName: "Bank Current Account", debitCredit: "Credit", amount: 52300, currency: "INR" },
  { documentNo: "GL5100000402", vendorCode: "100004", reference: "5100000402", referenceType: "Invoice", postingDate: "2026-07-18", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 675000, currency: "INR" },
  { documentNo: "GL5100000501", vendorCode: "100005", reference: "5100000501", referenceType: "Invoice", postingDate: "2026-07-22", glAccount: "211000", glAccountName: "Trade Payables - Domestic Suppliers", debitCredit: "Credit", amount: 38900, currency: "INR" },
];

module.exports = { contracts, requisitions, purchaseOrders, goodsReceipts, glPostings };
