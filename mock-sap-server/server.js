// Standalone mock SAP-like REST API + admin UI — Supplier, Contract,
// Requisition, Purchase Order, Goods Receipt, Invoice, Payment, GL
// Postings, Form 16.
//
// This is NOT part of the vendor-query-assistant bot and is never imported
// by it. It's a separate process you run on its own port and call over
// HTTP, the same way you'd eventually call a real SAP OData service.
// Core field names (supplier/invoice/payment/form16) match lib/sap/types.ts
// in the bot repo, so wiring a connector against this later is a straight
// mapping.

const path = require("path");
const express = require("express");
const cors = require("cors");
const data = require("./data");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4001;

function notFound(res, message) {
  return res.status(404).json({ error: message });
}

function listOrFilter(collection, filters) {
  return collection.filter((record) =>
    Object.entries(filters).every(([key, value]) => !value || record[key] === value)
  );
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "mock-sap-server" });
});

app.get("/api", (req, res) => {
  res.json({
    endpoints: [
      "GET /api/suppliers",
      "GET /api/suppliers/:vendorCode",
      "GET /api/suppliers/:vendorCode/verify?taxId=PAN_OR_GSTIN",
      "GET /api/contracts?vendorCode=",
      "GET /api/requisitions?vendorCode=",
      "GET /api/purchase-orders?vendorCode=&poNumber=",
      "GET /api/goods-receipts?vendorCode=&poNumber=",
      "GET /api/invoices?vendorCode=&ref=(invoiceNo or poNumber, optional)",
      "GET /api/payments?vendorCode=&ref=(invoiceNo, optional)",
      "GET /api/gl-postings?vendorCode=&reference=",
      "GET /api/form16?vendorCode=&financialYear=(optional, single record if both given)",
    ],
  });
});

// ---- Supplier / vendor master ----

app.get("/api/suppliers", (req, res) => {
  res.json(listOrFilter(data.suppliers, { vendorCode: req.query.vendorCode }));
});

app.get("/api/suppliers/:vendorCode", (req, res) => {
  const supplier = data.suppliers.find((s) => s.vendorCode === req.params.vendorCode);
  if (!supplier) return notFound(res, "Supplier not found");
  res.json(supplier);
});

// Mirrors SapConnector.verifyVendor — matches vendor code + PAN or GSTIN.
app.get("/api/suppliers/:vendorCode/verify", (req, res) => {
  const taxId = String(req.query.taxId || "").trim().toUpperCase();
  const supplier = data.suppliers.find((s) => s.vendorCode === req.params.vendorCode);
  if (!supplier) return notFound(res, "Supplier not found");
  if (supplier.pan !== taxId && supplier.gstin !== taxId) {
    return notFound(res, "PAN/GSTIN does not match this vendor code");
  }
  res.json(supplier);
});

// ---- Vendor contracts / pricing agreements ----

app.get("/api/contracts", (req, res) => {
  res.json(listOrFilter(data.contracts, { vendorCode: req.query.vendorCode }));
});

// ---- Purchase requisitions ----

app.get("/api/requisitions", (req, res) => {
  res.json(listOrFilter(data.requisitions, { vendorCode: req.query.vendorCode }));
});

// ---- Purchase orders ----

app.get("/api/purchase-orders", (req, res) => {
  res.json(listOrFilter(data.purchaseOrders, { vendorCode: req.query.vendorCode, poNumber: req.query.poNumber }));
});

// ---- Goods receipts ----

app.get("/api/goods-receipts", (req, res) => {
  res.json(listOrFilter(data.goodsReceipts, { vendorCode: req.query.vendorCode, poNumber: req.query.poNumber }));
});

// ---- Invoices ----

app.get("/api/invoices", (req, res) => {
  const { vendorCode, ref } = req.query;
  const matches = listOrFilter(data.invoices, { vendorCode });

  if (!ref) return res.json(matches);
  if (!vendorCode) return res.status(400).json({ error: "vendorCode is required when ref is given" });

  const single = matches.find((inv) => inv.invoiceNo === ref || inv.poNumber === ref);
  if (!single) return notFound(res, "Invoice not found for this vendor");
  res.json(single);
});

// ---- Payments ----

app.get("/api/payments", (req, res) => {
  const { vendorCode, ref } = req.query;
  let matches = listOrFilter(data.payments, { vendorCode });
  if (ref) matches = matches.filter((p) => p.invoiceNo === ref);
  res.json(matches);
});

// ---- GL postings ----

app.get("/api/gl-postings", (req, res) => {
  const { vendorCode, reference } = req.query;
  res.json(listOrFilter(data.glPostings, { vendorCode, reference }));
});

// ---- Form 16 / withholding tax ----

app.get("/api/form16", (req, res) => {
  const { vendorCode, financialYear } = req.query;

  if (vendorCode && financialYear) {
    const cert = data.form16.find((c) => c.vendorCode === vendorCode && c.financialYear === financialYear);
    if (!cert) return notFound(res, "No Form 16 certificate found for this vendor/year");
    return res.json(cert);
  }

  res.json(listOrFilter(data.form16, { vendorCode }));
});

app.listen(PORT, () => {
  console.log(`mock-sap-server listening on http://localhost:${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}/`);
  console.log(`API root: http://localhost:${PORT}/api`);
});
