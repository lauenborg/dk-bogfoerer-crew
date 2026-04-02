/**
 * Billy.dk API klient
 * Docs: https://www.billy.dk/api
 * Base URL: https://api.billysbilling.com/v2
 */

const BASE_URL = "https://api.billysbilling.com/v2";

function getToken(): string {
  const token = process.env.BILLY_API_TOKEN;
  if (!token) {
    throw new Error("BILLY_API_TOKEN environment variable er ikke sat. Generer et token i Billy: Indstillinger → Adgangstokens.");
  }
  return token;
}

interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly params?: Record<string, string | number | boolean | undefined>;
}

export async function billyFetch(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { method = "GET", body, params } = options;
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    "X-Access-Token": getToken(),
    "Accept": "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Billy API fejl ${response.status}: ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

// ─── Organisation ───

export async function getOrganization(): Promise<unknown> {
  return billyFetch("/organization");
}

// ─── Kontoplan ───

export async function getAccounts(params?: { readonly pageSize?: number }): Promise<unknown> {
  return billyFetch("/accounts", { params: { pageSize: params?.pageSize ?? 200 } });
}

export async function getAccountGroups(): Promise<unknown> {
  return billyFetch("/accountGroups", { params: { pageSize: 200 } });
}

// ─── Kontakter ───

export async function getContacts(params?: {
  readonly isCustomer?: boolean;
  readonly isSupplier?: boolean;
  readonly q?: string;
  readonly pageSize?: number;
}): Promise<unknown> {
  return billyFetch("/contacts", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

export async function getContact(id: string): Promise<unknown> {
  return billyFetch(`/contacts/${id}`);
}

export async function createContact(data: {
  readonly name: string;
  readonly type?: string;
  readonly registrationNo?: string;
  readonly isCustomer?: boolean;
  readonly isSupplier?: boolean;
  readonly countryId?: string;
  readonly paymentTermsDays?: number;
}): Promise<unknown> {
  return billyFetch("/contacts", { method: "POST", body: { contact: data } });
}

// ─── Fakturaer (salg) ───

export async function getInvoices(params?: {
  readonly contactId?: string;
  readonly state?: string;
  readonly isPaid?: boolean;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/invoices", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

export async function getInvoice(id: string): Promise<unknown> {
  return billyFetch(`/invoices/${id}`);
}

export async function createInvoice(data: Record<string, unknown>): Promise<unknown> {
  return billyFetch("/invoices", { method: "POST", body: { invoice: data } });
}

// ─── Regninger (koeb) ───

export async function getBills(params?: {
  readonly contactId?: string;
  readonly state?: string;
  readonly isPaid?: boolean;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/bills", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

export async function getBill(id: string): Promise<unknown> {
  return billyFetch(`/bills/${id}`);
}

// ─── Banklinjer ───
// NOTE: Billy API docs do NOT document filter params for bankLines.
// We fetch all and let the MCP tool layer filter client-side.
// Each bankLine has a `match` (belongs-to bankLineMatch) — if the match
// has isApproved=false, the line is "unreconciled".

export async function getBankLines(params?: {
  readonly accountId?: string;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/bankLines", { params: { ...params, pageSize: params?.pageSize ?? 200 } });
}

export async function getBankLine(id: string): Promise<unknown> {
  return billyFetch(`/bankLines/${id}`);
}

// Billy bankLineMatch: the reconciliation container.
// Required fields: account, feeAccount, entryDate, amount, side.
// `lines` is a has-many of bankLine IDs.
// isApproved=true finalizes the reconciliation.
export async function createBankLineMatch(data: {
  readonly account: string;
  readonly feeAccount: string;
  readonly entryDate: string;
  readonly amount: number;
  readonly side: string;
  readonly lines: readonly string[];
  readonly isApproved?: boolean;
  readonly subjectAssociations?: readonly Record<string, unknown>[];
}): Promise<unknown> {
  return billyFetch("/bankLineMatches", {
    method: "POST",
    body: { bankLineMatch: data },
  });
}

export async function updateBankLineMatch(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return billyFetch(`/bankLineMatches/${id}`, {
    method: "PUT",
    body: { bankLineMatch: data },
  });
}

export async function getBankLineMatches(params?: {
  readonly isApproved?: boolean;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/bankLineMatches", { params: { ...params, pageSize: params?.pageSize ?? 100 } });
}

export async function getBankLineMatch(id: string): Promise<unknown> {
  return billyFetch(`/bankLineMatches/${id}`);
}

export async function createSubjectAssociation(data: {
  readonly bankLineMatchId: string;
  readonly subjectReference: string;
  readonly amount?: number;
}): Promise<unknown> {
  return billyFetch("/bankLineSubjectAssociations", {
    method: "POST",
    body: { bankLineSubjectAssociation: data },
  });
}

// ─── Hjaelpefunktion: find uafstemte banklinjer ───
// Hent banklinjer + deres matches, filtrer paa isApproved=false
export async function getUnreconciledBankLines(accountId?: string): Promise<unknown> {
  // Hent alle banklinjer
  const linesResult = await billyFetch("/bankLines", {
    params: { accountId, pageSize: 200 },
  }) as Record<string, unknown>;
  const allLines = (linesResult.bankLines ?? []) as Array<Record<string, unknown>>;

  // Hent uafsluttede matches
  const matchesResult = await billyFetch("/bankLineMatches", {
    params: { isApproved: false, pageSize: 200 },
  }) as Record<string, unknown>;
  const unapprovedMatches = (matchesResult.bankLineMatches ?? []) as Array<Record<string, unknown>>;
  const unapprovedMatchIds = new Set(unapprovedMatches.map((m) => m.id as string));

  // Filtrer banklinjer der har en uafsluttet match (eller ingen match)
  const unreconciled = allLines.filter((line) => {
    const matchId = line.match as string | null;
    if (!matchId) return true; // Ingen match = uafstemt
    return unapprovedMatchIds.has(matchId); // Match ikke godkendt = uafstemt
  });

  return {
    bankLines: unreconciled,
    total: unreconciled.length,
    allTotal: allLines.length,
  };
}

// ─── Dagbogstransaktioner (journal entries) ───

export async function getDaybookTransactions(params?: {
  readonly daybookId?: string;
  readonly state?: string;
  readonly minEntryDate?: string;
  readonly maxEntryDate?: string;
  readonly q?: string;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/daybookTransactions", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

export async function createDaybookTransaction(data: {
  readonly daybookId: string;
  readonly entryDate: string;
  readonly description?: string;
  readonly lines: readonly {
    readonly accountId: string;
    readonly amount: number;
    readonly side: string;
    readonly text?: string;
    readonly taxRateId?: string;
  }[];
}): Promise<unknown> {
  return billyFetch("/daybookTransactions", { method: "POST", body: { daybookTransaction: data } });
}

export async function getDaybooks(): Promise<unknown> {
  return billyFetch("/daybooks");
}

// ─── Posteringer ───

export async function getPostings(params?: {
  readonly accountId?: string;
  readonly minEntryDate?: string;
  readonly maxEntryDate?: string;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/postings", { params: { ...params, pageSize: params?.pageSize ?? 100 } });
}

// ─── Moms (Sales Tax) ───

export async function getSalesTaxReturns(params?: {
  readonly isSettled?: boolean;
  readonly pageSize?: number;
}): Promise<unknown> {
  return billyFetch("/salesTaxReturns", { params: { ...params, pageSize: params?.pageSize ?? 20 } });
}

export async function getSalesTaxReturn(id: string): Promise<unknown> {
  return billyFetch(`/salesTaxReturns/${id}`);
}

export async function getTaxRates(): Promise<unknown> {
  return billyFetch("/taxRates", { params: { pageSize: 100 } });
}

// ─── Filer og bilag ───

export async function uploadFile(filename: string, contentBase64: string): Promise<unknown> {
  return billyFetch("/files", {
    method: "POST",
    body: { file: { filename, data: contentBase64 } },
  });
}

export async function createAttachment(data: {
  readonly ownerId: string;
  readonly ownerReference: string;
  readonly fileId: string;
}): Promise<unknown> {
  return billyFetch("/attachments", { method: "POST", body: { attachment: data } });
}

export async function getAttachments(params?: {
  readonly ownerId?: string;
  readonly pageSize?: number;
}): Promise<unknown> {
  return billyFetch("/attachments", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

// ─── Produkter ───

export async function getProducts(params?: {
  readonly q?: string;
  readonly pageSize?: number;
}): Promise<unknown> {
  return billyFetch("/products", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

// ─── Bank betalinger ───

export async function getBankPayments(params?: {
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/bankPayments", { params: { ...params, pageSize: params?.pageSize ?? 50 } });
}

export async function createBankPayment(data: {
  readonly contactId: string;
  readonly entryDate: string;
  readonly cashAmount: number;
  readonly cashSide: string;
  readonly cashAccountId: string;
  readonly associations: readonly Record<string, unknown>[];
}): Promise<unknown> {
  return billyFetch("/bankPayments", { method: "POST", body: { bankPayment: data } });
}
