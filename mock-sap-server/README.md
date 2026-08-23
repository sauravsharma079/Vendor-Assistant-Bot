# Mock SAP Server

A standalone REST API + browser admin UI that fakes a slice of SAP:
**Supplier** master, **Contracts**, **Purchase Requisitions**, **Purchase
Orders**, **Goods Receipts**, **Invoices**, **Payments**, **GL Postings**,
and **Form 16** withholding tax certificates — chained together the way
they'd relate in real SAP (Requisition → PO → GRN → Invoice → Payment → GL).

This is intentionally **not** wired into the bot's codebase. The bot's
`lib/sap/` layer only ever calls a real SAP S/4HANA tenant by design (see
the main README). This server exists so you can develop/test against
something without waiting on a real SAP sandbox — you connect it to the
bot yourself, on your own terms, whenever you're ready.

All data here is fabricated sample data — fake vendor codes, PAN/GSTIN,
amounts. None of it represents a real company or real tax filing. 5
"hero" vendors (100001–100005) have hand-curated, realistic scenarios
(clean approval, GRN-pending, blocked on price variance, rejected as
duplicate); 15 more vendors (100006–100020) are generated deterministically
(same data every run) for volume.

## Run it

```bash
cd mock-sap-server
npm install
npm start
```

- Admin UI: `http://localhost:4001/` — browse every module as a table, filter by vendor code
- API root: `http://localhost:4001/api` — lists all endpoints

Override the port with `PORT=xxxx npm start`.

## Sample vendor codes

| Vendor Code | Name | PAN | GSTIN | Category |
|---|---|---|---|---|
| 100001 | Bharat Steel & Alloys Pvt Ltd | AABCB1234C | 27AABCB1234C1Z5 | Raw Material |
| 100002 | Precision Tooling Works | AAECP5678D | 27AAECP5678D1Z2 | Tooling |
| 100003 | SafePack Packaging Solutions | AABCS9012E | 24AABCS9012E1Z8 | Packaging |
| 100004 | Apex Auto Components Ltd | AAACA3456F | 29AAACA3456F1Z3 | Components |
| 100005 | Reliable MRO Services | AAFCR7890G | 27AAFCR7890G1Z1 | Machining / MRO |
| 100006–100020 | Generated (see `/api/suppliers`) | — | — | Mixed |

## Endpoints

```
GET /api/suppliers?vendorCode=
GET /api/suppliers/:vendorCode
GET /api/suppliers/:vendorCode/verify?taxId=PAN_OR_GSTIN

GET /api/contracts?vendorCode=

GET /api/requisitions?vendorCode=

GET /api/purchase-orders?vendorCode=&poNumber=

GET /api/goods-receipts?vendorCode=&poNumber=

GET /api/invoices?vendorCode=100001
GET /api/invoices?vendorCode=100001&ref=5100000123        # ref = invoiceNo or poNumber

GET /api/payments?vendorCode=100001
GET /api/payments?vendorCode=100001&ref=5100000123        # ref = invoiceNo

GET /api/gl-postings?vendorCode=&reference=

GET /api/form16?vendorCode=100001                          # list all
GET /api/form16?vendorCode=100001&financialYear=2025-26    # single record
```

### Examples

```bash
curl "http://localhost:4001/api/suppliers/100001/verify?taxId=AABCB1234C"

curl "http://localhost:4001/api/purchase-orders?vendorCode=100002"

curl "http://localhost:4001/api/goods-receipts?poNumber=4500002001"

curl "http://localhost:4001/api/invoices?vendorCode=100002&ref=5100000201"

curl "http://localhost:4001/api/payments?vendorCode=100001"

curl "http://localhost:4001/api/gl-postings?vendorCode=100001"

curl "http://localhost:4001/api/form16?vendorCode=100003&financialYear=2025-26"
```

## Field shapes

Supplier, Invoice, Payment, and Form 16 match `lib/sap/types.ts` in the bot
repo (`VendorIdentity`, `InvoiceStatusResult`, `PaymentStatusResult`,
`Form16Result`) field-for-field, so if you do wire those in later, mapping
is 1:1 rather than a translation layer. Contracts, Requisitions, Purchase
Orders, Goods Receipts, and GL Postings are new modules the bot doesn't
currently model — see `data/curated-extras.js` and `data/generate.js` for
their shapes.

## Project layout

```
server.js                  Express app — all routes, serves public/ as static
data/
  records.js                Curated: 5 hero suppliers + invoices/payments/form16
  curated-extras.js          Curated: contracts/requisitions/POs/GRNs/GL for the same 5
  generate.js                Seeded generator: 15 more vendors, full chain, for volume
  index.js                   Combines curated + generated into one dataset
public/
  index.html, app.js, styles.css   Browser admin UI (tables per module, vendor filter)
```

## Connecting this to the bot later

The bot's `lib/sap/index.ts` only ever instantiates `RealS4HanaConnector`.
If/when you want the bot to call this mock server instead of real SAP,
that's a deliberate code change in that repo (not something this server
does on its own) — e.g. a new `MockSapConnector` implementing the same
`SapConnector` interface, fetching from this server's endpoints, switched
in behind an explicit env var so it can never accidentally run in
production against real vendors.
