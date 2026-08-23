const TABS = [
  { id: "suppliers", label: "Suppliers", endpoint: "/api/suppliers", statusKey: null },
  { id: "contracts", label: "Contracts", endpoint: "/api/contracts", statusKey: "status" },
  { id: "requisitions", label: "Requisitions", endpoint: "/api/requisitions", statusKey: "status" },
  { id: "purchase-orders", label: "Purchase Orders", endpoint: "/api/purchase-orders", statusKey: "status" },
  { id: "goods-receipts", label: "Goods Receipts", endpoint: "/api/goods-receipts", statusKey: "status" },
  { id: "invoices", label: "Invoices", endpoint: "/api/invoices", statusKey: "approvalStatus" },
  { id: "payments", label: "Payments", endpoint: "/api/payments", statusKey: "status" },
  { id: "gl-postings", label: "GL Postings", endpoint: "/api/gl-postings", statusKey: null },
  { id: "form16", label: "Form 16A / Form 26AS / TDS", endpoint: "/api/form16", statusKey: "status" },
];

const COLUMN_LABELS = {
  vendorCode: "Vendor Code",
  vendorName: "Vendor Name",
  pan: "PAN",
  gstin: "GSTIN",
  plant: "Plant",
  category: "Category",
  email: "Email",

  contractId: "Contract ID",
  material: "Material",
  unitPrice: "Unit Price",
  unit: "Unit",
  currency: "Currency",
  paymentTerms: "Payment Terms",
  validFrom: "Valid From",
  validTo: "Valid To",
  status: "Status",

  requisitionNo: "Requisition No.",
  description: "Description",
  quantity: "Quantity",
  estimatedValue: "Estimated Value",
  createdDate: "Created Date",
  poNumber: "PO Number",

  totalValue: "Total Value",
  expectedDeliveryDate: "Expected Delivery",

  grnNumber: "GRN Number",
  receivedDate: "Received Date",
  quantityOrdered: "Quantity Ordered",
  quantityReceived: "Quantity Received",
  inspectionStatus: "Inspection Status",

  invoiceNo: "Invoice No.",
  postingDate: "Posting Date",
  grnMatched: "GRN Matched",
  approvalStatus: "Approval Status",
  blockReason: "Block Reason",
  amount: "Amount",

  paymentDocNo: "Payment Doc No.",
  clearingDate: "Clearing Date",
  scheduledDate: "Scheduled Date",
  bankReference: "Bank Reference",
  holdReason: "Hold Reason",

  documentNo: "Document No.",
  reference: "Reference",
  referenceType: "Reference Type",
  glAccount: "GL Account",
  glAccountName: "GL Account Name",
  debitCredit: "Debit / Credit",

  certificateNo: "Certificate No.",
  financialYear: "Financial Year",
  quarter: "Quarter",
  tdsAmount: "TDS Amount",
  downloadUrl: "Download URL",
};

function columnLabel(key) {
  return COLUMN_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

const STATUS_MAP = {
  Approved: "positive",
  Active: "positive",
  Cleared: "positive",
  Full: "positive",
  Accepted: "positive",
  Available: "positive",
  Completed: "positive",
  "Converted to PO": "positive",

  Scheduled: "informative",
  Open: "informative",

  "Pending Approval": "critical",
  "Under Processing": "critical",
  Partial: "critical",
  Pending: "critical",

  Blocked: "negative",
  Rejected: "negative",
  "On Hold": "negative",

  "Not Yet Generated": "neutral",
  Expired: "neutral",
  Closed: "neutral",
};

let activeTab = TABS[0].id;

function statusBadge(value) {
  if (!value) return "";
  const semantic = STATUS_MAP[value] || "neutral";
  return `<span class="status status-${semantic}">${value}</span>`;
}

function renderTable(rows, statusKey) {
  const container = document.getElementById("content");
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No records match this filter.</div>';
    return;
  }

  const columns = Object.keys(rows[0]);
  const head = columns.map((c) => `<th>${columnLabel(c)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const value = row[c];
          if (c === statusKey) return `<td>${statusBadge(value)}</td>`;
          if (value === null || value === undefined || value === "") return "<td>—</td>";
          if (typeof value === "number") return `<td>${value.toLocaleString("en-IN")}</td>`;
          return `<td>${value}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="count">${rows.length} record${rows.length === 1 ? "" : "s"}</div>
    <div class="table-wrap">
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
  `;
}

async function loadTab(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  const vendorCode = document.getElementById("vendorFilter").value.trim();
  const url = new URL(tab.endpoint, window.location.origin);
  if (vendorCode) url.searchParams.set("vendorCode", vendorCode);

  document.getElementById("content").innerHTML = '<div class="empty">Loading…</div>';

  try {
    const res = await fetch(url);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [json];
    renderTable(rows, tab.statusKey);
  } catch (err) {
    document.getElementById("content").innerHTML = `<div class="empty">Failed to load: ${err.message}</div>`;
  }
}

function renderTabs() {
  const nav = document.getElementById("tabs");
  nav.innerHTML = TABS.map(
    (t) => `<div class="tab ${t.id === activeTab ? "active" : ""}" data-tab="${t.id}">${t.label}</div>`
  ).join("");

  nav.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      activeTab = el.dataset.tab;
      renderTabs();
      loadTab(activeTab);
    });
  });
}

document.getElementById("vendorFilter").addEventListener("input", () => loadTab(activeTab));

renderTabs();
loadTab(activeTab);
