import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { MomsDatabase, SkatDatabase } from "./types.js";
import { searchAll, matchByKeywords, matchByField } from "./search.js";
import {
  searchLaws, getLaw, getLawMarkdown, getLatestLawMarkdown,
  getParagraph, getParagraphStk,
  getLatestVersion, getLawAtDate, getLawAtDateMarkdown,
  getLawAmendments, getLawVersions, getVersionDiff,
  searchBills, KNOWN_LAWS,
} from "./retsinformation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

function jsonText(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

interface KontoEntry {
  readonly konto: string;
  readonly navn: string;
  readonly gruppe: string;
  readonly moms?: string;
  readonly beskrivelse: string;
}

interface KontoplanDb {
  readonly meta: Record<string, unknown>;
  readonly resultat: readonly KontoEntry[];
  readonly balance: readonly KontoEntry[];
  readonly momskoder: Record<string, { readonly sats: number; readonly type: string; readonly fradrag: number; readonly beskrivelse: string }>;
}

interface DeadlinesDb {
  readonly meta: Record<string, unknown>;
  readonly moms: Record<string, unknown>;
  readonly a_skat_am_bidrag: Record<string, unknown>;
  readonly selskabsskat: readonly { readonly opgave: string; readonly frist: string }[];
  readonly b_skat: Record<string, unknown>;
  readonly loensumsafgift: readonly Record<string, unknown>[];
  readonly aarsafslutning: readonly { readonly opgave: string; readonly frist: string; readonly note?: string }[];
  readonly eu_salgsliste: Record<string, unknown>;
}

interface LoenDb {
  readonly meta: Record<string, unknown>;
  readonly am_bidrag: { readonly sats: number; readonly beskrivelse: string };
  readonly a_skat: Record<string, unknown>;
  readonly feriepenge: { readonly sats: number; readonly ferietillaeg_sats: number; readonly beskrivelse: string };
  readonly atp: Record<string, unknown>;
  readonly pension: Record<string, unknown>;
  readonly koerselsgodtgoerelse: Record<string, unknown>;
  readonly diaetkost: Record<string, unknown>;
  readonly logigodtgoerelse: Record<string, unknown>;
  readonly beregningseksempel: Record<string, unknown>;
}

async function main(): Promise<void> {
  const momsDb = await loadJson<MomsDatabase>(join(__dirname, "..", "data", "moms_rules.json"));
  const skatDb = await loadJson<SkatDatabase>(join(__dirname, "..", "data", "skat_rules.json"));
  const kontoplanDb = await loadJson<KontoplanDb>(join(__dirname, "..", "data", "kontoplan.json"));
  const deadlinesDb = await loadJson<DeadlinesDb>(join(__dirname, "..", "data", "deadlines.json"));
  const loenDb = await loadJson<LoenDb>(join(__dirname, "..", "data", "loen_satser.json"));

  const server = new McpServer({
    name: "dk-bogfoerer",
    version: "1.0.0",
  });

  // ╔══════════════════════════════════════════╗
  // ║  SAMLET SOEGNING                         ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "search",
    "Samlet fritekst-soegning paa tvaers af ALLE danske moms- og skatteregler. Returnerer de mest relevante resultater.",
    { query: z.string().describe("Soege-tekst, f.eks. 'momsfradrag restaurant' eller 'topskat 2026'") },
    async ({ query }) => {
      const results = searchAll(momsDb, skatDb, query);
      if (results.length === 0) {
        return textResult(`Ingen resultater for "${query}". Proev andre soege-ord.`);
      }
      const formatted = results
        .map((r, i) =>
          `${i + 1}. **${r.title}** (score: ${r.score}, kilde: ${r.source})\n` +
          `   ${r.description}\n` +
          `   Lovhenvisning: ${r.law_reference}`)
        .join("\n\n");
      return textResult(`${results.length} resultater for "${query}":\n\n${formatted}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  MOMS TOOLS                              ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "moms_fradragssats",
    "Momsfradragssats for en given udgiftskategori (restaurant, hotel, bil, kontorhold).",
    { category: z.string().describe("Udgiftskategori, f.eks. 'restaurant', 'hotel', 'bil', 'kontorhold'") },
    async ({ category }) => {
      const byCategory = matchByField(momsDb.deductions, "category", category);
      const byKeyword = matchByKeywords(momsDb.deductions, category);
      const unique = [...new Map([...byCategory, ...byKeyword].map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Ingen fradragssats for "${category}". Proev "restaurant", "hotel", "bil", "kontorhold".`);
      }
      const formatted = unique
        .map((d) =>
          `**${d.category}**\n  Fradragssats: ${d.rate}%\n  ${d.description}\n  Betingelser: ${d.conditions}\n  Lovhenvisning: ${d.law_reference}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "moms_fritagelse",
    "Tjekker om en aktivitet/ydelse er momsfritaget jf. ML paragraf 13.",
    { activity: z.string().describe("Aktivitet, f.eks. 'sundhed', 'uddannelse', 'forsikring'") },
    async ({ activity }) => {
      const byCategory = matchByField(momsDb.exemptions, "category", activity);
      const byKeyword = matchByKeywords(momsDb.exemptions, activity);
      const unique = [...new Map([...byCategory, ...byKeyword].map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Ingen momsfritagelse for "${activity}". Aktiviteten er sandsynligvis momspligtig (25%).`);
      }
      const formatted = unique
        .map((e) => `**${e.category}** — MOMSFRITAGET\n  ${e.description}\n  Lovhenvisning: ${e.law_reference}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "moms_frist",
    "Momsindberetningsfrister. Angiv periodetype (halvaar, kvartal, maaned).",
    {
      period_type: z.string().describe("'halvaar', 'kvartal' eller 'maaned'"),
      period: z.string().optional().describe("Specifik periode, f.eks. '1. halvaar 2026'"),
    },
    async ({ period_type, period }) => {
      let matches = matchByField(momsDb.deadlines, "period_type", period_type);
      if (period) {
        const periodMatches = matchByField(matches, "period", period);
        if (periodMatches.length > 0) matches = periodMatches;
      }
      if (matches.length === 0) {
        return textResult(`Ingen frister for "${period_type}". Proev "halvaar", "kvartal" eller "maaned".`);
      }
      const formatted = matches
        .map((d) => `**${d.period_type} — ${d.period}**\n  Frist: ${d.deadline}\n  ${d.description}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "moms_fakturakrav",
    "Fakturakrav (paakraevede felter, forenklet faktura, kreditnotaer, e-fakturering).",
    { type: z.string().optional().describe("'fuld', 'forenklet' eller udelad for alt") },
    async ({ type }) => {
      const inv = momsDb.invoicing;
      const parts: string[] = [];
      if (!type || type === "fuld") {
        parts.push(`**Fuld faktura — paakraevede felter:**\n` + inv.required_fields.map((f, i) => `  ${i + 1}. ${f}`).join("\n"));
      }
      if (!type || type === "forenklet") {
        parts.push(`**Forenklet faktura:**\n  Graense: ${inv.simplified_threshold} kr. inkl. moms`);
      }
      if (!type) {
        parts.push(
          `**Kreditnotaer:** ${jsonText(inv.credit_notes)}`,
          `**E-fakturering:** ${jsonText(inv.electronic_invoicing)}`,
          `**Valutaregler:** ${jsonText(inv.currency_rules)}`,
        );
      }
      return textResult(parts.join("\n\n"));
    },
  );

  server.tool(
    "moms_eu",
    "EU-momsregler: reverse_charge, oss, ioss, export, import, b2c_eu, intrastat mv.",
    { topic: z.string().describe("EU-emne: 'reverse_charge', 'oss', 'ioss', 'export', 'import', 'intrastat' mv.") },
    async ({ topic }) => {
      const data = (momsDb.international as Record<string, unknown>)[topic];
      if (!data) {
        const available = Object.keys(momsDb.international).join(", ");
        return textResult(`Emnet "${topic}" ikke fundet. Tilgaengelige: ${available}`);
      }
      return textResult(`**EU-momsregel: ${topic}**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "moms_sats",
    "Momssats for vare/ydelse. Uden input: standardsats 25%. Med input: soeger specifik sats.",
    { item: z.string().optional().describe("Vare/ydelse, f.eks. 'boeger', 'aviser'. Udelad for standardsats.") },
    async ({ item }) => {
      if (!item) {
        const s = momsDb.rates.standard;
        return textResult(`**Standardsats:** ${s.rate}%\n${s.description}\nLovhenvisning: ${s.law_reference}`);
      }
      const zeroMatches = [
        ...matchByField(momsDb.rates.zero, "category", item),
        ...matchByKeywords(momsDb.rates.zero, item),
      ];
      const unique = [...new Map(zeroMatches.map((m) => [m.id, m])).values()];
      if (unique.length > 0) {
        const formatted = unique
          .map((r) => `**${r.category}** — ${r.rate}% (nulmoms)\n  ${r.description}\n  Ikrafttraeden: ${r.effective_date}\n  Lovhenvisning: ${r.law_reference}`)
          .join("\n\n");
        return textResult(formatted);
      }
      const exemptMatches = matchByKeywords(momsDb.exemptions, item);
      if (exemptMatches.length > 0) {
        return textResult(`"${item}" er muligvis momsfritaget. Brug moms_fritagelse for detaljer.`);
      }
      return textResult(`Ingen saerlig sats for "${item}". Standardsatsen paa ${momsDb.rates.standard.rate}% gaelder.`);
    },
  );

  server.tool(
    "moms_biler",
    "Momsregler for koeretoeejer: personbiler, varebiler, ladestandere.",
    { type: z.string().optional().describe("'personbiler', 'varebiler', 'ladestandere'. Udelad for alle.") },
    async ({ type }) => {
      if (type) {
        const data = (momsDb.vehicles as Record<string, unknown>)[type]
          ?? (momsDb.vehicles as Record<string, unknown>)[type.replace(/ /g, "_")];
        if (!data) {
          return textResult(`Type "${type}" ikke fundet. Tilgaengelige: ${Object.keys(momsDb.vehicles).join(", ")}`);
        }
        return textResult(`**Biler: ${type}**\n\n${jsonText(data)}`);
      }
      return textResult(`**Alle bilregler:**\n\n${jsonText(momsDb.vehicles)}`);
    },
  );

  server.tool(
    "moms_straffe",
    "Straffe ved forsinket/forkert momsindberetning.",
    {},
    async () => textResult(`**Straffe og konsekvenser:**\n\n${jsonText(momsDb.penalties)}`),
  );

  server.tool(
    "moms_beloeb",
    "Alle vigtige momsbeloebsgraenser og satser.",
    {},
    async () => {
      const formatted = Object.entries(momsDb.key_amounts)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");
      return textResult(`**Vigtige momsbeloeb:**\n\n${formatted}`);
    },
  );

  server.tool(
    "moms_saerordning",
    "Saerordninger: brugtmoms, rejsebureau, byggemoms, kantinemoms mv.",
    { scheme: z.string().optional().describe("F.eks. 'brugtmoms', 'rejsebureau'. Udelad for alle.") },
    async ({ scheme }) => {
      if (!scheme) {
        const formatted = momsDb.special_schemes
          .map((s) => `**${s.name}**\n  ${s.description}\n  Lovhenvisning: ${s.law_reference}`)
          .join("\n\n");
        return textResult(formatted);
      }
      const matches = [
        ...matchByField(momsDb.special_schemes, "name", scheme),
        ...matchByKeywords(momsDb.special_schemes, scheme),
      ];
      const unique = [...new Map(matches.map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Saerordning "${scheme}" ikke fundet. Tilgaengelige: ${momsDb.special_schemes.map((s) => s.name).join(", ")}`);
      }
      return textResult(unique.map((s) => `**${s.name}**\n${jsonText(s)}`).join("\n\n"));
    },
  );

  server.tool(
    "moms_aendringer_2026",
    "Momsaendringer der traeder i kraft i 2026.",
    {},
    async () => {
      const changes = momsDb.changes_2026;
      if (!changes || changes.length === 0) return textResult("Ingen registrerede momsaendringer for 2026.");
      const formatted = changes
        .map((c, i) => `${i + 1}. **${c.title}**\n   Ikrafttraeden: ${c.effective_date}\n   ${c.description}\n   Lovhenvisning: ${c.law_reference}`)
        .join("\n\n");
      return textResult(`Momsaendringer 2026 (${changes.length} stk.):\n\n${formatted}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  SKAT TOOLS                              ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "skat_sats",
    "Skattesats for indkomsttype: personlig, selskab, aktie, kapital.",
    { income_type: z.string().describe("'personlig', 'selskab', 'aktie' eller 'kapital'") },
    async ({ income_type }) => {
      const n = income_type.toLowerCase();
      if (n.includes("personlig") || n.includes("person")) {
        return textResult(`**Personlig indkomstskat:**\n\n${jsonText(skatDb.income_tax)}`);
      }
      if (n.includes("selskab") || n.includes("firma")) {
        return textResult(`**Selskabsskat:**\n\n${jsonText(skatDb.corporate_tax)}`);
      }
      if (n.includes("aktie") || n.includes("udbytte")) {
        return textResult(`**Aktieindkomstskat:**\n\n${jsonText(skatDb.share_income)}`);
      }
      if (n.includes("kapital") || n.includes("rente")) {
        return textResult(`**Kapitalindkomstskat:**\n\n${jsonText(skatDb.capital_income)}`);
      }
      return textResult(`Ukendt type "${income_type}". Proev: "personlig", "selskab", "aktie" eller "kapital".`);
    },
  );

  server.tool(
    "skat_fradrag",
    "Skattefradrag: beskaeftigelse, befordring, haandvaerker, rente, fagforening mv.",
    { type: z.string().describe("Fradragstype, f.eks. 'beskaeftigelse', 'befordring', 'haandvaerker'") },
    async ({ type }) => {
      const byName = matchByField(skatDb.deductions, "name", type);
      const byKeyword = matchByKeywords(skatDb.deductions, type);
      const unique = [...new Map([...byName, ...byKeyword].map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Ingen fradrag for "${type}". Tilgaengelige: ${skatDb.deductions.map((d) => d.name).join(", ")}`);
      }
      const formatted = unique
        .map((d) =>
          `**${d.name}**\n  ${d.description}\n  Sats: ${d.rate_percent ?? "—"}%\n  Maks: ${d.max_amount ?? "—"} kr.\n  Betingelser: ${d.conditions}\n  Lovhenvisning: ${d.law_reference}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "skat_personalegode",
    "Personalegodebeskatning: fri bil, telefon, sundhed mv.",
    { benefit: z.string().describe("F.eks. 'fri bil', 'telefon', 'sundhed'") },
    async ({ benefit }) => {
      const byName = matchByField(skatDb.employee_benefits, "name", benefit);
      const byKeyword = matchByKeywords(skatDb.employee_benefits, benefit);
      const unique = [...new Map([...byName, ...byKeyword].map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Ingen personalegoder for "${benefit}". Tilgaengelige: ${skatDb.employee_benefits.map((b) => b.name).join(", ")}`);
      }
      const formatted = unique
        .map((b) => `**${b.name}**\n  ${b.description}\n  Beskatning: ${b.rate ?? "Se beskrivelse"}\n  Lovhenvisning: ${b.law_reference}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "skat_rejsegodtgoerelse",
    "Koerselsgodtgoerelse, kost og logi satser.",
    { type: z.string().optional().describe("'koersel', 'kost', 'logi'. Udelad for alle.") },
    async ({ type }) => {
      const ta = skatDb.travel_allowances as Record<string, unknown>;
      if (!type) return textResult(`**Alle rejsegodtgoerelser:**\n\n${jsonText(ta)}`);
      const n = type.toLowerCase();
      if (n.includes("koersel") || n.includes("km") || n.includes("bil")) {
        return textResult(`**Koerselsgodtgoerelse:**\n\n${jsonText(ta.koerselsgodtgoerelse)}`);
      }
      if (n.includes("kost") || n.includes("mad")) {
        return textResult(`**Kostgodtgoerelse:**\n\n${jsonText(ta.kostgodtgoerelse)}`);
      }
      if (n.includes("logi") || n.includes("overnatning")) {
        return textResult(`**Logigodtgoerelse:**\n\n${jsonText(ta.logigodtgoerelse)}`);
      }
      return textResult(`Type "${type}" ikke fundet. Proev "koersel", "kost" eller "logi".`);
    },
  );

  server.tool(
    "skat_pension",
    "Pensionsregler: ratepension, aldersopsparing, livrente.",
    { type: z.string().optional().describe("'ratepension', 'aldersopsparing', 'livrente'. Udelad for alle.") },
    async ({ type }) => {
      if (!type) {
        const formatted = skatDb.pension
          .map((p) =>
            `**${p.type}**\n  ${p.description}\n  Maks. fradrag: ${p.max_deduction ?? "Intet loft"} kr.\n  Fradragstype: ${p.fradrag_type ?? "—"}\n  Lovhenvisning: ${p.law_reference}`)
          .join("\n\n");
        return textResult(`**Alle pensionsregler:**\n\n${formatted}`);
      }
      const byType = matchByField(skatDb.pension, "type", type);
      const byKeyword = matchByKeywords(skatDb.pension, type);
      const unique = [...new Map([...byType, ...byKeyword].map((m) => [m.id, m])).values()];
      if (unique.length === 0) {
        return textResult(`Ingen pensionsregler for "${type}". Tilgaengelige: ${skatDb.pension.map((p) => p.type).join(", ")}`);
      }
      const formatted = unique
        .map((p) =>
          `**${p.type}**\n  ${p.description}\n  Maks. fradrag: ${p.max_deduction ?? "Intet loft"} kr.\n  Fradragstype: ${p.fradrag_type ?? "—"}\n  Lovhenvisning: ${p.law_reference}`)
        .join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "skat_ejendom",
    "Ejendomsskat: ejendomsvaerdiskat, grundskyld, parcelhusregel.",
    { type: z.string().optional().describe("'ejendomsvaerdi', 'grundskyld', 'parcelhusregel'. Udelad for alt.") },
    async ({ type }) => {
      const pt = skatDb.property_tax as Record<string, unknown>;
      if (!type) return textResult(`**Alle ejendomsskatteregler:**\n\n${jsonText(pt)}`);
      const n = type.toLowerCase();
      for (const [key, value] of Object.entries(pt)) {
        if (key.toLowerCase().includes(n) || n.includes(key.toLowerCase())) {
          return textResult(`**${key}:**\n\n${jsonText(value)}`);
        }
      }
      return textResult(`Type "${type}" ikke fundet. Tilgaengelige: ${Object.keys(pt).filter((k) => k !== "keywords").join(", ")}`);
    },
  );

  server.tool(
    "skat_selskab",
    "Selskabsskat, acontoskat, udbytteskat, underskud.",
    { topic: z.string().optional().describe("'acontoskat', 'udbytteskat', 'underskud'. Udelad for alt.") },
    async ({ topic }) => {
      if (!topic) return textResult(`**Selskabsskat:**\n\n${jsonText(skatDb.corporate_tax)}`);
      const ct = skatDb.corporate_tax as Record<string, unknown>;
      const n = topic.toLowerCase();
      for (const [key, value] of Object.entries(ct)) {
        if (key.toLowerCase().includes(n) || n.includes(key.toLowerCase())) {
          return textResult(`**${key}:**\n\n${jsonText(value)}`);
        }
      }
      return textResult(`Emne "${topic}" ikke fundet. Tilgaengelige: ${Object.keys(ct).filter((k) => k !== "keywords" && k !== "law_reference").join(", ")}`);
    },
  );

  server.tool(
    "skat_virksomhedsordning",
    "Virksomhedsskatteordningen: opsparing, kapitalafkast, haeveraekkefoelge.",
    { topic: z.string().optional().describe("'opsparing', 'kapitalafkast', 'haeveraekkefoelge'. Udelad for alt.") },
    async ({ topic }) => {
      if (!topic) return textResult(`**Virksomhedsordningen:**\n\n${jsonText(skatDb.virksomhedsordningen)}`);
      const vo = skatDb.virksomhedsordningen as Record<string, unknown>;
      const n = topic.toLowerCase();
      for (const [key, value] of Object.entries(vo)) {
        if (key.toLowerCase().includes(n) || n.includes(key.toLowerCase())) {
          return textResult(`**${key}:**\n\n${jsonText(value)}`);
        }
      }
      return textResult(`Emne "${topic}" ikke fundet.`);
    },
  );

  server.tool(
    "skat_arv_gave",
    "Arv og gaveafgift: satser, bundfradrag, naerstaaende.",
    {},
    async () => textResult(`**Arv og gaveafgift:**\n\n${jsonText(skatDb.inheritance_gift)}`),
  );

  server.tool(
    "skat_aendringer_2026",
    "Skatteaendringer der traeder i kraft i 2026.",
    {},
    async () => {
      const changes = skatDb.changes_2026;
      if (!changes || changes.length === 0) return textResult("Ingen registrerede skatteaendringer for 2026.");
      const formatted = changes
        .map((c, i) => `${i + 1}. **${c.title}**\n   Ikrafttraeden: ${c.effective_date}\n   ${c.description}\n   Lovhenvisning: ${c.law_reference}`)
        .join("\n\n");
      return textResult(`Skatteaendringer 2026 (${changes.length} stk.):\n\n${formatted}`);
    },
  );

  server.tool(
    "skat_beloeb",
    "Alle vigtige skattebeloebsgraenser og satser.",
    {},
    async () => {
      const formatted = Object.entries(skatDb.key_amounts)
        .filter(([k]) => k !== "keywords")
        .map(([key, value]) => `  ${key}: ${typeof value === "object" ? jsonText(value) : value}`)
        .join("\n");
      return textResult(`**Vigtige skattebeloeb:**\n\n${formatted}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  RETSINFORMATION TOOLS                   ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "lov_soeg",
    "Soeg i danske love via Retsinformation API. Returnerer matchende love.",
    {
      search: z.string().optional().describe("Soege-tekst, f.eks. 'momsloven' eller 'bogfoering'"),
      year: z.number().optional().describe("Filtrer paa aar, f.eks. 2022"),
      limit: z.number().optional().describe("Maks antal resultater (standard 20)"),
    },
    async ({ search, year, limit }) => {
      try {
        const result = await searchLaws({ search, year, limit });
        if (!result) return textResult("Ingen love fundet.");
        return textResult(`**Lovsoegning:**\n\n${jsonText(result)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl ved soegning: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_hent",
    "Hent en specifik lov fra Retsinformation. Brug enten aar+nummer eller et velkendt lovnavn.",
    {
      name: z.string().optional().describe("Velkendt lovnavn: momsloven, kildeskatteloven, bogfoeringsloven, personskatteloven, ligningsloven, selskabsskatteloven, virksomhedsskatteloven, aarsregnskabsloven, afskrivningsloven"),
      year: z.number().optional().describe("Lovens aar (f.eks. 1994 for momsloven)"),
      number: z.number().optional().describe("Lovens nummer (f.eks. 375 for momsloven)"),
      include: z.string().optional().describe("Ekstra data: 'case', 'actors', 'timeline', 'full'"),
    },
    async ({ name, year, number, include }) => {
      let lawYear = year;
      let lawNum = number;

      if (name) {
        const normalized = name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
        const known = KNOWN_LAWS[normalized];
        if (known) {
          lawYear = known.year;
          lawNum = known.number;
        } else {
          const match = Object.entries(KNOWN_LAWS).find(([, v]) =>
            v.name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").includes(normalized),
          );
          if (match) {
            lawYear = match[1].year;
            lawNum = match[1].number;
          } else {
            const available = Object.entries(KNOWN_LAWS).map(([k, v]) => `${k} (${v.year}/${v.number})`).join(", ");
            return textResult(`Ukendt lovnavn "${name}". Velkendte love: ${available}\n\nEllers angiv year og number direkte.`);
          }
        }
      }

      if (!lawYear || !lawNum) {
        return textResult("Angiv enten 'name' (f.eks. 'momsloven') eller 'year' + 'number'.");
      }

      try {
        const result = await getLaw(lawYear, lawNum, include);
        if (!result) return textResult(`Lov ${lawYear}/${lawNum} ikke fundet.`);
        return textResult(`**Lov ${lawYear}/${lawNum}:**\n\n${jsonText(result)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_paragraf",
    "Hent en specifik paragraf (og evt. stk) fra en lov via Retsinformation.",
    {
      name: z.string().optional().describe("Velkendt lovnavn, f.eks. 'momsloven'"),
      year: z.number().optional().describe("Lovens aar"),
      number: z.number().optional().describe("Lovens nummer"),
      paragraph: z.string().describe("Paragrafnummer, f.eks. '13', '42', '15a'"),
      stk: z.number().optional().describe("Stk-nummer (1-indekseret), f.eks. 1, 2"),
    },
    async ({ name, year, number, paragraph, stk }) => {
      let lawYear = year;
      let lawNum = number;

      if (name) {
        const normalized = name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
        const known = KNOWN_LAWS[normalized]
          ?? Object.values(KNOWN_LAWS).find((v) =>
            v.name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").includes(normalized));
        if (known) {
          lawYear = known.year;
          lawNum = known.number;
        }
      }

      if (!lawYear || !lawNum) {
        return textResult("Angiv enten 'name' eller 'year' + 'number'.");
      }

      try {
        const result = stk
          ? await getParagraphStk(lawYear, lawNum, paragraph, stk)
          : await getParagraph(lawYear, lawNum, paragraph);
        if (!result) return textResult(`Paragraf ${paragraph}${stk ? ` stk. ${stk}` : ""} ikke fundet i lov ${lawYear}/${lawNum}.`);
        return textResult(`**Lov ${lawYear}/${lawNum} § ${paragraph}${stk ? ` stk. ${stk}` : ""}:**\n\n${jsonText(result)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_tekst",
    "Hent den seneste gaeldende version af en lov som markdown (letlaeselig tekst).",
    {
      name: z.string().optional().describe("Velkendt lovnavn, f.eks. 'momsloven'"),
      year: z.number().optional().describe("Lovens aar"),
      number: z.number().optional().describe("Lovens nummer"),
      paragraphs: z.string().optional().describe("Filtrering, f.eks. '1-10' eller '13'"),
    },
    async ({ name, year, number, paragraphs }) => {
      let lawYear = year;
      let lawNum = number;

      if (name) {
        const normalized = name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
        const known = KNOWN_LAWS[normalized]
          ?? Object.values(KNOWN_LAWS).find((v) =>
            v.name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").includes(normalized));
        if (known) {
          lawYear = known.year;
          lawNum = known.number;
        }
      }

      if (!lawYear || !lawNum) {
        return textResult("Angiv enten 'name' eller 'year' + 'number'.");
      }

      try {
        const result = await getLatestLawMarkdown(lawYear, lawNum, { paragraphs });
        if (!result) return textResult(`Lov ${lawYear}/${lawNum} ikke fundet.`);
        const text = typeof result === "string" ? result : jsonText(result);
        // Beggraens output til 8000 tegn for at undgaa at sprenge kontekst
        const truncated = text.length > 8000
          ? text.slice(0, 8000) + "\n\n--- (afkortet, brug 'paragraphs' parameteren for at filtrere) ---"
          : text;
        return textResult(`**Seneste version af lov ${lawYear}/${lawNum}:**\n\n${truncated}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_historisk",
    "Hent en lov som den saa ud paa en bestemt dato (historisk opslag).",
    {
      name: z.string().optional().describe("Velkendt lovnavn"),
      year: z.number().optional().describe("Lovens aar"),
      number: z.number().optional().describe("Lovens nummer"),
      date: z.string().describe("Dato i YYYY-MM-DD format, f.eks. '2024-12-31'"),
      paragraphs: z.string().optional().describe("Filtrering, f.eks. '13' eller '37-42'"),
    },
    async ({ name, year, number, date, paragraphs }) => {
      let lawYear = year;
      let lawNum = number;

      if (name) {
        const normalized = name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
        const known = KNOWN_LAWS[normalized]
          ?? Object.values(KNOWN_LAWS).find((v) =>
            v.name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").includes(normalized));
        if (known) {
          lawYear = known.year;
          lawNum = known.number;
        }
      }

      if (!lawYear || !lawNum) {
        return textResult("Angiv enten 'name' eller 'year' + 'number'.");
      }

      try {
        const result = await getLawAtDateMarkdown(lawYear, lawNum, date, { paragraphs });
        if (!result) return textResult(`Lov ${lawYear}/${lawNum} paa dato ${date} ikke fundet.`);
        const text = typeof result === "string" ? result : jsonText(result);
        const truncated = text.length > 8000
          ? text.slice(0, 8000) + "\n\n--- (afkortet) ---"
          : text;
        return textResult(`**Lov ${lawYear}/${lawNum} pr. ${date}:**\n\n${truncated}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_aendringer",
    "Hent alle aendringer (amendments) til en lov.",
    {
      name: z.string().optional().describe("Velkendt lovnavn"),
      year: z.number().optional().describe("Lovens aar"),
      number: z.number().optional().describe("Lovens nummer"),
    },
    async ({ name, year, number }) => {
      let lawYear = year;
      let lawNum = number;

      if (name) {
        const normalized = name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
        const known = KNOWN_LAWS[normalized]
          ?? Object.values(KNOWN_LAWS).find((v) =>
            v.name.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").includes(normalized));
        if (known) {
          lawYear = known.year;
          lawNum = known.number;
        }
      }

      if (!lawYear || !lawNum) {
        return textResult("Angiv enten 'name' eller 'year' + 'number'.");
      }

      try {
        const result = await getLawAmendments(lawYear, lawNum);
        if (!result) return textResult(`Ingen aendringer fundet for lov ${lawYear}/${lawNum}.`);
        return textResult(`**Aendringer til lov ${lawYear}/${lawNum}:**\n\n${jsonText(result)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_lovforslag",
    "Soeg i lovforslag (bills) i Folketinget.",
    {
      search: z.string().optional().describe("Soege-tekst, f.eks. 'moms' eller 'skat'"),
      status: z.string().optional().describe("Filtrer paa status"),
      enacted: z.boolean().optional().describe("Kun vedtagne lovforslag?"),
      limit: z.number().optional().describe("Maks antal (standard 20)"),
    },
    async ({ search, status, enacted, limit }) => {
      try {
        const result = await searchBills({ search, status, enacted, limit });
        if (!result) return textResult("Ingen lovforslag fundet.");
        return textResult(`**Lovforslag:**\n\n${jsonText(result)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Ukendt fejl";
        return textResult(`Fejl: ${msg}`);
      }
    },
  );

  server.tool(
    "lov_velkendte",
    "Liste over velkendte danske love med aar/nummer til brug i andre lov_* tools.",
    {},
    async () => {
      const formatted = Object.entries(KNOWN_LAWS)
        .map(([key, v]) => `  **${v.name}** (${key}) — ${v.year}/${v.number}`)
        .join("\n");
      return textResult(`**Velkendte danske love:**\n\n${formatted}\n\nBrug disse navne i 'name' parameteren paa lov_hent, lov_paragraf, lov_tekst mv.`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  1. KONTOPLAN                            ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "konto_opslag",
    "Slaa en konto op i standardkontoplanen. Soeg paa kontonummer, navn eller gruppe.",
    { query: z.string().describe("Kontonummer (f.eks. '4100'), navn (f.eks. 'kontorhold') eller gruppe (f.eks. 'administration')") },
    async ({ query }) => {
      const q = query.toLowerCase();
      const allKonti = [...kontoplanDb.resultat, ...kontoplanDb.balance];
      const matches = allKonti.filter((k) =>
        k.konto.includes(q) ||
        k.navn.toLowerCase().includes(q) ||
        k.gruppe.toLowerCase().includes(q) ||
        k.beskrivelse.toLowerCase().includes(q),
      );
      if (matches.length === 0) return textResult(`Ingen konti fundet for "${query}".`);
      const formatted = matches
        .map((k) => {
          const momsInfo = k.moms && kontoplanDb.momskoder[k.moms]
            ? ` | Moms: ${kontoplanDb.momskoder[k.moms].beskrivelse}`
            : "";
          return `**${k.konto} — ${k.navn}**\n  Gruppe: ${k.gruppe}\n  ${k.beskrivelse}${momsInfo}`;
        })
        .join("\n\n");
      return textResult(`${matches.length} konti fundet:\n\n${formatted}`);
    },
  );

  server.tool(
    "konto_momskode",
    "Hvilken momskode hoerer til en udgiftstype? Returnerer korrekt konto + momsfradrag.",
    { expense_type: z.string().describe("Udgiftstype, f.eks. 'restaurant', 'kontorhold', 'forsikring', 'bil', 'hotel', 'reklame'") },
    async ({ expense_type }) => {
      const q = expense_type.toLowerCase();
      const resultatMatches = kontoplanDb.resultat.filter((k) =>
        k.navn.toLowerCase().includes(q) ||
        k.beskrivelse.toLowerCase().includes(q) ||
        k.gruppe.toLowerCase().includes(q),
      );
      if (resultatMatches.length === 0) {
        return textResult(`Ingen konto fundet for "${expense_type}". Proev f.eks. "restaurant", "kontorhold", "forsikring", "bil".`);
      }
      const formatted = resultatMatches.map((k) => {
        const mk = k.moms ? kontoplanDb.momskoder[k.moms] : null;
        return `**${k.konto} — ${k.navn}**\n` +
          `  Momskode: ${k.moms ?? "ingen"}\n` +
          (mk ? `  Momssats: ${mk.sats}% | Fradrag: ${mk.fradrag}%\n  ${mk.beskrivelse}\n` : "") +
          `  ${k.beskrivelse}`;
      }).join("\n\n");
      return textResult(formatted);
    },
  );

  server.tool(
    "konto_liste",
    "Vis hele kontoplanen eller en specifik gruppe (resultat/balance/momskoder).",
    { gruppe: z.string().optional().describe("'resultat', 'balance' eller 'momskoder'. Udelad for oversigt.") },
    async ({ gruppe }) => {
      if (gruppe === "momskoder") {
        const formatted = Object.entries(kontoplanDb.momskoder)
          .map(([kode, m]) => `**${kode}**: ${m.sats}% moms, ${m.fradrag}% fradrag — ${m.beskrivelse}`)
          .join("\n");
        return textResult(`**Momskoder:**\n\n${formatted}`);
      }
      if (gruppe === "resultat") {
        const formatted = kontoplanDb.resultat
          .map((k) => `${k.konto} | ${k.navn} | ${k.gruppe} | moms: ${k.moms ?? "—"}`)
          .join("\n");
        return textResult(`**Resultatopgoerelse:**\n\n${formatted}`);
      }
      if (gruppe === "balance") {
        const formatted = kontoplanDb.balance
          .map((k) => `${k.konto} | ${k.navn} | ${k.gruppe}`)
          .join("\n");
        return textResult(`**Balance:**\n\n${formatted}`);
      }
      return textResult(
        `**Standardkontoplan — oversigt:**\n\n` +
        `Resultatopgoerelse: ${kontoplanDb.resultat.length} konti (1000-8999)\n` +
        `Balance: ${kontoplanDb.balance.length} konti (11000-15999)\n` +
        `Momskoder: ${Object.keys(kontoplanDb.momskoder).length} stk.\n\n` +
        `Brug gruppe='resultat', 'balance' eller 'momskoder' for detaljer.`,
      );
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  2. DEADLINE-KALENDER                    ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "deadline_oversigt",
    "Alle indberetningsfrister for en virksomhedstype. Viser naeste deadline baseret paa dags dato.",
    {
      virksomhedstype: z.string().optional().describe("'aps', 'emv' (enkeltmand), 'as'. Standard: aps"),
      momsperiode: z.string().optional().describe("'halvaar', 'kvartal', 'maaned'. Standard: halvaar"),
    },
    async ({ virksomhedstype, momsperiode }) => {
      const today = new Date().toISOString().slice(0, 10);
      const parts: string[] = [`**Deadline-oversigt** (i dag: ${today})\n`];

      // Moms
      const mp = momsperiode ?? "halvaar";
      const momsData = (deadlinesDb.moms as Record<string, Record<string, unknown>>)[mp];
      if (momsData) {
        parts.push(`**Moms (${mp}):** ${momsData.omsaetning ?? ""}`);
        const perioder = momsData.perioder as Array<{ periode: string; frist: string }> | undefined;
        if (perioder) {
          for (const p of perioder) {
            const marker = p.frist >= today ? " ← KOMMENDE" : " ✓";
            parts.push(`  ${p.periode}: frist ${p.frist}${marker}`);
          }
        }
      }

      // A-skat
      parts.push("\n**A-skat/AM-bidrag (smaa/mellemstore):**");
      const askat = deadlinesDb.a_skat_am_bidrag as Record<string, Record<string, unknown>>;
      const askatPerioder = askat.smaa_mellemstore?.perioder as Array<{ periode: string; frist: string }> | undefined;
      if (askatPerioder) {
        const naeste = askatPerioder.find((p) => p.frist >= today);
        if (naeste) parts.push(`  Naeste: ${naeste.periode} — frist ${naeste.frist}`);
      }

      // Selskabsskat
      const vt = (virksomhedstype ?? "aps").toLowerCase();
      if (vt === "aps" || vt === "as") {
        parts.push("\n**Selskabsskat:**");
        for (const s of deadlinesDb.selskabsskat) {
          const marker = s.frist >= today ? " ← KOMMENDE" : " ✓";
          parts.push(`  ${s.opgave}: ${s.frist}${marker}`);
        }
      }

      // B-skat for EMV
      if (vt === "emv" || vt === "enkeltmand") {
        parts.push("\n**B-skat:**");
        const bskat = deadlinesDb.b_skat as { rater: Array<{ rate: number; frist: string }> };
        const naesteRate = bskat.rater?.find((r) => r.frist >= today);
        if (naesteRate) parts.push(`  Naeste: Rate ${naesteRate.rate} — frist ${naesteRate.frist}`);
      }

      // Aarsafslutning
      parts.push("\n**Aarsafslutning:**");
      for (const a of deadlinesDb.aarsafslutning) {
        const marker = a.frist >= today ? " ← KOMMENDE" : " ✓";
        parts.push(`  ${a.opgave}: ${a.frist}${marker}${a.note ? ` (${a.note})` : ""}`);
      }

      return textResult(parts.join("\n"));
    },
  );

  server.tool(
    "deadline_naeste",
    "Hvad er de naeste N deadlines fra dags dato? Paa tvaers af alle typer.",
    { antal: z.number().optional().describe("Antal deadlines (standard 5)") },
    async ({ antal }) => {
      const today = new Date().toISOString().slice(0, 10);
      const n = antal ?? 5;

      // Saml alle deadlines i en flad liste
      const alle: Array<{ frist: string; beskrivelse: string }> = [];

      // Moms (alle periodetyper)
      for (const [periodetype, data] of Object.entries(deadlinesDb.moms)) {
        const d = data as Record<string, unknown>;
        const perioder = d.perioder as Array<{ periode: string; frist: string }> | undefined;
        if (perioder) {
          for (const p of perioder) {
            alle.push({ frist: p.frist, beskrivelse: `Moms (${periodetype}): ${p.periode}` });
          }
        }
      }

      // A-skat
      const askat = deadlinesDb.a_skat_am_bidrag as Record<string, Record<string, unknown>>;
      const askatP = askat.smaa_mellemstore?.perioder as Array<{ periode: string; frist: string }> | undefined;
      if (askatP) {
        for (const p of askatP) {
          alle.push({ frist: p.frist, beskrivelse: `A-skat/AM-bidrag: ${p.periode}` });
        }
      }

      // Selskabsskat
      for (const s of deadlinesDb.selskabsskat) {
        alle.push({ frist: s.frist, beskrivelse: `Selskabsskat: ${s.opgave}` });
      }

      // Aarsafslutning
      for (const a of deadlinesDb.aarsafslutning) {
        alle.push({ frist: a.frist, beskrivelse: a.opgave });
      }

      const kommende = alle
        .filter((d) => d.frist >= today)
        .sort((a, b) => a.frist.localeCompare(b.frist))
        .slice(0, n);

      if (kommende.length === 0) return textResult("Ingen kommende deadlines fundet.");

      const formatted = kommende
        .map((d, i) => `${i + 1}. **${d.frist}** — ${d.beskrivelse}`)
        .join("\n");
      return textResult(`**Naeste ${kommende.length} deadlines:**\n\n${formatted}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  3. BILAGSKLASSIFICERING                 ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "bilag_klassificer",
    "Klassificer et bilag: hvilken konto, momskode og fradragssats passer? Beskriv bilaget saa praecist som muligt.",
    {
      beskrivelse: z.string().describe("Beskrivelse af bilaget, f.eks. 'faktura fra restaurant, 4 gaester, forretningsmoede' eller 'kvittering for kontorartikler'"),
      beloeb: z.number().optional().describe("Beloeb inkl. moms"),
    },
    async ({ beskrivelse, beloeb }) => {
      const b = beskrivelse.toLowerCase();
      const parts: string[] = [`**Bilagsklassificering:** "${beskrivelse}"\n`];

      // Regelbaseret matching
      interface BilagMatch {
        readonly konto: string;
        readonly kontonavn: string;
        readonly momskode: string;
        readonly fradrag: number;
        readonly forklaring: string;
      }

      const regler: Array<{ readonly keywords: readonly string[]; readonly match: BilagMatch }> = [
        { keywords: ["restaurant", "frokost", "middag", "cafe", "forplejning", "mad"],
          match: { konto: "3700", kontonavn: "Restaurationsbesoeg", momskode: "rest_25pct_fradrag", fradrag: 25, forklaring: "Restaurant/forplejning — kun 25% momsfradrag jf. ML §42, stk. 1" } },
        { keywords: ["repraesentation", "gaester", "kundepleje", "gaver til kunder"],
          match: { konto: "3600", kontonavn: "Repraesentation", momskode: "repr_25pct_fradrag", fradrag: 25, forklaring: "Repraesentation — kun 25% momsfradrag jf. ML §42, stk. 1. Husk min. 2 deltagere." } },
        { keywords: ["hotel", "overnatning", "erhvervsrejse"],
          match: { konto: "3500", kontonavn: "Rejseomkostninger", momskode: "hotel_100pct", fradrag: 100, forklaring: "Hotel til erhvervsmaessig overnatning — 100% momsfradrag jf. ML §42, stk. 2" } },
        { keywords: ["kontor", "papir", "printer", "toner", "kuglepen", "kontorartikl"],
          match: { konto: "4100", kontonavn: "Kontorhold", momskode: "koeb_25", fradrag: 100, forklaring: "Kontorhold — fuldt momsfradrag" } },
        { keywords: ["software", "licens", "abonnement", "saas", "cloud", "hosting"],
          match: { konto: "4400", kontonavn: "IT og software", momskode: "koeb_25", fradrag: 100, forklaring: "IT/software — fuldt momsfradrag" } },
        { keywords: ["telefon", "mobil", "internet", "bredbaand"],
          match: { konto: "4300", kontonavn: "Telefon og internet", momskode: "koeb_25", fradrag: 100, forklaring: "Telefon/internet — fuldt momsfradrag" } },
        { keywords: ["reklame", "annonce", "google ads", "facebook ads", "markedsfoering", "kampagne"],
          match: { konto: "3100", kontonavn: "Reklame og markedsfoering", momskode: "koeb_25", fradrag: 100, forklaring: "Markedsfoering — fuldt momsfradrag" } },
        { keywords: ["revisor", "bogfoering", "regnskab"],
          match: { konto: "4600", kontonavn: "Revisor og regnskab", momskode: "koeb_25", fradrag: 100, forklaring: "Revisor/bogfoering — fuldt momsfradrag" } },
        { keywords: ["advokat", "juridisk", "raadgivning"],
          match: { konto: "4700", kontonavn: "Advokat og raadgivning", momskode: "koeb_25", fradrag: 100, forklaring: "Juridisk raadgivning — fuldt momsfradrag" } },
        { keywords: ["forsikring"],
          match: { konto: "4500", kontonavn: "Forsikringer", momskode: "ingen_momsfri", fradrag: 0, forklaring: "Forsikring er momsfritaget jf. ML §13, stk. 1, nr. 10 — ingen moms paa fakturaen, intet fradrag" } },
        { keywords: ["husleje", "leje", "lokale", "kontorleje"],
          match: { konto: "4000", kontonavn: "Lokaleomkostninger", momskode: "koeb_25", fradrag: 100, forklaring: "Husleje er normalt momsfri, men erhvervslejemaal kan vaere frivilligt momsregistreret — tjek faktura" } },
        { keywords: ["benzin", "diesel", "braendstof", "bil", "vaerksted", "daek", "parkering"],
          match: { konto: "3400", kontonavn: "Koeretoejsomkostninger", momskode: "bil_blandet", fradrag: 0, forklaring: "Personbil: 0% momsfradrag (ML §41). Varebil m. gule plader: 100%. Tjek biltype!" } },
        { keywords: ["varekøb", "varer", "indkoeb", "lager"],
          match: { konto: "2000", kontonavn: "Vareforbrug", momskode: "koeb_25", fradrag: 100, forklaring: "Varekøb til videresalg — fuldt momsfradrag" } },
        { keywords: ["fragt", "levering", "forsendelse", "porto"],
          match: { konto: "3300", kontonavn: "Fragtomkostninger", momskode: "koeb_25", fradrag: 100, forklaring: "Fragt — fuldt momsfradrag" } },
        { keywords: ["bank", "gebyr", "bankgebyr"],
          match: { konto: "7200", kontonavn: "Bankgebyrer", momskode: "ingen_momsfri", fradrag: 0, forklaring: "Bankgebyrer er momsfritaget (finansiel ydelse, ML §13)" } },
        { keywords: ["rente", "renteudgift"],
          match: { konto: "7000", kontonavn: "Renteudgifter", momskode: "ingen_momsfri", fradrag: 0, forklaring: "Renter er momsfritaget" } },
      ];

      let found = false;
      for (const regel of regler) {
        if (regel.keywords.some((kw) => b.includes(kw))) {
          const m = regel.match;
          parts.push(`**Anbefalet konto:** ${m.konto} — ${m.kontonavn}`);
          parts.push(`**Momskode:** ${m.momskode}`);
          parts.push(`**Momsfradrag:** ${m.fradrag}%`);
          parts.push(`**Forklaring:** ${m.forklaring}`);
          if (beloeb && m.fradrag > 0) {
            const momsBeloeb = beloeb * 0.20; // 25/125
            const fradrag = momsBeloeb * (m.fradrag / 100);
            parts.push(`\n**Beregning (${beloeb} kr. inkl. moms):**`);
            parts.push(`  Moms i alt: ${momsBeloeb.toFixed(2)} kr.`);
            parts.push(`  Momsfradrag (${m.fradrag}%): ${fradrag.toFixed(2)} kr.`);
          }
          found = true;
          break;
        }
      }

      if (!found) {
        parts.push("Kunne ikke automatisk klassificere bilaget.");
        parts.push("Proev at beskrive mere praecist, f.eks. 'kvittering restaurant', 'faktura software' osv.");
        parts.push("\nGenerelle retningslinjer:");
        parts.push("- Drift/kontor: konto 4000-4999, fuld momsfradrag");
        parts.push("- Restaurant/repr.: konto 3600-3700, 25% momsfradrag");
        parts.push("- Forsikring/bank/renter: momsfri, intet fradrag");
        parts.push("- Personbil: 0% momsfradrag, varebil gule plader: 100%");
      }

      return textResult(parts.join("\n"));
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  4. LOENBEREGNING                        ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "loen_beregn",
    "Beregn nettoloen for en medarbejder. Angiv bruttoeloen, traekprocent og traekfradrag fra skattekortet.",
    {
      brutto: z.number().describe("Maanedlig bruttoeloen i kr."),
      traekprocent: z.number().describe("Traekprocent fra skattekort (f.eks. 37)"),
      traekfradrag: z.number().optional().describe("Maanedligt traekfradrag fra skattekort (f.eks. 5500)"),
      pension_pct_loenmodtager: z.number().optional().describe("Loenmodtagers pensionsbidrag i % (standard 4)"),
      pension_pct_arbejdsgiver: z.number().optional().describe("Arbejdsgivers pensionsbidrag i % (standard 8)"),
      timer: z.number().optional().describe("Arbejdstimer i maaneden (standard 160.33 fuldtid)"),
    },
    async ({ brutto, traekprocent, traekfradrag, pension_pct_loenmodtager, pension_pct_arbejdsgiver, timer }) => {
      const tf = traekfradrag ?? 0;
      const penLm = pension_pct_loenmodtager ?? 4;
      const penAg = pension_pct_arbejdsgiver ?? 8;
      const t = timer ?? 160.33;

      // ATP
      let atpTotal = 0;
      let atpLm = 0;
      let atpAg = 0;
      if (t >= 117) { atpTotal = 284.40; atpLm = 94.80; atpAg = 189.60; }
      else if (t >= 78) { atpTotal = 189.60; atpLm = 63.20; atpAg = 126.40; }
      else if (t >= 39) { atpTotal = 94.80; atpLm = 31.60; atpAg = 63.20; }

      // Beregning
      const amBidrag = Math.round(brutto * 0.08 * 100) / 100;
      const efterAm = brutto - amBidrag;
      const pensionLm = Math.round(brutto * (penLm / 100) * 100) / 100;
      const pensionAg = Math.round(brutto * (penAg / 100) * 100) / 100;
      const skattepligtig = Math.max(0, efterAm - tf);
      const aSkat = Math.round(skattepligtig * (traekprocent / 100) * 100) / 100;
      const netto = Math.round((efterAm - aSkat - pensionLm - atpLm) * 100) / 100;

      const parts = [
        `**Loenberegning**\n`,
        `Bruttoeloen:                     ${brutto.toFixed(2)} kr.`,
        `AM-bidrag (8%):                - ${amBidrag.toFixed(2)} kr.`,
        `A-indkomst efter AM:             ${efterAm.toFixed(2)} kr.`,
        `Traekfradrag:                  - ${tf.toFixed(2)} kr.`,
        `Skattepligtig indkomst:          ${skattepligtig.toFixed(2)} kr.`,
        `A-skat (${traekprocent}%):              - ${aSkat.toFixed(2)} kr.`,
        `Pension loenmodtager (${penLm}%):  - ${pensionLm.toFixed(2)} kr.`,
        `ATP loenmodtager:              - ${atpLm.toFixed(2)} kr.`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `**Nettoloen:                     ${netto.toFixed(2)} kr.**`,
        ``,
        `**Arbejdsgivers udgifter ud over loen:**`,
        `  Pension arbejdsgiver (${penAg}%):   ${pensionAg.toFixed(2)} kr.`,
        `  ATP arbejdsgiver:               ${atpAg.toFixed(2)} kr.`,
        `  Feriepenge (12,5%):             ${(brutto * 0.125).toFixed(2)} kr.`,
        `  ─────────────────────────────`,
        `  **Samlet loenomkostning:        ${(brutto + pensionAg + atpAg + brutto * 0.125).toFixed(2)} kr.**`,
        ``,
        `**Til indberetning/betaling:**`,
        `  A-skat til SKAT:                ${aSkat.toFixed(2)} kr.`,
        `  AM-bidrag til SKAT:             ${amBidrag.toFixed(2)} kr.`,
        `  ATP til ATP:                    ${atpTotal.toFixed(2)} kr.`,
        `  Pension til pensionsselskab:    ${(pensionLm + pensionAg).toFixed(2)} kr.`,
      ];

      return textResult(parts.join("\n"));
    },
  );

  server.tool(
    "loen_satser",
    "Alle aktuelle loensatser: AM-bidrag, ATP, feriepenge, koerselsgodtgoerelse, kost, logi.",
    { type: z.string().optional().describe("'am', 'atp', 'ferie', 'koersel', 'kost', 'logi', 'alle'. Standard: alle") },
    async ({ type }) => {
      const t = (type ?? "alle").toLowerCase();
      if (t === "alle") return textResult(`**Alle loensatser 2026:**\n\n${jsonText(loenDb)}`);
      if (t === "am") return textResult(`**AM-bidrag:**\n\n${jsonText(loenDb.am_bidrag)}`);
      if (t === "atp") return textResult(`**ATP:**\n\n${jsonText(loenDb.atp)}`);
      if (t === "ferie") return textResult(`**Feriepenge:**\n\n${jsonText(loenDb.feriepenge)}`);
      if (t === "koersel") return textResult(`**Koerselsgodtgoerelse:**\n\n${jsonText(loenDb.koerselsgodtgoerelse)}`);
      if (t === "kost") return textResult(`**Kostgodtgoerelse:**\n\n${jsonText(loenDb.diaetkost)}`);
      if (t === "logi") return textResult(`**Logigodtgoerelse:**\n\n${jsonText(loenDb.logigodtgoerelse)}`);
      return textResult(`Ukendt type "${type}". Proev: am, atp, ferie, koersel, kost, logi, alle.`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  5. AARSAFSLUTNING                       ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "aarsafslutning_tjekliste",
    "Komplet tjekliste for aarsafslutning med forklaringer og lovhenvisninger.",
    {
      virksomhedstype: z.string().optional().describe("'aps', 'emv', 'as'. Standard: aps"),
      regnskabsaar: z.number().optional().describe("Regnskabsaar (standard: forrige aar)"),
    },
    async ({ virksomhedstype, regnskabsaar }) => {
      const vt = (virksomhedstype ?? "aps").toLowerCase();
      const aar = regnskabsaar ?? new Date().getFullYear() - 1;
      const isSelskab = vt === "aps" || vt === "as";

      const steps = [
        { nr: 1, opgave: "Bankafsteming", beskrivelse: `Afstem alle bankkonti pr. 31/12-${aar}. Saldo i bogfoering skal stemme med kontoudtog.`, krav: "alle" },
        { nr: 2, opgave: "Kasseafsteming", beskrivelse: "Afstem kassebeholdning hvis relevant. Fysisk optaelling.", krav: "alle" },
        { nr: 3, opgave: "Debitorer", beskrivelse: "Gennemgaa alle udestaaeende fakturaer. Nedskriv uerholdelige (konto 4800).", krav: "alle" },
        { nr: 4, opgave: "Kreditorer", beskrivelse: "Afstem leverandoerkonti. Bogfoer skyldige men ubetalte fakturaer.", krav: "alle" },
        { nr: 5, opgave: "Varelager", beskrivelse: `Fysisk optaelling pr. 31/12-${aar}. Vaerdiansaet til kostpris eller nettorealisationsvaerdi (laveste). Aarsregnskabsloven §44.`, krav: "alle" },
        { nr: 6, opgave: "Igangvaerende arbejder", beskrivelse: "Opgoerelse af udfoert men ufaktureret arbejde ved aarets udgang.", krav: "alle" },
        { nr: 7, opgave: "Periodisering — forudbetalinger", beskrivelse: `Forudbetalte omkostninger (forsikring, husleje) der daekker perioden efter 31/12-${aar} bogfoeres paa konto 12600.`, krav: "alle" },
        { nr: 8, opgave: "Periodisering — skyldige omkostninger", beskrivelse: `Omkostninger der vedhører ${aar} men foerst betales i ${aar + 1} bogfoeres paa konto 15800.`, krav: "alle" },
        { nr: 9, opgave: "Afskrivninger", beskrivelse: `Beregn aarets afskrivninger paa driftsmidler, IT, koeretoejer. Saldoafskrivning: 25% paa driftsmidler, 15% paa bygninger. Afskrivningsloven §5-7.`, krav: "alle" },
        { nr: 10, opgave: "Momsafsteming", beskrivelse: "Afstem momskonto (15200) mod indberettet moms for alle perioder. Bogfoeringslovens §11.", krav: "alle" },
        { nr: 11, opgave: "Loenafsteming", beskrivelse: "Afstem loenposteringer mod eIndkomst-indberetninger for hele aaret.", krav: "alle" },
        { nr: 12, opgave: "A-skat/AM-bidrag afsteming", beskrivelse: "Afstem konto 15300/15310 mod indberettet og betalt A-skat/AM-bidrag.", krav: "alle" },
      ];

      if (isSelskab) {
        steps.push(
          { nr: 13, opgave: "Selskabsskat", beskrivelse: `Beregn skyldig selskabsskat (22%). Modregn acontobetalinger. Bogfoer paa konto 8000/15400.`, krav: "selskab" },
          { nr: 14, opgave: "Udskudt skat", beskrivelse: "Beregn udskudt skat paa midlertidige forskelle (konto 14000). 22% af forskellen mellem regnskab og skat.", krav: "selskab" },
          { nr: 15, opgave: "Aarsrapport", beskrivelse: `Udarbejd resultatopgoerelse, balance og noter. Frist: 31/5-${aar + 1}. Aarsregnskabsloven.`, krav: "selskab" },
          { nr: 16, opgave: "Indberetning Erhvervsstyrelsen", beskrivelse: `Upload aarsrapport via regnskab.virk.dk. Frist: 31/5-${aar + 1}.`, krav: "selskab" },
          { nr: 17, opgave: "Selskabsselvangivelse", beskrivelse: `Indberetning via TastSelv Erhverv. Frist: 30/6-${aar + 1}.`, krav: "selskab" },
        );
      } else {
        steps.push(
          { nr: 13, opgave: "Privat/erhverv afgraensning", beskrivelse: "Afstem mellemregning/privatkonto (13300). Saerligt vigtigt ved virksomhedsordningen.", krav: "emv" },
          { nr: 14, opgave: "Virksomhedsordningen", beskrivelse: "Opgoerelse af kapitalafkastgrundlag, opsparing, haeveraekkefoelge. Virksomhedsskatteloven §2-10.", krav: "emv" },
          { nr: 15, opgave: "Selvangivelse", beskrivelse: `Indberetning via TastSelv. Frist: 1/7-${aar + 1} (udvidet).`, krav: "emv" },
        );
      }

      const formatted = steps
        .map((s) => `${s.nr}. [ ] **${s.opgave}**\n   ${s.beskrivelse}`)
        .join("\n\n");

      return textResult(
        `**Aarsafslutning ${aar} — ${vt.toUpperCase()}**\n` +
        `Regnskabsaar: 1/1-${aar} til 31/12-${aar}\n\n` +
        formatted,
      );
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  6. FEJLDETEKTION                        ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "tjek_bilag",
    "Tjek et bilag for typiske bogfoeringsfejl. Beskriv kontering og beloeb.",
    {
      konto: z.string().describe("Kontonummer, f.eks. '4100'"),
      momskode: z.string().optional().describe("Momskode fra kontoplan, f.eks. 'koeb_25'"),
      beloeb: z.number().optional().describe("Beloeb inkl. moms"),
      beskrivelse: z.string().optional().describe("Beskrivelse af bilaget"),
    },
    async ({ konto, momskode, beloeb, beskrivelse }) => {
      const advarsler: string[] = [];
      const b = (beskrivelse ?? "").toLowerCase();

      // Find kontoen
      const allKonti = [...kontoplanDb.resultat, ...kontoplanDb.balance];
      const kontoMatch = allKonti.find((k) => k.konto === konto);

      if (!kontoMatch) {
        advarsler.push(`⚠ Konto ${konto} findes ikke i standardkontoplanen.`);
      } else {
        // Tjek moms-mismatch
        const forventetMoms = kontoMatch.moms;
        if (momskode && forventetMoms && momskode !== forventetMoms) {
          const forventetInfo = kontoplanDb.momskoder[forventetMoms];
          advarsler.push(
            `⚠ MOMSFEJL: Konto ${konto} (${kontoMatch.navn}) forventer momskode "${forventetMoms}" ` +
            `(${forventetInfo?.beskrivelse ?? ""}), men du bruger "${momskode}".`,
          );
        }
      }

      // Restaurant/repr paa forkert konto
      if ((b.includes("restaurant") || b.includes("frokost") || b.includes("middag")) && !["3600", "3700"].includes(konto)) {
        advarsler.push("⚠ Restaurant/forplejning boer bogfoeres paa konto 3700 (25% momsfradrag), ikke " + konto + ".");
      }

      // Repraesentation uden nok info
      if (b.includes("repraesentation") && !b.includes("gaest") && !b.includes("deltager")) {
        advarsler.push("⚠ Repraesentation kraever dokumentation af deltagere og formaal. Notér navne og anledning paa bilaget.");
      }

      // Forsikring med moms
      if (b.includes("forsikring") && momskode && momskode !== "ingen_momsfri") {
        advarsler.push("⚠ Forsikring er momsfritaget (ML §13). Der boer ikke vaere moms paa fakturaen. Tjek bilaget.");
      }

      // Personbil med momsfradrag
      if ((b.includes("personbil") || b.includes("privatbil")) && momskode && momskode === "koeb_25") {
        advarsler.push("⚠ PERSONBIL: 0% momsfradrag paa personbiler (ML §41). Kun varebiler med gule plader har fuldt fradrag.");
      }

      // Privat udgift paa erhvervskonto
      if (b.includes("privat") && konto.startsWith("4")) {
        advarsler.push("⚠ Private udgifter maa IKKE bogfoeres paa erhvervskonti. Brug konto 13300 (Privat) for EMV eller mellemregning.");
      }

      // Beloebstjek
      if (beloeb && beloeb > 10000 && (b.includes("kontant") || b.includes("kasse"))) {
        advarsler.push("⚠ Kontantbetaling over 10.000 kr. kraever saerlig dokumentation og kan vaere i strid med hvidvaskreglerne.");
      }

      if (advarsler.length === 0) {
        return textResult(
          `✓ Ingen advarsler fundet.\n\n` +
          `Konto: ${konto}${kontoMatch ? ` — ${kontoMatch.navn}` : ""}\n` +
          `Momskode: ${momskode ?? "ikke angivet"}\n` +
          (beloeb ? `Beloeb: ${beloeb} kr.` : ""),
        );
      }

      return textResult(
        `**${advarsler.length} advarsel(er) fundet:**\n\n` +
        advarsler.join("\n\n") +
        `\n\n---\nKonto: ${konto}${kontoMatch ? ` — ${kontoMatch.navn}` : ""}\n` +
        `Momskode: ${momskode ?? "ikke angivet"}`,
      );
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BOGFOERER-INIT                          ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "bogfoerer_init",
    "Opret mappestruktur og skabelonfiler for en ny bogfoeringsklient. Opretter kontoplan, tjeklister og konfiguration.",
    {
      firmanavn: z.string().describe("Firmanavn, f.eks. 'Hansen Consulting ApS'"),
      cvr: z.string().optional().describe("CVR-nummer"),
      virksomhedstype: z.string().optional().describe("'aps', 'emv', 'as', 'is'. Standard: aps"),
      momsperiode: z.string().optional().describe("'halvaar', 'kvartal', 'maaned'. Standard: halvaar"),
      branche: z.string().optional().describe("Branche, f.eks. 'konsulent', 'handel', 'haandvaerker'"),
      sti: z.string().describe("Sti hvor mappen skal oprettes, f.eks. '/Users/dig/klienter'"),
    },
    async ({ firmanavn, cvr, virksomhedstype, momsperiode, branche, sti }) => {
      const vt = virksomhedstype ?? "aps";
      const mp = momsperiode ?? "halvaar";
      const slug = firmanavn.toLowerCase().replace(/[^a-z0-9æøåäöü]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const baseDir = join(sti, slug);

      if (existsSync(baseDir)) {
        return textResult(`Mappen "${baseDir}" eksisterer allerede. Vaelg en anden sti.`);
      }

      // Opret mappestruktur
      const dirs = [
        baseDir,
        join(baseDir, "bilag", "indgaaende"),
        join(baseDir, "bilag", "udgaaende"),
        join(baseDir, "bank"),
        join(baseDir, "loen"),
        join(baseDir, "moms"),
        join(baseDir, "aarsafslutning"),
        join(baseDir, "rapporter"),
      ];

      for (const dir of dirs) {
        await mkdir(dir, { recursive: true });
      }

      // Klient-konfiguration
      const config = {
        firmanavn,
        cvr: cvr ?? "UDFYLD",
        virksomhedstype: vt,
        momsperiode: mp,
        branche: branche ?? "generel",
        regnskabsaar: "kalenderaar",
        oprettet: new Date().toISOString().slice(0, 10),
        bogfoeringssystem: "UDFYLD (e-conomic, Dinero, Billy, Uniconta)",
        kontaktperson: "UDFYLD",
        email: "UDFYLD",
        noter: "",
      };
      await writeFile(join(baseDir, "config.json"), JSON.stringify(config, null, 2), "utf-8");

      // Kontoplan (kopi)
      await writeFile(join(baseDir, "kontoplan.json"), JSON.stringify(kontoplanDb, null, 2), "utf-8");

      // Maanedlig tjekliste
      const maanedligTjekliste = [
        "# Maanedlig bogfoeringstjekliste",
        `Firma: ${firmanavn}`,
        `Maaned: ___________`,
        "",
        "## Bilag",
        "- [ ] Alle koebsbilag modtaget og registreret",
        "- [ ] Alle salgsfakturaer udstedt og registreret",
        "- [ ] Bilag konteret med korrekt konto og momskode",
        "",
        "## Bank",
        "- [ ] Bankafsteming gennemfoert",
        "- [ ] Alle differencer afklaret",
        "",
        "## Loen",
        "- [ ] Loenkoersel gennemfoert",
        "- [ ] A-skat og AM-bidrag indberettet til eIndkomst",
        "- [ ] A-skat/AM-bidrag betalt inden frist",
        "- [ ] ATP indberettet",
        "",
        "## Moms",
        mp === "maaned" ? "- [ ] Momsindberetning indsendt" : "- [ ] Momskonti afstemt (indberetning ved periodens slutning)",
        "",
        "## Oevigt",
        "- [ ] Debitorkonti gennemgaaet",
        "- [ ] Kreditorkonti afstemt",
        "- [ ] Eventuelle nye aktiver registreret",
      ].join("\n");
      await writeFile(join(baseDir, "maanedlig_tjekliste.md"), maanedligTjekliste, "utf-8");

      // Frister
      const fristerTekst = [
        `# Indberetningsfrister 2026`,
        `Firma: ${firmanavn}`,
        `Virksomhedstype: ${vt.toUpperCase()}`,
        `Momsperiode: ${mp}`,
        "",
        `## Moms (${mp})`,
      ];

      const momsData = (deadlinesDb.moms as Record<string, Record<string, unknown>>)[mp];
      if (momsData) {
        const perioder = momsData.perioder as Array<{ periode: string; frist: string }> | undefined;
        if (perioder) {
          for (const p of perioder) {
            fristerTekst.push(`- ${p.periode}: **${p.frist}**`);
          }
        }
      }

      fristerTekst.push("", "## A-skat/AM-bidrag");
      fristerTekst.push("Den 10. i foelgende maaned (smaa/mellemstore)");

      if (vt === "aps" || vt === "as") {
        fristerTekst.push("", "## Selskabsskat");
        for (const s of deadlinesDb.selskabsskat) {
          fristerTekst.push(`- ${s.opgave}: **${s.frist}**`);
        }
        fristerTekst.push("", "## Aarsrapport");
        fristerTekst.push("- Frist Erhvervsstyrelsen: **31. maj**");
        fristerTekst.push("- Selskabsselvangivelse: **30. juni**");
      } else {
        fristerTekst.push("", "## B-skat");
        fristerTekst.push("10 rater den 20. i maaneden (jan-maj + aug-dec)");
        fristerTekst.push("", "## Selvangivelse");
        fristerTekst.push("- Udvidet selvangivelse: **1. juli**");
      }

      await writeFile(join(baseDir, "frister_2026.md"), fristerTekst.join("\n"), "utf-8");

      // Overblik
      const overblik = [
        `# ${firmanavn}`,
        "",
        `| Felt | Vaerdi |`,
        `|------|--------|`,
        `| CVR | ${cvr ?? "UDFYLD"} |`,
        `| Type | ${vt.toUpperCase()} |`,
        `| Momsperiode | ${mp} |`,
        `| Branche | ${branche ?? "generel"} |`,
        `| Regnskabsaar | Kalenderaar |`,
        "",
        "## Mappestruktur",
        "```",
        `${slug}/`,
        "├── config.json          # Klientkonfiguration",
        "├── kontoplan.json       # Standardkontoplan med momskoder",
        "├── maanedlig_tjekliste.md",
        "├── frister_2026.md      # Alle indberetningsfrister",
        "├── bilag/",
        "│   ├── indgaaende/      # Koebsfakturaer, kvitteringer",
        "│   └── udgaaende/       # Salgsfakturaer",
        "├── bank/                # Kontoudtog og afstemninger",
        "├── loen/                # Loensedler, eIndkomst",
        "├── moms/                # Momsindberetninger",
        "├── aarsafslutning/      # Aarsskifte-dokumenter",
        "└── rapporter/           # Perioderegnskaber, rapporter",
        "```",
      ].join("\n");
      await writeFile(join(baseDir, "README.md"), overblik, "utf-8");

      return textResult(
        `**Klient oprettet: ${firmanavn}**\n\n` +
        `Sti: ${baseDir}\n\n` +
        `Oprettet filer:\n` +
        `  config.json — klientkonfiguration (UDFYLD felter)\n` +
        `  kontoplan.json — standardkontoplan med momskoder\n` +
        `  maanedlig_tjekliste.md — maanedlig bogfoeringstjekliste\n` +
        `  frister_2026.md — alle indberetningsfrister for ${vt.toUpperCase()}\n` +
        `  README.md — overblik\n\n` +
        `Mapper: bilag/indgaaende, bilag/udgaaende, bank, loen, moms, aarsafslutning, rapporter\n\n` +
        `Naeste skridt: Udfyld config.json med CVR, bogfoeringssystem og kontaktinfo.`,
      );
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  START SERVER                            ║
  // ╚══════════════════════════════════════════╝

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal fejl:", error);
  process.exit(1);
});
