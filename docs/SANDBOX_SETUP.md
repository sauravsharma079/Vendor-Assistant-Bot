# Sandbox setup: provisioning + creating live manufacturing data

This app has **no mock or seeded data**. Every answer it gives comes from
a live OData call to your SAP S/4HANA tenant. Before it can answer
anything, two things need to happen in SAP itself: (1) provision the
tenant, (2) create real manufacturing vendor/transaction data in it.
This doc walks through both.

## 1. Provision the tenant

Request **SAP S/4HANA Cloud Public Edition \u2014 free trial** (not the API
Business Hub sandbox, not a CAL appliance \u2014 see the comparison in the
main README for why).

1. Go to SAP's free trial signup for S/4HANA Cloud, Public Edition (search
   "SAP S/4HANA Cloud free trial" \u2014 SAP periodically moves this between
   the SAP Store, SAP Discovery Center, and the SAP Free Tier program, so
   go through SAP's own site rather than a cached link).
2. Sign up with a business email. Provisioning typically takes a few
   minutes to a few hours and gives you a tenant URL plus an admin
   business user.
3. Log into the Fiori Launchpad as the initial admin user. From here you
   can create additional business users if others need Fiori access
   (e.g. someone posting invoices as part of the demo data creation
   below).

## 2. Expose OData APIs (Communication Arrangement)

SAP S/4HANA Cloud doesn't expose OData services by default \u2014 each one
needs a **Communication Arrangement** tying together a communication
user, a communication system, and a specific communication scenario.

Do this once per scenario:

1. **Communication Users** (Fiori app) \u2014 create a technical user for
   this bot, e.g. `VENDORBOT_TECH`. Save the credentials.
2. **Communication Systems** (Fiori app) \u2014 register "Vendor Query
   Assistant" as an external system, attach the communication user from
   step 1.
3. **Communication Arrangements** (Fiori app) \u2014 create one arrangement
   per scenario needed:
   - `SAP_COM_0106` \u2014 Business Partner, Supplier Integration (vendor
     identity / master data \u2014 needed for `verifyVendor`)
   - `SAP_COM_0092` \u2014 Supplier Invoice Integration (needed for
     `getInvoiceStatus`)
   - Payment/clearing status and Form 16 typically aren't covered by a
     single standard scenario \u2014 you'll likely need a custom CDS view
     exposed as an OData service for these (see step 4). Flag this to
     whoever has SAP Basis/functional access on the trial tenant early,
     since it takes longer than the standard scenarios.
4. Each arrangement gives you an OAuth2 **client ID**, **client secret**,
   and **token URL**, plus the service's base path. Put these in
   `.env.local` (copy `.env.example`):
   ```
   SAP_S4_BASE_URL=https://<your-tenant>.s4hana.cloud.sap
   SAP_S4_TOKEN_URL=<from the communication arrangement>
   SAP_S4_CLIENT_ID=<from the communication arrangement>
   SAP_S4_CLIENT_SECRET=<from the communication arrangement>
   ```
   If different scenarios give you different token URLs/credentials,
   flag it \u2014 `lib/sap/s4hana-connector.ts` currently assumes one shared
   OAuth2 client for simplicity and will need a small adjustment to
   support per-scenario credentials.

## 3. Create manufacturing vendor + transaction data in SAP

This is the "real data" step \u2014 nothing is seeded by the app, so these
records need to exist in SAP for the assistant to find anything.

### Vendor (Supplier) master

Fiori app: **Manage Suppliers**. Create suppliers that reflect the
manufacturing categories from the use case, e.g.:

| Supplier | Category | Notes |
|---|---|---|
| A steel/raw-material supplier | Raw Material | Set PAN/GSTIN (tax numbers) \u2014 required for the bot's identity check |
| A tooling & dies supplier | Tooling | |
| A packaging supplier | Packaging | |
| An auto/precision components supplier | Components | |
| A machining/MRO supplier | Machining / MRO | |

For each: set the **tax numbers** (PAN under Tax Number 1 / STCD1, GSTIN
under Tax Number 3 / STCD3 depending on tenant config) \u2014 the bot
verifies vendors by matching vendor code + PAN or GSTIN, so these fields
must be populated or verification will always fail.

### Purchase orders, goods receipt, and invoices

Fiori apps: **Create Purchase Order** \u2192 **Post Goods Receipt for
Purchase Order** \u2192 **Create Supplier Invoice**.

Create a small spread of realistic scenarios so the demo shows both the
happy path and the escalation path:
- A clean case: PO \u2192 GRN posted \u2192 invoice created and released (auto-
  resolves as "Approved, GRN matched")
- A GRN-pending case: PO \u2192 invoice created before GRN is posted (auto-
  resolves as blocked \u2014 exercises the escalation/ticket flow)
- A blocked/rejected case: post an invoice with a deliberate price
  variance against the PO so it lands in blocked status

### Payment / clearing status

Once an invoice is released, run the standard payment run (or post a
manual clearing document) against at least one of them so there's a
"Cleared" case to query, and leave at least one open/scheduled so the
"Scheduled" case has something to show.

### Form 16 / withholding tax

This is the piece most likely to need custom configuration \u2014 India
withholding tax certificate generation depends on tenant-level tax
configuration (withholding tax types/codes) being active. If the trial
tenant doesn't have Indian withholding tax configured out of the box,
this may need a functional consultant to activate it, or the app's
Form 16 answer will legitimately (and correctly) come back as "not
found" until that's done. That's expected behavior, not a bug \u2014 the
whole point of removing mock data is that the assistant only ever
reflects what's actually true in SAP.

## 4. Validate

Once `.env.local` is filled in, before creating any data, first confirm
the four OData services actually resolve:

```bash
npm run verify:sap
```

This authenticates with your Communication Arrangement credentials and
probes each of the four service paths (vendor, invoice, payment, Form 16).
Payment and Form 16 are the ones most likely to fail — if they do, the
output tells you which `SAP_S4_*_SERVICE_PATH` env var to set once you
know the real CDS view name for your tenant. Fix these before creating
demo data, not after.

Once that passes and data exists in SAP:

```bash
npm run dev
```

Go to the vendor portal, enter the real vendor code + PAN/GSTIN you
created, and query the real invoice/PO numbers you posted. If SAP isn't
reachable or a communication arrangement is misconfigured, the app will
say so explicitly rather than ever returning fabricated data.

## 5. Before the client demo

- Re-run `npm run verify:sap` one more time close to demo day — tenant
  config can drift.
- Set `ADMIN_PASSWORD` in `.env.local` (see main README's "Business
  support access" section) and confirm you can sign in at `/admin/login`.
- Walk both paths once end-to-end yourself: a clean auto-resolved query,
  and one that escalates to a ticket — so you know what the client will
  see either way.
