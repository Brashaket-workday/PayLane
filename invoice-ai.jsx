import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, FileText, FilePlus2, Inbox, AlertTriangle, Sparkles, Settings as SettingsIcon,
  Plug, Search, ChevronRight, ChevronLeft, Check, CheckCircle2, XCircle, Clock, Send, Loader2, Info,
  Zap, Building, CreditCard, ArrowRight, Database, ClipboardCheck, Ban, MessageSquare, RefreshCw,
  ScanLine, Wand2, Mail, Landmark, ShoppingCart, Percent, Hash, Truck, GitCompare, DollarSign
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";

/* ------------------------------------------------------------------ *
 * Attavo Invoices — touchless invoice processing inside Workday
 * Companion to Attavo Verify. Real extraction (Claude), real PO
 * matching, tax + math validation, duplicate detection, and an
 * Invoice Assistant. Every AI feature has an offline fallback.
 * ------------------------------------------------------------------ */

const T = {
  brand: "#0C6B6B", brandDk: "#0A5757",
  amber: "#B54708", rose: "#C01048", info: "#175CD3", slate: "#475467",
  ink: "#101828", ink2: "#344054", ink3: "#667085",
  line: "#E4E7EC", line2: "#EAECF0", bg: "#F3F4F6", panel: "#FFFFFF",
  brandBg: "#E4F0EF", amberBg: "#FDF0E6", roseBg: "#FDE7EE", infoBg: "#E8F0FD", slateBg: "#EEF1F4",
};

const STATUS = {
  posted:   { label: "Posted",       color: T.brand, bg: T.brandBg, icon: CheckCircle2 },
  review:   { label: "Needs review", color: T.amber, bg: T.amberBg, icon: AlertTriangle },
  hold:     { label: "On hold",      color: T.info,  bg: T.infoBg,  icon: Clock },
  rejected: { label: "Rejected",     color: T.rose,  bg: T.roseBg,  icon: XCircle },
  pending:  { label: "Processing",   color: T.slate, bg: T.slateBg, icon: Loader2 },
};

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "JPY", "AUD", "CHF", "SGD", "INR", "MXN"];

const CAT_LABEL = {
  vendor: "Vendor & master data",
  po: "Purchase-order match",
  tax: "Tax validation",
  math: "Invoice math",
  duplicate: "Duplicate check",
  currency: "Currency & format",
  confidence: "Extraction confidence",
};

const CHANNELS = [
  { ts: "1 min ago", channel: "Email", subject: "Cascade Components Inc — INV-88213", result: "posted" },
  { ts: "9 min ago", channel: "Supplier portal", subject: "Lumen Retail GmbH — RE-4471", result: "hold" },
  { ts: "24 min ago", channel: "Scan", subject: "Brightline Services Co — 20614", result: "review" },
  { ts: "1 hr ago", channel: "EDI", subject: "Summit Tools Inc — ST-9905", result: "posted" },
  { ts: "today", channel: "Email", subject: "Apex Logistics Group — AX-1200", result: "rejected" },
];

/* ----------------------------- helpers ----------------------------- */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|ojsc|plc|sa|ag|limited|company|holdings)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function lev(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function levRatio(a, b) { if (!a && !b) return 1; return 1 - lev(a, b) / Math.max(a.length, b.length, 1); }
function jac(a, b) {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
function nameSim(a, b) { const na = norm(a), nb = norm(b); return Math.max(jac(na, nb), levRatio(na, nb)); }

function money(cur, n) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(n || 0); }
  catch { return (cur || "") + " " + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US"); }
}
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const round2 = (n) => Math.round(n * 100) / 100;

let _iid = 0;
const nid = () => `INV-${7000 + ++_iid}`;
function inv(o) {
  return { id: nid(), poNumber: null, source: "Email", receivedAt: "—", extractionConfidence: 0.97, lineItems: [], ...o };
}

/* ----------------------------- master data ----------------------------- */

const MASTER = [
  { name: "Cascade Components Inc", vendorId: "V-1001", terms: "Net 30", currency: "USD" },
  { name: "Summit Tools Inc", vendorId: "V-1002", terms: "Net 30", currency: "USD" },
  { name: "Delta Chemicals Inc", vendorId: "V-1003", terms: "Net 45", currency: "USD" },
  { name: "Lumen Retail GmbH", vendorId: "V-1004", terms: "Net 30", currency: "EUR" },
  { name: "Pioneer Paper Co", vendorId: "V-1005", terms: "Net 30", currency: "USD" },
  { name: "Northwind Traders LLC", vendorId: "V-1006", terms: "Net 15", currency: "USD" },
  { name: "Brightline Services Co", vendorId: "V-1007", terms: "Net 30", currency: "USD" },
  { name: "Apex Logistics Group", vendorId: "V-1008", terms: "Net 30", currency: "USD" },
];

/* ----------------------------- purchase orders ----------------------------- */

const POS = [
  { po: "PO-5001", vendor: "Cascade Components Inc", currency: "USD", threeWay: true,
    lines: [{ sku: "BRK-100", desc: "Steel bracket", qty: 500, unitPrice: 12.00 }],
    received: [{ sku: "BRK-100", qty: 500 }] },
  { po: "PO-5002", vendor: "Summit Tools Inc", currency: "USD", threeWay: true,
    lines: [{ sku: "DRL-22", desc: "Cordless drill", qty: 40, unitPrice: 85.00 }],
    received: [{ sku: "DRL-22", qty: 40 }] },
  { po: "PO-5003", vendor: "Delta Chemicals Inc", currency: "USD", threeWay: false,
    lines: [{ sku: "SOL-9", desc: "Cleaning solvent, drum", qty: 20, unitPrice: 140.00 }],
    received: [] },
  { po: "PO-5004", vendor: "Lumen Retail GmbH", currency: "EUR", threeWay: true,
    lines: [{ sku: "DSP-1", desc: "Display unit", qty: 100, unitPrice: 45.00 }],
    received: [{ sku: "DSP-1", qty: 60 }] },
  { po: "PO-5005", vendor: "Pioneer Paper Co", currency: "USD", threeWay: true,
    lines: [{ sku: "PPR-A4", desc: "A4 paper, case", qty: 300, unitPrice: 6.00 }],
    received: [{ sku: "PPR-A4", qty: 300 }] },
  { po: "PO-5006", vendor: "Northwind Traders LLC", currency: "USD", threeWay: false,
    lines: [{ sku: "WGT-7", desc: "Widget assembly", qty: 250, unitPrice: 9.00 }],
    received: [] },
];

/* ----------------------------- seed invoices ----------------------------- */

const L = (sku, desc, qty, unitPrice) => ({ sku, desc, qty, unitPrice, amount: round2(qty * unitPrice) });

const INVOICES = [
  // straight-through (posted)
  inv({ vendor: "Cascade Components Inc", invoiceNumber: "INV-88213", date: "2026-01-14", currency: "USD", poNumber: "PO-5001",
    lineItems: [L("BRK-100", "Steel bracket", 500, 12.00)], subtotal: 6000, taxRate: 0.08, tax: 480, total: 6480,
    source: "Email", receivedAt: "2 days ago", extractionConfidence: 0.98 }),
  inv({ vendor: "Summit Tools Inc", invoiceNumber: "ST-9905", date: "2026-01-15", currency: "USD", poNumber: "PO-5002",
    lineItems: [L("DRL-22", "Cordless drill", 40, 85.00)], subtotal: 3400, taxRate: 0.08, tax: 272, total: 3672,
    source: "EDI", receivedAt: "2 days ago", extractionConfidence: 0.99 }),
  inv({ vendor: "Delta Chemicals Inc", invoiceNumber: "DC-7802", date: "2026-01-13", currency: "USD", poNumber: "PO-5003",
    lineItems: [L("SOL-9", "Cleaning solvent, drum", 20, 140.00)], subtotal: 2800, taxRate: 0.08, tax: 224, total: 3024,
    source: "Email", receivedAt: "3 days ago", extractionConfidence: 0.98 }),
  inv({ vendor: "Northwind Traders LLC", invoiceNumber: "NW-1205", date: "2026-01-12", currency: "USD", poNumber: "PO-5006",
    lineItems: [L("WGT-7", "Widget assembly", 250, 9.00)], subtotal: 2250, taxRate: 0.08, tax: 180, total: 2430,
    source: "EDI", receivedAt: "4 days ago", extractionConfidence: 0.97 }),
  inv({ vendor: "Pioneer Paper Co", invoiceNumber: "PP-3350", date: "2026-01-16", currency: "USD", poNumber: "PO-5005",
    lineItems: [L("PPR-A4", "A4 paper, case", 300, 6.00)], subtotal: 1800, taxRate: 0.08, tax: 144, total: 1944,
    source: "Email", receivedAt: "1 day ago", extractionConfidence: 0.98 }),
  inv({ vendor: "Lumen Retail GmbH", invoiceNumber: "RE-4490", date: "2026-01-10", currency: "EUR", poNumber: "PO-5004",
    lineItems: [L("DSP-1", "Display unit", 60, 45.00)], subtotal: 2700, taxRate: 0.19, tax: 513, total: 3213,
    source: "Supplier portal", receivedAt: "5 days ago", extractionConfidence: 0.97 }),
  inv({ vendor: "Summit Tools Inc", invoiceNumber: "ST-9980", date: "2026-01-16", currency: "USD", poNumber: "PO-5002",
    lineItems: [L("DRL-22", "Cordless drill", 40, 85.00)], subtotal: 3400, taxRate: 0.08, tax: 272, total: 3672,
    source: "EDI", receivedAt: "1 day ago", extractionConfidence: 0.98 }),

  // needs review
  inv({ vendor: "Delta Chemicals Inc", invoiceNumber: "DC-7781", date: "2026-01-11", currency: "USD", poNumber: "PO-5003",
    lineItems: [L("SOL-9", "Cleaning solvent, drum", 20, 154.00)], subtotal: 3080, taxRate: 0.08, tax: 246.40, total: 3326.40,
    source: "Email", receivedAt: "4 days ago", extractionConfidence: 0.97 }),
  inv({ vendor: "Pioneer Paper Co", invoiceNumber: "PP-3310", date: "2026-01-09", currency: "USD", poNumber: "PO-5005",
    lineItems: [L("PPR-A4", "A4 paper, case", 360, 6.00)], subtotal: 2160, taxRate: 0.08, tax: 172.80, total: 2332.80,
    source: "Scan", receivedAt: "6 days ago", extractionConfidence: 0.98 }),
  inv({ vendor: "Northwind Traders LLC", invoiceNumber: "NW-1180", date: "2026-01-08", currency: "USD", poNumber: "PO-5099",
    lineItems: [L("WGT-7", "Widget assembly", 250, 9.00)], subtotal: 2250, taxRate: 0.08, tax: 180, total: 2430,
    source: "Email", receivedAt: "7 days ago", extractionConfidence: 0.95 }),
  inv({ vendor: "Cascade Components Inc", invoiceNumber: "INV-88240", date: "2026-01-15", currency: "USD", poNumber: "PO-5001",
    lineItems: [L("BRK-100", "Steel bracket", 500, 12.00)], subtotal: 6000, taxRate: 0.08, tax: 700, total: 6700,
    source: "Email", receivedAt: "2 days ago", extractionConfidence: 0.96 }),
  inv({ vendor: "Summit Tools Inc", invoiceNumber: "ST-9930", date: "2026-01-14", currency: "USD", poNumber: "PO-5002",
    lineItems: [L("DRL-22", "Cordless drill", 40, 85.00)], subtotal: 3600, taxRate: 0.08, tax: 288, total: 3888,
    source: "Email", receivedAt: "3 days ago", extractionConfidence: 0.97 }),

  // on hold
  inv({ vendor: "Lumen Retail GmbH", invoiceNumber: "RE-4471", date: "2026-01-07", currency: "EUR", poNumber: "PO-5004",
    lineItems: [L("DSP-1", "Display unit", 100, 45.00)], subtotal: 4500, taxRate: 0.19, tax: 855, total: 5355,
    source: "Supplier portal", receivedAt: "8 days ago", extractionConfidence: 0.96 }),
  inv({ vendor: "Brightline Services Co", invoiceNumber: "20614", date: "2026-01-13", currency: "USD", poNumber: null,
    lineItems: [L(null, "Monthly facilities service", 1, 4200.00)], subtotal: 4200, taxRate: 0.08, tax: 336, total: 4536,
    source: "Scan", receivedAt: "3 days ago", extractionConfidence: 0.90 }),
  inv({ vendor: "Globex Supply Partners", invoiceNumber: "GX-2201", date: "2026-01-12", currency: "USD", poNumber: null,
    lineItems: [L(null, "Consulting services", 1, 5000.00)], subtotal: 5000, taxRate: 0.08, tax: 400, total: 5400,
    source: "Email", receivedAt: "4 days ago", extractionConfidence: 0.68 }),

  // rejected (duplicate of the first invoice)
  inv({ vendor: "Cascade Components Inc", invoiceNumber: "INV-88213", date: "2026-01-16", currency: "USD", poNumber: "PO-5001",
    lineItems: [L("BRK-100", "Steel bracket", 500, 12.00)], subtotal: 6000, taxRate: 0.08, tax: 480, total: 6480,
    source: "Email", receivedAt: "1 day ago", extractionConfidence: 0.98 }),
];

/* ----------------------------- engine ----------------------------- */

const SEV_RANK = { fail: 4, hold: 3, review: 2, pass: 0 };

function matchPO(invoice, po, cfg) {
  const recvBySku = {};
  (po.received || []).forEach((r) => { recvBySku[r.sku] = (recvBySku[r.sku] || 0) + r.qty; });
  const lines = (invoice.lineItems || []).map((li) => {
    let pl = li.sku ? po.lines.find((p) => p.sku === li.sku) : null;
    if (!pl) pl = po.lines.find((p) => norm(p.desc) === norm(li.desc));
    if (!pl) return { li, matched: false, sev: "review", note: "not on the PO" };
    const priceVar = pl.unitPrice ? (li.unitPrice - pl.unitPrice) / pl.unitPrice : 0;
    const recv = po.threeWay ? (recvBySku[pl.sku] ?? 0) : null;
    const notes = [];
    let sev = "pass";
    if (Math.abs(priceVar) > cfg.priceTol) { sev = "review"; notes.push(`unit price ${money(invoice.currency, li.unitPrice)} vs PO ${money(invoice.currency, pl.unitPrice)} (${priceVar > 0 ? "+" : ""}${(priceVar * 100).toFixed(0)}%)`); }
    if (li.qty > pl.qty) { if (SEV_RANK.review > SEV_RANK[sev]) sev = "review"; notes.push(`billed ${li.qty} vs ${pl.qty} ordered`); }
    if (po.threeWay && recv != null && li.qty > recv) { sev = "hold"; notes.push(`billed ${li.qty} but only ${recv} received`); }
    return { li, matched: true, pl, priceVar, recv, sev, note: notes.join("; ") };
  });
  let worst = "pass";
  lines.forEach((l) => { if (SEV_RANK[l.sev] > SEV_RANK[worst]) worst = l.sev; });
  const messages = lines.filter((l) => l.sev !== "pass").map((l) => ({
    sev: l.sev, text: `${l.matched ? (l.pl.desc || l.li.desc) : l.li.desc}: ${l.note || "variance"}.`,
  }));
  return { lines, worst, messages, threeWay: po.threeWay, po: po.po };
}

function evaluate(invoice, all, idx, pos, master, cfg, overrides) {
  const findings = [];
  const push = (cat, label, severity, evidence) => findings.push({ cat, label, severity, evidence });

  // vendor / master data
  const vm = master.map((m) => ({ m, score: nameSim(invoice.vendor, m.name) })).sort((a, b) => b.score - a.score)[0];
  const vendorOk = vm && vm.score >= 0.8;
  if (!vendorOk) push("vendor", "Vendor & master data", "hold", `Vendor “${invoice.vendor}” is not in the supplier master. Set the vendor up before posting.`);
  else push("vendor", "Vendor & master data", "pass", `Matched to ${vm.m.name} (${vm.m.vendorId}), ${vm.m.terms}.`);

  // currency
  if (!CURRENCIES.includes(invoice.currency)) push("currency", "Currency & format", "review", `Currency “${invoice.currency}” is not recognised.`);
  else push("currency", "Currency & format", "pass", `${invoice.currency}, amounts parsed cleanly.`);

  // math
  const lineSum = round2((invoice.lineItems || []).reduce((s, l) => s + (l.amount != null ? l.amount : round2(l.qty * l.unitPrice)), 0));
  const subtotalOk = Math.abs(lineSum - invoice.subtotal) <= 0.02;
  const expectedTotal = round2(invoice.subtotal + invoice.tax);
  const totalOk = Math.abs(expectedTotal - invoice.total) <= 0.02;
  if (!subtotalOk) push("math", "Invoice math", "review", `Line items total ${money(invoice.currency, lineSum)}, but the subtotal reads ${money(invoice.currency, invoice.subtotal)}.`);
  else if (!totalOk) push("math", "Invoice math", "review", `Subtotal plus tax is ${money(invoice.currency, expectedTotal)}, but the total reads ${money(invoice.currency, invoice.total)}.`);
  else push("math", "Invoice math", "pass", "Line items, subtotal, and total reconcile.");

  // tax
  if (invoice.taxRate != null) {
    const expectedTax = round2(invoice.subtotal * invoice.taxRate);
    const taxOk = Math.abs(expectedTax - invoice.tax) <= Math.max(0.02, invoice.subtotal * cfg.taxTol);
    if (cfg.verifyTax && !taxOk) push("tax", "Tax validation", "review", `Tax of ${money(invoice.currency, invoice.tax)} does not match ${(invoice.taxRate * 100).toFixed(0)}% of the taxable amount (${money(invoice.currency, expectedTax)}).`);
    else push("tax", "Tax validation", "pass", `Tax matches ${(invoice.taxRate * 100).toFixed(0)}% (${money(invoice.currency, expectedTax)}).`);
  }

  // PO match
  let matchInfo = null;
  if (invoice.poNumber) {
    const po = pos.find((p) => p.po === invoice.poNumber);
    if (!po) push("po", "Purchase-order match", "review", `Referenced PO ${invoice.poNumber} was not found.`);
    else {
      matchInfo = matchPO(invoice, po, cfg);
      if (matchInfo.worst === "pass") push("po", "Purchase-order match", "pass", `${po.threeWay ? "3-way" : "2-way"} match against ${po.po} within tolerance.`);
      else matchInfo.messages.forEach((msg) => push("po", "Purchase-order match", msg.sev, msg.text));
    }
  } else if (cfg.requirePO) {
    push("po", "Purchase-order match", "hold", "No purchase order referenced. A PO is required before posting.");
  } else {
    push("po", "Purchase-order match", "pass", "Non-PO invoice; PO match not required.");
  }

  // duplicate
  const dupIdx = all.findIndex((x) => norm(x.vendor) === norm(invoice.vendor) && (x.invoiceNumber || "").toLowerCase() === (invoice.invoiceNumber || "").toLowerCase());
  const isDup = dupIdx > -1 && dupIdx < idx;
  if (isDup) push("duplicate", "Duplicate check", "fail", `Invoice ${invoice.invoiceNumber} from ${invoice.vendor} was already received and processed.`);
  else push("duplicate", "Duplicate check", "pass", "No earlier invoice with this number from this vendor.");

  // extraction confidence
  if (invoice.extractionConfidence < cfg.autoPostThreshold)
    push("confidence", "Extraction confidence", "review", `Extraction confidence is ${(invoice.extractionConfidence * 100).toFixed(0)}%, below the ${(cfg.autoPostThreshold * 100).toFixed(0)}% auto-post threshold. A person should confirm the fields.`);

  // outcome
  const has = (sev) => findings.some((f) => f.severity === sev);
  let outcome = "posted";
  if (has("fail")) outcome = "rejected";
  else if (has("hold")) outcome = "hold";
  else if (has("review")) outcome = "review";

  const issues = findings.filter((f) => f.severity !== "pass");
  const primaryReason = issues.length ? (issues.find((f) => f.severity === "fail") || issues.find((f) => f.severity === "hold") || issues[0]) : null;

  // manual overrides
  const ov = overrides[invoice.id];
  let finalOutcome = outcome, note = null, overridden = false;
  if (ov) { overridden = true; note = ov.note; finalOutcome = ov.decision === "posted" ? "posted" : ov.decision === "hold" ? "hold" : ov.decision === "rejected" ? "rejected" : "review"; }

  return { ...invoice, findings, matchInfo, vendorMatch: vm, issues, primaryReason, outcome, finalOutcome, note, overridden, confidence: invoice.extractionConfidence };
}

function worstSeverity(findings, cat) {
  let worst = "pass";
  findings.filter((f) => f.cat === cat).forEach((f) => { if (SEV_RANK[f.severity] > SEV_RANK[worst]) worst = f.severity; });
  return worst;
}

/* --------------------------- Claude calls --------------------------- */

async function callClaude(system, userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: [{ role: "user", content: userText }] }),
  });
  if (!res.ok) throw new Error("api " + res.status);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

function normalizeExtract(d) {
  const items = (d.lineItems || []).map((li) => ({
    sku: li.sku || null, desc: li.desc || "Item",
    qty: Number(li.qty) || 1, unitPrice: Number(li.unitPrice) || 0,
    amount: round2((Number(li.qty) || 1) * (Number(li.unitPrice) || 0)),
  }));
  const subtotal = d.subtotal != null ? Number(d.subtotal) : round2(items.reduce((s, l) => s + l.amount, 0));
  const total = d.total != null ? Number(d.total) : round2(subtotal + (Number(d.tax) || 0));
  const tax = d.tax != null ? Number(d.tax) : round2(total - subtotal);
  const taxRate = subtotal ? round2(tax / subtotal) : null;
  return {
    vendor: d.vendor || "Unknown vendor", invoiceNumber: d.invoiceNumber || "—",
    date: d.date || null, currency: (d.currency || "USD").toUpperCase(),
    poNumber: d.poNumber || null, lineItems: items, subtotal, tax, taxRate, total,
  };
}

async function aiExtract(text) {
  const system =
    "You are an invoice data extraction engine. Read the raw invoice text and return ONLY compact JSON with keys: " +
    "vendor (string), invoiceNumber (string), date (YYYY-MM-DD or null), currency (ISO 4217 code), poNumber (string or null), " +
    "lineItems (array of {desc, sku, qty, unitPrice}), subtotal (number), tax (number), total (number). " +
    "Use null when a value is absent. Do not include commentary or markdown.";
  const txt = await callClaude(system, text);
  return normalizeExtract(JSON.parse(txt.replace(/```json|```/g, "").trim()));
}

function offlineExtract(text) {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const invM = text.match(/invoice\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/i);
  const poM = text.match(/\bP\.?O\.?\s*(?:no\.?|number|#)?\s*[:#]?\s*((?:PO-?)?\d[\w-]*)/i);
  let currency = "USD";
  const cIso = text.match(/\b(USD|EUR|GBP|CAD|JPY|AUD|CHF|SGD|INR|MXN)\b/);
  if (cIso) currency = cIso[1]; else if (text.includes("€")) currency = "EUR"; else if (text.includes("£")) currency = "GBP";
  const totM = [...text.matchAll(/total[^0-9]{0,12}([0-9][0-9,]*\.?[0-9]{0,2})/gi)].pop();
  const total = totM ? Number(totM[1].replace(/,/g, "")) : 0;
  const po = poM ? (/^PO/i.test(poM[1]) ? poM[1].toUpperCase() : "PO-" + poM[1]) : null;
  return {
    vendor: lines[0] || "Unknown vendor", invoiceNumber: invM ? invM[1] : "—", date: null, currency,
    poNumber: po, lineItems: [{ sku: null, desc: "Invoice amount", qty: 1, unitPrice: total, amount: total }],
    subtotal: total, tax: 0, taxRate: 0, total,
  };
}

async function askAssistant(q, rows, cfg) {
  const ctx = rows.map((r) => ({
    vendor: r.vendor, invoiceNumber: r.invoiceNumber, status: r.finalOutcome,
    total: money(r.currency, r.total), po: r.poNumber || "none",
    confidence: Math.round(r.confidence * 100), issues: r.issues.map((f) => `${f.label}: ${f.evidence}`),
  }));
  const system =
    "You are the Attavo Invoice Assistant, embedded in an invoice automation platform that reads invoices and validates them against master data, purchase orders, and tax rules. " +
    "Answer accounts-payable questions using ONLY the invoice dataset provided as JSON. Be concise and specific: name vendors and invoice numbers and cite status, totals, PO matches, or findings. " +
    "Statuses mean: posted = cleared straight through; review = needs a person; hold = blocked pending something; rejected = not payable. " +
    "If the answer is not in the data, say so plainly. Never invent invoices. Reply in short plain text, no markdown headings.";
  const userText = `Invoice dataset (JSON):\n${JSON.stringify(ctx)}\n\nAuto-post threshold: ${Math.round(cfg.autoPostThreshold * 100)}%. PO required: ${cfg.requirePO}.\n\nQuestion: ${q}`;
  return await callClaude(system, userText);
}

function offlineAnswer(q, rows) {
  const ql = q.toLowerCase();
  const cnt = (k) => rows.filter((x) => x.finalOutcome === k).length;
  const hit = rows.find((r) => ql.includes((r.invoiceNumber || "").toLowerCase()) || ql.includes(r.vendor.toLowerCase().split(" ")[0]));
  if (hit) {
    const issues = hit.issues.map((f) => f.evidence).join(" ");
    return `${hit.vendor} ${hit.invoiceNumber} (${money(hit.currency, hit.total)}) is ${STATUS[hit.finalOutcome].label.toLowerCase()}. ${issues || "No open findings."}`;
  }
  if (/hold/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "hold"); return r.length ? `On hold: ${r.map((x) => `${x.vendor} ${x.invoiceNumber} (${x.primaryReason ? x.primaryReason.label.toLowerCase() : "review"})`).join("; ")}.` : "Nothing is on hold."; }
  if (/reject|duplicate/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "rejected"); return r.length ? `Rejected: ${r.map((x) => `${x.vendor} ${x.invoiceNumber}`).join(", ")}.` : "No rejected invoices."; }
  if (/review|exception/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "review"); return r.length ? `Needs review: ${r.map((x) => `${x.vendor} ${x.invoiceNumber} (${x.primaryReason ? x.primaryReason.label.toLowerCase() : "review"})`).join("; ")}.` : "Nothing needs review."; }
  if (/post|paid|straight|touchless|clear/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "posted"); return `Posted straight through: ${r.map((x) => `${x.vendor} ${x.invoiceNumber}`).join(", ")}.`; }
  if (/total|sum|amount|owe|payable/.test(ql)) {
    const usd = rows.filter((x) => x.currency === "USD" && x.finalOutcome !== "rejected").reduce((s, x) => s + x.total, 0);
    return `Across USD invoices not rejected, the total is ${money("USD", usd)}. EUR invoices are listed separately.`;
  }
  return `I could not reach the AI service, so here is a summary from your current data: ${rows.length} invoices — ${cnt("posted")} posted, ${cnt("review")} in review, ${cnt("hold")} on hold, ${cnt("rejected")} rejected. Ask about a specific invoice for detail.`;
}

async function aiSuggest(row) {
  const system =
    "You are an accounts-payable resolution assistant. Given an invoice and its validation findings, recommend the next action. " +
    "Respond ONLY as compact JSON: {\"action\":\"post\"|\"hold\"|\"reject\"|\"request_correction\"|\"review\",\"confidence\":0-100,\"rationale\":\"one short sentence\"}. No other text.";
  const payload = {
    vendor: row.vendor, invoiceNumber: row.invoiceNumber, total: money(row.currency, row.total),
    po: row.poNumber || "none", status: row.finalOutcome,
    findings: row.issues.map((f) => `${f.label}: ${f.evidence}`),
  };
  return JSON.parse((await callClaude(system, JSON.stringify(payload))).replace(/```json|```/g, "").trim());
}
function offlineSuggest(row) {
  const cat = row.primaryReason ? row.primaryReason.cat : null;
  const map = {
    duplicate: { action: "reject", rationale: "This invoice number was already received from this vendor." },
    vendor: { action: "hold", rationale: "Set the vendor up in the master before this can post." },
    po: { action: "request_correction", rationale: "The PO match is outside tolerance; confirm the PO or ask the vendor to correct it." },
    tax: { action: "request_correction", rationale: "The tax amount does not match the expected rate." },
    math: { action: "request_correction", rationale: "The line items and totals do not reconcile." },
    confidence: { action: "review", rationale: "Low extraction confidence; a person should confirm the fields." },
    currency: { action: "review", rationale: "The currency could not be recognised." },
  };
  const base = map[cat] || { action: "review", rationale: "A person should review this invoice." };
  return { ...base, confidence: cat === "duplicate" ? 96 : 74, offline: true };
}

const CSS = `
* { box-sizing: border-box; }
.pl-app { display: flex; min-height: 100vh; background: ${T.bg}; color: ${T.ink};
  font-family: "IBM Plex Sans", -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
.pl-num { font-variant-numeric: tabular-nums; }

/* sidebar */
.pl-side { width: 236px; flex: none; background: ${T.panel}; border-right: 1px solid ${T.line};
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
.pl-brand { display: flex; align-items: center; gap: 10px; padding: 18px 18px 14px; }
.pl-brandmark { width: 32px; height: 32px; border-radius: 9px; background: ${T.brand};
  display: grid; place-items: center; color: #fff; flex: none; }
.pl-brandname { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 15px; letter-spacing: -.01em; line-height: 1.1; }
.pl-brandsub { font-size: 11px; color: ${T.ink3}; }
.pl-nav { padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.pl-navitem { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 9px;
  color: ${T.ink2}; cursor: pointer; border: none; background: none; width: 100%; text-align: left;
  font-size: 13.5px; font-family: inherit; transition: background .12s; }
.pl-navitem:hover { background: ${T.slateBg}; }
.pl-navitem.active { background: ${T.brandBg}; color: ${T.brandDk}; font-weight: 600; }
.pl-navitem .pl-badge { margin-left: auto; }
.pl-badge { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
  background: ${T.slateBg}; color: ${T.ink2}; font-variant-numeric: tabular-nums; }
.pl-badge.warn { background: ${T.amberBg}; color: ${T.amber}; }
.pl-side-foot { margin-top: auto; padding: 14px 16px; border-top: 1px solid ${T.line};
  font-size: 11.5px; color: ${T.ink3}; }

/* main */
.pl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pl-top { display: flex; align-items: center; gap: 14px; padding: 16px 26px; border-bottom: 1px solid ${T.line};
  background: rgba(255,255,255,.75); backdrop-filter: blur(6px); position: sticky; top: 0; z-index: 5; }
.pl-topttl { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 18px; letter-spacing: -.01em; }
.pl-topsub { font-size: 12.5px; color: ${T.ink3}; margin-top: 1px; }
.pl-top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.pl-content { padding: 22px 26px 60px; max-width: 1180px; width: 100%; }

/* cards + tiles */
.pl-card { background: ${T.panel}; border: 1px solid ${T.line}; border-radius: 14px; padding: 16px; }
.pl-card-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; color: ${T.ink}; margin-bottom: 12px; }
.pl-card-head .sub { margin-left: auto; font-weight: 400; font-size: 12px; color: ${T.ink3}; }
.pl-tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.pl-tile { background: ${T.panel}; border: 1px solid ${T.line}; border-radius: 13px; padding: 14px; position: relative; }
.pl-tile-num { font-family: "Space Grotesk", sans-serif; font-size: 27px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.pl-tile-lbl { font-size: 12px; color: ${T.ink3}; margin-top: 2px; }
.pl-tile-ico { position: absolute; top: 13px; right: 13px; opacity: .9; }

/* pills + chips */
.pl-pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
.pl-chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 7px; font-size: 11.5px; font-weight: 500; padding: 2px 8px; white-space: nowrap; }

/* risk meter */
.pl-meter { position: relative; height: 6px; border-radius: 999px; flex: 1; min-width: 60px;
  background: linear-gradient(90deg, ${T.brand} 0%, ${T.amber} 55%, ${T.rose} 100%); opacity: .92; }
.pl-meter-thumb { position: absolute; top: 50%; transform: translateY(-50%); width: 12px; height: 12px;
  border-radius: 50%; background: #fff; border: 2px solid ${T.ink}; box-shadow: 0 1px 2px rgba(16,24,40,.3); }

/* gauge */
.pl-gauge-wrap { position: relative; }
.pl-gauge-c { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }

/* table */
.pl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pl-table th { text-align: left; font-weight: 500; color: ${T.ink3}; font-size: 11.5px; padding: 8px 10px; border-bottom: 1px solid ${T.line}; }
.pl-table td { padding: 11px 10px; border-bottom: 1px solid ${T.line2}; vertical-align: middle; }
.pl-table tr:last-child td { border-bottom: none; }
.pl-rowlink { cursor: pointer; transition: background .1s; }
.pl-rowlink:hover { background: ${T.slateBg}; }

/* segmented tabs */
.pl-seg { display: inline-flex; background: ${T.slateBg}; border-radius: 10px; padding: 3px; gap: 2px; flex-wrap: wrap; }
.pl-seg-btn { border: none; background: none; padding: 6px 13px; border-radius: 8px; font-size: 13px; color: ${T.ink2};
  cursor: pointer; font-family: inherit; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
.pl-seg-btn.active { background: ${T.panel}; color: ${T.ink}; box-shadow: 0 1px 2px rgba(16,24,40,.08); font-weight: 600; }

/* inputs */
.pl-field { display: flex; flex-direction: column; gap: 5px; }
.pl-label { font-size: 12.5px; color: ${T.ink2}; font-weight: 500; }
.pl-hint { font-size: 11.5px; color: ${T.ink3}; }
.pl-input, .pl-select { border: 1px solid ${T.line}; border-radius: 9px; padding: 9px 11px; font-size: 13.5px;
  font-family: inherit; color: ${T.ink}; background: ${T.panel}; width: 100%; outline: none; transition: border .12s, box-shadow .12s; }
.pl-input:focus, .pl-select:focus { border-color: ${T.brand}; box-shadow: 0 0 0 3px ${T.brandBg}; }
.pl-input::placeholder { color: #98A2B3; }

/* buttons */
.pl-btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; font-family: inherit;
  font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: filter .12s, background .12s; white-space: nowrap; }
.pl-btn:disabled { cursor: default; }
.pl-btn.primary { background: ${T.brand}; color: #fff; }
.pl-btn.primary:hover:not(:disabled) { filter: brightness(1.06); }
.pl-btn.ghost { background: ${T.panel}; color: ${T.ink2}; border-color: ${T.line}; }
.pl-btn.ghost:hover:not(:disabled) { background: ${T.slateBg}; }
.pl-btn.subtle { background: ${T.slateBg}; color: ${T.ink2}; }
.pl-btn.subtle:hover:not(:disabled) { filter: brightness(.97); }
.pl-btn.danger { background: ${T.roseBg}; color: ${T.rose}; }
.pl-btn.danger:hover:not(:disabled) { filter: brightness(.98); }
.pl-btn.approve { background: ${T.brandBg}; color: ${T.brandDk}; }

/* check rows (onboarding) */
.pl-check { display: flex; align-items: flex-start; gap: 11px; padding: 12px 0; border-bottom: 1px solid ${T.line2}; }
.pl-check:last-child { border-bottom: none; }
.pl-check-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none; }
.pl-check-body { flex: 1; min-width: 0; }
.pl-check-t { font-size: 13.5px; font-weight: 500; color: ${T.ink}; }
.pl-check-e { font-size: 12.5px; color: ${T.ink3}; margin-top: 1px; }
@keyframes plspin { to { transform: rotate(360deg); } }
.pl-spin { animation: plspin .8s linear infinite; }

/* screening card */
.pl-scard { border: 1px solid ${T.line}; border-radius: 12px; padding: 14px; }

/* kv */
.pl-kv { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.pl-kv-k { display: inline-flex; align-items: center; gap: 7px; color: ${T.ink3}; font-size: 12.5px; }
.pl-kv-v { font-size: 13px; font-weight: 500; }

/* timeline */
.pl-tl { position: relative; padding-left: 8px; }
.pl-tl-item { display: flex; gap: 12px; padding-bottom: 16px; position: relative; }
.pl-tl-item:last-child { padding-bottom: 0; }
.pl-tl-rail { position: relative; display: flex; flex-direction: column; align-items: center; }
.pl-tl-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid #fff; flex: none; margin-top: 3px; z-index: 1; }
.pl-tl-line { width: 2px; flex: 1; background: ${T.line}; margin-top: 2px; }

/* toggle */
.pl-toggle-row { display: flex; align-items: center; gap: 11px; background: none; border: none; cursor: pointer;
  padding: 0; font-family: inherit; text-align: left; }
.pl-toggle { width: 34px; height: 18px; border-radius: 999px; position: relative; flex: none; transition: background .16s; }
.pl-toggle-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,.35); transition: transform .16s; }

/* chat */
.pl-chat { display: flex; flex-direction: column; height: calc(100vh - 190px); min-height: 440px; }
.pl-msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 14px; }
.pl-msg { display: flex; gap: 10px; max-width: 82%; }
.pl-msg.user { align-self: flex-end; flex-direction: row-reverse; }
.pl-bubble { padding: 10px 13px; border-radius: 13px; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; }
.pl-msg.bot .pl-bubble { background: ${T.panel}; border: 1px solid ${T.line}; border-top-left-radius: 4px; }
.pl-msg.user .pl-bubble { background: ${T.brand}; color: #fff; border-top-right-radius: 4px; }
.pl-avatar { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center; }
.pl-composer { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid ${T.line}; padding-top: 12px; }
.pl-suggest { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
.pl-suggest button { border: 1px solid ${T.line}; background: ${T.panel}; border-radius: 999px; padding: 6px 12px;
  font-size: 12.5px; color: ${T.ink2}; cursor: pointer; font-family: inherit; }
.pl-suggest button:hover { background: ${T.slateBg}; }

/* architecture */
.pl-arch { display: flex; flex-direction: column; align-items: stretch; gap: 0; }
.pl-layer { border: 1px solid ${T.line}; border-radius: 14px; padding: 16px; background: ${T.panel}; }
.pl-layer-ttl { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 13px; color: ${T.ink2}; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.pl-nodes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pl-node { border: 1px solid ${T.line}; border-radius: 11px; padding: 13px; background: ${T.bg}; }
.pl-node-ttl { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 8px; }
.pl-node-sub { font-size: 12px; color: ${T.ink3}; margin-top: 4px; }
.pl-edge { display: flex; flex-direction: column; align-items: center; padding: 8px 0; color: ${T.ink3}; }
.pl-edge-lbl { font-size: 12px; color: ${T.ink3}; margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px; }
.pl-sdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

.pl-note { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: ${T.ink2};
  background: ${T.infoBg}; border: 1px solid #CBDDF9; border-radius: 10px; padding: 10px 12px; }
.pl-empty { text-align: center; color: ${T.ink3}; font-size: 13px; padding: 34px 10px; }
.pl-divider { height: 1px; background: ${T.line2}; margin: 14px 0; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #D3D8E0; border-radius: 999px; border: 3px solid ${T.bg}; }
:focus-visible { outline: 2px solid ${T.brand}; outline-offset: 2px; }

@media (max-width: 900px) {
  .pl-side { position: fixed; z-index: 40; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 8px 40px rgba(16,24,40,.18); }
  .pl-side.open { transform: translateX(0); }
  .pl-tiles { grid-template-columns: repeat(2, 1fr); }
  .pl-nodes { grid-template-columns: 1fr; }
  .pl-content { padding: 16px 14px 60px; }
  .pl-top { padding: 13px 14px; }
}
@media (prefers-reduced-motion: reduce) { .pl-spin { animation: none; } * { transition: none !important; } }
`;

/* ------------------------------- atoms ------------------------------- */

function Gauge({ value, color, size = 104, label, sub }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - clamp(value, 0, 100) / 100);
  return (
    <div className="pl-gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.line2} strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div className="pl-gauge-c">
        <div className="pl-num" style={{ fontFamily: "Space Grotesk", fontSize: size * 0.26, fontWeight: 600, color: T.ink, lineHeight: 1 }}>
          {label != null ? label : Math.round(value)}
        </div>
        {sub && <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ConfMeter({ value, threshold = 0.85 }) {
  const p = Math.round(value * 100);
  const ok = value >= threshold;
  const col = ok ? T.brand : T.amber;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ position: "relative", height: 6, borderRadius: 999, flex: 1, minWidth: 60, background: T.slateBg, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${p}%`, background: col, borderRadius: 999 }} />
      </div>
      <span className="pl-num" style={{ fontSize: 12, fontWeight: 600, color: col, minWidth: 40, textAlign: "right" }}>{p}%</span>
    </div>
  );
}

function StatusPill({ status, size = "md" }) {
  const s = STATUS[status] || STATUS.pending;
  const I = s.icon;
  return (
    <span className="pl-pill" style={{ color: s.color, background: s.bg, fontSize: size === "lg" ? 13 : 12, padding: size === "lg" ? "6px 12px" : "3px 9px" }}>
      <I size={size === "lg" ? 15 : 13} /> {s.label}
    </span>
  );
}

function Chip({ children, color = T.ink2, bg = T.slateBg, icon: I }) {
  return <span className="pl-chip" style={{ color, background: bg }}>{I && <I size={12} />}{children}</span>;
}

function Btn({ children, onClick, kind = "primary", icon: I, size = "md", disabled }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`pl-btn ${kind}`}
      style={{ fontSize: size === "sm" ? 12.5 : 13.5, padding: size === "sm" ? "6px 11px" : "9px 15px", opacity: disabled ? 0.5 : 1 }}>
      {I && <I size={size === "sm" ? 14 : 16} />}{children}
    </button>
  );
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <button className="pl-toggle-row" onClick={() => onChange(!on)}>
      <span className="pl-toggle" style={{ background: on ? T.brand : "#CBD2DC" }}>
        <span className="pl-toggle-knob" style={{ transform: on ? "translateX(16px)" : "translateX(0)" }} />
      </span>
      {label && (
        <span style={{ display: "grid", gap: 1 }}>
          <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 500 }}>{label}</span>
          {sub && <span style={{ fontSize: 12, color: T.ink3 }}>{sub}</span>}
        </span>
      )}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="pl-field">
      <label className="pl-label">{label}</label>
      {children}
      {hint && <span className="pl-hint">{hint}</span>}
    </div>
  );
}
const TextInput = (p) => <input className="pl-input" {...p} />;
function SelectInput({ value, onChange, options }) {
  return <select className="pl-select" value={value} onChange={onChange}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}

function Kv({ k, v, icon: I, tone }) {
  return (
    <div className="pl-kv">
      <span className="pl-kv-k">{I && <I size={14} />}{k}</span>
      <span className="pl-kv-v pl-num" style={{ color: tone || T.ink, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Avatar() {
  return <span className="pl-avatar" style={{ background: T.brandBg, color: T.brandDk }}><Sparkles size={16} /></span>;
}

const sevMeta = {
  pass: { color: T.brand, bg: T.brandBg, icon: Check },
  review: { color: T.amber, bg: T.amberBg, icon: AlertTriangle },
  hold: { color: T.info, bg: T.infoBg, icon: Clock },
  fail: { color: T.rose, bg: T.roseBg, icon: XCircle },
  running: { color: T.slate, bg: T.slateBg, icon: Loader2 },
  queued: { color: T.ink3, bg: T.slateBg, icon: Clock },
};

/* ------------------------------- Dashboard ------------------------------- */

function Dashboard({ rows, go, openInvoice, autoPost }) {
  const total = rows.length;
  const cnt = (k) => rows.filter((r) => r.finalOutcome === k).length;
  const posted = cnt("posted"), review = cnt("review"), hold = cnt("hold"), rejected = cnt("rejected");
  const touchless = total ? Math.round((posted / total) * 100) : 0;
  const exceptions = rows.filter((r) => r.finalOutcome === "review" || r.finalOutcome === "hold");

  const reasonMap = {};
  exceptions.forEach((r) => { if (r.primaryReason) { const k = CAT_LABEL[r.primaryReason.cat]; reasonMap[k] = (reasonMap[k] || 0) + 1; } });
  const reasonDist = Object.entries(reasonMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const recent = rows.slice(0, 5);

  const tiles = [
    { n: total, l: "Invoices", ic: FileText, c: T.slate },
    { n: posted, l: "Posted", ic: CheckCircle2, c: T.brand },
    { n: review, l: "Needs review", ic: AlertTriangle, c: T.amber },
    { n: hold, l: "On hold", ic: Clock, c: T.info },
    { n: rejected, l: "Rejected", ic: XCircle, c: T.rose },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pl-tiles">
        {tiles.map((t) => (
          <div className="pl-tile" key={t.l}>
            <div className="pl-tile-num" style={{ color: t.c }}>{t.n}</div>
            <div className="pl-tile-lbl">{t.l}</div>
            <t.ic className="pl-tile-ico" size={17} color={t.c} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16, alignItems: "start" }} className="pl-dash-grid">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="pl-card">
            <div className="pl-card-head"><Zap size={16} color={T.brand} /> Straight-through processing
              <span className="sub">{autoPost ? "Auto-post on" : "Manual posting"}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <Gauge value={touchless} color={T.brand} sub="touchless" label={`${touchless}%`} />
              <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: T.ink3 }}>Median time to post</span><span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600 }}>1.8 min</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: T.ink3 }}>Checks per invoice</span><span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600 }}>6</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: T.ink3 }}>Open exceptions</span><span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: exceptions.length ? T.amber : T.ink }}>{exceptions.length}</span></div>
                <div style={{ height: 8, borderRadius: 999, overflow: "hidden", display: "flex", background: T.slateBg }}>
                  {[["posted", posted, T.brand], ["review", review, T.amber], ["hold", hold, T.info], ["rejected", rejected, T.rose]].map(([k, v, c]) =>
                    v ? <div key={k} style={{ width: `${(v / total) * 100}%`, background: c }} title={`${STATUS[k].label}: ${v}`} /> : null)}
                </div>
              </div>
            </div>
          </div>

          <div className="pl-card">
            <div className="pl-card-head"><AlertTriangle size={16} color={T.amber} /> Exception reasons</div>
            {reasonDist.length === 0 ? <div className="pl-empty">No exceptions.</div> : (
              <div style={{ height: Math.max(120, reasonDist.length * 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reasonDist} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: T.ink3 }} />
                    <Tooltip cursor={{ fill: T.slateBg }} contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={20} fill={T.amber} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="pl-card">
            <div className="pl-card-head"><Inbox size={16} color={T.amber} /> Exceptions to clear
              <span className="sub" style={{ cursor: "pointer", color: T.brand }} onClick={() => go("exceptions")}>Open</span></div>
            {exceptions.length === 0 ? <div className="pl-empty">Nothing to clear.</div> : (
              <div style={{ display: "grid", gap: 10 }}>
                {exceptions.slice(0, 4).map((r) => (
                  <div key={r.id} className="pl-rowlink" style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, margin: -8, borderRadius: 9 }} onClick={() => openInvoice(r.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.vendor}</div>
                      <div style={{ fontSize: 11.5, color: T.ink3 }}>{r.invoiceNumber} · {r.primaryReason ? r.primaryReason.label : "review"}</div>
                    </div>
                    <StatusPill status={r.finalOutcome} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-card">
            <div className="pl-card-head"><Clock size={16} color={T.slate} /> Recently received</div>
            <div style={{ display: "grid", gap: 9 }}>
              {recent.map((r) => (
                <div key={r.id} className="pl-rowlink" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 8, margin: -8, borderRadius: 9 }} onClick={() => openInvoice(r.id)}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.vendor}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3 }}>{money(r.currency, r.total)}</div>
                  </div>
                  <StatusPill status={r.finalOutcome} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Capture ------------------------------- */

const CHECK_ROWS_INV = [
  { cat: "vendor", label: "Vendor & master data" },
  { cat: "po", label: "Purchase-order match" },
  { cat: "tax", label: "Tax validation" },
  { cat: "math", label: "Invoice math" },
  { cat: "duplicate", label: "Duplicate check" },
];

const EX_CLEAN = {
  raw: `Summit Tools Inc
19 Ridgeline Dr, Boise, ID 83702
Invoice #: ST-9990
Date: 2026-01-17
PO Number: PO-5002
Currency: USD

Qty  Item                     Unit price    Amount
40   Cordless drill (DRL-22)  $85.00        $3,400.00

Subtotal: $3,400.00
Tax (8%):  $272.00
Total:     $3,672.00`,
  parse: { vendor: "Summit Tools Inc", invoiceNumber: "ST-9990", date: "2026-01-17", currency: "USD", poNumber: "PO-5002",
    lineItems: [{ sku: "DRL-22", desc: "Cordless drill", qty: 40, unitPrice: 85, amount: 3400 }],
    subtotal: 3400, taxRate: 0.08, tax: 272, total: 3672, confidence: 0.98 },
};
const EX_EXC = {
  raw: `Delta Chemicals Inc
Invoice No: DC-7790
PO: PO-5003
Currency: USD

20 x Cleaning solvent, drum (SOL-9) @ $158.00 = $3,160.00

Subtotal: $3,160.00
Tax (8%):  $252.80
Total:     $3,412.80`,
  parse: { vendor: "Delta Chemicals Inc", invoiceNumber: "DC-7790", date: "2026-01-17", currency: "USD", poNumber: "PO-5003",
    lineItems: [{ sku: "SOL-9", desc: "Cleaning solvent, drum", qty: 20, unitPrice: 158, amount: 3160 }],
    subtotal: 3160, taxRate: 0.08, tax: 252.80, total: 3412.80, confidence: 0.97 },
};

function Capture({ invoices, cfg, onAdd, openInvoice }) {
  const [raw, setRaw] = useState("");
  const [known, setKnown] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | extracting | validating | done
  const [extracted, setExtracted] = useState(null);
  const [src, setSrc] = useState(null);
  const [checkState, setCheckState] = useState({});
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const loadExample = (ex) => { setRaw(ex.raw); setKnown(ex.parse); setPhase("idle"); setResult(null); setExtracted(null); };
  const onEdit = (v) => { setRaw(v); setKnown(null); };

  const run = async () => {
    clearTimers();
    setPhase("extracting"); setResult(null); setExtracted(null);
    let parsed, source;
    if (known) { parsed = known; source = "example"; }
    else { try { parsed = await aiExtract(raw); source = "ai"; } catch { parsed = offlineExtract(raw); source = "offline"; } }
    setExtracted(parsed); setSrc(source);
    const conf = parsed.confidence != null ? parsed.confidence : source === "ai" ? 0.95 : source === "offline" ? 0.75 : 0.9;
    const draft = { id: "DRAFT", ...parsed, source: "Manual entry", receivedAt: "just now", extractionConfidence: conf };
    const res = evaluate(draft, [...invoices, draft], invoices.length, POS, MASTER, cfg, {});
    setResult(res);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { const d = {}; CHECK_ROWS_INV.forEach((c) => (d[c.cat] = "done")); setCheckState(d); setPhase("done"); return; }
    setPhase("validating");
    const init = {}; CHECK_ROWS_INV.forEach((c) => (init[c.cat] = "queued")); setCheckState(init);
    CHECK_ROWS_INV.forEach((c, i) => {
      timers.current.push(setTimeout(() => setCheckState((s) => ({ ...s, [c.cat]: "running" })), 160 + i * 340));
      timers.current.push(setTimeout(() => setCheckState((s) => ({ ...s, [c.cat]: "done" })), 160 + i * 340 + 280));
    });
    timers.current.push(setTimeout(() => setPhase("done"), 160 + CHECK_ROWS_INV.length * 340 + 120));
  };

  const reset = () => { clearTimers(); setRaw(""); setKnown(null); setPhase("idle"); setResult(null); setExtracted(null); setCheckState({}); };
  const commit = () => {
    const { id, ...rest } = result;
    const newId = onAdd({ vendor: rest.vendor, invoiceNumber: rest.invoiceNumber, date: rest.date, currency: rest.currency, poNumber: rest.poNumber, lineItems: rest.lineItems, subtotal: rest.subtotal, taxRate: rest.taxRate, tax: rest.tax, total: rest.total, source: "Manual entry", receivedAt: "just now", extractionConfidence: rest.confidence });
    openInvoice(newId);
  };

  const srcLabel = src === "ai" ? "Extracted by Claude" : src === "offline" ? "Extracted offline" : "Prepared example";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pl-onb-grid">
      <div className="pl-card">
        <div className="pl-card-head"><FilePlus2 size={16} color={T.brand} /> New invoice
          <span className="sub" style={{ display: "flex", gap: 6 }}>
            <button className="pl-btn subtle" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => loadExample(EX_CLEAN)}>Clean example</button>
            <button className="pl-btn subtle" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => loadExample(EX_EXC)}>Exception example</button>
          </span>
        </div>
        <Field label="Invoice text" hint="Paste an invoice in any format, or load an example. Claude extracts the fields.">
          <textarea className="pl-input" style={{ minHeight: 320, resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, lineHeight: 1.5 }}
            value={raw} onChange={(e) => onEdit(e.target.value)} placeholder="Paste invoice text here…" />
        </Field>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Btn onClick={run} disabled={raw.trim().length < 8 || phase === "extracting" || phase === "validating"} icon={phase === "extracting" || phase === "validating" ? Loader2 : ScanLine}>
            {phase === "extracting" ? "Reading…" : phase === "validating" ? "Validating…" : "Extract & validate"}
          </Btn>
          {phase !== "idle" && <Btn kind="ghost" onClick={reset} icon={RefreshCw}>Start over</Btn>}
        </div>
      </div>

      <div className="pl-card" style={{ position: "sticky", top: 84 }}>
        <div className="pl-card-head"><ClipboardCheck size={16} color={T.brand} /> Extraction & validation</div>
        {phase === "idle" ? (
          <div className="pl-empty" style={{ padding: "40px 16px" }}>
            <ScanLine size={26} color={T.ink3} style={{ marginBottom: 8 }} />
            <div>Load or paste an invoice, then extract.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Fields are read automatically, then validated against master data, the PO, tax rules, and the vendor's history.</div>
          </div>
        ) : phase === "extracting" ? (
          <div className="pl-empty" style={{ padding: "40px 16px" }}>
            <Loader2 size={24} color={T.brand} className="pl-spin" style={{ marginBottom: 8 }} />
            <div>Reading the invoice…</div>
          </div>
        ) : (
          <div>
            {extracted && (
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, padding: 13, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{extracted.vendor}</span>
                  <Chip icon={Sparkles} color={T.brandDk} bg={T.brandBg}>{srcLabel}</Chip>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 16px", fontSize: 12.5 }}>
                  <Kv icon={Hash} k="Invoice" v={extracted.invoiceNumber} />
                  <Kv icon={ShoppingCart} k="PO" v={extracted.poNumber || "none"} />
                  <Kv icon={CreditCard} k="Currency" v={extracted.currency} />
                  <Kv icon={DollarSign} k="Total" v={money(extracted.currency, extracted.total)} />
                </div>
                <div style={{ marginTop: 10 }}>
                  {extracted.lineItems.map((li, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.ink2, padding: "3px 0" }}>
                      <span>{li.qty} × {li.desc}{li.sku ? ` (${li.sku})` : ""}</span>
                      <span className="pl-num">{money(extracted.currency, li.amount)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line2}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.ink3, marginBottom: 5 }}><span>Extraction confidence</span></div>
                  <ConfMeter value={result ? result.confidence : 0.9} threshold={cfg.autoPostThreshold} />
                </div>
              </div>
            )}

            {result && CHECK_ROWS_INV.map((c) => {
              const st = checkState[c.cat] || "queued";
              const sev = st === "done" ? worstSeverity(result.findings, c.cat) : st;
              const meta = sevMeta[sev] || sevMeta.queued;
              const Icon = meta.icon;
              const finding = st === "done" ? result.findings.filter((x) => x.cat === c.cat).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0] : null;
              return (
                <div className="pl-check" key={c.cat}>
                  <div className="pl-check-ico" style={{ background: meta.bg, color: meta.color }}><Icon size={15} className={sev === "running" ? "pl-spin" : ""} /></div>
                  <div className="pl-check-body">
                    <div className="pl-check-t">{c.label}</div>
                    <div className="pl-check-e">{st === "queued" ? "Queued" : st === "running" ? "Checking…" : finding ? finding.evidence : "—"}</div>
                  </div>
                </div>
              );
            })}

            {phase === "done" && result && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <StatusPill status={result.finalOutcome} size="lg" />
                  <span style={{ fontSize: 12.5, color: T.ink3, flex: 1, minWidth: 160 }}>
                    {result.finalOutcome === "posted" && "Clean and matched. Cleared to post automatically."}
                    {result.finalOutcome === "review" && "Routed to a reviewer to resolve the findings above."}
                    {result.finalOutcome === "hold" && "Held until the blocking issue is resolved."}
                    {result.finalOutcome === "rejected" && "Not payable. This invoice was already received."}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn onClick={commit} icon={Check}>Add to invoices</Btn>
                  <Btn kind="ghost" onClick={reset}>Start over</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Invoices ------------------------------- */

function poBadge(r) {
  if (!r.poNumber) return { I: ShoppingCart, c: r.finalOutcome === "hold" ? T.info : T.ink3, t: "No PO" };
  if (!r.matchInfo) return { I: AlertTriangle, c: T.amber, t: "PO not found" };
  if (r.matchInfo.worst === "hold") return { I: Truck, c: T.info, t: "Awaiting receipt" };
  if (r.matchInfo.worst === "review") return { I: AlertTriangle, c: T.amber, t: "Variance" };
  return { I: GitCompare, c: T.brand, t: r.matchInfo.threeWay ? "3-way match" : "2-way match" };
}

function Invoices({ rows, openInvoice }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.finalOutcome !== filter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.vendor.toLowerCase().includes(s) || (r.invoiceNumber || "").toLowerCase().includes(s) || (r.poNumber || "").toLowerCase().includes(s);
  });
  const filters = [["all", "All"], ["posted", "Posted"], ["review", "Review"], ["hold", "On hold"], ["rejected", "Rejected"]];

  return (
    <div className="pl-card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={15} color={T.ink3} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input className="pl-input" style={{ paddingLeft: 33 }} placeholder="Search invoices, vendors, POs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="pl-seg">
          {filters.map(([k, l]) => <button key={k} className={`pl-seg-btn ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="pl-table">
          <thead><tr>
            <th style={{ paddingLeft: 16 }}>Invoice</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th><th>PO match</th><th style={{ minWidth: 130 }}>Confidence</th><th>Received</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const pb = poBadge(r);
              return (
                <tr key={r.id} className="pl-rowlink" onClick={() => openInvoice(r.id)}>
                  <td style={{ paddingLeft: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.vendor}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3 }}>{r.invoiceNumber} · {r.poNumber || "no PO"}</div>
                  </td>
                  <td><StatusPill status={r.finalOutcome} /></td>
                  <td style={{ textAlign: "right" }} className="pl-num">{money(r.currency, r.total)}</td>
                  <td><span title={pb.t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: pb.c }}><pb.I size={15} /> {pb.t}</span></td>
                  <td style={{ minWidth: 130 }}><ConfMeter value={r.confidence} threshold={0.85} /></td>
                  <td style={{ fontSize: 12.5, color: T.ink3, whiteSpace: "nowrap" }}>{r.receivedAt}</td>
                  <td style={{ paddingRight: 12 }}><ChevronRight size={16} color={T.ink3} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="pl-empty">No invoices match.</div>}
      </div>
    </div>
  );
}

/* --------------------------- exception card --------------------------- */

function ExceptionCard({ row, openInvoice, overrides, setOverrides }) {
  const [verdict, setVerdict] = useState(null);
  const [loading, setLoading] = useState(false);
  const decided = overrides[row.id];

  const runAI = async () => {
    setLoading(true); setVerdict(null);
    try { setVerdict(await aiSuggest(row)); }
    catch { setVerdict(offlineSuggest(row)); }
    setLoading(false);
  };
  const decide = (decision, note) => setOverrides((o) => ({ ...o, [row.id]: { decision, note } }));
  const actColor = (a) => (a === "post" ? T.brand : a === "reject" ? T.rose : a === "hold" ? T.info : T.amber);

  return (
    <div className="pl-scard">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{row.vendor}</span>
            <span style={{ fontSize: 12.5, color: T.ink3 }}>{row.invoiceNumber}</span>
            <StatusPill status={row.finalOutcome} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Chip icon={DollarSign} color={T.ink2} bg={T.slateBg}>{money(row.currency, row.total)}</Chip>
            <Chip icon={ShoppingCart} color={T.ink2} bg={T.slateBg}>{row.poNumber || "no PO"}</Chip>
          </div>
        </div>
        <button className="pl-btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => openInvoice(row.id)}>Open <ChevronRight size={14} /></button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
        {row.issues.map((f, i) => {
          const meta = sevMeta[f.severity] || sevMeta.review;
          return (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: T.ink2 }}>
              <meta.icon size={15} color={meta.color} style={{ flex: "none", marginTop: 1 }} />
              <span><b style={{ color: T.ink, fontWeight: 500 }}>{f.label}.</b> {f.evidence}</span>
            </div>
          );
        })}
      </div>

      {verdict && (
        <div style={{ marginTop: 12, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Sparkles size={15} color={T.brandDk} style={{ marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: actColor(verdict.action), textTransform: "capitalize" }}>Assistant: {String(verdict.action).replace("_", " ")} · {verdict.confidence}% confidence</div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{verdict.rationale}{verdict.offline ? " (offline)" : ""}</div>
          </div>
        </div>
      )}

      {decided && <div style={{ marginTop: 10, fontSize: 12.5, color: T.ink2, background: T.slateBg, borderRadius: 8, padding: "7px 10px" }}><Info size={13} style={{ verticalAlign: "-2px" }} /> Resolved as {STATUS[decided.decision] ? STATUS[decided.decision].label.toLowerCase() : decided.decision}. <button className="pl-btn ghost" style={{ padding: "2px 8px", fontSize: 11.5, marginLeft: 6 }} onClick={() => setOverrides((o) => { const n = { ...o }; delete n[row.id]; return n; })}>Undo</button></div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Btn size="sm" kind="subtle" icon={loading ? Loader2 : Wand2} onClick={runAI} disabled={loading}>{loading ? "Assessing…" : "AI suggest"}</Btn>
        <div style={{ flex: 1 }} />
        <Btn size="sm" kind="approve" icon={Check} onClick={() => decide("posted", "Approved and posted")}>Post</Btn>
        <Btn size="sm" kind="ghost" icon={Send} onClick={() => decide("review", "Sent back to vendor")}>Send back</Btn>
        <Btn size="sm" kind="danger" icon={Ban} onClick={() => decide("rejected", "Rejected")}>Reject</Btn>
      </div>
    </div>
  );
}

/* ------------------------------- Exceptions ------------------------------- */

function Exceptions({ rows, openInvoice, overrides, setOverrides }) {
  const [tab, setTab] = useState("all");
  const ex = rows.filter((r) => r.finalOutcome === "review" || r.finalOutcome === "hold");
  const shown = tab === "all" ? ex : ex.filter((r) => r.finalOutcome === tab);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[["Open exceptions", ex.length, T.amber], ["Needs review", ex.filter((r) => r.finalOutcome === "review").length, T.amber], ["On hold", ex.filter((r) => r.finalOutcome === "hold").length, T.info]].map(([l, n, c]) => (
          <div className="pl-tile" key={l}><div className="pl-tile-num" style={{ color: c }}>{n}</div><div className="pl-tile-lbl">{l}</div></div>
        ))}
      </div>
      <div className="pl-seg">
        {[["all", `All (${ex.length})`], ["review", `Needs review (${ex.filter((r) => r.finalOutcome === "review").length})`], ["hold", `On hold (${ex.filter((r) => r.finalOutcome === "hold").length})`]].map(([k, l]) =>
          <button key={k} className={`pl-seg-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {shown.length === 0 ? <div className="pl-card"><div className="pl-empty">No exceptions here. Everything is posting straight through.</div></div> : (
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map((r) => <ExceptionCard key={r.id} row={r} openInvoice={openInvoice} overrides={overrides} setOverrides={setOverrides} />)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Detail ------------------------------- */

function Detail({ row, onBack, overrides, setOverrides, cfg, goAssistant }) {
  const [tab, setTab] = useState("summary");
  if (!row) return null;
  const decide = (decision, note) => setOverrides((o) => ({ ...o, [row.id]: { decision, note } }));
  const clearDecision = () => setOverrides((o) => { const n = { ...o }; delete n[row.id]; return n; });
  const tabs = [
    ["summary", "Summary", FileText],
    ["lines", "Line items", ClipboardCheck],
    ["validation", "Validation", Check],
    ["matching", "PO matching", GitCompare],
    ["lifecycle", "Lifecycle", RefreshCw],
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button className="pl-btn ghost" style={{ width: "fit-content", padding: "6px 11px", fontSize: 12.5 }} onClick={onBack}><ChevronLeft size={15} /> All invoices</button>

      <div className="pl-card">
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontFamily: "Space Grotesk", fontSize: 21, letterSpacing: "-.01em" }}>{row.vendor}</h2>
              <StatusPill status={row.finalOutcome} size="lg" />
            </div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>{row.invoiceNumber} · {money(row.currency, row.total)} · received {row.receivedAt}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Chip icon={Mail} color={T.ink2} bg={T.slateBg}>{row.source}</Chip>
              <Chip icon={ShoppingCart} color={T.ink2} bg={T.slateBg}>{row.poNumber || "no PO"}</Chip>
            </div>
            {row.overridden && <div style={{ marginTop: 10, fontSize: 12.5, color: T.ink2, background: T.slateBg, borderRadius: 8, padding: "7px 10px", display: "flex", gap: 8, alignItems: "center" }}><Info size={14} /> Manual decision applied{row.note ? `: ${row.note}` : ""}. <button className="pl-btn ghost" style={{ padding: "2px 8px", fontSize: 11.5, marginLeft: "auto" }} onClick={clearDecision}>Undo</button></div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: T.ink3, marginBottom: 5 }}>Extraction confidence</div>
            <div style={{ width: 150 }}><ConfMeter value={row.confidence} threshold={cfg.autoPostThreshold} /></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Btn kind="approve" icon={Check} onClick={() => decide("posted", "Approved and posted")}>Approve &amp; post</Btn>
          <Btn kind="ghost" icon={Send} onClick={() => decide("review", "Sent back to vendor")}>Send back</Btn>
          <Btn kind="ghost" icon={Clock} onClick={() => decide("hold", "Placed on hold")}>Hold</Btn>
          <Btn kind="danger" icon={Ban} onClick={() => decide("rejected", "Rejected")}>Reject</Btn>
          <div style={{ flex: 1 }} />
          <Btn kind="ghost" icon={MessageSquare} onClick={() => goAssistant(`Summarize the status and any findings for ${row.vendor} invoice ${row.invoiceNumber}.`)}>Ask the assistant</Btn>
        </div>
      </div>

      <div className="pl-seg">
        {tabs.map(([k, l, I]) => <button key={k} className={`pl-seg-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}><I size={14} /> {l}</button>)}
      </div>

      {tab === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="pl-two">
          <div className="pl-card">
            <div className="pl-card-head"><FileText size={16} color={T.brand} /> Invoice</div>
            <div style={{ display: "grid", gap: 12 }}>
              <Kv icon={Building} k="Vendor" v={row.vendorMatch && row.vendorMatch.score >= 0.8 ? `${row.vendorMatch.m.name} (${row.vendorMatch.m.vendorId})` : row.vendor} />
              <Kv icon={Hash} k="Invoice number" v={row.invoiceNumber} />
              <Kv icon={Clock} k="Invoice date" v={row.date || "—"} />
              <Kv icon={ShoppingCart} k="Purchase order" v={row.poNumber || "none"} />
              <Kv icon={CreditCard} k="Currency" v={row.currency} />
            </div>
          </div>
          <div className="pl-card">
            <div className="pl-card-head"><DollarSign size={16} color={T.brand} /> Amounts</div>
            <div style={{ display: "grid", gap: 12 }}>
              <Kv k="Subtotal" v={money(row.currency, row.subtotal)} />
              <Kv k={`Tax${row.taxRate != null ? ` (${(row.taxRate * 100).toFixed(0)}%)` : ""}`} v={money(row.currency, row.tax)} />
              <div className="pl-divider" />
              <Kv k="Total" v={money(row.currency, row.total)} tone={T.ink} />
              <Kv icon={Landmark} k="Payment terms" v={row.vendorMatch && row.vendorMatch.m ? row.vendorMatch.m.terms : "—"} />
            </div>
          </div>
        </div>
      )}

      {tab === "lines" && (
        <div className="pl-card" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="pl-table">
              <thead><tr><th style={{ paddingLeft: 16 }}>Description</th><th>SKU</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Unit price</th><th style={{ textAlign: "right" }}>Amount</th><th>PO</th></tr></thead>
              <tbody>
                {row.lineItems.map((li, i) => {
                  const ml = row.matchInfo ? row.matchInfo.lines.find((x) => x.li === li) : null;
                  const pm = ml && ml.matched ? (ml.sev === "pass" ? { c: T.brand, t: "matches" } : ml.sev === "hold" ? { c: T.info, t: ml.note } : { c: T.amber, t: ml.note }) : ml ? { c: T.amber, t: "not on PO" } : null;
                  return (
                    <tr key={i}>
                      <td style={{ paddingLeft: 16 }}>{li.desc}</td>
                      <td style={{ color: T.ink3, fontSize: 12.5 }}>{li.sku || "—"}</td>
                      <td style={{ textAlign: "right" }} className="pl-num">{li.qty}</td>
                      <td style={{ textAlign: "right" }} className="pl-num">{money(row.currency, li.unitPrice)}</td>
                      <td style={{ textAlign: "right" }} className="pl-num">{money(row.currency, li.amount)}</td>
                      <td style={{ paddingRight: 12 }}>{pm ? <span style={{ fontSize: 12, color: pm.c }}>{pm.t}</span> : <span style={{ fontSize: 12, color: T.ink3 }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "validation" && (
        <div className="pl-card">
          <div className="pl-card-head"><Check size={16} color={T.brand} /> Validation checks</div>
          <div>
            {row.findings.map((fd, i) => {
              const meta = sevMeta[fd.severity] || sevMeta.pass; const Icon = meta.icon;
              return (
                <div className="pl-check" key={i}>
                  <div className="pl-check-ico" style={{ background: meta.bg, color: meta.color }}><Icon size={15} /></div>
                  <div className="pl-check-body"><div className="pl-check-t">{fd.label}</div><div className="pl-check-e">{fd.evidence}</div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "matching" && (
        <div className="pl-card">
          <div className="pl-card-head"><GitCompare size={16} color={T.brand} /> Purchase-order match</div>
          {!row.poNumber ? (
            <div className="pl-empty">No purchase order on this invoice.</div>
          ) : !row.matchInfo ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.amber, fontSize: 13.5 }}><AlertTriangle size={16} /> Referenced PO {row.poNumber} was not found in the system.</div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <Chip icon={ShoppingCart} color={T.ink2} bg={T.slateBg}>{row.matchInfo.po}</Chip>
                <Chip icon={GitCompare} color={T.ink2} bg={T.slateBg}>{row.matchInfo.threeWay ? "3-way (PO + receipt + invoice)" : "2-way (PO + invoice)"}</Chip>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="pl-table">
                  <thead><tr><th>Line</th><th style={{ textAlign: "right" }}>Invoice qty</th><th style={{ textAlign: "right" }}>PO qty</th>{row.matchInfo.threeWay && <th style={{ textAlign: "right" }}>Received</th>}<th style={{ textAlign: "right" }}>Inv price</th><th style={{ textAlign: "right" }}>PO price</th><th>Result</th></tr></thead>
                  <tbody>
                    {row.matchInfo.lines.map((l, i) => {
                      const meta = sevMeta[l.sev] || sevMeta.pass;
                      return (
                        <tr key={i}>
                          <td>{l.matched ? l.pl.desc : l.li.desc}</td>
                          <td style={{ textAlign: "right" }} className="pl-num">{l.li.qty}</td>
                          <td style={{ textAlign: "right" }} className="pl-num">{l.matched ? l.pl.qty : "—"}</td>
                          {row.matchInfo.threeWay && <td style={{ textAlign: "right" }} className="pl-num">{l.recv != null ? l.recv : "—"}</td>}
                          <td style={{ textAlign: "right" }} className="pl-num">{money(row.currency, l.li.unitPrice)}</td>
                          <td style={{ textAlign: "right" }} className="pl-num">{l.matched ? money(row.currency, l.pl.unitPrice) : "—"}</td>
                          <td><span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: meta.color }}><meta.icon size={14} /> {l.sev === "pass" ? "Match" : l.note}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "lifecycle" && (
        <div className="pl-card">
          <div className="pl-card-head"><RefreshCw size={16} color={T.info} /> Processing lifecycle</div>
          <div className="pl-tl">
            {[
              { dot: T.slate, t: "Received", d: `${row.source} · ${row.receivedAt}` },
              { dot: T.brand, t: "Extracted", d: `Fields read at ${(row.confidence * 100).toFixed(0)}% confidence.` },
              { dot: STATUS[row.finalOutcome].color, t: `Validated — ${STATUS[row.finalOutcome].label}`, d: `${row.issues.length} finding(s) across ${row.findings.length} checks.` },
              row.finalOutcome === "posted"
                ? { dot: T.brand, t: "Posted to Workday", d: "Recorded against the PO and vendor, ready for payment." }
                : { dot: STATUS[row.finalOutcome].color, t: "Awaiting resolution", d: "Held until the findings are cleared." },
              { dot: "#CBD2DC", t: "Payment", d: row.finalOutcome === "posted" ? `Scheduled on ${row.vendorMatch && row.vendorMatch.m ? row.vendorMatch.m.terms : "vendor"} terms.` : "Runs once the invoice posts.", last: true },
            ].map((it, i, arr) => (
              <div className="pl-tl-item" key={i}>
                <div className="pl-tl-rail"><span className="pl-tl-dot" style={{ background: it.dot, boxShadow: `0 0 0 3px ${it.dot}22` }} />{i < arr.length - 1 && <span className="pl-tl-line" />}</div>
                <div style={{ paddingBottom: 2 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.t}</div><div style={{ fontSize: 12.5, color: T.ink3, marginTop: 1 }}>{it.d}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Assistant ------------------------------- */

const SUGGESTIONS = [
  "What posted straight through today?",
  "Show exceptions and why.",
  "Which invoices are on hold?",
  "Any duplicates I should reject?",
];

function Assistant({ rows, cfg, thread, setThread }) {
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);
  const setInput = (v) => setThread((t) => ({ ...t, input: v }));
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.messages, busy]);

  const send = async (textArg) => {
    const text = (textArg != null ? textArg : thread.input).trim();
    if (!text || busy) return;
    setThread((t) => ({ ...t, messages: [...t.messages, { role: "user", text }], input: "" }));
    setBusy(true);
    let answer;
    try { answer = await askAssistant(text, rows, cfg); if (!answer) throw new Error("empty"); }
    catch { answer = offlineAnswer(text, rows); }
    setThread((t) => ({ ...t, messages: [...t.messages, { role: "bot", text: answer }] }));
    setBusy(false);
  };

  return (
    <div className="pl-card pl-chat">
      <div className="pl-card-head" style={{ marginBottom: 8 }}><Sparkles size={16} color={T.brandDk} /> Invoice Assistant<span className="sub">Answers grounded in your current invoice data</span></div>
      <div className="pl-msgs" ref={scroller}>
        {thread.messages.length === 0 && (
          <div style={{ margin: "auto 0", textAlign: "center", color: T.ink3 }}>
            <Avatar />
            <div style={{ marginTop: 10, fontSize: 14, color: T.ink2, maxWidth: 430, marginInline: "auto" }}>Ask about invoice status, exceptions, PO matches, or totals. I only use the data in this workspace, and I can take corrective action on an invoice for you.</div>
          </div>
        )}
        {thread.messages.map((m, i) => (
          <div key={i} className={`pl-msg ${m.role}`}>{m.role === "bot" && <Avatar />}<div className="pl-bubble">{m.text}</div></div>
        ))}
        {busy && <div className="pl-msg bot"><Avatar /><div className="pl-bubble" style={{ color: T.ink3, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} className="pl-spin" /> Checking the data…</div></div>}
      </div>
      {thread.messages.length === 0 && <div className="pl-suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
      <div className="pl-composer">
        <textarea className="pl-input" rows={1} style={{ resize: "none", minHeight: 42, paddingTop: 11 }} placeholder="Ask about an invoice…"
          value={thread.input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Btn onClick={() => send()} disabled={busy || !thread.input.trim()} icon={Send}>Send</Btn>
      </div>
    </div>
  );
}

/* ------------------------------- Integration ------------------------------- */

function SourceNode({ icon: I, title, sub, status, color, children }) {
  return (
    <div className="pl-node">
      <div className="pl-node-ttl"><I size={16} color={color || T.ink2} /> {title}</div>
      <div className="pl-node-sub">{sub}</div>
      {children}
      {status && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}><span className="pl-sdot" style={{ background: T.brand }} /><span style={{ fontSize: 11.5, color: T.brand, fontWeight: 500 }}>{status}</span></div>}
    </div>
  );
}
function Edge({ label, icon: I }) {
  return (
    <div className="pl-edge"><span className="pl-edge-lbl">{I && <I size={13} />}{label}</span><ArrowRight size={18} style={{ transform: "rotate(90deg)" }} color={T.ink3} /></div>
  );
}

function Integration({ cfg, autoPost, setAutoPost }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pl-arch">
        <div className="pl-layer">
          <div className="pl-layer-ttl"><Building2Fallback /> Inbound &amp; Workday</div>
          <div className="pl-nodes">
            <SourceNode icon={Inbox} title="Invoice channels" sub="Every invoice, whatever the format" color={T.brand}>
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                {[["Email", Mail], ["Scan / OCR", ScanLine], ["EDI", Plug], ["Supplier portal", Landmark]].map(([l]) => <Chip key={l} color={T.ink2} bg={T.slateBg}>{l}</Chip>)}
              </div>
            </SourceNode>
            <SourceNode icon={Landmark} title="Workday Financials" sub="Supplier Accounts and accounts payable" status="Connected" color={T.brand} />
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12.5, color: T.ink2 }}><Zap size={14} color={T.amber} /> Triggered event — invoice received</div>
        </div>

        <Edge label="Secure API trigger" icon={Plug} />

        <div className="pl-layer" style={{ borderColor: T.brand, boxShadow: `0 0 0 3px ${T.brandBg}` }}>
          <div className="pl-layer-ttl"><ClipboardCheck size={15} color={T.brand} /> Attavo Invoices engine</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: T.ink2, display: "grid", gap: 6 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Template-free extraction in 100+ languages</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Master-data, PO, tax, and math validation in parallel</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Exceptions routed; clean invoices post on their own</span>
              </div>
            </div>
            <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 11, padding: 13, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: T.ink3, marginBottom: 8 }}>Single toggle</div>
              <Toggle on={autoPost} onChange={setAutoPost} label="Auto-post clean invoices" sub={autoPost ? "Fully matched invoices post without a person" : "Every invoice waits for approval"} />
            </div>
          </div>
        </div>

        <Edge label="Real-time validation" icon={ScanLine} />

        <div className="pl-layer">
          <div className="pl-layer-ttl"><Database size={15} color={T.brand} /> Validation sources</div>
          <div className="pl-nodes">
            <SourceNode icon={ShoppingCart} title="Workday master data &amp; POs" sub="Vendor master, purchase orders, receipts" status="Live" color={T.brand} />
            <SourceNode icon={Percent} title="Government tax authorities" sub="Tax IDs and rates validated at source" status="Live" color={T.brand} />
          </div>
        </div>
      </div>

      <div className="pl-note"><Info size={15} style={{ flex: "none", marginTop: 1 }} color={T.info} /><span>Invoices runs inside Workday: a single secure trigger fires when an invoice arrives, the engine reads and validates it in real time against Workday master data, purchase orders, and tax authorities, and posts clean invoices automatically.</span></div>

      <div className="pl-card">
        <div className="pl-card-head"><Zap size={16} color={T.amber} /> Recent processing</div>
        <div style={{ overflowX: "auto" }}>
          <table className="pl-table">
            <thead><tr><th>When</th><th>Channel</th><th>Invoice</th><th>Result</th></tr></thead>
            <tbody>
              {CHANNELS.map((e, i) => (
                <tr key={i}><td style={{ color: T.ink3, whiteSpace: "nowrap" }}>{e.ts}</td><td>{e.channel}</td><td>{e.subject}</td><td><StatusPill status={e.result} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function Building2Fallback() { return <Inbox size={15} color={T.brand} />; }

/* ------------------------------- Settings ------------------------------- */

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: T.ink2 }}>{label}</span>
        <span className="pl-num" style={{ fontSize: 13, fontWeight: 600, color: T.brandDk }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: T.brand }} />
    </div>
  );
}

function Settings({ cfg, setCfg }) {
  const up = (patch) => setCfg((c) => ({ ...c, ...patch }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pl-two">
      <div className="pl-card">
        <div className="pl-card-head"><GitCompare size={16} color={T.brand} /> Purchase-order matching</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle on={cfg.requirePO} onChange={(v) => up({ requirePO: v })} label="Require a purchase order" sub="Hold non-PO invoices for manual review" />
          <Slider label="Price variance tolerance" value={cfg.priceTol} min={0} max={0.2} step={0.01} onChange={(v) => up({ priceTol: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <p className="pl-hint">Line prices within this band of the PO are treated as a match. Quantities billed above the PO or receipt are always flagged.</p>
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><Percent size={16} color={T.brand} /> Tax validation</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle on={cfg.verifyTax} onChange={(v) => up({ verifyTax: v })} label="Validate tax amounts" sub="Recompute tax from the taxable amount and rate" />
          <Slider label="Tax tolerance" value={cfg.taxTol} min={0} max={0.1} step={0.005} onChange={(v) => up({ taxTol: v })} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><Zap size={16} color={T.brand} /> Straight-through posting</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Slider label="Auto-post confidence threshold" value={cfg.autoPostThreshold} min={0.5} max={0.99} step={0.01} onChange={(v) => up({ autoPostThreshold: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <p className="pl-hint">Invoices extracted below this confidence are routed to a person even when every other check passes.</p>
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><CreditCard size={16} color={T.info} /> Currencies accepted</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CURRENCIES.map((c) => <Chip key={c} color={T.ink2} bg={T.slateBg}>{c}</Chip>)}
        </div>
        <p className="pl-hint" style={{ marginTop: 12 }}>Invoices in any listed ISO currency are processed. Unrecognised currencies are flagged for review.</p>
      </div>
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

const DEFAULT_CFG = { requirePO: true, priceTol: 0.05, taxTol: 0.02, verifyTax: true, autoPostThreshold: 0.85 };

export default function App() {
  const [invoices, setInvoices] = useState(INVOICES);
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [overrides, setOverrides] = useState({});
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState({ messages: [], input: "" });
  const [autoPost, setAutoPost] = useState(true);
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const rows = useMemo(() => invoices.map((s, i) => evaluate(s, invoices, i, POS, MASTER, cfg, overrides)), [invoices, cfg, overrides]);
  const exceptionCount = rows.filter((r) => r.finalOutcome === "review" || r.finalOutcome === "hold").length;

  const openInvoice = (id) => { setSelectedId(id); setView("detail"); setSideOpen(false); };
  const go = (v) => { setView(v); setSideOpen(false); };
  const goAssistant = (prefill) => { setThread((t) => ({ ...t, input: prefill })); setView("assistant"); setSideOpen(false); };
  const onAdd = (o) => { const withId = { ...o, id: nid() }; setInvoices((a) => [...a, withId]); return withId.id; };

  const selected = rows.find((r) => r.id === selectedId);

  const NAV = [
    { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { k: "capture", label: "New invoice", icon: FilePlus2 },
    { k: "invoices", label: "Invoices", icon: FileText, badge: rows.length },
    { k: "exceptions", label: "Exceptions", icon: Inbox, badge: exceptionCount, warn: exceptionCount > 0 },
    { k: "assistant", label: "Assistant", icon: Sparkles },
    { k: "integration", label: "Integration", icon: Plug },
    { k: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const titles = {
    dashboard: ["Dashboard", "Invoice automation overview"],
    capture: ["New invoice", "Extract and validate an invoice in real time"],
    invoices: ["Invoices", `${rows.length} invoices in the workspace`],
    exceptions: ["Exceptions", "Invoices that need a person"],
    assistant: ["Invoice Assistant", "Ask about invoices, exceptions, and totals"],
    integration: ["Integration", "How Invoices connects to Workday and validation sources"],
    settings: ["Settings", "Matching tolerances, tax rules, and auto-post"],
    detail: [selected ? selected.vendor : "Invoice", "Invoice detail"],
  };
  const [tt, ts] = titles[view] || titles.dashboard;

  return (
    <div className="pl-app">
      <style>{CSS}</style>

      <aside className={`pl-side ${sideOpen ? "open" : ""}`}>
        <div className="pl-brand">
          <div className="pl-brandmark"><FileText size={18} /></div>
          <div><div className="pl-brandname">Attavo</div><div className="pl-brandsub">Invoices</div></div>
        </div>
        <nav className="pl-nav">
          {NAV.map((n) => (
            <button key={n.k} className={`pl-navitem ${view === n.k || (n.k === "invoices" && view === "detail") ? "active" : ""}`} onClick={() => go(n.k)}>
              <n.icon size={17} /> {n.label}
              {n.badge != null && n.badge > 0 && <span className={`pl-badge ${n.warn ? "warn" : ""}`}>{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="pl-side-foot">Invoice automation prototype.<br />Runs inside Workday.</div>
      </aside>

      {sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.35)", zIndex: 30 }} />}

      <div className="pl-main">
        <header className="pl-top">
          <button className="pl-btn ghost pl-menu" style={{ padding: 8, display: "none" }} onClick={() => setSideOpen(true)}><LayoutDashboard size={16} /></button>
          <div><div className="pl-topttl">{tt}</div><div className="pl-topsub">{ts}</div></div>
          <div className="pl-top-actions">{view !== "capture" && <Btn icon={FilePlus2} onClick={() => go("capture")}>New invoice</Btn>}</div>
        </header>

        <div className="pl-content">
          {view === "dashboard" && <Dashboard rows={rows} go={go} openInvoice={openInvoice} autoPost={autoPost} />}
          {view === "capture" && <Capture invoices={invoices} cfg={cfg} onAdd={onAdd} openInvoice={openInvoice} />}
          {view === "invoices" && <Invoices rows={rows} openInvoice={openInvoice} />}
          {view === "exceptions" && <Exceptions rows={rows} openInvoice={openInvoice} overrides={overrides} setOverrides={setOverrides} />}
          {view === "assistant" && <Assistant rows={rows} cfg={cfg} thread={thread} setThread={setThread} />}
          {view === "integration" && <Integration cfg={cfg} autoPost={autoPost} setAutoPost={setAutoPost} />}
          {view === "settings" && <Settings cfg={cfg} setCfg={setCfg} />}
          {view === "detail" && <Detail row={selected} onBack={() => go("invoices")} overrides={overrides} setOverrides={setOverrides} cfg={cfg} goAssistant={goAssistant} />}
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .pl-menu{ display:inline-flex !important; } .pl-dash-grid{ grid-template-columns:1fr !important; } .pl-onb-grid{ grid-template-columns:1fr !important; } .pl-two{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
