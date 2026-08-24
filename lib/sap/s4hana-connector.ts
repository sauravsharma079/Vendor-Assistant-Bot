import type {
  SapConnector,
  VendorIdentity,
  InvoiceStatusResult,
  PaymentStatusResult,
  Form16Result,
  PurchaseOrderResult,
} from "./types";

/**
 * RealS4HanaConnector \u2014 talks to a live SAP S/4HANA Cloud tenant over
 * OData v2/v4, using OAuth2 client-credentials auth via a Communication
 * Arrangement. This is the default and only connector used in production;
 * see lib/sap/index.ts for the SAP_MODE=mock dev-only exception.
 *
 * --------------------------------------------------------------------
 * ONE-TIME SETUP IN THE SAP TENANT (Fiori apps, done by whoever has
 * admin access to the S/4HANA Cloud trial):
 *
 * 1. "Communication Users" app \u2014 create a technical user for this bot.
 * 2. "Communication Systems" app \u2014 register this app as an external
 *    system, attach the communication user.
 * 3. "Communication Arrangements" app \u2014 create arrangements for each
 *    scenario below, attach the communication system, and copy the
 *    generated OAuth2 client ID/secret + token URL into .env.local:
 *      - SAP_COM_0106  Business Partner, Supplier Integration
 *                        (vendor identity verification)
 *      - SAP_COM_0092  Supplier Invoice Integration
 *                        (invoice + payment status)
 *      - Withholding tax / Form 16: check whether your tenant exposes
 *        this via a standard communication scenario or needs a custom
 *        CDS view exposed as OData (this varies by tenant configuration
 *        and is the one piece worth confirming with Kyndryl/SAP Basis
 *        early, since Form 16 issuance is India-localization specific).
 * 4. Note each arrangement's service base path \u2014 they differ per
 *    scenario, which is why BASE_URL below is composed per-call rather
 *    than being one fixed path for the whole tenant.
 *
 * ENV VARS THIS FILE READS:
 *   SAP_S4_BASE_URL        e.g. https://<tenant>.s4hana.cloud.sap
 *   SAP_S4_TOKEN_URL        OAuth2 token endpoint from the Communication
 *                          Arrangement (same for all scopes on most
 *                          tenants, but confirm per-arrangement)
 *   SAP_S4_CLIENT_ID
 *   SAP_S4_CLIENT_SECRET
 * --------------------------------------------------------------------
 */

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

// Service paths as env vars with defaults, not hardcoded constants. The
// vendor and invoice paths are standard SAP-released services and unlikely
// to need changing. The payment and Form 16 paths are best-effort guesses
// at custom CDS view names (see class-level comment) — if the real tenant
// exposes them under a different service/entity name, that's a one-line
// .env.local edit instead of a code change and redeploy. Run
// `npm run verify:sap` against the real sandbox to confirm all four before
// a demo.
function envOrDefault(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const SAP_SERVICE_PATHS = {
  vendor: envOrDefault("SAP_S4_VENDOR_SERVICE_PATH", "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Supplier"),
  invoice: envOrDefault(
    "SAP_S4_INVOICE_SERVICE_PATH",
    "/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV/A_SupplierInvoice"
  ),
  payment: envOrDefault("SAP_S4_PAYMENT_SERVICE_PATH", "/sap/opu/odata/sap/ZCDS_VENDOR_LINE_ITEMS/A_VendorLineItem"),
  form16: envOrDefault("SAP_S4_FORM16_SERVICE_PATH", "/sap/opu/odata/sap/ZCDS_WHT_CERTIFICATES/A_WithholdingTaxCert"),
  purchaseOrderItem: envOrDefault(
    "SAP_S4_PO_ITEM_SERVICE_PATH",
    "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem"
  ),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SapNotConfiguredError(
      `${name} is not set. Configure the S/4HANA sandbox connection in .env.local ` +
        `(see .env.example) before the Vendor Query Assistant can answer live queries.`
    );
  }
  return value;
}

export class SapNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SapNotConfiguredError";
  }
}

export class SapRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SapRequestError";
    this.status = status;
  }
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) {
    return tokenCache.token;
  }

  const tokenUrl = requireEnv("SAP_S4_TOKEN_URL");
  const clientId = requireEnv("SAP_S4_CLIENT_ID");
  const clientSecret = requireEnv("SAP_S4_CLIENT_SECRET");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new SapRequestError(`OAuth2 token request failed: ${res.status} ${res.statusText}`, res.status);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function sapGet<T>(path: string): Promise<T> {
  const baseUrl = requireEnv("SAP_S4_BASE_URL");
  const token = await getAccessToken();

  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    throw new SapRequestError("NOT_FOUND", 404);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SapRequestError(`SAP request failed: ${res.status} ${res.statusText} \u2014 ${body}`, res.status);
  }

  return (await res.json()) as T;
}

export class RealS4HanaConnector implements SapConnector {
  async verifyVendor(vendorCode: string, panOrGstin: string): Promise<VendorIdentity | null> {
    // API_BUSINESS_PARTNER \u2014 Supplier / Business Partner OData service.
    // Filters on Supplier (vendor code) and matches PAN (STCD1) or GSTIN
    // (STCD3) client-side once retrieved, since tax number field usage
    // can vary by country version / tenant config.
    try {
      const data = await sapGet<{
        d: {
          results: Array<{
            Supplier: string;
            SupplierName: string;
            TaxNumber1?: string; // PAN, typically STCD1
            TaxNumber3?: string; // GSTIN, typically STCD3
            Plant?: string;
            SupplierAccountGroup?: string;
            EmailAddress?: string;
          }>;
        };
      }>(
        `${SAP_SERVICE_PATHS.vendor}` +
          `?$filter=Supplier eq '${encodeURIComponent(vendorCode.trim())}'&$format=json`
      );

      const record = data.d.results[0];
      if (!record) return null;

      const normalized = panOrGstin.trim().toUpperCase();
      const matches = record.TaxNumber1 === normalized || record.TaxNumber3 === normalized;
      if (!matches) return null;

      return {
        vendorCode: record.Supplier,
        vendorName: record.SupplierName,
        pan: record.TaxNumber1 ?? "",
        gstin: record.TaxNumber3 ?? "",
        plant: record.Plant ?? "",
        category: record.SupplierAccountGroup ?? "",
        email: record.EmailAddress ?? "",
      };
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async getInvoiceStatus(vendorCode: string, invoiceOrPo: string): Promise<InvoiceStatusResult | null> {
    // API_SUPPLIERINVOICE_PROCESS_SRV \u2014 A_SupplierInvoice, filtered by
    // Supplier + (SupplierInvoice or PurchaseOrder). Field names below
    // are the standard SAP field names for this service; confirm exact
    // entity/field naming against the tenant's metadata document
    // ($metadata) once connected, since some are release-dependent.
    try {
      const ref = encodeURIComponent(invoiceOrPo.trim());
      const data = await sapGet<{
        d: {
          results: Array<{
            SupplierInvoice: string;
            PurchasingDocument: string;
            DocumentDate: string;
            InvoicingParty: string;
            IsInvoiceBlocked: boolean;
            GoodsReceiptBasedInvVerf?: boolean;
            InvoiceGrossAmount: string;
            DocumentCurrency: string;
          }>;
        };
      }>(
        `${SAP_SERVICE_PATHS.invoice}` +
          `?$filter=InvoicingParty eq '${encodeURIComponent(vendorCode.trim())}' and ` +
          `(SupplierInvoice eq '${ref}' or PurchasingDocument eq '${ref}')&$format=json`
      );

      const inv = data.d.results[0];
      if (!inv) return null;

      return {
        invoiceNo: inv.SupplierInvoice,
        poNumber: inv.PurchasingDocument,
        postingDate: inv.DocumentDate,
        grnMatched: !!inv.GoodsReceiptBasedInvVerf,
        grnNumber: null,
        approvalStatus: inv.IsInvoiceBlocked ? "Blocked" : "Approved",
        blockReason: inv.IsInvoiceBlocked ? "Invoice is blocked \u2014 see SAP for release reason" : null,
        amount: parseFloat(inv.InvoiceGrossAmount),
        currency: inv.DocumentCurrency,
      };
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async getPaymentStatus(vendorCode: string, invoiceOrPoRef?: string): Promise<PaymentStatusResult[]> {
    // Vendor open/cleared line items \u2014 typically exposed via a custom
    // CDS view over BSIK/BSAK (no single standard released OData service
    // covers this cleanly for all tenants). TODO: confirm the exact
    // service name/path with Kyndryl's SAP Basis team once the
    // communication arrangement is set up, then adjust the path and
    // field mapping below.
    try {
      const filter = invoiceOrPoRef
        ? `SupplierInvoice eq '${encodeURIComponent(invoiceOrPoRef.trim())}' and `
        : "";
      const data = await sapGet<{
        d: {
          results: Array<{
            SupplierInvoice: string;
            ClearingDocument?: string;
            IsCleared: boolean;
            ClearingDate?: string;
            NetDueDate?: string;
            AmountInDocumentCurrency: string;
            DocumentCurrency: string;
            PaymentReference?: string;
            PaymentBlockingReason?: string;
          }>;
        };
      }>(
        `${SAP_SERVICE_PATHS.payment}` +
          `?$filter=${filter}SupplierAccount eq '${encodeURIComponent(vendorCode.trim())}'&$format=json`
      );

      return data.d.results.map((item) => ({
        invoiceNo: item.SupplierInvoice,
        paymentDocNo: item.ClearingDocument ?? null,
        status: item.PaymentBlockingReason
          ? "On Hold"
          : item.IsCleared
          ? "Cleared"
          : item.NetDueDate
          ? "Scheduled"
          : "Open",
        clearingDate: item.ClearingDate ?? null,
        scheduledDate: item.NetDueDate ?? null,
        amount: parseFloat(item.AmountInDocumentCurrency),
        currency: item.DocumentCurrency,
        bankReference: item.PaymentReference ?? null,
        holdReason: item.PaymentBlockingReason ?? null,
      }));
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return [];
      throw err;
    }
  }

  async getForm16(vendorCode: string, financialYear: string): Promise<Form16Result | null> {
    // Withholding tax certificate data. India Form 16A generation is a
    // localization-specific process (typically run via withholding tax
    // reporting, or a custom certificate repository); most tenants will
    // need a custom CDS view exposed over OData for this. TODO: confirm
    // with Kyndryl's SAP team where/how certificates are stored in their
    // tenant, then adjust the path and field mapping below.
    try {
      const data = await sapGet<{
        d: {
          results: Array<{
            WithholdingTaxCertificate: string;
            FiscalYear: string;
            FiscalQuarter?: string;
            WithholdingTaxAmount: string;
            Currency: string;
            CertificateStatus: string;
            DownloadUrl?: string;
          }>;
        };
      }>(
        `${SAP_SERVICE_PATHS.form16}` +
          `?$filter=Supplier eq '${encodeURIComponent(vendorCode.trim())}' and ` +
          `FiscalYear eq '${encodeURIComponent(financialYear.trim())}'&$format=json`
      );

      const cert = data.d.results[0];
      if (!cert) return null;

      const status: Form16Result["status"] =
        cert.CertificateStatus === "Available"
          ? "Available"
          : cert.CertificateStatus === "Processing"
          ? "Under Processing"
          : "Not Yet Generated";

      return {
        certificateNo: cert.WithholdingTaxCertificate,
        financialYear: cert.FiscalYear,
        quarter: (cert.FiscalQuarter as Form16Result["quarter"]) ?? "Q1",
        tdsAmount: parseFloat(cert.WithholdingTaxAmount),
        currency: cert.Currency,
        status,
        downloadUrlForm16A: cert.DownloadUrl ?? null,
        // Form 26AS is not a SAP document — it's the Income Tax Department's
        // own annual tax credit statement (viewable/downloadable exclusively
        // via the government's TRACES portal, using the vendor's own PAN
        // login). No SAP tenant can serve this, so it's always null here —
        // vendors need to get it directly from TRACES, not through this app.
        downloadUrlForm26AS: null,
      };
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async getPurchaseOrder(vendorCode: string, poNumber: string): Promise<PurchaseOrderResult | null> {
    // API_PURCHASEORDER_PROCESS_SRV — a standard SAP-released service, like
    // vendor/invoice. Queried at item level (A_PurchaseOrderItem) rather
    // than the PO header, since quantity/price/delivery date/material live
    // there — this assumes a single-line PO like the mock data models;
    // a multi-line PO would need summing across items, worth confirming
    // against real tenant data. Filters on Supplier client-side isn't
    // possible from the item entity alone, so this trusts the PO number
    // itself as sufficient scoping — the invoice this PO belongs to is
    // already vendor-scoped by the caller, so a vendor can only ever reach
    // a PO number that's genuinely theirs.
    try {
      const data = await sapGet<{
        d: {
          results: Array<{
            PurchaseOrder: string;
            PurchaseOrderItemText?: string;
            Material?: string;
            OrderQuantity: string;
            PurchaseOrderQuantityUnit: string;
            NetPriceAmount: string;
            NetAmount: string;
            DocumentCurrency: string;
            PurchasingDocumentDate: string;
            ScheduleLineDeliveryDate?: string;
            PurchasingProcessingStatus?: string;
          }>;
        };
      }>(`${SAP_SERVICE_PATHS.purchaseOrderItem}?$filter=PurchaseOrder eq '${encodeURIComponent(poNumber.trim())}'&$format=json`);

      const item = data.d.results[0];
      if (!item) return null;

      return {
        poNumber: item.PurchaseOrder,
        description: item.PurchaseOrderItemText || item.Material || "—",
        quantity: parseFloat(item.OrderQuantity),
        unit: item.PurchaseOrderQuantityUnit,
        unitPrice: parseFloat(item.NetPriceAmount),
        totalValue: parseFloat(item.NetAmount),
        currency: item.DocumentCurrency,
        status: item.PurchasingProcessingStatus || "Open",
        createdDate: item.PurchasingDocumentDate,
        expectedDeliveryDate: item.ScheduleLineDeliveryDate ?? "",
      };
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return null;
      throw err;
    }
  }

  async listInvoices(vendorCode: string, dateFrom?: string, dateTo?: string): Promise<InvoiceStatusResult[]> {
    // Same service/fields as getInvoiceStatus, filtered by vendor + an
    // optional DocumentDate range instead of a specific document number.
    // OData date literals need SAP's datetime'...' format; confirm the
    // exact filter syntax this tenant's release expects once connected.
    try {
      let filter = `InvoicingParty eq '${encodeURIComponent(vendorCode.trim())}'`;
      if (dateFrom) filter += ` and DocumentDate ge datetime'${dateFrom}T00:00:00'`;
      if (dateTo) filter += ` and DocumentDate le datetime'${dateTo}T00:00:00'`;

      const data = await sapGet<{
        d: {
          results: Array<{
            SupplierInvoice: string;
            PurchasingDocument: string;
            DocumentDate: string;
            InvoicingParty: string;
            IsInvoiceBlocked: boolean;
            GoodsReceiptBasedInvVerf?: boolean;
            InvoiceGrossAmount: string;
            DocumentCurrency: string;
          }>;
        };
      }>(`${SAP_SERVICE_PATHS.invoice}?$filter=${filter}&$format=json`);

      return data.d.results.map((inv) => ({
        invoiceNo: inv.SupplierInvoice,
        poNumber: inv.PurchasingDocument,
        postingDate: inv.DocumentDate,
        grnMatched: !!inv.GoodsReceiptBasedInvVerf,
        grnNumber: null,
        approvalStatus: inv.IsInvoiceBlocked ? "Blocked" : "Approved",
        blockReason: inv.IsInvoiceBlocked ? "Invoice is blocked — see SAP for release reason" : null,
        amount: parseFloat(inv.InvoiceGrossAmount),
        currency: inv.DocumentCurrency,
      }));
    } catch (err) {
      if (err instanceof SapRequestError && err.status === 404) return [];
      throw err;
    }
  }
}
