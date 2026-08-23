// Exports the Analytics dashboard as a real PDF/PPTX file — shapes and text
// drawn natively from the same chart data the on-screen dashboard uses, not
// a screenshot. Each chart lives in a bordered card sized to fill its row
// (matching the on-screen white rounded-card layout), with content
// vertically centered inside — not just anchored to the top of an empty
// page. Both libraries are loaded lazily (dynamic import) since this only
// ever runs client-side, on click.

export interface ExportBarDatum {
  label: string;
  value: number;
  color: string; // hex, with "#"
}

export interface ExportKpi {
  label: string;
  value: string;
  sub?: string;
}

export interface AnalyticsExportData {
  generatedAt: Date;
  kpis: ExportKpi[];
  autoResolvedPct: number;
  autoResolvedSub: string;
  stateChart: ExportBarDatum[];
  outcomeChart: ExportBarDatum[];
  typeChart: ExportBarDatum[];
  avgResolutionChart: ExportBarDatum[]; // seconds
  topVendorsChart: ExportBarDatum[];
}

const NAVY = "#0f1729";
const GOLD = "#C9A227";
const STEEL = "#5b6b7c";
const TRACK = "#f0f1f3";
const BORDER = "#e1e3e6";
const EMERALD = "#059669";
const EMERALD_TRACK = "#d1fae5";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function fileStamp(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Fixed format so the "Generated" timestamp reads the same regardless of
// the exporting machine's locale.
function formatDateTime(d: Date) {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// PDF (jsPDF) — landscape A4, coordinates in points.
// ---------------------------------------------------------------------------

export async function exportAnalyticsPdf(data: AnalyticsExportData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentTop = 95;
  const contentBottom = H - 55;
  const contentH = contentBottom - contentTop;

  const setFill = (hex: string) => doc.setFillColor(...hexToRgb(hex));
  const setText = (hex: string) => doc.setTextColor(...hexToRgb(hex));
  const setDraw = (hex: string) => doc.setDrawColor(...hexToRgb(hex));

  function pageHeader(title: string) {
    setText(NAVY);
    doc.setFontSize(18);
    doc.text(title, margin, 55);
  }

  function pageFooter(pageLabel: string) {
    setDraw(BORDER);
    doc.line(margin, H - 34, W - margin, H - 34);
    setText(STEEL);
    doc.setFontSize(8);
    doc.text("Vendor Query Assistant · Business Support", margin, H - 20);
    doc.text(pageLabel, W - margin, H - 20, { align: "right" });
  }

  function card(x: number, y: number, w: number, h: number) {
    setDraw(BORDER);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, w, h, 8, 8, "S");
  }

  const PAD = 24;

  function cardMeter(x: number, y: number, w: number, h: number, label: string, pct: number, color: string, trackColor: string, sub: string) {
    card(x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    setText(STEEL);
    doc.setFontSize(11);
    doc.text(label.toUpperCase(), ix, y + PAD + 6);
    const midY = y + h / 2;
    setText(color);
    doc.setFontSize(52);
    doc.text(`${pct}%`, ix, midY);
    setFill(trackColor);
    doc.roundedRect(ix, midY + 22, iw, 16, 8, 8, "F");
    if (pct > 0) {
      setFill(color);
      doc.roundedRect(ix, midY + 22, Math.max((iw * pct) / 100, 12), 16, 8, 8, "F");
    }
    setText(STEEL);
    doc.setFontSize(10);
    doc.text(sub, ix, midY + 56, { maxWidth: iw });
  }

  function cardStackedBar(x: number, y: number, w: number, h: number, title: string, items: ExportBarDatum[]) {
    card(x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    setText(STEEL);
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), ix, y + PAD + 6);

    const barY = y + PAD + 30;
    const barH = 20;
    const total = items.reduce((s, i) => s + i.value, 0);
    setFill(TRACK);
    doc.roundedRect(ix, barY, iw, barH, 6, 6, "F");
    if (total > 0) {
      let cx = ix;
      const gap = 2;
      const visible = items.filter((i) => i.value > 0);
      visible.forEach((item) => {
        const segW = (iw - gap * (visible.length - 1)) * (item.value / total);
        setFill(item.color);
        doc.rect(cx, barY, Math.max(segW, 1), barH, "F");
        cx += segW + gap;
      });
    }

    // Legend — vertically centered in the remaining card space below the bar.
    const legendRowH = 30;
    const legendBlockH = items.length * legendRowH;
    const legendStart = barY + barH + Math.max(24, (y + h - PAD - (barY + barH) - legendBlockH) / 2);
    let ly = legendStart;
    for (const item of items) {
      setFill(item.color);
      doc.circle(ix + 5, ly - 4, 5, "F");
      setText(NAVY);
      doc.setFontSize(13);
      doc.text(item.label, ix + 18, ly);
      doc.setFontSize(13);
      doc.text(String(item.value), ix + iw, ly, { align: "right" });
      ly += legendRowH;
    }
  }

  function cardColumnChart(x: number, y: number, w: number, h: number, title: string, items: ExportBarDatum[]) {
    card(x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    setText(STEEL);
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), ix, y + PAD + 6);

    const chartBottom = y + h - PAD - 22;
    const chartTop = y + PAD + 40;
    const chartH = chartBottom - chartTop;
    const max = Math.max(1, ...items.map((i) => i.value));
    const gap = 20;
    const colW = (iw - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const cx = ix + i * (colW + gap);
      const barH = Math.max((chartH * item.value) / max, item.value > 0 ? 4 : 0);
      setText(NAVY);
      doc.setFontSize(13);
      doc.text(String(item.value), cx + colW / 2, chartBottom - barH - 10, { align: "center" });
      setFill(item.color);
      doc.roundedRect(cx, chartBottom - barH, colW, barH, 4, 4, "F");
      setText(STEEL);
      doc.setFontSize(10);
      doc.text(item.label, cx + colW / 2, chartBottom + 20, { align: "center", maxWidth: colW + gap });
    });
  }

  function cardBarList(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    items: ExportBarDatum[],
    fmt: (v: number) => string = String,
    ranked = false
  ) {
    card(x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    setText(STEEL);
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), ix, y + PAD + 6);

    const rowH = 44;
    const blockH = items.length * rowH;
    const top = y + PAD + 30 + Math.max(0, (h - PAD * 2 - 30 - blockH) / 2);
    let cy = top;
    const barH = 14;
    items.forEach((item, i) => {
      setText(NAVY);
      doc.setFontSize(13);
      const label = ranked ? `${i + 1}.  ${item.label}` : item.label;
      doc.text(label, ix, cy);
      doc.text(fmt(item.value), ix + iw, cy, { align: "right" });
      const max = Math.max(1, ...items.map((d) => d.value));
      setFill(TRACK);
      doc.roundedRect(ix, cy + 8, iw, barH, 5, 5, "F");
      const pct = item.value / max;
      if (pct > 0) {
        setFill(item.color);
        doc.roundedRect(ix, cy + 8, Math.max(iw * pct, 10), barH, 5, 5, "F");
      }
      cy += rowH;
    });
  }

  function kpiGrid(x: number, y: number, w: number, h: number, kpis: ExportKpi[]) {
    const cols = 4;
    const rows = 2;
    const gap = 16;
    const boxW = (w - gap * (cols - 1)) / cols;
    const boxH = (h - gap * (rows - 1)) / rows;
    kpis.forEach((k, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = x + col * (boxW + gap);
      const by = y + row * (boxH + gap);
      card(bx, by, boxW, boxH);
      setText(STEEL);
      doc.setFontSize(10);
      doc.text(k.label.toUpperCase(), bx + 16, by + 26, { maxWidth: boxW - 32 });
      setText(NAVY);
      doc.setFontSize(30);
      doc.text(k.value, bx + 16, by + boxH / 2 + 10);
      if (k.sub) {
        setText(STEEL);
        doc.setFontSize(9);
        doc.text(k.sub, bx + 16, by + boxH - 18, { maxWidth: boxW - 32 });
      }
    });
  }

  // Page 1 — title
  setFill(NAVY);
  doc.rect(0, 0, W, H, "F");
  setFill(GOLD);
  doc.rect(margin, H / 2 - 6, 56, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.text("Reporting Dashboard", margin, H / 2 + 26);
  doc.setTextColor(200, 205, 214);
  doc.setFontSize(14);
  doc.text("Vendor Query Assistant · Business Support", margin, H / 2 + 52);
  doc.setFontSize(10);
  doc.text(`Generated ${formatDateTime(data.generatedAt)}`, margin, H / 2 + 72);

  // Page 2 — KPIs, filling the full content height
  doc.addPage();
  pageHeader("Key Metrics");
  kpiGrid(margin, contentTop, W - margin * 2, contentH, data.kpis);
  pageFooter("2 / 5");

  // Page 3 — resolution rate meter + the two stacked (part-to-whole) bars
  doc.addPage();
  pageHeader("Resolution Rate, Incidents by State & Query Outcomes");
  const thirdGap = 24;
  const thirdW = (W - margin * 2 - thirdGap * 2) / 3;
  cardMeter(margin, contentTop, thirdW, contentH, "Auto-resolved", data.autoResolvedPct, EMERALD, EMERALD_TRACK, data.autoResolvedSub);
  cardStackedBar(margin + thirdW + thirdGap, contentTop, thirdW, contentH, "Incidents by state", data.stateChart);
  cardStackedBar(margin + (thirdW + thirdGap) * 2, contentTop, thirdW, contentH, "Query outcomes", data.outcomeChart);
  pageFooter("3 / 5");

  // Page 4 — column chart + ranked leaderboard
  doc.addPage();
  pageHeader("Queries by Type & Top Vendors");
  const halfGap = 24;
  const halfW = (W - margin * 2 - halfGap) / 2;
  cardColumnChart(margin, contentTop, halfW, contentH, "Queries by type", data.typeChart);
  cardBarList(margin + halfW + halfGap, contentTop, halfW, contentH, "Top vendors by query volume", data.topVendorsChart, String, true);
  pageFooter("4 / 5");

  // Page 5 — response time bar list, full width
  doc.addPage();
  pageHeader("Average Response Time");
  cardBarList(margin, contentTop, W - margin * 2, contentH, "Avg. response time by type", data.avgResolutionChart, (v) => `${v.toFixed(2)}s`);
  pageFooter("5 / 5");

  doc.save(`analytics-${fileStamp(data.generatedAt)}.pdf`);
}

// ---------------------------------------------------------------------------
// PPTX (pptxgenjs) — 13.333" x 7.5" widescreen, coordinates in inches.
// ---------------------------------------------------------------------------

export async function exportAnalyticsPpt(data: AnalyticsExportData): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  const noHash = (hex: string) => hex.replace("#", "");
  type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

  const MARGIN = 0.5;
  const CONTENT_TOP = 1.15;
  const CONTENT_BOTTOM = 6.75;
  const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;
  const PAGE_W = 13.333;
  const PAD = 0.3;

  function pageHeader(slide: Slide, title: string) {
    slide.addText(title, { x: MARGIN, y: 0.4, w: PAGE_W - MARGIN * 2, h: 0.5, fontSize: 22, color: noHash(NAVY), bold: true });
  }

  function pageFooter(slide: Slide, pageLabel: string) {
    slide.addShape(pptx.ShapeType.line, {
      x: MARGIN,
      y: 6.95,
      w: PAGE_W - MARGIN * 2,
      h: 0,
      line: { color: noHash(BORDER), width: 1 },
    });
    slide.addText("Vendor Query Assistant · Business Support", { x: MARGIN, y: 7.02, w: 6, h: 0.3, fontSize: 9, color: noHash(STEEL) });
    slide.addText(pageLabel, { x: PAGE_W - MARGIN - 2, y: 7.02, w: 2, h: 0.3, fontSize: 9, color: noHash(STEEL), align: "right" });
  }

  function card(slide: Slide, x: number, y: number, w: number, h: number) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: "FFFFFF" },
      line: { color: noHash(BORDER), width: 1 },
      rectRadius: 0.08,
    });
  }

  function cardMeter(slide: Slide, x: number, y: number, w: number, h: number, label: string, pct: number, color: string, trackColor: string, sub: string) {
    card(slide, x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    slide.addText(label.toUpperCase(), { x: ix, y: y + PAD, w: iw, h: 0.3, fontSize: 12, color: noHash(STEEL), bold: true });
    const midY = y + h / 2;
    slide.addText(`${pct}%`, { x: ix, y: midY - 0.7, w: iw, h: 1.1, fontSize: 60, color: noHash(color), bold: true });
    slide.addShape(pptx.ShapeType.roundRect, { x: ix, y: midY + 0.5, w: iw, h: 0.22, fill: { color: noHash(trackColor) }, line: { type: "none" }, rectRadius: 0.06 });
    if (pct > 0) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: ix,
        y: midY + 0.5,
        w: Math.max((iw * pct) / 100, 0.12),
        h: 0.22,
        fill: { color: noHash(color) },
        line: { type: "none" },
        rectRadius: 0.06,
      });
    }
    slide.addText(sub, { x: ix, y: midY + 0.85, w: iw, h: 0.6, fontSize: 11, color: noHash(STEEL) });
  }

  function cardStackedBar(slide: Slide, x: number, y: number, w: number, h: number, title: string, items: ExportBarDatum[]) {
    card(slide, x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    slide.addText(title.toUpperCase(), { x: ix, y: y + PAD, w: iw, h: 0.3, fontSize: 12, color: noHash(STEEL), bold: true });

    const barY = y + PAD + 0.45;
    const barH = 0.28;
    const total = items.reduce((s, i) => s + i.value, 0);
    slide.addShape(pptx.ShapeType.roundRect, { x: ix, y: barY, w: iw, h: barH, fill: { color: noHash(TRACK) }, line: { type: "none" }, rectRadius: 0.05 });
    if (total > 0) {
      let cx = ix;
      const gap = 0.025;
      const visible = items.filter((i) => i.value > 0);
      visible.forEach((item) => {
        const segW = (iw - gap * (visible.length - 1)) * (item.value / total);
        slide.addShape(pptx.ShapeType.rect, { x: cx, y: barY, w: Math.max(segW, 0.02), h: barH, fill: { color: noHash(item.color) }, line: { type: "none" } });
        cx += segW + gap;
      });
    }

    const legendRowH = 0.42;
    const legendBlockH = items.length * legendRowH;
    const spaceBelow = y + h - PAD - (barY + barH);
    const legendStart = barY + barH + Math.max(0.35, (spaceBelow - legendBlockH) / 2);
    let ly = legendStart;
    for (const item of items) {
      slide.addShape(pptx.ShapeType.ellipse, { x: ix, y: ly, w: 0.14, h: 0.14, fill: { color: noHash(item.color) }, line: { type: "none" } });
      slide.addText(item.label, { x: ix + 0.24, y: ly - 0.06, w: iw - 1, h: 0.26, fontSize: 14, color: noHash(NAVY) });
      slide.addText(String(item.value), { x: ix, y: ly - 0.06, w: iw, h: 0.26, fontSize: 14, color: noHash(NAVY), align: "right" });
      ly += legendRowH;
    }
  }

  function cardColumnChart(slide: Slide, x: number, y: number, w: number, h: number, title: string, items: ExportBarDatum[]) {
    card(slide, x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    slide.addText(title.toUpperCase(), { x: ix, y: y + PAD, w: iw, h: 0.3, fontSize: 12, color: noHash(STEEL), bold: true });

    const chartBottom = y + h - PAD - 0.35;
    const chartTop = y + PAD + 0.55;
    const chartH = chartBottom - chartTop;
    const max = Math.max(1, ...items.map((i) => i.value));
    const gap = 0.3;
    const colW = (iw - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const cx = ix + i * (colW + gap);
      const barH = Math.max((chartH * item.value) / max, item.value > 0 ? 0.08 : 0);
      slide.addText(String(item.value), { x: cx, y: chartBottom - barH - 0.3, w: colW, h: 0.25, fontSize: 14, color: noHash(NAVY), align: "center" });
      slide.addShape(pptx.ShapeType.roundRect, {
        x: cx,
        y: chartBottom - barH,
        w: colW,
        h: barH,
        fill: { color: noHash(item.color) },
        line: { type: "none" },
        rectRadius: 0.03,
      });
      slide.addText(item.label, { x: cx - 0.1, y: chartBottom + 0.08, w: colW + 0.2, h: 0.3, fontSize: 11, color: noHash(STEEL), align: "center" });
    });
  }

  function cardBarList(
    slide: Slide,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    items: ExportBarDatum[],
    fmt: (v: number) => string = String,
    ranked = false
  ) {
    card(slide, x, y, w, h);
    const ix = x + PAD;
    const iw = w - PAD * 2;
    slide.addText(title.toUpperCase(), { x: ix, y: y + PAD, w: iw, h: 0.3, fontSize: 12, color: noHash(STEEL), bold: true });

    const rowH = 0.62;
    const blockH = items.length * rowH;
    const availableTop = y + PAD + 0.45;
    const availableH = y + h - PAD - availableTop;
    const top = availableTop + Math.max(0, (availableH - blockH) / 2);
    let cy = top;
    const max = Math.max(1, ...items.map((d) => d.value));
    const barH = 0.2;
    items.forEach((item, i) => {
      const label = ranked ? `${i + 1}.  ${item.label}` : item.label;
      slide.addText(label, { x: ix, y: cy, w: iw * 0.65, h: 0.28, fontSize: 14, color: noHash(NAVY) });
      slide.addText(fmt(item.value), { x: ix + iw * 0.65, y: cy, w: iw * 0.35, h: 0.28, fontSize: 14, color: noHash(NAVY), align: "right" });
      slide.addShape(pptx.ShapeType.roundRect, { x: ix, y: cy + 0.3, w: iw, h: barH, fill: { color: noHash(TRACK) }, line: { type: "none" }, rectRadius: 0.05 });
      const pct = item.value / max;
      if (pct > 0) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: ix,
          y: cy + 0.3,
          w: Math.max(iw * pct, 0.12),
          h: barH,
          fill: { color: noHash(item.color) },
          line: { type: "none" },
          rectRadius: 0.05,
        });
      }
      cy += rowH;
    });
  }

  function kpiGrid(slide: Slide, x: number, y: number, w: number, h: number, kpis: ExportKpi[]) {
    const cols = 4;
    const rows = 2;
    const gap = 0.2;
    const boxW = (w - gap * (cols - 1)) / cols;
    const boxH = (h - gap * (rows - 1)) / rows;
    kpis.forEach((k, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = x + col * (boxW + gap);
      const by = y + row * (boxH + gap);
      card(slide, bx, by, boxW, boxH);
      slide.addText(k.label.toUpperCase(), { x: bx + 0.2, y: by + 0.2, w: boxW - 0.4, h: 0.4, fontSize: 11, color: noHash(STEEL) });
      slide.addText(k.value, { x: bx + 0.2, y: by + boxH / 2 - 0.35, w: boxW - 0.4, h: 0.7, fontSize: 32, color: noHash(NAVY), bold: true });
      if (k.sub) {
        slide.addText(k.sub, { x: bx + 0.2, y: by + boxH - 0.5, w: boxW - 0.4, h: 0.4, fontSize: 10, color: noHash(STEEL) });
      }
    });
  }

  // Slide 1 — title
  const title = pptx.addSlide();
  title.background = { color: noHash(NAVY) };
  title.addShape(pptx.ShapeType.rect, { x: 0.6, y: 3.3, w: 0.7, h: 0.05, fill: { color: noHash(GOLD) }, line: { type: "none" } });
  title.addText("Reporting Dashboard", { x: 0.6, y: 3.4, w: 10, h: 0.7, fontSize: 34, color: "FFFFFF", bold: true });
  title.addText("Vendor Query Assistant · Business Support", { x: 0.6, y: 4.05, w: 10, h: 0.4, fontSize: 15, color: "C8CDD6" });
  title.addText(`Generated ${formatDateTime(data.generatedAt)}`, { x: 0.6, y: 4.4, w: 10, h: 0.3, fontSize: 10, color: "9AA4B2" });

  // Slide 2 — KPIs, filling the full content height
  const kpiSlide = pptx.addSlide();
  pageHeader(kpiSlide, "Key Metrics");
  kpiGrid(kpiSlide, MARGIN, CONTENT_TOP, PAGE_W - MARGIN * 2, CONTENT_H, data.kpis);
  pageFooter(kpiSlide, "2 / 5");

  // Slide 3 — resolution rate meter + the two stacked (part-to-whole) bars
  const s3 = pptx.addSlide();
  pageHeader(s3, "Resolution Rate, Incidents by State & Query Outcomes");
  const thirdGap = 0.3;
  const thirdW = (PAGE_W - MARGIN * 2 - thirdGap * 2) / 3;
  cardMeter(s3, MARGIN, CONTENT_TOP, thirdW, CONTENT_H, "Auto-resolved", data.autoResolvedPct, EMERALD, EMERALD_TRACK, data.autoResolvedSub);
  cardStackedBar(s3, MARGIN + thirdW + thirdGap, CONTENT_TOP, thirdW, CONTENT_H, "Incidents by state", data.stateChart);
  cardStackedBar(s3, MARGIN + (thirdW + thirdGap) * 2, CONTENT_TOP, thirdW, CONTENT_H, "Query outcomes", data.outcomeChart);
  pageFooter(s3, "3 / 5");

  // Slide 4 — column chart + ranked leaderboard
  const s4 = pptx.addSlide();
  pageHeader(s4, "Queries by Type & Top Vendors");
  const halfGap = 0.3;
  const halfW = (PAGE_W - MARGIN * 2 - halfGap) / 2;
  cardColumnChart(s4, MARGIN, CONTENT_TOP, halfW, CONTENT_H, "Queries by type", data.typeChart);
  cardBarList(s4, MARGIN + halfW + halfGap, CONTENT_TOP, halfW, CONTENT_H, "Top vendors by query volume", data.topVendorsChart, String, true);
  pageFooter(s4, "4 / 5");

  // Slide 5 — response time bar list, full width
  const s5 = pptx.addSlide();
  pageHeader(s5, "Average Response Time");
  cardBarList(s5, MARGIN, CONTENT_TOP, PAGE_W - MARGIN * 2, CONTENT_H, "Avg. response time by type", data.avgResolutionChart, (v) => `${v.toFixed(2)}s`);
  pageFooter(s5, "5 / 5");

  await pptx.writeFile({ fileName: `analytics-${fileStamp(data.generatedAt)}.pptx` });
}
