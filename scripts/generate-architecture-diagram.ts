// Generates a technical architecture diagram of this codebase as PDF + PPTX.
// Run with: npx tsx scripts/generate-architecture-diagram.ts
// Static content — describes the code structure, not live app data, so it
// runs standalone in Node rather than needing the browser.

import fs from "fs";
import path from "path";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

const NAVY = "#0f1729";
const GOLD = "#C9A227";
const STEEL = "#5b6b7c";
const BORDER = "#c9ccd1";
const WHITE = "#ffffff";
const BG = "#f6f7f9";

interface Box {
  id: string;
  title: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  emphasis?: "prod" | "dev" | "normal";
}

interface Edge {
  from: string;
  to: string;
  dashed?: boolean;
  label?: string;
}

// --- Diagram model (shared between PDF + PPT) -----------------------------
// Coordinates are in a normalized 900 x 640 unit space, scaled per format.

const BOXES: Box[] = [
  { id: "vendor", title: "Vendor", lines: ["Browser — chat portal"], x: 90, y: 30, w: 220, h: 46 },
  { id: "support", title: "Business Support", lines: ["Browser — Service Desk dashboard"], x: 470, y: 30, w: 220, h: 46 },

  {
    id: "nextapp",
    title: "Next.js Application",
    lines: [
      "app/page.tsx (Vendor Portal UI)   ·   app/admin (Admin Dashboard UI)",
      "app/api/* route handlers   ·   proxy.ts (admin session gate)",
    ],
    x: 90,
    y: 120,
    w: 600,
    h: 64,
  },

  { id: "resolver", title: "lib/resolver.ts", lines: ["Auto-resolve or escalate + log"], x: 90, y: 240, w: 220, h: 46 },
  { id: "auth", title: "lib/auth", lines: ["OTP challenges, sessions, lockouts"], x: 350, y: 240, w: 220, h: 46 },

  { id: "sap", title: "lib/sap", lines: ["SapConnector interface", "getSapConnector() — env switch"], x: 90, y: 340, w: 220, h: 54 },
  { id: "store", title: "lib/store", lines: ["File-backed JSON", "(.data/store.json)"], x: 350, y: 340, w: 220, h: 54 },
  { id: "email", title: "lib/email", lines: ["Console (dev) / SMTP sender"], x: 610, y: 340, w: 220, h: 54 },

  {
    id: "sapreal",
    title: "SAP S/4HANA Cloud",
    lines: ["OData v2 · OAuth2 client-credentials", "Production — default connector"],
    x: 30,
    y: 460,
    w: 260,
    h: 60,
    emphasis: "prod",
  },
  {
    id: "sapmock",
    title: "mock-sap-server",
    lines: ["Standalone Express app + REST API", "SAP_MODE=mock only — blocked when", "NODE_ENV=production"],
    x: 310,
    y: 460,
    w: 260,
    h: 60,
    emphasis: "dev",
  },
  {
    id: "smtp",
    title: "SMTP Provider",
    lines: ["OTP codes + ticket-resolution emails", "sent to the vendor's inbox"],
    x: 610,
    y: 460,
    w: 220,
    h: 60,
  },
];

const EDGES: Edge[] = [
  { from: "vendor", to: "nextapp" },
  { from: "support", to: "nextapp" },
  { from: "nextapp", to: "resolver" },
  { from: "nextapp", to: "auth" },
  { from: "resolver", to: "sap" },
  { from: "resolver", to: "store" },
  { from: "resolver", to: "email" },
  { from: "sap", to: "sapreal", label: "live" },
  { from: "sap", to: "sapmock", dashed: true, label: "dev only" },
  { from: "email", to: "smtp" },
];

function boxCenterBottom(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h };
}
function boxCenterTop(b: Box) {
  return { x: b.x + b.w / 2, y: b.y };
}
function findBox(id: string) {
  const b = BOXES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown box ${id}`);
  return b;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function buildPdf(): Buffer {
  const SCALE = 1; // 1 unit = 1pt, canvas sized to match the model
  const PAGE_W = 900;
  const PAGE_H = 700;
  const OFFSET_Y = 60; // room for title

  // jsPDF defaults to portrait and silently swaps a custom [w,h] format to
  // keep height >= width unless orientation is given explicitly.
  const doc = new jsPDF({ unit: "pt", format: [PAGE_W, PAGE_H], orientation: "landscape" });
  const hex = (h: string): [number, number, number] => {
    const v = h.replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const setFill = (h: string) => doc.setFillColor(...hex(h));
  const setText = (h: string) => doc.setTextColor(...hex(h));
  const setDraw = (h: string) => doc.setDrawColor(...hex(h));

  setFill(BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  setText(NAVY);
  doc.setFontSize(20);
  doc.text("Technical Architecture", 40, 34);
  setText(STEEL);
  doc.setFontSize(10);
  doc.text("Vendor Query Assistant", 40, 50);

  // Edges first (under the boxes)
  for (const e of EDGES) {
    const from = findBox(e.from);
    const to = findBox(e.to);
    const p1 = boxCenterBottom(from);
    const p2 = boxCenterTop(to);
    const x1 = p1.x * SCALE;
    const y1 = p1.y * SCALE + OFFSET_Y;
    const x2 = p2.x * SCALE;
    const y2 = p2.y * SCALE + OFFSET_Y;

    setDraw(STEEL);
    doc.setLineWidth(1.2);
    doc.setLineDashPattern(e.dashed ? [4, 3] : [], 0);
    doc.line(x1, y1, x2, y2);
    doc.setLineDashPattern([], 0);

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 7;
    const a1x = x2 - size * Math.cos(angle - Math.PI / 7);
    const a1y = y2 - size * Math.sin(angle - Math.PI / 7);
    const a2x = x2 - size * Math.cos(angle + Math.PI / 7);
    const a2y = y2 - size * Math.sin(angle + Math.PI / 7);
    setFill(STEEL);
    doc.triangle(x2, y2, a1x, a1y, a2x, a2y, "F");

    if (e.label) {
      const midx = (x1 + x2) / 2;
      const midy = (y1 + y2) / 2;
      setText(STEEL);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(e.label, midx + 6, midy - 4);
      doc.setFont("helvetica", "normal");
    }
  }

  // Boxes
  for (const b of BOXES) {
    const x = b.x * SCALE;
    const y = b.y * SCALE + OFFSET_Y;
    const w = b.w * SCALE;
    const h = b.h * SCALE;

    const borderColor = b.emphasis === "dev" ? GOLD : b.emphasis === "prod" ? NAVY : BORDER;
    setFill(WHITE);
    doc.roundedRect(x, y, w, h, 6, 6, "F");
    setDraw(borderColor);
    doc.setLineWidth(b.emphasis ? 1.6 : 1);
    doc.roundedRect(x, y, w, h, 6, 6, "S");

    setText(NAVY);
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.text(b.title, x + 12, y + 18);
    doc.setFont("helvetica", "normal");

    setText(STEEL);
    doc.setFontSize(8.5);
    b.lines.forEach((line, i) => {
      doc.text(line, x + 12, y + 32 + i * 11);
    });
  }

  // Legend
  const legendY = 560 + OFFSET_Y;
  setText(STEEL);
  doc.setFontSize(9);
  setDraw(NAVY);
  doc.setLineWidth(1.6);
  doc.roundedRect(40, legendY - 10, 14, 10, 2, 2, "S");
  doc.text("Production path", 62, legendY - 1);
  setDraw(GOLD);
  doc.roundedRect(200, legendY - 10, 14, 10, 2, 2, "S");
  doc.text("Dev-only, gated behind SAP_MODE=mock, blocked when NODE_ENV=production", 222, legendY - 1);

  setText(STEEL);
  doc.setFontSize(8);
  doc.text(
    "Every SAP call is live in production. The mock path exists only for local development and can never run when NODE_ENV=production.",
    40,
    PAGE_H - 18
  );

  return Buffer.from(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------

async function buildPptx(): Promise<PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ARCH", width: 13, height: 10.1 });
  pptx.layout = "ARCH";

  const noHash = (h: string) => h.replace("#", "");
  const slide = pptx.addSlide();
  slide.background = { color: noHash(BG) };

  slide.addText("Technical Architecture", { x: 0.5, y: 0.3, w: 8, h: 0.4, fontSize: 22, color: noHash(NAVY), bold: true });
  slide.addText("Vendor Query Assistant", { x: 0.5, y: 0.68, w: 8, h: 0.3, fontSize: 11, color: noHash(STEEL) });

  // Model space is 900x700pt with a 60pt title offset; PPT canvas is
  // 13 x 10.1in — scale uniformly (pt -> in) and shift down for the header.
  const SCALE = 13 / 900;
  const OFFSET_Y_IN = 0.95;

  function toSlideX(x: number) {
    return x * SCALE;
  }
  function toSlideY(y: number) {
    return y * SCALE + OFFSET_Y_IN;
  }

  for (const e of EDGES) {
    const from = findBox(e.from);
    const to = findBox(e.to);
    const p1 = boxCenterBottom(from);
    const p2 = boxCenterTop(to);
    const x1 = toSlideX(p1.x);
    const y1 = toSlideY(p1.y);
    const x2 = toSlideX(p2.x);
    const y2 = toSlideY(p2.y);

    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: x2 - x1,
      h: y2 - y1,
      line: {
        color: noHash(STEEL),
        width: 1.25,
        dashType: e.dashed ? "dash" : "solid",
        endArrowType: "triangle",
      },
      flipV: y2 < y1,
    });

    if (e.label) {
      slide.addText(e.label, {
        x: Math.min(x1, x2),
        y: (y1 + y2) / 2 - 0.15,
        w: Math.max(Math.abs(x2 - x1), 0.8),
        h: 0.2,
        fontSize: 8,
        italic: true,
        color: noHash(STEEL),
        align: "center",
      });
    }
  }

  for (const b of BOXES) {
    const x = toSlideX(b.x);
    const y = toSlideY(b.y);
    const w = b.w * SCALE;
    const h = b.h * SCALE;
    const borderColor = b.emphasis === "dev" ? GOLD : b.emphasis === "prod" ? NAVY : BORDER;

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: "FFFFFF" },
      line: { color: noHash(borderColor), width: b.emphasis ? 1.75 : 1 },
      rectRadius: 0.04,
    });
    slide.addText(b.title, { x: x + 0.12, y: y + 0.04, w: w - 0.24, h: 0.25, fontSize: 12, color: noHash(NAVY), bold: true });
    slide.addText(b.lines.join("\n"), {
      x: x + 0.12,
      y: y + 0.28,
      w: w - 0.24,
      h: h - 0.32,
      fontSize: 8.5,
      color: noHash(STEEL),
      lineSpacingMultiple: 1.15,
    });
  }

  const legendY = toSlideY(560);
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: legendY, w: 0.22, h: 0.15, fill: { color: "FFFFFF" }, line: { color: noHash(NAVY), width: 1.75 } });
  slide.addText("Production path", { x: 0.8, y: legendY - 0.05, w: 2, h: 0.25, fontSize: 10, color: noHash(STEEL) });
  slide.addShape(pptx.ShapeType.roundRect, { x: 2.9, y: legendY, w: 0.22, h: 0.15, fill: { color: "FFFFFF" }, line: { color: noHash(GOLD), width: 1.75 } });
  slide.addText("Dev-only, gated behind SAP_MODE=mock, blocked when NODE_ENV=production", {
    x: 3.2,
    y: legendY - 0.05,
    w: 8,
    h: 0.25,
    fontSize: 10,
    color: noHash(STEEL),
  });

  slide.addText(
    "Every SAP call is live in production. The mock path exists only for local development and can never run when NODE_ENV=production.",
    { x: 0.5, y: 9.7, w: 12, h: 0.3, fontSize: 8, color: noHash(STEEL) }
  );

  return pptx;
}

async function main() {
  const outDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(outDir, { recursive: true });

  const pdfBuf = buildPdf();
  const pdfPath = path.join(outDir, "architecture-diagram.pdf");
  fs.writeFileSync(pdfPath, pdfBuf);
  console.log(`Wrote ${pdfPath} (${pdfBuf.length} bytes)`);

  const pptx = await buildPptx();
  const pptxPath = path.join(outDir, "architecture-diagram.pptx");
  await pptx.writeFile({ fileName: pptxPath });
  console.log(`Wrote ${pptxPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
