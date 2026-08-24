import type {
  SapConnector,
  VendorIdentity,
  InvoiceStatusResult,
  PaymentStatusResult,
  Form16Result,
  PurchaseOrderResult,
} from "./types";
import { SapNotConfiguredError, SapRequestError } from "./s4hana-connector";

/**
 * MockSapConnector — talks to the standalone mock-sap-server (see
 * mock-sap-server/ at the repo root) instead of a real SAP tenant.
 *
 * Only ever used when SAP_MODE=mock is explicitly set (see
 * lib/sap/index.ts), and hard-disabled when NODE_ENV=production — this app
 * must never show fabricated invoice/payment/tax data to a real vendor.
 */

function baseUrl(): string {
  return process.env.MOCK_SAP_BASE_URL || "http://localhost:4001";
}

async function mockGet<T>(path: string): Promise<T | null> {
  const url = `${baseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new SapNotConfiguredError(
      `Could not reach mock-sap-server at ${url}. Is it running? ` +
        `(cd mock-sap-server && npm start) — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SapRequestError(`mock-sap-server request failed: ${res.status} ${res.statusText} — ${body}`, res.status);
  }

  return (await res.json()) as T;
}

export class MockSapConnector implements SapConnector {
  async verifyVendor(vendorCode: string, panOrGstin: string): Promise<VendorIdentity | null> {
    return mockGet<VendorIdentity>(
      `/api/suppliers/${encodeURIComponent(vendorCode.trim())}/verify?taxId=${encodeURIComponent(panOrGstin.trim())}`
    );
  }

  async getInvoiceStatus(vendorCode: string, invoiceOrPo: string): Promise<InvoiceStatusResult | null> {
    return mockGet<InvoiceStatusResult>(
      `/api/invoices?vendorCode=${encodeURIComponent(vendorCode.trim())}&ref=${encodeURIComponent(invoiceOrPo.trim())}`
    );
  }

  async getPaymentStatus(vendorCode: string, invoiceOrPoRef?: string): Promise<PaymentStatusResult[]> {
    const refParam = invoiceOrPoRef ? `&ref=${encodeURIComponent(invoiceOrPoRef.trim())}` : "";
    const result = await mockGet<PaymentStatusResult[]>(
      `/api/payments?vendorCode=${encodeURIComponent(vendorCode.trim())}${refParam}`
    );
    return result ?? [];
  }

  async getForm16(vendorCode: string, financialYear: string): Promise<Form16Result | null> {
    // mock-sap-server returns a single relative path (e.g. "/certs/FORM16A-2025-Q1-100001")
    // when the certificate is Available, null otherwise — /certs/:certificateNo
    // serves Form 16A by default and Form 26AS via ?type=26as (see mock-sap-server/certs.js).
    const cert = await mockGet<Omit<Form16Result, "downloadUrlForm16A" | "downloadUrlForm26AS"> & { downloadUrl: string | null }>(
      `/api/form16?vendorCode=${encodeURIComponent(vendorCode.trim())}&financialYear=${encodeURIComponent(financialYear.trim())}`
    );
    if (!cert) return null;
    const { downloadUrl, ...rest } = cert;
    return {
      ...rest,
      downloadUrlForm16A: downloadUrl ? `${baseUrl()}${downloadUrl}` : null,
      downloadUrlForm26AS: downloadUrl ? `${baseUrl()}${downloadUrl}?type=26as` : null,
    };
  }

  async getPurchaseOrder(vendorCode: string, poNumber: string): Promise<PurchaseOrderResult | null> {
    // /api/purchase-orders always returns an array (unlike /api/invoices,
    // which special-cases a single-record response when `ref` is given).
    const result = await mockGet<PurchaseOrderResult[]>(
      `/api/purchase-orders?vendorCode=${encodeURIComponent(vendorCode.trim())}&poNumber=${encodeURIComponent(poNumber.trim())}`
    );
    return result?.[0] ?? null;
  }

  async listInvoices(vendorCode: string, dateFrom?: string, dateTo?: string): Promise<InvoiceStatusResult[]> {
    // mock-sap-server's /api/invoices already returns every invoice for a
    // vendor when no ref is given; date-range filtering happens here since
    // the mock server doesn't support it server-side.
    const result = await mockGet<InvoiceStatusResult[]>(`/api/invoices?vendorCode=${encodeURIComponent(vendorCode.trim())}`);
    const all = result ?? [];
    if (!dateFrom && !dateTo) return all;
    return all.filter((inv) => (!dateFrom || inv.postingDate >= dateFrom) && (!dateTo || inv.postingDate <= dateTo));
  }
}
