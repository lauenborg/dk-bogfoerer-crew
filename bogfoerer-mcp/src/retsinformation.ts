/**
 * Klient til Retsinformation API (retsinformation-api.dk)
 * Giver adgang til danske love, paragraffer og aendringshistorik.
 */

const BASE_URL = "https://retsinformation-api.dk/v1";

interface FetchOptions {
  readonly path: string;
  readonly params?: Record<string, string | number | boolean | undefined>;
}

async function apiFetch({ path, params }: FetchOptions): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Retsinformation API fejl: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

// ─── Love ───

export async function searchLaws(options: {
  readonly search?: string;
  readonly year?: number;
  readonly ressort?: string;
  readonly skip?: number;
  readonly limit?: number;
}): Promise<unknown> {
  return apiFetch({
    path: "/lovgivning/",
    params: {
      search: options.search,
      year: options.year,
      ressort: options.ressort,
      skip: options.skip ?? 0,
      limit: options.limit ?? 20,
    },
  });
}

export async function getLaw(year: number, number: number, include?: string): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${number}`,
    params: include ? { include } : undefined,
  });
}

export async function getLawMarkdown(
  year: number,
  num: number,
  options?: { readonly paragraphs?: string; readonly exclude?: string },
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/markdown`,
    params: options,
  });
}

export async function getLatestLawMarkdown(
  year: number,
  num: number,
  options?: { readonly paragraphs?: string; readonly exclude?: string },
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions/latest/markdown`,
    params: options,
  });
}

// ─── Paragraffer ───

export async function getParagraph(
  year: number,
  num: number,
  paragraph: string,
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/paragraphs/${paragraph}`,
  });
}

export async function getParagraphStk(
  year: number,
  num: number,
  paragraph: string,
  stk: number,
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/paragraphs/${paragraph}/stk/${stk}`,
  });
}

// ─── Versioner og historik ───

export async function getLatestVersion(year: number, num: number): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions/latest`,
  });
}

export async function getLawAtDate(
  year: number,
  num: number,
  targetDate: string,
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions/at/${targetDate}`,
  });
}

export async function getLawAtDateMarkdown(
  year: number,
  num: number,
  targetDate: string,
  options?: { readonly paragraphs?: string; readonly exclude?: string },
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions/at/${targetDate}/markdown`,
    params: options,
  });
}

export async function getLawAmendments(
  year: number,
  num: number,
  options?: { readonly skip?: number; readonly limit?: number },
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/amendments`,
    params: options,
  });
}

export async function getLawVersions(
  year: number,
  num: number,
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions`,
  });
}

export async function getVersionDiff(
  year: number,
  num: number,
  v1: number,
  v2: number,
): Promise<unknown> {
  return apiFetch({
    path: `/lovgivning/${year}/${num}/versions/diff/${v1}/${v2}`,
  });
}

// ─── Lovforslag (bills) ───

export async function searchBills(options: {
  readonly search?: string;
  readonly status?: string;
  readonly enacted?: boolean;
  readonly skip?: number;
  readonly limit?: number;
}): Promise<unknown> {
  return apiFetch({
    path: "/lovgivning/bills/",
    params: {
      search: options.search,
      status: options.status,
      enacted: options.enacted,
      skip: options.skip ?? 0,
      limit: options.limit ?? 20,
    },
  });
}

// ─── Velkendte danske love (bogfoerer-relevante) ───

// Konsoliderede lovbekendtgoerelsesnumre (LBKH) fra Retsinformation API.
// API'et bruger disse numre — IKKE de originale lovnumre.
export const KNOWN_LAWS: Record<string, { readonly year: number; readonly number: number; readonly name: string }> = {
  momsloven:             { year: 2024, number: 209,   name: "Momsloven" },
  kildeskatteloven:      { year: 2024, number: 460,   name: "Kildeskatteloven" },
  personskatteloven:     { year: 2021, number: 1284,  name: "Personskatteloven" },
  ligningsloven:         { year: 2025, number: 1500,  name: "Ligningsloven" },
  selskabsskatteloven:   { year: 2025, number: 279,   name: "Selskabsskatteloven" },
  virksomhedsskatteloven:{ year: 2021, number: 1836,  name: "Virksomhedsskatteloven" },
  bogfoeringsloven:      { year: 2022, number: 700,   name: "Bogfoeringsloven" },
  aarsregnskabsloven:    { year: 2024, number: 1057,  name: "Aarsregnskabsloven" },
  skatteforvaltningsloven:{ year: 2025, number: 1228, name: "Skatteforvaltningsloven" },
  afskrivningsloven:     { year: 2025, number: 1222,  name: "Afskrivningsloven" },
  aktieavancebeskatningsloven: { year: 2025, number: 1098, name: "Aktieavancebeskatningsloven" },
};
