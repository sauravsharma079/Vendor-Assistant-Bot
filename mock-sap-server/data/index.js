const curated = require("./records");
const curatedExtras = require("./curated-extras");
const { buildAdditionalDataset } = require("./generate");

const generated = buildAdditionalDataset();

module.exports = {
  suppliers: [...curated.suppliers, ...generated.suppliers],
  contracts: [...curatedExtras.contracts, ...generated.contracts],
  requisitions: [...curatedExtras.requisitions, ...generated.requisitions],
  purchaseOrders: [...curatedExtras.purchaseOrders, ...generated.purchaseOrders],
  goodsReceipts: [...curatedExtras.goodsReceipts, ...generated.goodsReceipts],
  invoices: [...curated.invoices, ...generated.invoices],
  payments: [...curated.payments, ...generated.payments],
  glPostings: [...curatedExtras.glPostings, ...generated.glPostings],
  form16: [...curated.form16, ...generated.form16],
};
