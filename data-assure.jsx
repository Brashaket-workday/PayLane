import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, UserPlus, Building2, ShieldAlert, Sparkles, Settings as SettingsIcon,
  Search, ChevronRight, ChevronLeft, Check, CheckCircle2, XCircle, AlertTriangle, Clock,
  ShieldCheck, Landmark, Banknote, Globe, FileText, Users, RefreshCw, Send, Loader2, Info,
  Zap, Building, CreditCard, ArrowRight, Fingerprint, Database, Plug, ClipboardCheck,
  Ban, MessageSquare, CircleUser, Wand2, ScanSearch
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";

/* ------------------------------------------------------------------ *
 * Attavo Verify — supplier data validation & fraud prevention
 * Companion to Attavo Invoices. Real routing/IBAN checksums, real
 * fuzzy watchlist screening, Claude-powered Procurement Assistant.
 * ------------------------------------------------------------------ */

const T = {
  brand: "#0C6B6B", brandDk: "#0A5757",
  amber: "#B54708", rose: "#C01048", info: "#175CD3", slate: "#475467",
  ink: "#101828", ink2: "#344054", ink3: "#667085",
  line: "#E4E7EC", line2: "#EAECF0", bg: "#F3F4F6", panel: "#FFFFFF",
  brandBg: "#E4F0EF", amberBg: "#FDF0E6", roseBg: "#FDE7EE", infoBg: "#E8F0FD", slateBg: "#EEF1F4",
};

const STATUS = {
  validated: { label: "Validated", color: T.brand, bg: T.brandBg, icon: CheckCircle2 },
  flagged:   { label: "Flagged",   color: T.amber, bg: T.amberBg, icon: AlertTriangle },
  rejected:  { label: "Rejected",  color: T.rose,  bg: T.roseBg,  icon: XCircle },
  sent_back: { label: "Sent back", color: T.info,  bg: T.infoBg,  icon: Send },
  pending:   { label: "Pending",   color: T.slate, bg: T.slateBg, icon: Clock },
};

const LIST_ALL = ["OFAC SDN", "Denied Persons List", "INTERPOL", "FBI", "FTO", "LEIE"];
const EMBARGO = ["Cuba", "Iran", "North Korea", "Syria", "Crimea"];

/* Demonstration watchlist — entirely fictional entities and people.
   Not real sanctions data; used only to exercise the screening logic. */
const WATCHLIST = [
  { name: "Volkov Metals OJSC", type: "entity", lists: ["OFAC SDN", "INTERPOL"], country: "Russia", note: "Listed for sanctions evasion in metals trade." },
  { name: "Zenith Arms Limited", type: "entity", lists: ["FTO", "Denied Persons List"], country: "Syria", note: "Denied export privileges; arms trafficking." },
  { name: "Groupe Sahel Logistique", type: "entity", lists: ["Denied Persons List"], country: "Mali", note: "Export-control violation." },
  { name: "Andrei Popov", type: "individual", lists: ["FBI", "INTERPOL"], country: "Belarus", note: "Wanted in connection with financial crime." },
  { name: "Karim S. Al-Nabhani", type: "individual", lists: ["OFAC SDN"], country: "Iran", note: "Blocked person under counter-terrorism authority." },
  { name: "Helena Vance", type: "individual", lists: ["LEIE"], country: "United States", note: "Excluded from federal healthcare programs." },
];

const COUNTRIES = [
  "United States", "United Kingdom", "Germany", "France", "Canada", "Mexico", "Cyprus",
  "Netherlands", "Ireland", "Spain", "Italy", "Poland", "India", "Singapore", "Japan",
  "Australia", "Brazil", "Cuba", "Iran", "Syria", "North Korea",
];

const TRIGGER_EVENTS = [
  { ts: "2 min ago", system: "Workday HCM", event: "Worker creation", subject: "Contractor — payroll onboarding", result: "validated" },
  { ts: "18 min ago", system: "Strategic Sourcing", event: "Supplier creation", subject: "Volkov Metals Trading LLC", result: "flagged" },
  { ts: "1 hr ago", system: "Strategic Sourcing", event: "Supplier creation", subject: "Zenith Arms Limited", result: "rejected" },
  { ts: "3 hr ago", system: "Workday Financials", event: "Bank detail change", subject: "Brightline Services Co", result: "flagged" },
  { ts: "today", system: "Strategic Sourcing", event: "Supplier creation", subject: "Lumen Retail GmbH", result: "validated" },
];

/* ----------------------------- helpers ----------------------------- */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const normId = (s) => (s || "").replace(/[^a-z0-9]/gi, "").toUpperCase();

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
function levRatio(a, b) {
  if (!a && !b) return 1;
  const d = lev(a, b);
  return 1 - d / Math.max(a.length, b.length, 1);
}
function jac(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
function nameSim(a, b) {
  const na = norm(a), nb = norm(b);
  return Math.max(jac(na, nb), levRatio(na, nb));
}

/* Real ABA routing-number checksum (US bank routing) */
function validABA(num) {
  if (!num) return false;
  const s = ("" + num).replace(/\D/g, "");
  if (s.length !== 9) return false;
  const d = s.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/* Real IBAN mod-97 checksum (international bank account) */
function validIBAN(iban) {
  if (!iban) return false;
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  if (s.length < 15 || s.length > 34) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const val = /[A-Z]/.test(ch) ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const dch of val) rem = (rem * 10 + (dch.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

function taxCheck(country, taxId) {
  if (!taxId) return { status: "missing", label: "Tax ID" };
  const v = taxId.trim().replace(/\s/g, "");
  if (country === "United States") return { status: /^\d{2}-?\d{7}$/.test(taxId.trim()) ? "valid" : "invalid", label: "US EIN" };
  if (country === "United Kingdom") return { status: /^GB?\d{9}(\d{3})?$/i.test(v) ? "valid" : "invalid", label: "UK VAT" };
  if (country === "Germany") return { status: /^DE\d{9}$/i.test(v) ? "valid" : "invalid", label: "DE VAT" };
  return { status: v.replace(/[^a-z0-9]/gi, "").length >= 6 ? "valid" : "invalid", label: "Tax ID" };
}

function maskBank(s) {
  if (!s) return "—";
  const v = ("" + s).replace(/\s/g, "");
  if (v.length <= 4) return v;
  return v.slice(0, 4) + " •••• " + v.slice(-3);
}

let _sid = 0;
const nid = () => `SUP-${1000 + ++_sid}`;
function sup(o) {
  return {
    id: nid(), dba: "", owners: [], address: {}, source: "Supplier portal",
    submittedAt: "—", nextRevalidation: "—", enrich: {}, ...o,
  };
}

/* --------------------------- seed suppliers --------------------------- */

const SUPPLIERS = [
  sup({ legalName: "Cascade Components Inc", country: "United States", category: "Manufacturing",
    address: { line1: "880 Foundry Rd", city: "Akron", region: "OH", postal: "44305" },
    taxId: "47-2810193", routing: "021000021", accountName: "Cascade Components Inc",
    owners: [{ name: "Margaret Ellison", pct: 60 }, { name: "David Ellison", pct: 40 }],
    contactEmail: "ap@cascadecomp.com", source: "Workday: Supplier creation", submittedAt: "5 days ago", nextRevalidation: "in 84 days",
    enrich: { duns: "07-914-2233", creditRating: "A", revenueBand: "$50M–$100M", employees: "210", yearsInBusiness: 14, ecovadis: "Gold · 68/100" } }),

  sup({ legalName: "Northwind Traders LLC", country: "United States", category: "Distribution",
    address: { line1: "12 Harbor St", city: "Tacoma", region: "WA", postal: "98402" },
    taxId: "83-1120945", routing: "111000025", accountName: "Northwind Traders LLC",
    owners: [{ name: "Priya Nair", pct: 100 }],
    contactEmail: "billing@northwindtraders.com", source: "Workday: Supplier creation", submittedAt: "3 days ago", nextRevalidation: "in 88 days",
    enrich: { duns: "11-233-9087", creditRating: "BB", revenueBand: "$5M–$10M", employees: "22", yearsInBusiness: 1, ecovadis: "Bronze · 41/100" } }),

  sup({ legalName: "Brightline Services Co", country: "United States", category: "Facilities",
    address: { line1: "455 Market Ave", city: "Columbus", region: "OH", postal: "43215" },
    taxId: "26-4491028", routing: "026009593", accountName: "BL Services Payments",
    owners: [{ name: "Tom Reyes", pct: 100 }],
    contactEmail: "invoices@brightlinesvc.com", source: "Workday Financials: Bank detail change", submittedAt: "2 days ago", nextRevalidation: "in 90 days",
    enrich: { duns: "22-118-4471", creditRating: "A", revenueBand: "$10M–$25M", employees: "75", yearsInBusiness: 9, ecovadis: "Silver · 55/100" } }),

  sup({ legalName: "Apex Logistics Group", country: "United States", category: "Logistics",
    address: { line1: "900 Rail Yard Dr", city: "Memphis", region: "TN", postal: "38118" },
    taxId: "45-3390011", routing: "021000020", accountName: "Apex Logistics Group",
    owners: [{ name: "Sara Whitfield", pct: 100 }],
    contactEmail: "ar@apexlog.com", source: "Workday: Supplier creation", submittedAt: "1 day ago", nextRevalidation: "in 90 days",
    enrich: { duns: "33-441-2290", creditRating: "BBB", revenueBand: "$25M–$50M", employees: "140", yearsInBusiness: 6, ecovadis: "Silver · 52/100" } }),

  sup({ legalName: "Volkov Metals Trading LLC", country: "United States", category: "Raw materials",
    address: { line1: "1400 Harbor Blvd", city: "Newark", region: "NJ", postal: "07114" },
    taxId: "88-2019471", routing: "026009593", accountName: "Volkov Metals Trading LLC",
    owners: [{ name: "Ivan Sokolov", pct: 100 }],
    contactEmail: "ap@volkovmetals.us", source: "Supplier portal", submittedAt: "6 hours ago", nextRevalidation: "in 90 days",
    enrich: { duns: "44-902-1183", creditRating: "BB", revenueBand: "$25M–$50M", employees: "60", yearsInBusiness: 4, ecovadis: "—" } }),

  sup({ legalName: "Zenith Arms Limited", country: "United Kingdom", category: "Industrial",
    address: { line1: "5 Dockside Rd", city: "Portsmouth", region: "", postal: "PO1 3TX" },
    taxId: "GB219124883", iban: "GB82WEST12345698765432", accountName: "Zenith Arms Limited",
    owners: [{ name: "Nigel Harding", pct: 100 }],
    contactEmail: "accounts@zenitharms.co.uk", source: "Supplier portal", submittedAt: "yesterday", nextRevalidation: "—",
    enrich: { duns: "55-201-8834", creditRating: "B", revenueBand: "$5M–$10M", employees: "30", yearsInBusiness: 3, ecovadis: "—" } }),

  sup({ legalName: "Havana Trading Co", country: "Cuba", category: "Import / export",
    address: { line1: "Calle 23 No. 456", city: "Havana", region: "", postal: "10400" },
    taxId: "CU99120034", accountName: "Havana Trading Co",
    owners: [{ name: "Luis Marín", pct: 100 }],
    contactEmail: "ventas@havanatrading.cu", source: "Supplier portal", submittedAt: "2 days ago", nextRevalidation: "—",
    enrich: { duns: "—", creditRating: "—", revenueBand: "—", employees: "—", yearsInBusiness: 8, ecovadis: "—" } }),

  sup({ legalName: "Meridian Supplies Inc", country: "United States", category: "Office supplies",
    address: { line1: "77 Commerce Pkwy", city: "Reno", region: "NV", postal: "89502" },
    taxId: "12-34", routing: "111000025", accountName: "Meridian Supplies Inc",
    owners: [{ name: "Grace Kim", pct: 100 }],
    contactEmail: "ap@meridiansupplies.com", source: "Workday: Supplier creation", submittedAt: "4 days ago", nextRevalidation: "—",
    enrich: { duns: "66-330-1120", creditRating: "A", revenueBand: "$10M–$25M", employees: "48", yearsInBusiness: 11, ecovadis: "Silver · 58/100" } }),

  sup({ legalName: "Orion Freight LLC", country: "United States", category: "Logistics",
    address: { line1: "210 Cargo Way", city: "Louisville", region: "KY", postal: "40213" },
    taxId: "27-8890142", accountName: "Orion Freight LLC",
    owners: [{ name: "Marcus Lee", pct: 100 }],
    contactEmail: "billing@orionfreight.com", source: "Supplier portal", submittedAt: "3 days ago", nextRevalidation: "—",
    enrich: { duns: "71-220-9981", creditRating: "BBB", revenueBand: "$5M–$10M", employees: "35", yearsInBusiness: 5, ecovadis: "Bronze · 44/100" } }),

  sup({ legalName: "Cascade Components Incorporated", country: "United States", category: "Manufacturing",
    address: { line1: "880 Foundry Road", city: "Akron", region: "OH", postal: "44305" },
    taxId: "47-2810193", routing: "021000021", accountName: "Cascade Components Incorporated",
    owners: [{ name: "Margaret Ellison", pct: 100 }],
    contactEmail: "payments@cascade-components.com", source: "Supplier portal", submittedAt: "1 day ago", nextRevalidation: "—",
    enrich: { duns: "07-914-2233", creditRating: "A", revenueBand: "$50M–$100M", employees: "210", yearsInBusiness: 14, ecovadis: "Gold · 68/100" } }),

  sup({ legalName: "Meridian Freight LLC", country: "United States", category: "Logistics",
    address: { line1: "340 Transit Ln", city: "Dallas", region: "TX", postal: "75207" },
    taxId: "46-7781200", routing: "026009593", accountName: "Meridian Freight LLC",
    owners: [{ name: "Andriy Popov", pct: 70 }, { name: "Elena Popova", pct: 30 }],
    contactEmail: "ap@meridianfreight.com", source: "Workday: Supplier creation", submittedAt: "8 hours ago", nextRevalidation: "in 90 days",
    enrich: { duns: "48-119-3321", creditRating: "BBB", revenueBand: "$10M–$25M", employees: "52", yearsInBusiness: 7, ecovadis: "Silver · 50/100" } }),

  sup({ legalName: "Lumen Retail GmbH", country: "Germany", category: "Retail goods",
    address: { line1: "Hauptstraße 45", city: "Munich", region: "BY", postal: "80331" },
    taxId: "DE811204567", iban: "DE89370400440532013000", accountName: "Lumen Retail GmbH",
    owners: [{ name: "Anna Bauer", pct: 100 }],
    contactEmail: "kreditoren@lumenretail.de", source: "Workday: Supplier creation", submittedAt: "6 days ago", nextRevalidation: "in 80 days",
    enrich: { duns: "88-004-7712", creditRating: "A", revenueBand: "$50M–$100M", employees: "320", yearsInBusiness: 18, ecovadis: "Platinum · 79/100" } }),

  sup({ legalName: "Pioneer Paper Co", country: "United States", category: "Packaging",
    address: { line1: "62 Mill St", city: "Green Bay", region: "WI", postal: "54303" },
    taxId: "39-1180022", routing: "021000021", accountName: "Pioneer Paper Co",
    owners: [{ name: "Robert Shaw", pct: 100 }],
    contactEmail: "ap@pioneerpaper.com", source: "Workday: Supplier creation", submittedAt: "7 days ago", nextRevalidation: "in 76 days",
    enrich: { duns: "39-880-2210", creditRating: "A", revenueBand: "$25M–$50M", employees: "130", yearsInBusiness: 22, ecovadis: "Gold · 66/100" } }),

  sup({ legalName: "Summit Tools Inc", country: "United States", category: "Hardware",
    address: { line1: "19 Ridgeline Dr", city: "Boise", region: "ID", postal: "83702" },
    taxId: "82-4410098", routing: "111000025", accountName: "Summit Tools Inc",
    owners: [{ name: "Karen Doyle", pct: 100 }],
    contactEmail: "billing@summittools.com", source: "Supplier portal", submittedAt: "9 days ago", nextRevalidation: "in 70 days",
    enrich: { duns: "82-114-5567", creditRating: "AA", revenueBand: "$100M–$250M", employees: "540", yearsInBusiness: 27, ecovadis: "Gold · 70/100" } }),

  sup({ legalName: "Delta Chemicals Inc", country: "United States", category: "Chemicals",
    address: { line1: "500 Industrial Pkwy", city: "Baton Rouge", region: "LA", postal: "70802" },
    taxId: "72-3390881", routing: "026009593", accountName: "Delta Chemicals Inc",
    owners: [{ name: "James Fontaine", pct: 100 }],
    contactEmail: "ap@deltachem.com", source: "Workday: Supplier creation", submittedAt: "10 days ago", nextRevalidation: "in 64 days",
    enrich: { duns: "72-330-9081", creditRating: "A", revenueBand: "$100M–$250M", employees: "410", yearsInBusiness: 19, ecovadis: "Silver · 59/100" } }),
];

/* ----------------------------- engine ----------------------------- */

function evaluate(s, all, idx, cfg, adj, overrides) {
  const findings = [];
  const push = (cat, label, severity, evidence) => findings.push({ cat, label, severity, evidence });

  // Identity & jurisdiction
  const addr = s.address || {};
  const addrComplete = addr.line1 && addr.city && addr.postal && s.country;
  const restricted = cfg.rejectOnEmbargo && EMBARGO.includes(s.country);
  if (!s.legalName) push("identity", "Legal name", "sendback", "No legal name provided.");
  if (restricted) push("identity", "Jurisdiction", "fail", `${s.country} is on the restricted-jurisdiction list. Onboarding is blocked.`);
  if (!addrComplete && !restricted) push("identity", "Registered address", "sendback", "Registered address is incomplete. Sent back to the supplier.");
  if (s.legalName && addrComplete && !restricted) push("identity", "Identity & address", "pass", `Legal name and registered address in ${s.country} are complete.`);

  // Tax ID
  const tax = taxCheck(s.country, s.taxId);
  if (tax.status === "missing") push("tax", "Tax ID", "sendback", "No tax ID provided.");
  else if (tax.status === "invalid") push("tax", "Tax ID", "sendback", `${tax.label} “${s.taxId}” has an unexpected format. Sent back for correction.`);
  else push("tax", "Tax ID", "pass", `${tax.label} ${s.taxId} matches the expected format.`);

  // Bank & routing
  const bankSignals = [];
  const bankMethod = s.iban ? "IBAN" : s.routing ? "ABA routing" : null;
  let bankValid = null, matchScore = null, accountMatch = null;
  if (!s.iban && !s.routing) {
    push("bank", "Bank account", "sendback", "No bank details provided. Required before any payment.");
  } else {
    bankValid = cfg.verifyBank ? (s.iban ? validIBAN(s.iban) : validABA(s.routing)) : true;
    if (cfg.verifyBank && !bankValid) {
      push("bank", "Bank account", "flag", s.iban
        ? `IBAN ${maskBank(s.iban)} failed the mod-97 checksum.`
        : `Routing number ${s.routing} failed the ABA checksum.`);
      bankSignals.push("Invalid bank identifier");
    }
    if (cfg.requireNameMatch && s.accountName) {
      matchScore = nameSim(s.accountName, s.legalName);
      accountMatch = matchScore >= cfg.nameThreshold;
      if (!accountMatch) {
        push("bank", "Account holder name", "flag",
          `Account holder “${s.accountName}” is ${(matchScore * 100).toFixed(0)}% similar to the legal name — below the ${(cfg.nameThreshold * 100).toFixed(0)}% match threshold.`);
        bankSignals.push("Account-name mismatch");
      }
    }
    if (bankValid && accountMatch !== false) {
      push("bank", "Bank verification", "pass",
        `${bankMethod} verified${matchScore != null ? ` and account holder matches (${(matchScore * 100).toFixed(0)}%)` : ""}.`);
    }
  }

  // Sanctions & watchlist screening (entity + beneficial owners)
  const activeLists = cfg.lists;
  const buildMatches = (nameToCheck, kind, ownerName) =>
    WATCHLIST
      .map((w) => ({ w, score: nameSim(nameToCheck, w.name) }))
      .filter((x) => x.w.lists.some((l) => activeLists.includes(l)))
      .filter((x) => x.score >= cfg.screenThreshold)
      .map((x) => {
        const mid = `${s.id}::${x.w.name}::${ownerName || "entity"}`;
        const strong = x.score >= 0.9;
        const state = adj[mid] || (strong ? "confirmed" : "open");
        return {
          mid, kind, ownerName: ownerName || null, name: x.w.name, type: x.w.type,
          lists: x.w.lists.filter((l) => activeLists.includes(l)), country: x.w.country,
          note: x.w.note, score: x.score, state,
        };
      });
  let screening = buildMatches(s.legalName, "entity", null);
  (s.owners || []).forEach((o) => { screening = screening.concat(buildMatches(o.name, "owner", o.name)); });
  const confirmed = screening.filter((m) => m.state === "confirmed");
  const openHits = screening.filter((m) => m.state === "open");
  const dismissed = screening.filter((m) => m.state === "dismissed");
  const sevForConfirmed = cfg.rejectOnSanctions ? "fail" : "flag";
  confirmed.forEach((m) => push("sanctions", m.kind === "owner" ? "Ownership screening" : "Watchlist screening", sevForConfirmed,
    `${m.kind === "owner" ? `Beneficial owner ${m.ownerName}` : s.legalName} matches ${m.name} on ${m.lists.join(", ")} (${(m.score * 100).toFixed(0)}%).`));
  openHits.forEach((m) => push("sanctions", m.kind === "owner" ? "Ownership screening" : "Watchlist screening", "flag",
    `Possible match: ${m.kind === "owner" ? `owner ${m.ownerName}` : s.legalName} vs ${m.name} on ${m.lists.join(", ")} (${(m.score * 100).toFixed(0)}%). Needs review.`));
  if (!confirmed.length && !openHits.length)
    push("sanctions", "Watchlist screening", "pass", `No matches across ${activeLists.length} enabled list${activeLists.length > 1 ? "s" : ""}.`);

  // Duplicate (first occurrence by tax ID stays clean; later ones flag)
  const key = normId(s.taxId);
  const dupIdx = key ? all.findIndex((x) => normId(x.taxId) === key) : -1;
  if (key && dupIdx > -1 && dupIdx < idx)
    push("duplicate", "Duplicate check", "flag", `Shares a tax ID with an existing supplier (${all[dupIdx].legalName}).`);
  else
    push("duplicate", "Duplicate check", "pass", "No existing supplier shares these identifiers.");

  // Outcome precedence
  const has = (sev) => findings.some((f) => f.severity === sev);
  let outcome = "validated";
  if (has("fail")) outcome = "rejected";
  else if (has("sendback")) outcome = "sent_back";
  else if (has("flag")) outcome = "flagged";

  // Risk score
  let risk = 8;
  findings.forEach((f) => {
    if (f.severity === "fail") risk += f.cat === "sanctions" ? 58 : 52;
    else if (f.severity === "flag") risk += f.cat === "sanctions" ? 30 : 20;
    else if (f.severity === "sendback") risk += 16;
  });
  const e = s.enrich || {};
  if (/^(C|D)/.test(e.creditRating || "")) risk += 12;
  else if (/^(B|BB)$/.test(e.creditRating || "")) risk += 5;
  if ((typeof e.yearsInBusiness === "number" ? e.yearsInBusiness : 99) < 2) risk += 6;
  if (/plat|gold/i.test(e.ecovadis || "")) risk -= 4;
  risk = clamp(Math.round(risk), 2, 99);
  const band = risk < 25 ? "low" : risk < 55 ? "medium" : "high";

  // Manual overrides
  const ov = overrides[s.id];
  let finalOutcome = outcome, note = null, overridden = false;
  if (ov) {
    overridden = true; note = ov.note;
    finalOutcome = ov.decision === "approved" ? "validated" : ov.decision === "sentback" ? "sent_back" : "rejected";
  }

  return {
    ...s, findings,
    bank: { method: bankMethod, valid: bankValid, accountMatch, matchScore, signals: bankSignals },
    screening, confirmed, openHits, dismissed, enrich: e,
    risk, band, outcome, finalOutcome, note, overridden,
  };
}

function worstSeverity(findings, cat) {
  const rank = { fail: 3, flag: 2, sendback: 1, pass: 0 };
  let worst = "pass";
  findings.filter((f) => f.cat === cat).forEach((f) => { if (rank[f.severity] > rank[worst]) worst = f.severity; });
  return worst;
}

/* --------------------------- Claude calls --------------------------- */

async function callClaude(system, userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error("api " + res.status);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

async function askAssistant(q, rows, cfg) {
  const ctx = rows.map((r) => ({
    name: r.legalName, country: r.country, category: r.category,
    status: r.finalOutcome, risk: r.risk, riskBand: r.band,
    findings: r.findings.filter((f) => f.severity !== "pass").map((f) => `${f.label}: ${f.evidence}`),
    watchlist: [...r.confirmed, ...r.openHits].map((m) => `${m.name} (${m.lists.join("/")}, ${(m.score * 100).toFixed(0)}%, ${m.state})`),
    bankVerified: r.bank.valid, nextRevalidation: r.nextRevalidation,
  }));
  const system =
    "You are the Attavo Procurement Assistant, embedded in a supplier data validation platform that validates supplier identity, tax, and banking data and screens suppliers against sanctions/watchlists. " +
    "Answer procurement and accounts-payable questions using ONLY the supplier dataset provided as JSON. Be concise and specific: name suppliers and cite their status, risk, findings, or watchlist matches. " +
    "Statuses mean: validated = cleared for payment; flagged = needs review; rejected = blocked; sent_back = returned to the supplier for corrections. " +
    "If the answer is not in the data, say so plainly. Never invent suppliers or results. Reply in short plain text, no markdown headings.";
  const userText = `Supplier dataset (JSON):\n${JSON.stringify(ctx)}\n\nEnabled watchlists: ${cfg.lists.join(", ")}.\n\nQuestion: ${q}`;
  return await callClaude(system, userText);
}

function offlineAnswer(q, rows) {
  const ql = q.toLowerCase();
  const hit = rows.find((r) => ql.includes(r.legalName.toLowerCase()) || ql.includes(r.legalName.toLowerCase().split(" ")[0]));
  const cnt = (k) => rows.filter((x) => x.finalOutcome === k).length;
  if (hit) {
    const issues = hit.findings.filter((f) => f.severity !== "pass").map((f) => f.evidence).join(" ");
    return `${hit.legalName} is currently ${STATUS[hit.finalOutcome].label.toLowerCase()} with a ${hit.band} risk score of ${hit.risk}. ${issues || "No open findings."}`;
  }
  if (/reject|block/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "rejected"); return r.length ? `Rejected suppliers: ${r.map((x) => x.legalName).join(", ")}.` : "No rejected suppliers."; }
  if (/flag|review/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "flagged"); return r.length ? `Flagged for review: ${r.map((x) => `${x.legalName} (${x.findings.find((f) => f.severity === "flag")?.label || "review"})`).join("; ")}.` : "Nothing is flagged."; }
  if (/sanction|watchlist|screen/.test(ql)) { const r = rows.filter((x) => x.openHits.length || x.confirmed.length); return r.length ? `Watchlist activity: ${r.map((x) => { const m = x.confirmed[0] || x.openHits[0]; return `${x.legalName} — ${m.name} on ${m.lists.join(", ")} (${m.state})`; }).join("; ")}.` : "No watchlist hits."; }
  if (/re-?valid|due/.test(ql)) { const r = rows.filter((x) => /in \d+ days|overdue/i.test(x.nextRevalidation)); return r.length ? `Upcoming re-validations: ${r.map((x) => `${x.legalName} (${x.nextRevalidation})`).join("; ")}.` : "Nothing is scheduled for re-validation."; }
  if (/clear|pay|validated|onboard/.test(ql)) { const r = rows.filter((x) => x.finalOutcome === "validated"); return `Cleared for payment: ${r.map((x) => x.legalName).join(", ")}.`; }
  return `I could not reach the AI service, so here is a summary from your current data: ${rows.length} suppliers — ${cnt("validated")} validated, ${cnt("flagged")} flagged, ${cnt("rejected")} rejected, ${cnt("sent_back")} sent back. Ask about a specific supplier for detail.`;
}

async function aiAdjudicate(item, s) {
  const system =
    "You are a sanctions-screening analyst assistant. Given a supplier and a potential watchlist match, judge whether they are likely the same party using name similarity, country, and any distinguishing details. " +
    "This is demonstration data with fictional entities. Respond ONLY as compact JSON: {\"recommendation\":\"dismiss\"|\"confirm\"|\"investigate\",\"confidence\":0-100,\"rationale\":\"one short sentence\"}. No other text.";
  const payload = {
    supplier: { name: s.legalName, country: s.country, address: s.address, owners: s.owners },
    potentialMatch: { name: item.name, type: item.type, lists: item.lists, country: item.country, note: item.note },
    subject: item.kind === "owner" ? `beneficial owner ${item.ownerName}` : "the supplier entity",
    nameMatchScore: Math.round(item.score * 100),
  };
  const txt = await callClaude(system, JSON.stringify(payload));
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}
function offlineAdjudicate(item) {
  const s = item.score;
  return {
    recommendation: s >= 0.9 ? "confirm" : s >= 0.75 ? "investigate" : "dismiss",
    confidence: Math.round(s * 100),
    rationale: `Name-match score ${(s * 100).toFixed(0)}% (offline heuristic).`,
  };
}

/* ------------------------------- styles ------------------------------- */

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

function RiskMeter({ value }) {
  const band = value < 25 ? "Low" : value < 55 ? "Medium" : "High";
  const col = value < 25 ? T.brand : value < 55 ? T.amber : T.rose;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div className="pl-meter"><div className="pl-meter-thumb" style={{ left: `calc(${clamp(value, 2, 98)}% - 6px)` }} /></div>
      <span className="pl-num" style={{ fontSize: 12, fontWeight: 600, color: col, minWidth: 74, textAlign: "right" }}>{value} {band}</span>
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
  return (
    <select className="pl-select" value={value} onChange={onChange}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
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
  flag: { color: T.amber, bg: T.amberBg, icon: AlertTriangle },
  fail: { color: T.rose, bg: T.roseBg, icon: XCircle },
  sendback: { color: T.info, bg: T.infoBg, icon: Send },
  running: { color: T.slate, bg: T.slateBg, icon: Loader2 },
  queued: { color: T.ink3, bg: T.slateBg, icon: Clock },
};

/* ------------------------------- Dashboard ------------------------------- */

function Dashboard({ rows, screeningItems, go, openSupplier, autoTrigger }) {
  const total = rows.length;
  const cnt = (k) => rows.filter((r) => r.finalOutcome === k).length;
  const validated = cnt("validated"), flagged = cnt("flagged"), rejected = cnt("rejected"), sentBack = cnt("sent_back");
  const cleanRate = total ? Math.round((validated / total) * 100) : 0;
  const riskDist = [
    { name: "Low", count: rows.filter((r) => r.band === "low").length, color: T.brand },
    { name: "Medium", count: rows.filter((r) => r.band === "medium").length, color: T.amber },
    { name: "High", count: rows.filter((r) => r.band === "high").length, color: T.rose },
  ];
  const openScreening = screeningItems.filter((m) => m.state === "open");
  const reval = rows.filter((r) => /in \d+ days/i.test(r.nextRevalidation))
    .sort((a, b) => parseInt(a.nextRevalidation.match(/\d+/)) - parseInt(b.nextRevalidation.match(/\d+/))).slice(0, 4);
  const recent = rows.slice(0, 5);

  const tiles = [
    { n: total, l: "Suppliers", ic: Building2, c: T.slate },
    { n: validated, l: "Validated", ic: CheckCircle2, c: T.brand },
    { n: flagged, l: "Flagged", ic: AlertTriangle, c: T.amber },
    { n: rejected, l: "Rejected", ic: XCircle, c: T.rose },
    { n: sentBack, l: "Sent back", ic: Send, c: T.info },
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
            <div className="pl-card-head"><ShieldCheck size={16} color={T.brand} /> Validation throughput
              <span className="sub">{autoTrigger ? "Auto-trigger on" : "Manual mode"}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <Gauge value={cleanRate} color={T.brand} sub="clean rate" label={`${cleanRate}%`} />
              <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: T.ink3 }}>Median validation time</span>
                  <span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600 }}>2.4 min</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: T.ink3 }}>Checks run in parallel</span>
                  <span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600 }}>5 per supplier</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: T.ink3 }}>Open watchlist reviews</span>
                  <span className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: openScreening.length ? T.amber : T.ink }}>{openScreening.length}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, overflow: "hidden", display: "flex", background: T.slateBg }}>
                  {[["validated", validated, T.brand], ["flagged", flagged, T.amber], ["rejected", rejected, T.rose], ["sent_back", sentBack, T.info]].map(([k, v, c]) =>
                    v ? <div key={k} style={{ width: `${(v / total) * 100}%`, background: c }} title={`${STATUS[k].label}: ${v}`} /> : null)}
                </div>
              </div>
            </div>
          </div>

          <div className="pl-card">
            <div className="pl-card-head"><Zap size={16} color={T.amber} /> Risk distribution</div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDist} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={64} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: T.ink3 }} />
                  <Tooltip cursor={{ fill: T.slateBg }} contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={22}>
                    {riskDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="pl-card">
            <div className="pl-card-head"><ShieldAlert size={16} color={T.rose} /> Watchlist reviews
              <span className="sub" style={{ cursor: "pointer", color: T.brand }} onClick={() => go("screening")}>Open</span></div>
            {openScreening.length === 0 ? <div className="pl-empty">No open reviews.</div> : (
              <div style={{ display: "grid", gap: 10 }}>
                {openScreening.slice(0, 3).map((m) => (
                  <div key={m.mid} className="pl-rowlink" style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, margin: -8, borderRadius: 9 }} onClick={() => openSupplier(m.supplierId)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.supplierName}</div>
                      <div style={{ fontSize: 11.5, color: T.ink3 }}>vs {m.name} · {m.lists.join(", ")}</div>
                    </div>
                    <span className="pl-num" style={{ fontSize: 12, fontWeight: 600, color: T.amber }}>{Math.round(m.score * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-card">
            <div className="pl-card-head"><RefreshCw size={16} color={T.info} /> Upcoming re-validations</div>
            {reval.length === 0 ? <div className="pl-empty">Nothing scheduled.</div> : (
              <div style={{ display: "grid", gap: 9 }}>
                {reval.map((r) => (
                  <div key={r.id} className="pl-rowlink" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, margin: -8, borderRadius: 9 }} onClick={() => openSupplier(r.id)}>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.legalName}</span>
                    <span style={{ fontSize: 12, color: T.ink3, whiteSpace: "nowrap" }}>{r.nextRevalidation}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-card">
            <div className="pl-card-head"><Clock size={16} color={T.slate} /> Recent activity</div>
            <div style={{ display: "grid", gap: 9 }}>
              {recent.map((r) => (
                <div key={r.id} className="pl-rowlink" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 8, margin: -8, borderRadius: 9 }} onClick={() => openSupplier(r.id)}>
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.legalName}</span>
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

/* ------------------------------- Onboard ------------------------------- */

const CHECK_ROWS = [
  { cat: "identity", label: "Identity & address" },
  { cat: "tax", label: "Tax ID & registration" },
  { cat: "bank", label: "Bank account & routing" },
  { cat: "sanctions", label: "Sanctions & watchlist" },
  { cat: "duplicate", label: "Duplicate & vendor master" },
];

const BLANK_FORM = {
  legalName: "", dba: "", country: "United States", category: "Manufacturing",
  line1: "", city: "", region: "", postal: "",
  taxId: "", bankType: "US routing (ABA)", routing: "", iban: "", accountName: "",
  ownerName: "", contactEmail: "", sourceEvent: "Manual entry",
};

function Onboard({ cfg, adj, suppliers, onAdd, openSupplier }) {
  const [f, setF] = useState(BLANK_FORM);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [checkState, setCheckState] = useState({});
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target ? e.target.value : e }));
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const loadClean = () => setF({
    legalName: "Willow Creek Supply Inc", dba: "", country: "United States", category: "Manufacturing",
    line1: "24 Cedar Mill Rd", city: "Portland", region: "OR", postal: "97201",
    taxId: "84-2210947", bankType: "US routing (ABA)", routing: "021000021", iban: "",
    accountName: "Willow Creek Supply Inc", ownerName: "Dana Whitmore", contactEmail: "ap@willowcreeksupply.com",
    sourceEvent: "Workday: Supplier creation",
  });
  const loadRisky = () => setF({
    legalName: "Volkov Metals Trading LLC", dba: "", country: "United States", category: "Raw materials",
    line1: "1400 Harbor Blvd", city: "Newark", region: "NJ", postal: "07114",
    taxId: "88-4410021", bankType: "US routing (ABA)", routing: "026009593", iban: "",
    accountName: "VMT Global Payments", ownerName: "Ivan Sokolov", contactEmail: "ap@volkovmetals.us",
    sourceEvent: "Supplier portal",
  });

  const draftFrom = () => ({
    id: "DRAFT", legalName: f.legalName.trim(), dba: f.dba, country: f.country, category: f.category,
    address: { line1: f.line1, city: f.city, region: f.region, postal: f.postal },
    taxId: f.taxId.trim(),
    routing: f.bankType === "US routing (ABA)" ? f.routing.trim() : "",
    iban: f.bankType === "US routing (ABA)" ? "" : f.iban.trim(),
    accountName: f.accountName.trim() || f.legalName.trim(),
    owners: f.ownerName.trim() ? [{ name: f.ownerName.trim(), pct: 100 }] : [],
    contactEmail: f.contactEmail, source: f.sourceEvent, submittedAt: "just now", nextRevalidation: `in ${cfg.revalDays} days`,
    enrich: {},
  });

  const run = () => {
    clearTimers();
    const draft = draftFrom();
    const res = evaluate(draft, [...suppliers, draft], suppliers.length, cfg, adj, {});
    setResult(res);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const done = {}; CHECK_ROWS.forEach((c) => (done[c.cat] = "done"));
      setCheckState(done); setPhase("done"); return;
    }
    setPhase("running");
    const init = {}; CHECK_ROWS.forEach((c) => (init[c.cat] = "queued")); setCheckState(init);
    CHECK_ROWS.forEach((c, i) => {
      timers.current.push(setTimeout(() => setCheckState((s) => ({ ...s, [c.cat]: "running" })), 180 + i * 360));
      timers.current.push(setTimeout(() => setCheckState((s) => ({ ...s, [c.cat]: "done" })), 180 + i * 360 + 300));
    });
    timers.current.push(setTimeout(() => setPhase("done"), 180 + CHECK_ROWS.length * 360 + 120));
  };

  const reset = () => { clearTimers(); setF(BLANK_FORM); setPhase("idle"); setResult(null); setCheckState({}); };
  const commit = () => {
    const d = draftFrom();
    const id = onAdd({ ...d, id: undefined, enrich: { duns: "—", creditRating: "—", revenueBand: "—", employees: "—", yearsInBusiness: "—", ecovadis: "—" } });
    openSupplier(id);
  };

  const canRun = f.legalName.trim().length > 1 && phase !== "running";
  const isUS = f.bankType === "US routing (ABA)";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pl-onb-grid">
      <div className="pl-card">
        <div className="pl-card-head"><UserPlus size={16} color={T.brand} /> Supplier registration
          <span className="sub" style={{ display: "flex", gap: 6 }}>
            <button className="pl-btn subtle" style={{ padding: "4px 9px", fontSize: 12 }} onClick={loadClean}>Clean example</button>
            <button className="pl-btn subtle" style={{ padding: "4px 9px", fontSize: 12 }} onClick={loadRisky}>Risky example</button>
          </span>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Legal business name"><TextInput value={f.legalName} onChange={set("legalName")} placeholder="e.g. Willow Creek Supply Inc" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Country"><SelectInput value={f.country} onChange={set("country")} options={COUNTRIES} /></Field>
            <Field label="Category"><SelectInput value={f.category} onChange={set("category")} options={["Manufacturing", "Distribution", "Logistics", "Facilities", "Raw materials", "Chemicals", "Retail goods", "Office supplies", "Services", "Import / export"]} /></Field>
          </div>
          <Field label="Registered address"><TextInput value={f.line1} onChange={set("line1")} placeholder="Street address" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr", gap: 10 }}>
            <TextInput value={f.city} onChange={set("city")} placeholder="City" />
            <TextInput value={f.region} onChange={set("region")} placeholder="State" />
            <TextInput value={f.postal} onChange={set("postal")} placeholder="Postal" />
          </div>
          <Field label="Tax ID" hint={isUS ? "US EIN format: 12-3456789" : ""}><TextInput value={f.taxId} onChange={set("taxId")} placeholder={f.country === "United States" ? "12-3456789" : "Tax / VAT number"} /></Field>
          <Field label="Bank account type"><SelectInput value={f.bankType} onChange={set("bankType")} options={["US routing (ABA)", "International (IBAN)"]} /></Field>
          {isUS
            ? <Field label="ABA routing number" hint="Validated with the ABA checksum"><TextInput value={f.routing} onChange={set("routing")} placeholder="9 digits" /></Field>
            : <Field label="IBAN" hint="Validated with the mod-97 checksum"><TextInput value={f.iban} onChange={set("iban")} placeholder="e.g. DE89 3704 0044 0532 0130 00" /></Field>}
          <Field label="Account holder name" hint="Compared against the legal name"><TextInput value={f.accountName} onChange={set("accountName")} placeholder="Name on the bank account" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Beneficial owner"><TextInput value={f.ownerName} onChange={set("ownerName")} placeholder="Primary owner" /></Field>
            <Field label="Triggered by"><SelectInput value={f.sourceEvent} onChange={set("sourceEvent")} options={["Manual entry", "Workday: Supplier creation", "Workday HCM: Worker creation"]} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Btn onClick={run} disabled={!canRun} icon={phase === "running" ? Loader2 : ScanSearch}>{phase === "running" ? "Validating…" : "Run validation"}</Btn>
            {phase !== "idle" && <Btn kind="ghost" onClick={reset} icon={RefreshCw}>Start over</Btn>}
          </div>
        </div>
      </div>

      <div className="pl-card" style={{ position: "sticky", top: 84 }}>
        <div className="pl-card-head"><ShieldCheck size={16} color={T.brand} /> Real-time verification
          {f.sourceEvent !== "Manual entry" && <span className="sub"><Chip icon={Plug} color={T.info} bg={T.infoBg}>{f.sourceEvent}</Chip></span>}
        </div>
        {phase === "idle" ? (
          <div className="pl-empty" style={{ padding: "40px 16px" }}>
            <ScanSearch size={26} color={T.ink3} style={{ marginBottom: 8 }} />
            <div>Enter a supplier and run validation.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Identity, tax, banking, sanctions and duplicate checks run in parallel against live sources.</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 4 }}>
              {CHECK_ROWS.map((c) => {
                const st = checkState[c.cat] || "queued";
                const sev = st === "done" ? worstSeverity(result.findings, c.cat) : st;
                const meta = sevMeta[sev] || sevMeta.queued;
                const Icon = meta.icon;
                const finding = st === "done" ? result.findings.filter((x) => x.cat === c.cat).sort((a, b) => ({ fail: 3, flag: 2, sendback: 1, pass: 0 }[b.severity] - { fail: 3, flag: 2, sendback: 1, pass: 0 }[a.severity]))[0] : null;
                return (
                  <div className="pl-check" key={c.cat}>
                    <div className="pl-check-ico" style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={15} className={sev === "running" ? "pl-spin" : ""} />
                    </div>
                    <div className="pl-check-body">
                      <div className="pl-check-t">{c.label}</div>
                      <div className="pl-check-e">{st === "queued" ? "Queued" : st === "running" ? "Checking…" : finding ? finding.evidence : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {phase === "done" && result && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <Gauge value={result.risk} color={result.band === "low" ? T.brand : result.band === "medium" ? T.amber : T.rose} size={90} sub="risk" />
                  <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 8 }}>
                    <StatusPill status={result.finalOutcome} size="lg" />
                    <div style={{ fontSize: 12.5, color: T.ink3 }}>
                      {result.finalOutcome === "validated" && "Clean data. Cleared to onboard and pay."}
                      {result.finalOutcome === "flagged" && "Onboarding held pending review of the findings above."}
                      {result.finalOutcome === "rejected" && "Blocked. Do not onboard or pay this supplier."}
                      {result.finalOutcome === "sent_back" && "Returned to the supplier to correct missing or invalid data."}
                    </div>
                    <RiskMeter value={result.risk} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn onClick={commit} icon={Check}>Add to suppliers</Btn>
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

/* ------------------------------- Suppliers ------------------------------- */

function bankIcon(r) {
  if (r.bank.method == null) return { I: Ban, c: T.ink3, t: "No bank" };
  if (r.bank.valid === false) return { I: XCircle, c: T.rose, t: "Invalid" };
  if (r.bank.accountMatch === false) return { I: AlertTriangle, c: T.amber, t: "Name mismatch" };
  return { I: ShieldCheck, c: T.brand, t: "Verified" };
}

function Suppliers({ rows, openSupplier }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.finalOutcome !== filter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.legalName.toLowerCase().includes(s) || r.country.toLowerCase().includes(s) || (r.category || "").toLowerCase().includes(s);
  });
  const filters = [["all", "All"], ["validated", "Validated"], ["flagged", "Flagged"], ["rejected", "Rejected"], ["sent_back", "Sent back"]];

  return (
    <div className="pl-card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={15} color={T.ink3} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input className="pl-input" style={{ paddingLeft: 33 }} placeholder="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="pl-seg">
          {filters.map(([k, l]) => <button key={k} className={`pl-seg-btn ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="pl-table">
          <thead><tr>
            <th style={{ paddingLeft: 16 }}>Supplier</th><th>Status</th><th style={{ minWidth: 170 }}>Risk</th><th>Bank</th><th>Sanctions</th><th>Last validated</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const bi = bankIcon(r);
              const sanc = r.confirmed.length ? { I: XCircle, c: T.rose } : r.openHits.length ? { I: AlertTriangle, c: T.amber } : { I: ShieldCheck, c: T.brand };
              return (
                <tr key={r.id} className="pl-rowlink" onClick={() => openSupplier(r.id)}>
                  <td style={{ paddingLeft: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.legalName}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3 }}>{r.country} · {r.category}</div>
                  </td>
                  <td><StatusPill status={r.finalOutcome} /></td>
                  <td><RiskMeter value={r.risk} /></td>
                  <td><span title={bi.t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: bi.c }}><bi.I size={15} /> {bi.t}</span></td>
                  <td><sanc.I size={16} color={sanc.c} /></td>
                  <td style={{ fontSize: 12.5, color: T.ink3, whiteSpace: "nowrap" }}>{r.submittedAt}</td>
                  <td style={{ paddingRight: 12 }}><ChevronRight size={16} color={T.ink3} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="pl-empty">No suppliers match.</div>}
      </div>
    </div>
  );
}

/* --------------------------- screening item --------------------------- */

const listColor = (l) => (["OFAC SDN", "FTO", "FBI"].includes(l) ? { c: T.rose, b: T.roseBg } : { c: T.amber, b: T.amberBg });

function ScreeningItem({ item, supplier, adj, setAdj }) {
  const [verdict, setVerdict] = useState(null);
  const [loading, setLoading] = useState(false);
  const state = adj[item.mid] || item.state;
  const stateMeta = state === "confirmed" ? { c: T.rose, b: T.roseBg, l: "Confirmed match" }
    : state === "dismissed" ? { c: T.slate, b: T.slateBg, l: "Dismissed" }
    : { c: T.amber, b: T.amberBg, l: "Open review" };

  const runAI = async () => {
    setLoading(true); setVerdict(null);
    try { setVerdict(await aiAdjudicate(item, supplier)); }
    catch { setVerdict({ ...offlineAdjudicate(item), offline: true }); }
    setLoading(false);
  };
  const decide = (s) => setAdj((a) => ({ ...a, [item.mid]: s }));

  const recColor = (r) => (r === "confirm" ? T.rose : r === "dismiss" ? T.brand : T.amber);

  return (
    <div className="pl-scard">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{supplier.legalName}</span>
            <Chip color={T.ink3} bg={T.slateBg} icon={item.kind === "owner" ? Users : Building}>{item.kind === "owner" ? `owner: ${item.ownerName}` : "entity"}</Chip>
          </div>
          <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>
            Possible match to <b>{item.name}</b> ({item.type}, {item.country})
          </div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{item.note}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {item.lists.map((l) => { const c = listColor(l); return <Chip key={l} color={c.c} bg={c.b} icon={ShieldAlert}>{l}</Chip>; })}
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "none", width: 120 }}>
          <span className="pl-pill" style={{ color: stateMeta.c, background: stateMeta.b, fontSize: 11.5, padding: "3px 9px" }}>{stateMeta.l}</span>
          <div style={{ marginTop: 10 }}>
            <div className="pl-num" style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 20, color: item.score >= 0.9 ? T.rose : T.amber }}>{Math.round(item.score * 100)}%</div>
            <div style={{ fontSize: 11, color: T.ink3 }}>name match</div>
          </div>
        </div>
      </div>

      {verdict && (
        <div style={{ marginTop: 12, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Sparkles size={15} color={T.brandDk} style={{ marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: recColor(verdict.recommendation), textTransform: "capitalize" }}>
              Assistant: {verdict.recommendation} · {verdict.confidence}% confidence
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{verdict.rationale}{verdict.offline ? " (offline)" : ""}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Btn size="sm" kind="subtle" icon={loading ? Loader2 : Wand2} onClick={runAI} disabled={loading}>{loading ? "Assessing…" : "AI adjudicate"}</Btn>
        <div style={{ flex: 1 }} />
        {state !== "dismissed" && <Btn size="sm" kind="ghost" icon={Check} onClick={() => decide("dismissed")}>False positive</Btn>}
        {state !== "confirmed" && <Btn size="sm" kind="danger" icon={Ban} onClick={() => decide("confirmed")}>Confirm match</Btn>}
        {state !== "open" && <Btn size="sm" kind="ghost" onClick={() => decide("open")}>Reopen</Btn>}
      </div>
    </div>
  );
}

/* ------------------------------- Screening ------------------------------- */

function Screening({ screeningItems, adj, setAdj }) {
  const [tab, setTab] = useState("open");
  const withState = screeningItems.map((m) => ({ ...m, resolved: adj[m.mid] || m.state }));
  const open = withState.filter((m) => m.resolved === "open");
  const confirmed = withState.filter((m) => m.resolved === "confirmed");
  const dismissed = withState.filter((m) => m.resolved === "dismissed");
  const shown = tab === "open" ? open : tab === "confirmed" ? confirmed : dismissed;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pl-note">
        <Info size={15} style={{ flex: "none", marginTop: 1 }} color={T.info} />
        <span>Screening runs each supplier and its beneficial owners against enabled watchlists. This demo uses a small set of fictional entities, not live sanctions data — real deployments query OFAC, the Denied Persons List, and other sources continuously.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[["Open reviews", open.length, T.amber], ["Confirmed matches", confirmed.length, T.rose], ["Dismissed", dismissed.length, T.slate]].map(([l, n, c]) => (
          <div className="pl-tile" key={l}>
            <div className="pl-tile-num" style={{ color: c }}>{n}</div>
            <div className="pl-tile-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div className="pl-seg">
        {[["open", `Open (${open.length})`], ["confirmed", `Confirmed (${confirmed.length})`], ["dismissed", `Dismissed (${dismissed.length})`]].map(([k, l]) =>
          <button key={k} className={`pl-seg-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {shown.length === 0 ? <div className="pl-card"><div className="pl-empty">Nothing here.</div></div> : (
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map((m) => <ScreeningItem key={m.mid} item={m} supplier={m.supplier} adj={adj} setAdj={setAdj} />)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Detail ------------------------------- */

function Detail({ row, onBack, overrides, setOverrides, adj, setAdj, cfg, goAssistant }) {
  const [tab, setTab] = useState("validation");
  if (!row) return null;
  const bandColor = row.band === "low" ? T.brand : row.band === "medium" ? T.amber : T.rose;
  const decide = (decision, note) => setOverrides((o) => ({ ...o, [row.id]: { decision, note } }));
  const clearDecision = () => setOverrides((o) => { const n = { ...o }; delete n[row.id]; return n; });

  const tabs = [
    ["validation", "Validation", ClipboardCheck],
    ["banking", "Banking & fraud", Banknote],
    ["screening", "Screening", ShieldAlert],
    ["enrichment", "Enrichment", Database],
    ["lifecycle", "Lifecycle", RefreshCw],
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button className="pl-btn ghost" style={{ width: "fit-content", padding: "6px 11px", fontSize: 12.5 }} onClick={onBack}><ChevronLeft size={15} /> All suppliers</button>

      <div className="pl-card">
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Gauge value={row.risk} color={bandColor} size={96} sub="risk score" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontFamily: "Space Grotesk", fontSize: 21, letterSpacing: "-.01em" }}>{row.legalName}</h2>
              <StatusPill status={row.finalOutcome} size="lg" />
            </div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>{row.country} · {row.category} · submitted {row.submittedAt}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Chip icon={Plug} color={T.ink2} bg={T.slateBg}>{row.source}</Chip>
              {row.contactEmail && <Chip icon={FileText} color={T.ink2} bg={T.slateBg}>{row.contactEmail}</Chip>}
            </div>
            {row.overridden && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: T.ink2, background: T.slateBg, borderRadius: 8, padding: "7px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                <Info size={14} /> Manual decision applied{row.note ? `: ${row.note}` : ""}. <button className="pl-btn ghost" style={{ padding: "2px 8px", fontSize: 11.5, marginLeft: "auto" }} onClick={clearDecision}>Undo</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Btn kind="approve" icon={Check} onClick={() => decide("approved", "Approved and onboarded")}>Approve & onboard</Btn>
          <Btn kind="ghost" icon={Send} onClick={() => decide("sentback", "Returned to supplier")}>Send back</Btn>
          <Btn kind="danger" icon={Ban} onClick={() => decide("rejected", "Rejected")}>Reject</Btn>
          <div style={{ flex: 1 }} />
          <Btn kind="ghost" icon={MessageSquare} onClick={() => goAssistant(`Summarize the validation status, risk, and any findings for ${row.legalName}.`)}>Ask the assistant</Btn>
        </div>
      </div>

      <div className="pl-seg">
        {tabs.map(([k, l, I]) => <button key={k} className={`pl-seg-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}><I size={14} /> {l}</button>)}
      </div>

      {tab === "validation" && (
        <div className="pl-card">
          <div className="pl-card-head"><ClipboardCheck size={16} color={T.brand} /> Validation checks</div>
          <div>
            {row.findings.map((fd, i) => {
              const meta = sevMeta[fd.severity] || sevMeta.pass; const Icon = meta.icon;
              return (
                <div className="pl-check" key={i}>
                  <div className="pl-check-ico" style={{ background: meta.bg, color: meta.color }}><Icon size={15} /></div>
                  <div className="pl-check-body">
                    <div className="pl-check-t">{fd.label}</div>
                    <div className="pl-check-e">{fd.evidence}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "banking" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="pl-two">
          <div className="pl-card">
            <div className="pl-card-head"><Banknote size={16} color={T.brand} /> Bank verification</div>
            <div style={{ display: "grid", gap: 12 }}>
              <Kv icon={CreditCard} k="Method" v={row.bank.method || "None on file"} />
              <Kv icon={Landmark} k={row.iban ? "IBAN" : "Routing"} v={maskBank(row.iban || row.routing)} />
              <Kv icon={row.bank.valid === false ? XCircle : ShieldCheck} k="Checksum" v={row.bank.valid == null ? "—" : row.bank.valid ? "Passed" : "Failed"} tone={row.bank.valid === false ? T.rose : row.bank.valid ? T.brand : T.ink} />
              <Kv icon={CircleUser} k="Account holder" v={row.accountName || "—"} />
              {row.bank.matchScore != null && <Kv icon={Fingerprint} k="Name match" v={`${Math.round(row.bank.matchScore * 100)}%`} tone={row.bank.accountMatch ? T.brand : T.amber} />}
            </div>
          </div>
          <div className="pl-card">
            <div className="pl-card-head"><ShieldAlert size={16} color={row.bank.signals.length ? T.amber : T.brand} /> Fraud signals</div>
            {row.bank.signals.length === 0 ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.brand, fontSize: 13 }}><ShieldCheck size={16} /> No banking fraud signals detected.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {row.bank.signals.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.amber }}><AlertTriangle size={15} /> {s}</div>
                ))}
              </div>
            )}
            <div className="pl-divider" />
            <div style={{ fontSize: 12.5, color: T.ink3, display: "flex", gap: 8 }}>
              <RefreshCw size={14} style={{ flex: "none", marginTop: 1 }} /> Banking details are re-verified automatically before each payment run.
            </div>
          </div>
        </div>
      )}

      {tab === "screening" && (
        <div style={{ display: "grid", gap: 12 }}>
          {row.screening.length === 0 ? (
            <div className="pl-card"><div style={{ display: "flex", gap: 8, alignItems: "center", color: T.brand, fontSize: 13.5 }}><ShieldCheck size={16} /> No watchlist matches for this supplier or its beneficial owners across {cfg.lists.length} enabled lists.</div></div>
          ) : row.screening.map((m) => <ScreeningItem key={m.mid} item={m} supplier={row} adj={adj} setAdj={setAdj} />)}
        </div>
      )}

      {tab === "enrichment" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="pl-two">
          <div className="pl-card">
            <div className="pl-card-head"><Database size={16} color={T.brand} /> Enriched profile</div>
            <div style={{ display: "grid", gap: 12 }}>
              <Kv icon={Fingerprint} k="D-U-N-S number" v={cfg.enrichSources.dnb ? (row.enrich.duns || "—") : "Source disabled"} />
              <Kv icon={CreditCard} k="Credit rating" v={cfg.enrichSources.dnb ? (row.enrich.creditRating || "—") : "Source disabled"} />
              <Kv icon={Building} k="Revenue band" v={row.enrich.revenueBand || "—"} />
              <Kv icon={Users} k="Employees" v={row.enrich.employees || "—"} />
              <Kv icon={Clock} k="Years in business" v={row.enrich.yearsInBusiness ?? "—"} />
              <Kv icon={Globe} k="ESG rating" v={cfg.enrichSources.ecovadis ? (row.enrich.ecovadis || "—") : "Source disabled"} />
            </div>
          </div>
          <div className="pl-card">
            <div className="pl-card-head"><Plug size={16} color={T.info} /> Sources</div>
            <div style={{ display: "grid", gap: 10 }}>
              {[["dnb", "Dun & Bradstreet", "Firmographics, DUNS, credit"], ["bvd", "Bureau van Dijk", "Ownership & corporate structure"], ["ecovadis", "EcoVadis", "Sustainability & ESG scoring"]].map(([k, name, desc]) => (
                <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="pl-sdot" style={{ background: cfg.enrichSources[k] ? T.brand : "#CBD2DC" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3 }}>{desc}</div>
                  </div>
                  <span style={{ fontSize: 11.5, color: cfg.enrichSources[k] ? T.brand : T.ink3 }}>{cfg.enrichSources[k] ? "Connected" : "Off"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "lifecycle" && (
        <div className="pl-card">
          <div className="pl-card-head"><RefreshCw size={16} color={T.info} /> Validation lifecycle</div>
          <div className="pl-tl">
            {[
              { dot: T.slate, t: "Submitted", d: `${row.source} · ${row.submittedAt}` },
              { dot: STATUS[row.finalOutcome].color, t: `Validation run — ${STATUS[row.finalOutcome].label}`, d: `${row.findings.filter((f) => f.severity !== "pass").length} finding(s), risk score ${row.risk}` },
              row.finalOutcome === "validated"
                ? { dot: T.brand, t: "Cleared for payment", d: "Added to the approved vendor master." }
                : { dot: STATUS[row.finalOutcome].color, t: "Awaiting resolution", d: "Onboarding paused until findings are cleared." },
              { dot: T.info, t: "Continuous monitoring", d: row.nextRevalidation !== "—" ? `Next scheduled re-validation ${row.nextRevalidation}.` : "Re-validation resumes once onboarded." },
              { dot: "#CBD2DC", t: "Pre-payment re-check", d: "Banking and sanctions are re-verified before every payment run.", last: true },
            ].map((it, i, arr) => (
              <div className="pl-tl-item" key={i}>
                <div className="pl-tl-rail">
                  <span className="pl-tl-dot" style={{ background: it.dot, boxShadow: `0 0 0 3px ${it.dot}22` }} />
                  {i < arr.length - 1 && <span className="pl-tl-line" />}
                </div>
                <div style={{ paddingBottom: 2 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.t}</div>
                  <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 1 }}>{it.d}</div>
                </div>
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
  "Which suppliers are cleared for payment?",
  "Show flagged suppliers and why.",
  "Any sanctions matches I should review?",
  "Who is due for re-validation soon?",
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
      <div className="pl-card-head" style={{ marginBottom: 8 }}>
        <Sparkles size={16} color={T.brandDk} /> Procurement Assistant
        <span className="sub">Answers grounded in your current supplier data</span>
      </div>

      <div className="pl-msgs" ref={scroller}>
        {thread.messages.length === 0 && (
          <div style={{ margin: "auto 0", textAlign: "center", color: T.ink3 }}>
            <Avatar />
            <div style={{ marginTop: 10, fontSize: 14, color: T.ink2, maxWidth: 420, marginInline: "auto" }}>
              Ask about supplier status, risk, banking verification, or watchlist screening. I only use the data in this workspace.
            </div>
          </div>
        )}
        {thread.messages.map((m, i) => (
          <div key={i} className={`pl-msg ${m.role}`}>
            {m.role === "bot" && <Avatar />}
            <div className="pl-bubble">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="pl-msg bot">
            <Avatar />
            <div className="pl-bubble" style={{ color: T.ink3, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} className="pl-spin" /> Checking the data…</div>
          </div>
        )}
      </div>

      {thread.messages.length === 0 && (
        <div className="pl-suggest">
          {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <div className="pl-composer">
        <textarea className="pl-input" rows={1} style={{ resize: "none", minHeight: 42, paddingTop: 11 }} placeholder="Ask about a supplier…"
          value={thread.input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Btn onClick={() => send()} disabled={busy || !thread.input.trim()} icon={Send}>Send</Btn>
      </div>
    </div>
  );
}

/* ------------------------------- Integration ------------------------------- */

function SourceNode({ icon: I, title, sub, status, color }) {
  return (
    <div className="pl-node">
      <div className="pl-node-ttl"><I size={16} color={color || T.ink2} /> {title}</div>
      <div className="pl-node-sub">{sub}</div>
      {status && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span className="pl-sdot" style={{ background: T.brand }} />
          <span style={{ fontSize: 11.5, color: T.brand, fontWeight: 500 }}>{status}</span>
        </div>
      )}
    </div>
  );
}
function Edge({ label, icon: I }) {
  return (
    <div className="pl-edge">
      <span className="pl-edge-lbl">{I && <I size={13} />}{label}</span>
      <ArrowRight size={18} style={{ transform: "rotate(90deg)" }} color={T.ink3} />
    </div>
  );
}

function Integration({ cfg, autoTrigger, setAutoTrigger }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pl-arch">
        <div className="pl-layer">
          <div className="pl-layer-ttl"><Building2 size={15} color={T.brand} /> Workday ecosystem</div>
          <div className="pl-nodes">
            <SourceNode icon={Landmark} title="Financials / Strategic Sourcing" sub="Supplier records and bank-detail changes" status="Connected" color={T.brand} />
            <SourceNode icon={Users} title="HCM / Payroll" sub="Worker creation and payroll updates" status="Connected" color={T.brand} />
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12.5, color: T.ink2 }}>
            <Zap size={14} color={T.amber} /> Triggered event — supplier or worker creation
          </div>
        </div>

        <Edge label="Secure API trigger" icon={Plug} />

        <div className="pl-layer" style={{ borderColor: T.brand, boxShadow: `0 0 0 3px ${T.brandBg}` }}>
          <div className="pl-layer-ttl"><ShieldCheck size={15} color={T.brand} /> Attavo engine</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: T.ink2, display: "grid", gap: 6 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Low-lift execution layer — no schema changes</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Template-free extraction and validation</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color={T.brand} /> Checks run in parallel, results returned when complete</span>
              </div>
            </div>
            <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 11, padding: 13, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: T.ink3, marginBottom: 8 }}>Single toggle</div>
              <Toggle on={autoTrigger} onChange={setAutoTrigger} label="Automated validation trigger" sub={autoTrigger ? "New Workday events validate automatically" : "Validation is run manually"} />
            </div>
          </div>
        </div>

        <Edge label="Real-time verification" icon={ScanSearch} />

        <div className="pl-layer">
          <div className="pl-layer-ttl"><Database size={15} color={T.brand} /> External authoritative sources</div>
          <div className="pl-nodes">
            <SourceNode icon={Landmark} title="Live government & Tier-1 banking data" sub="Registries, tax authorities, bank routing / IBAN" status="Live" color={T.brand} />
            <div className="pl-node">
              <div className="pl-node-ttl"><ShieldAlert size={16} color={T.rose} /> Global watchlists</div>
              <div className="pl-node-sub">OFAC, sanctions, denied-persons and exclusion lists</div>
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                {LIST_ALL.map((l) => <Chip key={l} color={cfg.lists.includes(l) ? T.ink2 : T.ink3} bg={cfg.lists.includes(l) ? T.slateBg : "#F4F5F7"}>{l}</Chip>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pl-note">
        <Info size={15} style={{ flex: "none", marginTop: 1 }} color={T.info} />
        <span>This mirrors the reference architecture: a single secure API trigger connects source systems to the engine, which verifies data in real time against external authoritative sources. The watchlist data in this prototype is fictional demonstration data.</span>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><Zap size={16} color={T.amber} /> Recent trigger events</div>
        <div style={{ overflowX: "auto" }}>
          <table className="pl-table">
            <thead><tr><th>When</th><th>Source system</th><th>Event</th><th>Subject</th><th>Result</th></tr></thead>
            <tbody>
              {TRIGGER_EVENTS.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: T.ink3, whiteSpace: "nowrap" }}>{e.ts}</td>
                  <td>{e.system}</td>
                  <td style={{ color: T.ink2 }}>{e.event}</td>
                  <td>{e.subject}</td>
                  <td><StatusPill status={e.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Settings ------------------------------- */

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: T.ink2 }}>{label}</span>
        <span className="pl-num" style={{ fontSize: 13, fontWeight: 600, color: T.brandDk }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: T.brand }} />
    </div>
  );
}

function Settings({ cfg, setCfg }) {
  const up = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const toggleList = (l) => setCfg((c) => ({ ...c, lists: c.lists.includes(l) ? c.lists.filter((x) => x !== l) : [...c.lists, l] }));
  const upSrc = (k, v) => setCfg((c) => ({ ...c, enrichSources: { ...c.enrichSources, [k]: v } }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pl-two">
      <div className="pl-card">
        <div className="pl-card-head"><ShieldAlert size={16} color={T.rose} /> Watchlists screened</div>
        <div style={{ display: "grid", gap: 12 }}>
          {LIST_ALL.map((l) => <Toggle key={l} on={cfg.lists.includes(l)} onChange={() => toggleList(l)} label={l} />)}
          <div className="pl-divider" />
          <Slider label="Name-match threshold to surface a review" value={cfg.screenThreshold} min={0.5} max={0.95} step={0.01} onChange={(v) => up({ screenThreshold: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><Banknote size={16} color={T.brand} /> Banking verification</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle on={cfg.verifyBank} onChange={(v) => up({ verifyBank: v })} label="Verify routing / IBAN checksum" sub="Validate the bank identifier structure" />
          <Toggle on={cfg.requireNameMatch} onChange={(v) => up({ requireNameMatch: v })} label="Require account-name match" sub="Flag when the account holder differs from the legal name" />
          <Slider label="Account-name match threshold" value={cfg.nameThreshold} min={0.5} max={0.95} step={0.01} onChange={(v) => up({ nameThreshold: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><SettingsIcon size={16} color={T.slate} /> Decision policy</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle on={cfg.rejectOnSanctions} onChange={(v) => up({ rejectOnSanctions: v })} label="Reject on confirmed sanctions match" sub="Otherwise a confirmed match is flagged for review" />
          <Toggle on={cfg.rejectOnEmbargo} onChange={(v) => up({ rejectOnEmbargo: v })} label="Reject restricted jurisdictions" sub={`Blocks: ${EMBARGO.join(", ")}`} />
          <div>
            <div style={{ fontSize: 13, color: T.ink2, marginBottom: 6 }}>Re-validation cadence</div>
            <SelectInput value={`${cfg.revalDays} days`} onChange={(e) => up({ revalDays: parseInt(e.target.value) })} options={["30 days", "60 days", "90 days", "180 days"]} />
          </div>
        </div>
      </div>

      <div className="pl-card">
        <div className="pl-card-head"><Database size={16} color={T.info} /> Enrichment sources</div>
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle on={cfg.enrichSources.dnb} onChange={(v) => upSrc("dnb", v)} label="Dun & Bradstreet" sub="Firmographics, DUNS, credit rating" />
          <Toggle on={cfg.enrichSources.bvd} onChange={(v) => upSrc("bvd", v)} label="Bureau van Dijk" sub="Ownership and corporate structure" />
          <Toggle on={cfg.enrichSources.ecovadis} onChange={(v) => upSrc("ecovadis", v)} label="EcoVadis" sub="Sustainability and ESG scoring" />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

const DEFAULT_CFG = {
  lists: [...LIST_ALL],
  screenThreshold: 0.62,
  verifyBank: true,
  requireNameMatch: true,
  nameThreshold: 0.8,
  rejectOnSanctions: true,
  rejectOnEmbargo: true,
  revalDays: 90,
  enrichSources: { dnb: true, bvd: true, ecovadis: true },
};

export default function App() {
  const [suppliers, setSuppliers] = useState(SUPPLIERS);
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [adj, setAdj] = useState({});
  const [overrides, setOverrides] = useState({});
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState({ messages: [], input: "" });
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const rows = useMemo(
    () => suppliers.map((s, i) => evaluate(s, suppliers, i, cfg, adj, overrides)),
    [suppliers, cfg, adj, overrides]
  );
  const screeningItems = useMemo(
    () => rows.flatMap((r) => r.screening.map((m) => ({ ...m, supplierId: r.id, supplierName: r.legalName, supplier: r }))),
    [rows]
  );
  const openScreeningCount = screeningItems.filter((m) => (adj[m.mid] || m.state) === "open").length;

  const openSupplier = (id) => { setSelectedId(id); setView("detail"); setSideOpen(false); };
  const go = (v) => { setView(v); setSideOpen(false); };
  const goAssistant = (prefill) => { setThread((t) => ({ ...t, input: prefill })); setView("assistant"); setSideOpen(false); };
  const onAdd = (s) => { const withId = { ...s, id: nid() }; setSuppliers((a) => [...a, withId]); return withId.id; };

  const selected = rows.find((r) => r.id === selectedId);

  const NAV = [
    { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { k: "onboard", label: "Onboard supplier", icon: UserPlus },
    { k: "suppliers", label: "Suppliers", icon: Building2, badge: rows.length },
    { k: "screening", label: "Screening", icon: ShieldAlert, badge: openScreeningCount, warn: openScreeningCount > 0 },
    { k: "assistant", label: "Assistant", icon: Sparkles },
    { k: "integration", label: "Integration", icon: Plug },
    { k: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const titles = {
    dashboard: ["Dashboard", "Supplier validation and fraud-prevention overview"],
    onboard: ["Onboard supplier", "Validate a new supplier against live sources in real time"],
    suppliers: ["Suppliers", `${rows.length} suppliers in the vendor master`],
    screening: ["Screening", "Sanctions and watchlist reviews"],
    assistant: ["Procurement Assistant", "Ask about supplier status, risk, and screening"],
    integration: ["Integration", "How Attavo connects to Workday and external sources"],
    settings: ["Settings", "Validation rules, watchlists, and enrichment sources"],
    detail: [selected ? selected.legalName : "Supplier", "Supplier validation detail"],
  };
  const [tt, ts] = titles[view] || titles.dashboard;

  return (
    <div className="pl-app">
      <style>{CSS}</style>

      <aside className={`pl-side ${sideOpen ? "open" : ""}`}>
        <div className="pl-brand">
          <div className="pl-brandmark"><ShieldCheck size={18} /></div>
          <div>
            <div className="pl-brandname">Attavo</div>
            <div className="pl-brandsub">Verify</div>
          </div>
        </div>
        <nav className="pl-nav">
          {NAV.map((n) => (
            <button key={n.k} className={`pl-navitem ${view === n.k || (n.k === "suppliers" && view === "detail") ? "active" : ""}`} onClick={() => go(n.k)}>
              <n.icon size={17} /> {n.label}
              {n.badge != null && n.badge > 0 && <span className={`pl-badge ${n.warn ? "warn" : ""}`}>{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="pl-side-foot">
          Supplier validation prototype.<br />Watchlist data is fictional.
        </div>
      </aside>

      {sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.35)", zIndex: 30 }} />}

      <div className="pl-main">
        <header className="pl-top">
          <button className="pl-btn ghost pl-menu" style={{ padding: 8, display: "none" }} onClick={() => setSideOpen(true)}><LayoutDashboard size={16} /></button>
          <div>
            <div className="pl-topttl">{tt}</div>
            <div className="pl-topsub">{ts}</div>
          </div>
          <div className="pl-top-actions">
            {view !== "onboard" && <Btn icon={UserPlus} onClick={() => go("onboard")}>Onboard supplier</Btn>}
          </div>
        </header>

        <div className="pl-content">
          {view === "dashboard" && <Dashboard rows={rows} screeningItems={screeningItems} go={go} openSupplier={openSupplier} autoTrigger={autoTrigger} />}
          {view === "onboard" && <Onboard cfg={cfg} adj={adj} suppliers={suppliers} onAdd={onAdd} openSupplier={openSupplier} />}
          {view === "suppliers" && <Suppliers rows={rows} openSupplier={openSupplier} />}
          {view === "screening" && <Screening screeningItems={screeningItems} adj={adj} setAdj={setAdj} />}
          {view === "assistant" && <Assistant rows={rows} cfg={cfg} thread={thread} setThread={setThread} />}
          {view === "integration" && <Integration cfg={cfg} autoTrigger={autoTrigger} setAutoTrigger={setAutoTrigger} />}
          {view === "settings" && <Settings cfg={cfg} setCfg={setCfg} />}
          {view === "detail" && <Detail row={selected} onBack={() => go("suppliers")} overrides={overrides} setOverrides={setOverrides} adj={adj} setAdj={setAdj} cfg={cfg} goAssistant={goAssistant} />}
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .pl-menu{ display:inline-flex !important; } .pl-dash-grid{ grid-template-columns:1fr !important; } .pl-onb-grid{ grid-template-columns:1fr !important; } .pl-two{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
