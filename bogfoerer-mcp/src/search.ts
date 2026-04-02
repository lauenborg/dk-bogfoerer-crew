import type { MomsDatabase, SkatDatabase, SearchResult } from "./types.js";

/**
 * Normaliserer tekst til lowercase og haandterer dansk ae/oe/aa
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa");
}

/**
 * Tokeniserer en soeegestreng til individuelle ord
 */
function tokenize(query: string): readonly string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function containsToken(text: string, token: string): boolean {
  return normalize(text).includes(token);
}

function extractStrings(obj: unknown): readonly string[] {
  const results: string[] = [];
  if (typeof obj === "string") {
    results.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) results.push(...extractStrings(item));
  } else if (typeof obj === "object" && obj !== null) {
    for (const value of Object.values(obj)) results.push(...extractStrings(value));
  }
  return results;
}

function scoreObject(obj: Record<string, unknown>, tokens: readonly string[], titleKey: string): number {
  let score = 0;
  const title = typeof obj[titleKey] === "string" ? obj[titleKey] as string : "";
  const keywords = Array.isArray(obj.keywords) ? obj.keywords as string[] : [];
  const description = typeof obj.description === "string" ? obj.description as string : "";
  const allText = extractStrings(obj).join(" ");

  for (const token of tokens) {
    if (title && containsToken(title, token)) score += 10;
    if (keywords.some((kw) => containsToken(kw, token))) score += 5;
    if (description && containsToken(description, token)) score += 3;
    if (containsToken(allText, token)) score += 1;
  }
  return score;
}

// ─── Samlet soegning paa tvaers af moms OG skat ───

export function searchAll(
  momsDb: MomsDatabase,
  skatDb: SkatDatabase,
  query: string,
): readonly SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];

  // === MOMS ===

  for (const rule of momsDb.rules) {
    let score = 0;
    for (const token of tokens) {
      if (containsToken(rule.title, token)) score += 10;
      if (rule.keywords.some((kw) => containsToken(kw, token))) score += 5;
      if (containsToken(rule.description, token)) score += 3;
      if (containsToken(rule.details, token)) score += 1;
    }
    if (score > 0) {
      results.push({
        title: rule.title,
        category: rule.category,
        description: rule.description + (rule.details ? "\n" + rule.details : ""),
        score,
        law_reference: rule.law_reference,
        source: "moms/rules",
      });
    }
  }

  for (const d of momsDb.deductions) {
    let score = 0;
    for (const token of tokens) {
      if (containsToken(d.category, token)) score += 10;
      if (d.keywords.some((kw) => containsToken(kw, token))) score += 5;
      if (containsToken(d.description, token)) score += 3;
      if (containsToken(d.conditions, token)) score += 1;
    }
    if (score > 0) {
      results.push({
        title: `Momsfradrag: ${d.category} (${d.rate}%)`,
        category: "momsfradrag",
        description: `${d.description}\nBetingelser: ${d.conditions}`,
        score,
        law_reference: d.law_reference,
        source: "moms/deductions",
      });
    }
  }

  for (const e of momsDb.exemptions) {
    let score = 0;
    for (const token of tokens) {
      if (containsToken(e.category, token)) score += 10;
      if (e.keywords.some((kw) => containsToken(kw, token))) score += 5;
      if (containsToken(e.description, token)) score += 3;
    }
    if (score > 0) {
      results.push({
        title: `Momsfritagelse: ${e.category}`,
        category: "momsfritagelse",
        description: e.description,
        score,
        law_reference: e.law_reference,
        source: "moms/exemptions",
      });
    }
  }

  for (const s of momsDb.special_schemes) {
    let score = 0;
    for (const token of tokens) {
      if (containsToken(s.name, token)) score += 10;
      if (s.keywords.some((kw) => containsToken(kw, token))) score += 5;
      if (containsToken(s.description, token)) score += 3;
    }
    if (score > 0) {
      results.push({
        title: `Saerordning: ${s.name}`,
        category: "momssaerordning",
        description: s.description,
        score,
        law_reference: s.law_reference,
        source: "moms/special_schemes",
      });
    }
  }

  for (const c of momsDb.changes_2026) {
    let score = 0;
    for (const token of tokens) {
      if (containsToken(c.title, token)) score += 10;
      if (c.keywords.some((kw) => containsToken(kw, token))) score += 5;
      if (containsToken(c.description, token)) score += 3;
    }
    if (score > 0) {
      results.push({
        title: `Momsaendring 2026: ${c.title}`,
        category: "momsaendringer",
        description: `${c.description}\nIkrafttraeden: ${c.effective_date}`,
        score,
        law_reference: c.law_reference,
        source: "moms/changes_2026",
      });
    }
  }

  for (const [key, value] of Object.entries(momsDb.international)) {
    const allText = extractStrings(value).join(" ");
    let score = 0;
    for (const token of tokens) {
      if (containsToken(key, token)) score += 10;
      if (containsToken(allText, token)) score += 3;
    }
    if (score > 0) {
      const description = typeof value === "object" && value !== null
        ? (value as Record<string, unknown>).description as string ?? allText.slice(0, 500)
        : String(value).slice(0, 500);
      results.push({
        title: `EU/International: ${key}`,
        category: "international",
        description,
        score,
        law_reference: typeof value === "object" && value !== null
          ? String((value as Record<string, unknown>).law_reference ?? "")
          : "",
        source: "moms/international",
      });
    }
  }

  for (const [key, value] of Object.entries(momsDb.vehicles)) {
    const allText = extractStrings(value).join(" ");
    let score = 0;
    for (const token of tokens) {
      if (containsToken(key, token)) score += 8;
      if (containsToken(allText, token)) score += 3;
    }
    if (score > 0) {
      results.push({
        title: `Biler (moms): ${key}`,
        category: "biler",
        description: allText.slice(0, 500),
        score,
        law_reference: "",
        source: "moms/vehicles",
      });
    }
  }

  // === SKAT ===

  for (const rule of skatDb.rules) {
    const score = scoreObject(rule as unknown as Record<string, unknown>, tokens, "title");
    if (score > 0) {
      results.push({
        title: rule.title,
        category: rule.category,
        description: rule.description,
        score,
        law_reference: "",
        source: "skat/rules",
      });
    }
  }

  for (const d of skatDb.deductions) {
    const score = scoreObject(d as unknown as Record<string, unknown>, tokens, "name");
    if (score > 0) {
      results.push({
        title: `Skattefradrag: ${d.name}`,
        category: "skattefradrag",
        description: `${d.description}\nSats: ${d.rate_percent ?? "—"}%, Maks: ${d.max_amount ?? "—"} kr.\nBetingelser: ${d.conditions}`,
        score,
        law_reference: d.law_reference,
        source: "skat/deductions",
      });
    }
  }

  for (const p of skatDb.pension) {
    const score = scoreObject(p as unknown as Record<string, unknown>, tokens, "type");
    if (score > 0) {
      results.push({
        title: `Pension: ${p.type}`,
        category: "pension",
        description: `${p.description}\nMaks. fradrag: ${p.max_deduction ?? "Intet loft"} kr.`,
        score,
        law_reference: p.law_reference,
        source: "skat/pension",
      });
    }
  }

  for (const b of skatDb.employee_benefits) {
    const score = scoreObject(b as unknown as Record<string, unknown>, tokens, "name");
    if (score > 0) {
      results.push({
        title: `Personalegode: ${b.name}`,
        category: "personalegoder",
        description: b.description,
        score,
        law_reference: b.law_reference,
        source: "skat/employee_benefits",
      });
    }
  }

  for (const c of skatDb.changes_2026) {
    const score = scoreObject(c as unknown as Record<string, unknown>, tokens, "title");
    if (score > 0) {
      results.push({
        title: `Skatteaendring 2026: ${c.title}`,
        category: "skatteaendringer",
        description: `${c.description}\nIkrafttraeden: ${c.effective_date}`,
        score,
        law_reference: c.law_reference,
        source: "skat/changes_2026",
      });
    }
  }

  const recordSections: Array<[string, Record<string, unknown>, string]> = [
    ["indkomstskat", skatDb.income_tax, "skat"],
    ["kapitalindkomst", skatDb.capital_income, "skat"],
    ["aktieindkomst", skatDb.share_income, "skat"],
    ["ejendomsskat", skatDb.property_tax, "skat"],
    ["selskabsskat", skatDb.corporate_tax, "skat"],
    ["virksomhedsordningen", skatDb.virksomhedsordningen, "skat"],
    ["arv_og_gave", skatDb.inheritance_gift, "skat"],
    ["rejsegodtgoerelse", skatDb.travel_allowances, "skat"],
  ];

  for (const [sectionName, section, domain] of recordSections) {
    const allText = extractStrings(section).join(" ");
    let score = 0;
    for (const token of tokens) {
      if (containsToken(sectionName, token)) score += 10;
      const keywords = Array.isArray(section.keywords) ? section.keywords as string[] : [];
      if (keywords.some((kw: string) => containsToken(kw, token))) score += 5;
      if (containsToken(allText, token)) score += 2;
    }
    if (score > 0) {
      const desc = typeof section.description === "string"
        ? section.description
        : allText.slice(0, 500);
      const lawRef = typeof section.law_reference === "string"
        ? section.law_reference
        : "";
      results.push({
        title: sectionName,
        category: sectionName,
        description: desc,
        score,
        law_reference: lawRef,
        source: `${domain}/${sectionName}`,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 15);
}

// ─── Generiske hjaelpefunktioner ───

export function matchByKeywords<T extends { readonly keywords: readonly string[] }>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return items.filter((item) =>
    tokens.some((token) => item.keywords.some((kw) => containsToken(kw, token))),
  );
}

export function matchByField<T>(
  items: readonly T[],
  fieldName: keyof T,
  query: string,
): readonly T[] {
  const normalizedQuery = normalize(query);
  return items.filter((item) => {
    const value = item[fieldName];
    return typeof value === "string" && normalize(value).includes(normalizedQuery);
  });
}
