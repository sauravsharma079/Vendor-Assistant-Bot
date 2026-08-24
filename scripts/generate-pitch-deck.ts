// Generates a client-facing pitch deck (with commercials) for the Vendor
// Query Assistant, as a real, editable PPTX — not a screenshot.
// Run with: npx tsx scripts/generate-pitch-deck.ts
//
// The commercial figures on the pricing slides are illustrative,
// market-benchmarked numbers (explicitly labeled as such on every pricing
// slide) for a typical mid-size manufacturer with ~1,000 active vendors on
// a single SAP S/4HANA tenant — the same scale this codebase's mock data
// is built around. They are a reasonable starting point for a real
// conversation, not a quote — validate against actual delivery cost and
// final scope before sending to a client. [Client Name] on the title slide
// is the one placeholder left for the user to fill in.

import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";

const NAVY = "0f1729";
const NAVY_2 = "17263c";
const GOLD = "C9A227";
const GOLD_DARK = "A9860E";
const STEEL = "5b6b7c";
const BORDER = "e1e3e6";
const BG = "f6f7f9";
const WHITE = "FFFFFF";
const EMERALD = "059669";

const CLIENT_NAME = "[Client Name]";

async function main() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  const W = 13.33;
  const H = 7.5;
  const MARGIN = 0.6;

  let pageNum = 0;

  // -- shared chrome --------------------------------------------------------

  function footer(slide: PptxGenJS.Slide, dark = false) {
    pageNum += 1;
    slide.addText("Vendor Query Assistant", {
      x: MARGIN,
      y: H - 0.4,
      w: 5,
      h: 0.3,
      fontSize: 8,
      color: dark ? "9AA4B2" : STEEL,
    });
    slide.addText(String(pageNum), {
      x: W - MARGIN - 0.5,
      y: H - 0.4,
      w: 0.5,
      h: 0.3,
      fontSize: 8,
      color: dark ? "9AA4B2" : STEEL,
      align: "right",
    });
  }

  function header(slide: PptxGenJS.Slide, kicker: string, title: string) {
    slide.background = { color: BG };
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 0.5, w: 0.35, h: 0.06, fill: { color: GOLD }, line: { type: "none" } });
    slide.addText(kicker.toUpperCase(), { x: MARGIN, y: 0.58, w: 10, h: 0.3, fontSize: 11, color: GOLD_DARK, bold: true, charSpacing: 1 });
    slide.addText(title, { x: MARGIN, y: 0.86, w: W - MARGIN * 2, h: 0.6, fontSize: 26, color: NAVY, bold: true, fontFace: "Georgia" });
    slide.addShape(pptx.ShapeType.line, {
      x: MARGIN,
      y: 1.55,
      w: W - MARGIN * 2,
      h: 0,
      line: { color: BORDER, width: 1 },
    });
  }

  function card(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: WHITE },
      line: { color: BORDER, width: 1 },
      rectRadius: 0.06,
    });
  }

  // ---------------------------------------------------------------------
  // 1. Title
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: GOLD }, line: { type: "none" } });
    s.addText("VENDOR QUERY RESOLUTION PLATFORM", { x: MARGIN, y: 2.5, w: 11, h: 0.4, fontSize: 13, color: GOLD, bold: true, charSpacing: 2 });
    s.addText("Vendor Query Assistant", { x: MARGIN, y: 2.95, w: 11, h: 1.1, fontSize: 44, color: WHITE, bold: true, fontFace: "Georgia" });
    s.addText("Self-service invoice, payment & Form 16A / Form 26AS / TDS resolution — grounded in live SAP data", {
      x: MARGIN,
      y: 3.95,
      w: 10.5,
      h: 0.5,
      fontSize: 15,
      color: "C8CDD6",
    });
    s.addShape(pptx.ShapeType.line, { x: MARGIN, y: 4.65, w: 2, h: 0, line: { color: GOLD, width: 2 } });
    s.addText(`Prepared for ${CLIENT_NAME}`, { x: MARGIN, y: 6.55, w: 8, h: 0.35, fontSize: 13, color: WHITE, bold: true });
    s.addText("Veltriance  ·  Business Proposal & Commercials", { x: MARGIN, y: 6.9, w: 8, h: 0.3, fontSize: 10.5, color: "9AA4B2" });
    footer(s, true);
  }

  // ---------------------------------------------------------------------
  // 2. Agenda
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Agenda", "What we'll cover");
    const items = [
      "The challenge — how vendor queries are handled today",
      "The solution — Vendor Query Assistant",
      "How it works, and what it can answer",
      "Security, compliance & trustworthy AI",
      "The Business Support command center",
      "Reference architecture",
      "Expected impact & ROI",
      "Implementation roadmap",
      "Commercials — three pricing options",
    ];
    items.forEach((item, i) => {
      const y = 1.95 + i * 0.55;
      s.addShape(pptx.ShapeType.ellipse, { x: MARGIN, y: y + 0.02, w: 0.32, h: 0.32, fill: { color: NAVY }, line: { type: "none" } });
      s.addText(String(i + 1), { x: MARGIN, y: y + 0.02, w: 0.32, h: 0.32, fontSize: 11, color: WHITE, bold: true, align: "center", valign: "middle" });
      s.addText(item, { x: MARGIN + 0.5, y, w: 10.5, h: 0.4, fontSize: 14, color: NAVY, valign: "middle" });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 3. The Challenge
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "The Challenge", "Vendor queries today are slow, manual, and untracked");
    const pain = [
      { t: "No self-service", d: "Vendors email or call for invoice status, payment status, and Form 16A / Form 26AS / TDS — there is no way for them to check it themselves." },
      { t: "Manual, one-by-one handling", d: "Business Support manually searches SAP and replies over email, one query at a time — with no queue, no priority, no SLA." },
      { t: "No visibility or audit trail", d: "There's no record of who asked what, how long it took, or whether it was ever actually resolved." },
      { t: "Vendor dissatisfaction", d: "Days-long response times on simple payment or TDS certificate questions strain supplier relationships and invite escalation." },
    ];
    pain.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 6.05;
      const y = 1.95 + row * 2.15;
      card(s, x, y, 5.75, 1.95);
      s.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h: 1.95, fill: { color: GOLD }, line: { type: "none" } });
      s.addText(p.t, { x: x + 0.3, y: y + 0.2, w: 5.2, h: 0.4, fontSize: 15, color: NAVY, bold: true });
      s.addText(p.d, { x: x + 0.3, y: y + 0.65, w: 5.2, h: 1.15, fontSize: 11.5, color: STEEL, lineSpacingMultiple: 1.25 });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 4. The Solution
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "The Solution", "Vendor Query Assistant");
    s.addText(
      `A self-service portal that gives ${CLIENT_NAME}'s suppliers instant, accurate answers — pulled live from SAP, ` +
        `with an optional AI chat layer that only rewords already-verified SAP data. It never invents a fact.`,
      { x: MARGIN, y: 1.85, w: W - MARGIN * 2, h: 0.7, fontSize: 14, color: NAVY, lineSpacingMultiple: 1.3 }
    );

    const points = [
      "Two-factor vendor verification — vendor code + PAN/GSTIN, one-time code to the email already on file in SAP",
      "Every SAP-backed answer is real-time — no cached, sample, or seeded data reaches a vendor",
      "Anything the system can't resolve becomes a tracked, SLA-bound ticket automatically — nothing falls through email",
      "A live SLA dashboard gives Business Support full visibility into volume, resolution time, and escalations",
    ];
    points.forEach((t, i) => {
      const y = 2.85 + i * 0.85;
      s.addShape(pptx.ShapeType.rect, { x: MARGIN, y: y + 0.06, w: 0.16, h: 0.16, fill: { color: EMERALD }, line: { type: "none" }, rectRadius: 0.03 });
      s.addText(t, { x: MARGIN + 0.4, y, w: 11.5, h: 0.7, fontSize: 13, color: NAVY, lineSpacingMultiple: 1.2, valign: "top" });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 5. How It Works
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "How It Works", "Three steps, every time");
    const steps = [
      { n: "1", t: "Verify", d: "Vendor code + PAN/GSTIN checked against the SAP vendor master, then a one-time code to the email on file." },
      { n: "2", t: "Ask", d: "Pick invoice status, payment status, Form 16A / Form 26AS / TDS, or a full account statement — or just type the question." },
      { n: "3", t: "Get an answer", d: "A live SAP lookup resolves it on the spot — or opens a tracked ticket, with an SLA clock, if it needs a person." },
    ];
    steps.forEach((st, i) => {
      const x = MARGIN + i * 4.08;
      card(s, x, 2.1, 3.85, 3.4);
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.3, y: 2.4, w: 0.55, h: 0.55, fill: { color: NAVY }, line: { type: "none" } });
      s.addText(st.n, { x: x + 0.3, y: 2.4, w: 0.55, h: 0.55, fontSize: 18, color: GOLD, bold: true, align: "center", valign: "middle" });
      s.addText(st.t, { x: x + 0.3, y: 3.15, w: 3.3, h: 0.45, fontSize: 18, color: NAVY, bold: true });
      s.addText(st.d, { x: x + 0.3, y: 3.65, w: 3.3, h: 1.7, fontSize: 12, color: STEEL, lineSpacingMultiple: 1.3 });
      if (i < 2) {
        s.addShape(pptx.ShapeType.line, {
          x: x + 3.9,
          y: 3.75,
          w: 0.22,
          h: 0,
          line: { color: GOLD, width: 2, endArrowType: "triangle" },
        });
      }
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 6. Key Capabilities
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Key Capabilities", "What vendors can do, self-service");
    const feats = [
      { t: "Invoice Status", d: "Real-time approval & GRN-match status, block/rejection reason, straight from SAP." },
      { t: "Payment Status", d: "Cleared, scheduled, on hold, or open — with bank reference and clearing date." },
      { t: "Form 16A / 26AS / TDS", d: "Certificate availability, TDS amount, and download — by financial year and quarter." },
      { t: "Account Statement", d: "Full statement for any date range, aging summary, and payable this month/quarter." },
      { t: "Submitted / Paid / Pending", d: "Every invoice submitted, paid (with payment date), or pending approval — one-click Excel export." },
      { t: "AI Chat", d: "Ask in plain English — grounded strictly in the same live SAP data, never fabricates." },
    ];
    feats.forEach((f, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = MARGIN + col * 4.08;
      const y = 1.95 + row * 2.35;
      card(s, x, y, 3.85, 2.15);
      s.addText(f.t, { x: x + 0.25, y: y + 0.2, w: 3.4, h: 0.45, fontSize: 14, color: NAVY, bold: true });
      s.addText(f.d, { x: x + 0.25, y: y + 0.7, w: 3.4, h: 1.3, fontSize: 11, color: STEEL, lineSpacingMultiple: 1.25 });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 7. Security, Compliance & Trustworthy AI
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Security & Trust", "Built to never show a vendor the wrong data");
    const left = [
      "Two-factor identity check — vendor code + PAN/GSTIN against SAP, plus a one-time code to the email SAP already has on file",
      "Every request is scoped server-side to the verified vendor — one supplier can never see another's data, even by guessing a reference number",
      "PAN, GSTIN, and email are masked everywhere they're logged or displayed",
      "Every query and every access attempt is written to a compliance audit trail",
    ];
    const right = [
      "The AI layer only classifies intent and rewords an already-verified SAP answer — it never generates a fact on its own",
      "If SAP isn't reachable, or a record doesn't exist, the assistant says so — it never fabricates a plausible-sounding answer",
      "Session cookies are signed, httpOnly, and expire after 30 minutes of inactivity",
      "Failed verification attempts are rate-limited and logged (masked) for traceability",
    ];
    s.addText("VERIFICATION & DATA ISOLATION", { x: MARGIN, y: 1.85, w: 5.8, h: 0.3, fontSize: 11, color: GOLD_DARK, bold: true, charSpacing: 1 });
    s.addText("TRUSTWORTHY AI", { x: MARGIN + 6.05, y: 1.85, w: 5.8, h: 0.3, fontSize: 11, color: GOLD_DARK, bold: true, charSpacing: 1 });
    [left, right].forEach((col, ci) => {
      col.forEach((t, i) => {
        const x = MARGIN + ci * 6.05;
        const y = 2.3 + i * 1.15;
        s.addShape(pptx.ShapeType.rect, { x, y: y + 0.06, w: 0.14, h: 0.14, fill: { color: ci === 0 ? NAVY : GOLD }, line: { type: "none" }, rectRadius: 0.03 });
        s.addText(t, { x: x + 0.35, y, w: 5.5, h: 1.05, fontSize: 11, color: NAVY, lineSpacingMultiple: 1.25, valign: "top" });
      });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 8. Business Support Command Center
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Business Support", "A command center, not an inbox");
    const feats = [
      "Live SLA dashboard — auto-resolution rate, average resolution time, escalation rate, and volume by query type",
      "Ticket queue with assignment, resolution notes, and automatic email notification to the vendor on close",
      "Full query log and compliance audit trail — every interaction, searchable and exportable",
      "Personal saved filter views and one-click CSV / PDF / PPT export for management reviews",
    ];
    feats.forEach((t, i) => {
      const y = 2.0 + i * 0.95;
      card(s, MARGIN, y, W - MARGIN * 2, 0.8);
      s.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: 0.06, h: 0.8, fill: { color: GOLD }, line: { type: "none" } });
      s.addText(t, { x: MARGIN + 0.35, y: y, w: 11.3, h: 0.8, fontSize: 13, color: NAVY, valign: "middle", lineSpacingMultiple: 1.2 });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 9. Reference Architecture
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Reference Architecture", "How it fits around SAP");

    function box(x: number, y: number, w: number, h: number, title: string, sub: string, emphasis?: "navy" | "gold") {
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h,
        fill: { color: emphasis === "navy" ? NAVY : WHITE },
        line: { color: emphasis === "gold" ? GOLD : BORDER, width: emphasis ? 1.75 : 1 },
        rectRadius: 0.05,
      });
      s.addText(title, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.35, fontSize: 12.5, bold: true, color: emphasis === "navy" ? WHITE : NAVY });
      s.addText(sub, { x: x + 0.15, y: y + 0.45, w: w - 0.3, h: h - 0.55, fontSize: 9.5, color: emphasis === "navy" ? "C8CDD6" : STEEL, lineSpacingMultiple: 1.2 });
    }
    function arrow(x1: number, y1: number, x2: number, y2: number) {
      s.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: x2 - x1,
        h: y2 - y1,
        line: { color: STEEL, width: 1.5, endArrowType: "triangle" },
        flipV: y2 < y1,
      });
    }

    box(0.7, 2.0, 3.2, 0.9, "Vendors", "Web browser — self-service chat portal", "gold");
    box(4.35, 2.0, 3.2, 0.9, "Business Support", "Web browser — SLA & ticket dashboard", "gold");
    box(8.0, 2.0, 4.6, 0.9, "Email Notifications", "OTP codes and ticket-resolution updates", "gold");

    box(1.6, 3.35, 9.3, 1.0, "Vendor Query Assistant Platform", "Verification & session security · query resolution engine · optional AI assistant · audit logging", "navy");

    box(1.6, 4.85, 4.4, 0.9, "SAP S/4HANA", "Live OData integration — vendor master, invoices, payments, withholding tax", "gold");
    box(6.5, 4.85, 4.4, 0.9, "Business Support Dashboard", "SLA tracking, ticket queue, analytics & exports");

    arrow(2.3, 2.9, 4.0, 3.35);
    arrow(5.95, 2.9, 5.95, 3.35);
    arrow(9.5, 2.9, 8.0, 3.35);
    arrow(4.0, 4.35, 3.8, 4.85);
    arrow(7.9, 4.35, 8.7, 4.85);

    s.addText(
      "Every answer is a live call against your SAP tenant — no cached, sample, or seeded data ever reaches a vendor in production.",
      { x: MARGIN, y: 6.15, w: W - MARGIN * 2, h: 0.4, fontSize: 10.5, italic: true, color: STEEL }
    );
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 10. Impact & ROI
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Impact & ROI", "What self-service is worth");

    const kpis: { label: string; value: string; sub: string }[] = [
      { label: "Typical manual cost / query", value: "₹ 80–85", sub: "Fully-loaded agent time to search SAP & reply" },
      { label: "Target auto-resolution rate", value: "70–80%", sub: "Industry-typical for a well-scoped self-service rollout" },
      { label: "Response time", value: "Instant", sub: "vs. hours to days over email" },
    ];
    kpis.forEach((k, i) => {
      const x = MARGIN + i * 4.08;
      card(s, x, 1.95, 3.85, 1.75);
      s.addText(k.value, { x: x + 0.25, y: 2.1, w: 3.4, h: 0.75, fontSize: 30, color: NAVY, bold: true, fontFace: "Georgia" });
      s.addText(k.label, { x: x + 0.25, y: 2.85, w: 3.4, h: 0.35, fontSize: 11.5, color: GOLD_DARK, bold: true });
      s.addText(k.sub, { x: x + 0.25, y: 3.18, w: 3.4, h: 0.45, fontSize: 9.5, color: STEEL, lineSpacingMultiple: 1.2 });
    });

    card(s, MARGIN, 3.95, W - MARGIN * 2, 1.85);
    s.addText("ILLUSTRATIVE — AT ~1,000 ACTIVE VENDORS", { x: MARGIN + 0.3, y: 4.15, w: 8, h: 0.3, fontSize: 10.5, color: GOLD_DARK, bold: true, charSpacing: 1 });
    s.addText(
      "~1,500 vendor queries/month × 75% auto-resolved ≈ 1,125 queries/month no longer needing agent time — " +
        "worth roughly ₹ 90,000+/month (₹ 11 lakh+/year) of freed Accounts Payable team capacity, before counting " +
        "faster vendor responses, fewer disputes, and a full compliance audit trail.",
      { x: MARGIN + 0.3, y: 4.55, w: W - MARGIN * 2 - 0.6, h: 1.1, fontSize: 13, color: NAVY, lineSpacingMultiple: 1.35 }
    );
    s.addText("Illustrative, based on typical AP query volumes — validate against your actual team cost & volume before relying on this figure.", {
      x: MARGIN,
      y: 5.95,
      w: W - MARGIN * 2,
      h: 0.35,
      fontSize: 9,
      italic: true,
      color: STEEL,
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 11. Implementation Roadmap
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Implementation Roadmap", "A typical 8–10 week rollout");
    const phases = [
      { t: "Discovery & SAP Scoping", w: "Weeks 1–2", d: "Confirm OData service availability, vendor master fields, and security requirements." },
      { t: "Build & Integration", w: "Weeks 3–7", d: "SAP connector, authentication, core query types, Business Support dashboard." },
      { t: "UAT & Hardening", w: "Weeks 8–9", d: "Client testing, security review, and load testing before go-live." },
      { t: "Go-Live & Training", w: "Week 10", d: "Production cutover, Business Support training, vendor communication." },
      { t: "Hypercare", w: "+2 weeks", d: "Close monitoring and fast-turnaround fixes right after go-live." },
    ];
    const trackY = 2.6;
    const boxW = 2.35;
    const trackStart = MARGIN + boxW / 2;
    const trackEnd = W - MARGIN - boxW / 2;
    s.addShape(pptx.ShapeType.line, { x: trackStart, y: trackY, w: trackEnd - trackStart, h: 0, line: { color: BORDER, width: 2 } });
    phases.forEach((p, i) => {
      const x = trackStart + (i * (trackEnd - trackStart)) / (phases.length - 1);
      s.addShape(pptx.ShapeType.ellipse, { x: x - 0.09, y: trackY - 0.09, w: 0.18, h: 0.18, fill: { color: GOLD }, line: { color: WHITE, width: 2 } });
      s.addText(p.w, { x: x - boxW / 2, y: trackY + 0.25, w: boxW, h: 0.3, fontSize: 10, color: GOLD_DARK, bold: true, align: "center" });
      s.addText(p.t, { x: x - boxW / 2, y: trackY + 0.55, w: boxW, h: 0.55, fontSize: 12.5, color: NAVY, bold: true, align: "center", lineSpacingMultiple: 1.1 });
      s.addText(p.d, { x: x - boxW / 2, y: trackY + 1.15, w: boxW, h: 1.3, fontSize: 9.5, color: STEEL, align: "center", lineSpacingMultiple: 1.25 });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 12. Commercials — intro + three options at a glance
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Commercials", "Three pricing options");
    s.addText(
      "Illustrative pricing for discussion, based on a typical mid-size manufacturer with up to ~1,000 active vendors on a " +
        "single SAP S/4HANA tenant. To be finalized after scoping — not a quote.",
      { x: MARGIN, y: 1.75, w: W - MARGIN * 2, h: 0.5, fontSize: 11.5, italic: true, color: STEEL }
    );

    const options = [
      {
        t: "A. One-Time + AMC",
        sub: "Own it outright",
        rows: ["Implementation: ₹ 15,00,000 (one-time)", "Timeline: 8–10 weeks", "Annual AMC (from Yr 2): ₹ 2,70,000/yr", "+ Add'l plant rollout: ₹ 2,00,000 each"],
        best: "Best if you want a owned asset and the lowest 3-year cost",
      },
      {
        t: "B. SaaS Subscription",
        sub: "Predictable opex",
        rows: ["Onboarding: ₹ 3,50,000 (one-time)", "Growth tier (≤ 1,000 vendors):", "₹ 85,000/month, billed annually", "(₹ 8,67,000/year — incl. hosting & support)"],
        best: "Best for predictable opex, no large upfront capex",
      },
      {
        t: "C. Usage-Based",
        sub: "Pay for what's used",
        rows: ["Platform base: ₹ 15,000/month", "₹ 15 per auto-resolved query", "₹ 100 per ticket escalated", "Typical @1,000 vendors: ≈ ₹ 69,000/mo"],
        best: "Best for piloting with uncertain adoption/volume",
      },
    ];
    options.forEach((o, i) => {
      const x = MARGIN + i * 4.08;
      card(s, x, 2.45, 3.85, 4.2);
      s.addShape(pptx.ShapeType.rect, { x, y: 2.45, w: 3.85, h: 0.55, fill: { color: NAVY }, line: { type: "none" }, rectRadius: 0.05 });
      s.addText(o.t, { x: x + 0.2, y: 2.45, w: 3.45, h: 0.55, fontSize: 14, color: WHITE, bold: true, valign: "middle" });
      s.addText(o.sub.toUpperCase(), { x: x + 0.25, y: 3.15, w: 3.4, h: 0.3, fontSize: 9.5, color: GOLD_DARK, bold: true, charSpacing: 1 });
      s.addText(o.rows.join("\n"), { x: x + 0.25, y: 3.5, w: 3.4, h: 2.2, fontSize: 11, color: NAVY, lineSpacingMultiple: 1.5, bullet: { code: "2022" } });
      s.addShape(pptx.ShapeType.line, { x: x + 0.25, y: 5.85, w: 3.35, h: 0, line: { color: BORDER, width: 1 } });
      s.addText(o.best, { x: x + 0.25, y: 5.95, w: 3.4, h: 0.6, fontSize: 9.5, italic: true, color: STEEL, lineSpacingMultiple: 1.2 });
    });
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 13. Commercials — 3-year TCO comparison table
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    header(s, "Commercials", "3-year total cost of ownership");

    const rows: PptxGenJS.TableRow[] = [
      [
        { text: "", options: { fill: { color: NAVY } } },
        { text: "Year 1", options: { fill: { color: NAVY }, color: WHITE, bold: true, align: "center" } },
        { text: "Year 2", options: { fill: { color: NAVY }, color: WHITE, bold: true, align: "center" } },
        { text: "Year 3", options: { fill: { color: NAVY }, color: WHITE, bold: true, align: "center" } },
        { text: "3-Year Total", options: { fill: { color: NAVY }, color: WHITE, bold: true, align: "center" } },
      ],
      [
        { text: "A. One-Time + AMC" },
        { text: "₹ 15,00,000" },
        { text: "₹ 2,70,000" },
        { text: "₹ 2,70,000" },
        { text: "₹ 20,40,000", options: { bold: true } },
      ],
      [
        { text: "B. SaaS Subscription" },
        { text: "₹ 12,17,000" },
        { text: "₹ 8,67,000" },
        { text: "₹ 8,67,000" },
        { text: "₹ 29,51,000", options: { bold: true } },
      ],
      [
        { text: "C. Usage-Based (typical)" },
        { text: "₹ 8,32,500" },
        { text: "₹ 8,32,500" },
        { text: "₹ 8,32,500" },
        { text: "₹ 24,97,500", options: { bold: true } },
      ],
    ];
    // header row for option A/B/C label column
    (rows[0] as PptxGenJS.TableCell[])[0] = { text: "Option", options: { fill: { color: NAVY }, color: WHITE, bold: true } };

    s.addTable(rows, {
      x: MARGIN,
      y: 1.95,
      w: W - MARGIN * 2,
      colW: [3.5, 2.3, 2.3, 2.3, 2.53],
      fontSize: 12,
      color: NAVY,
      border: { type: "solid", color: BORDER, pt: 1 },
      align: "center",
      valign: "middle",
      autoPage: false,
      rowH: 0.55,
    });

    s.addText(
      "Option A has the lowest 3-year cost but the largest upfront commitment. Option B trades a higher total for fully " +
        "predictable, no-capex opex. Option C scales with actual usage — ideal while adoption is still ramping up.",
      { x: MARGIN, y: 4.35, w: W - MARGIN * 2, h: 0.6, fontSize: 12, color: NAVY, lineSpacingMultiple: 1.3 }
    );
    s.addText(
      "All figures illustrative, for discussion only — final commercials depend on confirmed vendor volume, SAP landscape complexity, and scope agreed during Discovery.",
      { x: MARGIN, y: 5.1, w: W - MARGIN * 2, h: 0.4, fontSize: 9.5, italic: true, color: STEEL }
    );
    footer(s);
  }

  // ---------------------------------------------------------------------
  // 14. Next Steps
  // ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: GOLD }, line: { type: "none" } });
    s.addText("NEXT STEPS", { x: MARGIN, y: 2.3, w: 10, h: 0.4, fontSize: 13, color: GOLD, bold: true, charSpacing: 2 });
    s.addText("Let's schedule a scoping workshop", { x: MARGIN, y: 2.75, w: 11, h: 0.9, fontSize: 34, color: WHITE, bold: true, fontFace: "Georgia" });
    const steps = [
      "1. A short discovery call to confirm SAP landscape & vendor volume",
      "2. A tailored proposal with a firm commercial quote",
      "3. Kickoff, with go-live typically 8–10 weeks out",
    ];
    steps.forEach((t, i) => {
      s.addText(t, { x: MARGIN, y: 4.1 + i * 0.55, w: 10.5, h: 0.5, fontSize: 15, color: "C8CDD6" });
    });
    s.addShape(pptx.ShapeType.line, { x: MARGIN, y: 6.2, w: 2, h: 0, line: { color: GOLD, width: 2 } });
    s.addText("Veltriance", { x: MARGIN, y: 6.4, w: 8, h: 0.35, fontSize: 14, color: WHITE, bold: true });
    s.addText("Thank you.", { x: MARGIN, y: 6.75, w: 8, h: 0.3, fontSize: 10.5, color: "9AA4B2" });
    footer(s, true);
  }

  const outDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "pitch-deck.pptx");
  await pptx.writeFile({ fileName: outPath });
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
