/**
 * Billy.dk API klient
 * Docs: https://www.billy.dk/api
 * Base URL: https://api.billysbilling.com/v2
 */

const BASE_URL = "https://api.billysbilling.com/v2";

function getToken(): string {
  const token = process.env.BILLY_API_TOKEN;
  if (!token) {
    throw new Error("BILLY_API_TOKEN environment variable er ikke sat. Generér et token i Billy: Indstillinger → Adgangstokens.");
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

// ─── Regninger (køb) ───

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
// Billy bankLines: KRÆVER accountId parameter.
// Hver banklinje har et matchId (Billy opretter automatisk en match per linje).
// "Uafstemt" = matchens isApproved er false.
// Felt-navne: accountId, feeAccountId (IKKE account/feeAccount).

export async function getBankLines(params: {
  readonly accountId: string;
  readonly pageSize?: number;
  readonly page?: number;
  readonly sortProperty?: string;
  readonly sortDirection?: string;
}): Promise<unknown> {
  return billyFetch("/bankLines", { params: { ...params, pageSize: params.pageSize ?? 200 } });
}

export async function getBankLine(id: string): Promise<unknown> {
  return billyFetch(`/bankLines/${id}`);
}

export async function getBankLineMatch(id: string): Promise<unknown> {
  return billyFetch(`/bankLineMatches/${id}`);
}

// Godkend en eksisterende match (isApproved: true finaliserer afstemningen)
export async function updateBankLineMatch(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return billyFetch(`/bankLineMatches/${id}`, {
    method: "PUT",
    body: { bankLineMatch: data },
  });
}

// Fortryd en bankafstemning: sæt isApproved=false
export async function unapproveMatch(id: string): Promise<unknown> {
  return billyFetch(`/bankLineMatches/${id}`, {
    method: "PUT",
    body: { bankLineMatch: { isApproved: false } },
  });
}

// Slet en dagbogstransaktion (voider den)
export async function voidDaybookTransaction(id: string): Promise<unknown> {
  return billyFetch(`/daybookTransactions/${id}`, {
    method: "PUT",
    body: { daybookTransaction: { state: "voided" } },
  });
}

// Hent subject associations for en match
export async function getSubjectAssociations(matchId: string): Promise<unknown> {
  return billyFetch("/bankLineSubjectAssociations", { params: { matchId, pageSize: 50 } });
}

// Slet en subject association
export async function deleteSubjectAssociation(id: string): Promise<unknown> {
  return billyFetch(`/bankLineSubjectAssociations/${id}`, { method: "DELETE" });
}

// Hent uknyttede bilag (ownerReference=null — sendt via Shine men ikke matchet)
export async function getUnlinkedAttachments(): Promise<unknown> {
  const result = await billyFetch("/attachments", { params: { pageSize: 100 } }) as Record<string, unknown>;
  const all = (result.attachments ?? []) as Array<Record<string, unknown>>;
  const unlinked = all.filter((a) => !a.ownerId);
  return { attachments: unlinked, total: unlinked.length, allTotal: all.length };
}

// Hent fil-detaljer inkl. download-URL
export async function getFile(fileId: string): Promise<unknown> {
  return billyFetch(`/files/${fileId}`);
}

// Knyt et bilag til en regning (bill)
export async function linkAttachmentToBill(attachmentId: string, billId: string): Promise<unknown> {
  return billyFetch(`/attachments/${attachmentId}`, {
    method: "PUT",
    body: { attachment: { ownerId: billId, ownerReference: `bill:${billId}` } },
  });
}

export async function getBankLineMatches(params?: {
  readonly isApproved?: boolean;
  readonly pageSize?: number;
  readonly page?: number;
}): Promise<unknown> {
  return billyFetch("/bankLineMatches", { params: { ...params, pageSize: params?.pageSize ?? 100 } });
}

// Felt hedder "matchId" (IKKE "bankLineMatchId") — verificeret via live API test.
// ALDRIG brug daybookTransaction som subjectReference — crasher Billy UI.
// KUN invoice:ID eller bill:ID er gyldige.
export async function createSubjectAssociation(data: {
  readonly matchId: string;
  readonly subjectReference: string;
  readonly amount?: number;
}): Promise<unknown> {
  if (data.subjectReference.includes("daybookTransaction")) {
    throw new Error("⛔ daybookTransaction kan IKKE bruges som subject reference — crasher Billy UI. Brug invoice:ID eller bill:ID.");
  }
  return billyFetch("/bankLineSubjectAssociations", {
    method: "POST",
    body: { bankLineSubjectAssociation: data },
  });
}

// Godkend en dagbogstransaktion (state: "approved") — SKAL ske før bankmatch godkendes.
export async function approveDaybookTransaction(id: string): Promise<unknown> {
  return billyFetch(`/daybookTransactions/${id}`, {
    method: "PUT",
    body: { daybookTransaction: { state: "approved" } },
  });
}

// ─── Find uafstemte banklinjer ───
// Hent banklinjer, tjek hver linjes match for isApproved=false.
export async function getUnreconciledBankLines(accountId: string): Promise<unknown> {
  // Hent alle banklinjer (op til 500 fordelt på sider)
  const allLines: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 5) {
    const result = await billyFetch("/bankLines", {
      params: { accountId, pageSize: 200, page, sortProperty: "entryDate", sortDirection: "DESC" },
    }) as Record<string, unknown>;
    const lines = (result.bankLines ?? []) as Array<Record<string, unknown>>;
    allLines.push(...lines);
    const paging = (result.meta as Record<string, unknown>)?.paging as Record<string, unknown> | undefined;
    hasMore = page < (paging?.pageCount as number ?? 1);
    page++;
  }

  // Tjek hver linjes match
  const unreconciled: Array<Record<string, unknown>> = [];
  const checked = new Set<string>();

  for (const line of allLines) {
    const matchId = line.matchId as string | null;
    if (!matchId) {
      unreconciled.push(line);
      continue;
    }
    if (checked.has(matchId)) continue;
    checked.add(matchId);

    try {
      const matchResult = await billyFetch(`/bankLineMatches/${matchId}`) as Record<string, unknown>;
      const match = matchResult.bankLineMatch as Record<string, unknown> | undefined;
      if (match && match.isApproved === false) {
        unreconciled.push(line);
      }
    } catch {
      // Kan ikke hente match — antag uafstemt
      unreconciled.push(line);
    }
  }

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

// VIGTIGT: Hver linje SKAL have currencyId (typisk "DKK").
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
    readonly currencyId?: string;
  }[];
}): Promise<unknown> {
  // Tilføj currencyId=DKK på linjer der mangler det
  const linesWithCurrency = data.lines.map((line) => ({
    ...line,
    currencyId: line.currencyId ?? "DKK",
  }));
  return billyFetch("/daybookTransactions", {
    method: "POST",
    body: { daybookTransaction: { ...data, lines: linesWithCurrency } },
  });
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
  return billyFetch("/postings", { params: { ...params, pageSize: params?.pageSize ?? 20 } });
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
