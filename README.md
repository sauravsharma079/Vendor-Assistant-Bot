# Vendor Query Assistant

Self-service bot for manufacturing suppliers to check **invoice status**,
**payment status**, **Form 16 / TDS certificates**, and download a full
**account statement** (Excel, invoices + payments for a date range) —
without emailing or calling business support. Built for the Kyndryl vendor
query resolution use case. Standalone codebase, independent of the
Veltriance SaaS platform.

**No mock, seeded, or hardcoded data in production.** Every answer comes
from a live OData call to a connected SAP S/4HANA tenant. If SAP isn't
configured, or a record doesn't exist, the app says so explicitly rather
than fabricating a response. The one exception is `SAP_MODE=mock`, an
explicit local-dev-only flag that routes to a standalone fake SAP
(`mock-sap-server/`) for testing without a real tenant — see "Local mock
SAP (dev only)" below. It's hard-blocked whenever `NODE_ENV=production`.

**Vendors can also just type a question instead of using the menu.** An
optional free-tier LLM (Groq, `GROQ_API_KEY` in `.env.local`) classifies
the question and rewords the answer, but the answer itself always still
comes from the same `resolveQuery()` SAP lookup the menu-driven flow
uses — the model never generates a fact on its own. Leave `GROQ_API_KEY`
unset and the menu-driven flow works exactly as before.

**Every supplier can only ever see their own data.** See "Onboarding &
data isolation" below for how this is enforced.

## Setup

1. **Provision an S/4HANA sandbox and create real manufacturing data in
   it.** See [`docs/SANDBOX_SETUP.md`](docs/SANDBOX_SETUP.md) — which
   sandbox to request, how to expose OData APIs via a Communication
   Arrangement, and what vendor/PO/invoice records to create.
2. Copy `.env.example` to `.env.local` and fill in:
   - `SAP_S4_*` — from your Communication Arrangement
   - `SESSION_SECRET` — generate with `openssl rand -hex 32`
   - `ADMIN_PASSWORD` — gates the business support dashboard, see below
   - `EMAIL_MODE` + `SMTP_*` — OTP delivery (see below)
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   - Vendor self-service portal: http://localhost:3000
   - Business support / SLA dashboard: http://localhost:3000/admin
     (password-gated — see "Business support access" below)
4. **Before demoing to the client**, run `npm run verify:sap` to confirm
   all four SAP service paths actually resolve against your sandbox —
   see "SAP service paths" below for why this matters.

Until SAP is configured, the app runs fine but every query correctly
reports that it isn't connected yet — that's expected, not a bug.

## Onboarding & data isolation

A supplier goes through two factors before they can query anything:

1. **Vendor code + PAN/GSTIN** (something they know) — checked against
   the live SAP vendor master. Wrong details fail with a generic message
   (doesn't reveal whether the code or the tax ID was wrong, to resist
   enumeration), and 5 failed attempts locks that vendor code out for 15
   minutes.
2. **One-time code emailed to the address on file in SAP** (something
   they have) — not an email they type in, the one SAP already has
   for that vendor. This means knowing a vendor's PAN/GSTIN alone (which
   can leak through invoices, filings, etc.) isn't enough to get in.

Once both pass, the server issues a **signed, httpOnly session cookie**
scoped to that one vendor code. From then on:

- Every subsequent API call reads the vendor code **only from the
  session**, never from anything the client sends in a request body.
  Even if a request tried to pass a different vendor code, it's ignored.
- Every SAP query (`lib/sap/s4hana-connector.ts`) filters server-side by
  that vendor code — so even a record ID that happens to also belong to
  another vendor won't come back; the app escalates to a ticket instead
  of ever returning someone else's data.
- Sessions expire after 30 minutes and re-verification is required.

This is implemented in `lib/auth/` (OTP + session logic) and enforced at
`app/api/query/route.ts` (the single place all vendor data requests pass
through).

### Privacy handling

- PAN, GSTIN, and email are **never logged or displayed in full** —
  `lib/privacy/mask.ts` masks them everywhere they touch the audit log
  or UI (e.g. `j***@company.com`, `******1234K`).
- OTP codes are stored as SHA-256 hashes, never plaintext, and expire
  after 5 minutes.
- Session cookies are `httpOnly`, `sameSite=strict`, and `secure` in
  production — not readable or forgeable from client-side JS.
- Failed verification attempts are audit-logged (masked) for traceability
  without exposing the sensitive values themselves.

## Business support access

`/admin` and its APIs (`/api/tickets`, `/api/query-log`, `/api/audit-log`)
are gated by a shared password (`ADMIN_PASSWORD`), enforced in one place:
`proxy.ts`, which runs in front of every matching request — not just the
page, so hitting the APIs directly without a session is rejected too.

- Sign in at `/admin/login`. A correct password issues a signed, httpOnly
  session cookie (`vqa_admin_session`, 8-hour expiry). 5 failed attempts
  from the same IP locks it out for 15 minutes (`lib/auth/admin-lockout.ts`).
- Every sign-in attempt (success and failure) and every ticket status
  change is written to the audit trail.
- This is a single shared password, appropriate for a demo/POC. Before a
  wider rollout, swap it for per-agent accounts or SSO — the session
  layer (`lib/auth/session.ts`) already separates "how a session is
  signed" from "how someone gets one," so that swap doesn't need to touch
  the session/cookie mechanics.

## SAP service paths

Vendor verification and invoice status use standard SAP-released
services and should work as written. Payment status and Form 16 use
best-effort guesses at custom CDS view names
(`SAP_S4_PAYMENT_SERVICE_PATH`, `SAP_S4_FORM16_SERVICE_PATH` in
`lib/sap/s4hana-connector.ts`) — no single standard service covers either
in most tenants. All four paths are env-var overridable
(see `.env.example`), so if a guess is wrong, it's a config change in
`.env.local`, not a code change and redeploy.

Run `npm run verify:sap` against the real sandbox to check all four
before a demo — it authenticates and probes each path, and tells you
exactly which env var to set if one doesn't resolve.

## Local mock SAP (dev only)

For local development without a real SAP tenant, set `SAP_MODE=mock` in
`.env.local` (see `.env.example`) to route every SAP call to
[`mock-sap-server/`](mock-sap-server/) — a standalone fake SAP REST API +
admin UI with fabricated suppliers, invoices, payments, and Form 16 data.

1. `cd mock-sap-server && npm install && npm start` (serves on `:4001`)
2. In this app's `.env.local`: `SAP_MODE=mock` and `MOCK_SAP_BASE_URL=http://localhost:4001`
3. `npm run dev` as usual — queries now resolve against the mock data instead of live SAP

This is wired through `lib/sap/mock-connector.ts`, selected in
`lib/sap/index.ts` only when `SAP_MODE=mock` is explicitly set, and hard-
blocked whenever `NODE_ENV=production` — it cannot end up in front of a
real vendor no matter what gets deployed. Leave `SAP_MODE` unset (the
default) to use the real connector.

### OTP delivery

- `EMAIL_MODE=console` (default outside production) prints the OTP to
  the **server console only** — for local development, so you can test
  onboarding before SMTP is set up. It refuses to run at all if
  `NODE_ENV=production`, so this can't accidentally ship.
- `EMAIL_MODE=smtp` sends a real email via `lib/email/smtp-sender.ts`
  (works with any SMTP provider — SES, SendGrid, Postmark, etc.) —
  **required** before sharing this with real vendors.

## Architecture

```
proxy.ts                        Gates /admin + its APIs on the admin session

app/
  page.tsx                     Vendor portal (chat-style self-service)
  admin/
    page.tsx                    Business support SLA dashboard
    login/page.tsx               Admin password sign-in
  api/
    auth/request-otp/route.ts    Step 1: verify PAN/GSTIN, email OTP
    auth/verify-otp/route.ts     Step 2: verify OTP, issue session cookie
    auth/me/route.ts              Session check (for UI restore on reload)
    auth/logout/route.ts          Clear session
    admin-auth/login/route.ts      Admin password check, issue admin session
    admin-auth/logout/route.ts     Clear admin session
    admin-auth/me/route.ts          Admin session check
    query/route.ts                 Session-gated: resolve/escalate a query
    ai-query/route.ts               Session-gated: free-text alternative to
                                    query/route.ts — same resolveQuery(),
                                    LLM only classifies intent + rewords
    tickets/route.ts               GET/PATCH: exception ticket queue (admin-gated)
    query-log/route.ts             GET: full query history (admin-gated)
    audit-log/route.ts             GET: compliance audit trail (admin-gated)

lib/
  sap/
    types.ts                     SapConnector interface
    s4hana-connector.ts           Real OData calls to SAP S/4HANA Cloud,
                                  OAuth2 client-credentials auth, env-var-
                                  overridable service paths — the default
                                  and only connector in production
    mock-connector.ts             Dev-only: calls mock-sap-server instead
                                  of live SAP, used only when SAP_MODE=mock
    index.ts                      getSapConnector() entry point — the
                                  SAP_MODE switch, blocked in production
  auth/
    otp-store.ts                  OTP challenges, PAN attempt lockout
    admin-lockout.ts               Admin password attempt lockout (by IP)
    session.ts                     Signed vendor + admin session token create/verify
  email/
    types.ts, smtp-sender.ts,
    console-sender.ts, index.ts    OTP delivery, pluggable provider
  privacy/mask.ts                 PAN/GSTIN/email masking helpers
  resolver.ts                     Core logic: SAP lookup -> auto-resolve
                                  or escalate -> log everything
  llm/
    groq.ts                        Groq free-tier chat completion client
    vendor-assistant.ts             parseVendorIntent() (free text -> query
                                    type + reference) and phraseResponse()
                                    (rewords an already-fetched, already-
                                    correct summary — never generates facts)
  store/                          File-backed store for tickets, query
                                  log, audit log (swap for a real
                                  database before production use)

components/
  VendorChat.tsx                  Vendor onboarding + query chat widget
  AdminDashboard.tsx               SLA dashboard (stats, tickets, logs)
  Header.tsx                       Shared nav

scripts/
  verify-sap-services.ts           Pre-demo check: confirms all 4 SAP
                                   service paths resolve (npm run verify:sap)

docs/
  SANDBOX_SETUP.md                 Sandbox provisioning + live data
                                   creation runbook
```

## What's still open

- **Payment/clearing status and Form 16 OData paths are still best-effort
  guesses** at custom CDS view names — no single standard SAP-released
  service covers either in most tenants. They're now env-var overridable
  (see "SAP service paths" above) and `npm run verify:sap` checks them
  automatically, but someone still needs to run that check against the
  real tenant and fix any mismatch before the client sees it.
- The file-backed stores (`lib/store`, `lib/auth/otp-store.ts`,
  `lib/auth/admin-lockout.ts`) are fine for a single-instance demo but
  should move to a real database + cache/rate-limit store (e.g. Postgres
  + Redis) before production or multi-instance hosting.
- No CSRF token beyond `sameSite=strict` cookies — adequate for same-site
  usage, worth hardening further before wider rollout.
- Query classification is menu-driven (not free-text NLP) by design —
  more reliable for a demo; an NLP intent layer can sit in front of the
  same resolver later without touching SAP integration or auth.
- `/admin` is now gated by a single shared password
  (`ADMIN_PASSWORD`) rather than per-agent accounts — fine for a POC with
  one or two business support users in the room, but swap for individual
  accounts or SSO before a wider internal rollout.
