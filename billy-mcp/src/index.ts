import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getOrganization, getAccounts, getAccountGroups,
  getContacts, getContact, createContact,
  getInvoices, getInvoice, createInvoice,
  getBills, getBill,
  getBankLines, getUnreconciledBankLines, updateBankLineMatch, getBankLineMatches, getBankLineMatch, createSubjectAssociation,
  getDaybookTransactions, createDaybookTransaction, approveDaybookTransaction, getDaybooks,
  getPostings,
  getSalesTaxReturns, getSalesTaxReturn, getTaxRates,
  uploadFile, createAttachment, getAttachments,
  getProducts,
  getBankPayments, createBankPayment,
} from "./billy-client.js";

function jsonText(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

const MAX_RESPONSE = 15_000; // Maks tegn i MCP-respons — undgå token overflow

function textResult(text: string) {
  if (text.length > MAX_RESPONSE) {
    const truncated = text.slice(0, MAX_RESPONSE);
    return { content: [{ type: "text" as const, text: truncated + `\n\n--- (afkortet fra ${text.length} tegn. Brug filtre eller paginering for mindre resultat) ---` }] };
  }
  return { content: [{ type: "text" as const, text }] };
}

async function safeCall<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await fn() };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Ukendt fejl";
    return { error: msg };
  }
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: "billy",
    version: "1.0.0",
  });

  // ╔══════════════════════════════════════════╗
  // ║  ORGANISATION                            ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_firma",
    "Hent info om firmaet i Billy (navn, CVR, adresse, regnskabsår).",
    {},
    async () => {
      const { data, error } = await safeCall(getOrganization);
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Firma i Billy:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  KONTOPLAN                               ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_kontoplan",
    "Hent kontoplan fra Billy. Viser konti kompakt (nr, navn, type, bank). Brug søg-parameter for at filtrere.",
    {
      search: z.string().optional().describe("Søg på kontonavn eller -nummer"),
      bankOnly: z.boolean().optional().describe("Kun bankkonti?"),
    },
    async ({ search, bankOnly }) => {
      const { data, error } = await safeCall(() => getAccounts({ pageSize: 500 }));
      if (error) return textResult(`Fejl: ${error}`);

      const result = data as Record<string, unknown>;
      let accounts = (result.accounts ?? []) as Array<Record<string, unknown>>;

      if (bankOnly) {
        accounts = accounts.filter((a) => a.isBankAccount === true);
      }
      if (search) {
        const q = search.toLowerCase();
        accounts = accounts.filter((a) =>
          String(a.name ?? "").toLowerCase().includes(q) ||
          String(a.accountNo ?? "").includes(q),
        );
      }

      const compact = accounts.map((a) =>
        `${a.accountNo ?? "—"} | ${a.name ?? "—"} | ${a.isBankAccount ? "BANK" : ""} | ID: ${a.id}`,
      ).join("\n");

      return textResult(`**Kontoplan (${accounts.length} konti):**\n\n${compact}`);
    },
  );

  server.tool(
    "billy_kontogrupper",
    "Hent kontogrupper fra Billy.",
    {},
    async () => {
      const { data, error } = await safeCall(getAccountGroups);
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Kontogrupper:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  KONTAKTER                               ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_kontakter",
    "Søg og list kontakter (kunder/leverandører) i Billy.",
    {
      q: z.string().optional().describe("Søg på navn"),
      isCustomer: z.boolean().optional().describe("Kun kunder?"),
      isSupplier: z.boolean().optional().describe("Kun leverandører?"),
    },
    async ({ q, isCustomer, isSupplier }) => {
      const { data, error } = await safeCall(() => getContacts({ q, isCustomer, isSupplier }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Kontakter:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_kontakt_opret",
    "Opret en ny kontakt (kunde eller leverandør) i Billy.",
    {
      name: z.string().describe("Kontaktens navn"),
      registrationNo: z.string().optional().describe("CVR-nummer"),
      isCustomer: z.boolean().optional().describe("Er det en kunde?"),
      isSupplier: z.boolean().optional().describe("Er det en leverandør?"),
      paymentTermsDays: z.number().optional().describe("Betalingsfrist i dage"),
    },
    async ({ name, registrationNo, isCustomer, isSupplier, paymentTermsDays }) => {
      const { data, error } = await safeCall(() =>
        createContact({ name, registrationNo, isCustomer, isSupplier, paymentTermsDays, type: "company" }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Kontakt oprettet:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  FAKTURAER (SALG)                        ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_fakturaer",
    "List salgsfakturaer fra Billy. Filtrer på status og betaling.",
    {
      contactId: z.string().optional().describe("Filtrer på kontakt-ID"),
      state: z.string().optional().describe("'draft' eller 'approved'"),
      isPaid: z.boolean().optional().describe("Kun betalte/ubetalte?"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ contactId, state, isPaid, page }) => {
      const { data, error } = await safeCall(() => getInvoices({ contactId, state, isPaid, page }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Fakturaer:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_faktura",
    "Hent en specifik faktura med alle linjer.",
    { id: z.string().describe("Faktura-ID") },
    async ({ id }) => {
      const { data, error } = await safeCall(() => getInvoice(id));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Faktura:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_faktura_opret",
    "Opret en ny salgsfaktura i Billy.",
    {
      contactId: z.string().describe("Kontakt-ID (kunde)"),
      entryDate: z.string().describe("Fakturadato YYYY-MM-DD"),
      paymentTermsDays: z.number().optional().describe("Betalingsfrist i dage"),
      lines: z.string().describe("Fakturalinjer som JSON-array: [{productId, quantity, unitPrice, accountId, taxRateId}]"),
    },
    async ({ contactId, entryDate, paymentTermsDays, lines }) => {
      const parsedLines = JSON.parse(lines) as Record<string, unknown>[];
      const { data, error } = await safeCall(() =>
        createInvoice({ contactId, entryDate, paymentTermsDays, lines: parsedLines }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Faktura oprettet:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  REGNINGER (KØB)                         ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_regninger",
    "List købsfakturaer/regninger fra Billy.",
    {
      contactId: z.string().optional().describe("Filtrer på leverandør-ID"),
      state: z.string().optional().describe("'draft' eller 'approved'"),
      isPaid: z.boolean().optional().describe("Kun betalte/ubetalte?"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ contactId, state, isPaid, page }) => {
      const { data, error } = await safeCall(() => getBills({ contactId, state, isPaid, page }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Regninger:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BANKLINJER                              ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_banklinjer",
    "Hent banklinjer fra Billy (kompakt format). KRÆVER accountId (brug billy_kontoplan med bankOnly=true).",
    {
      accountId: z.string().describe("Bank-konto-ID (brug billy_kontoplan med bankOnly=true)"),
      page: z.number().optional().describe("Sidetal (20 linjer pr. side)"),
      sortDirection: z.string().optional().describe("'ASC' (ældste først) eller 'DESC' (nyeste først)"),
    },
    async ({ accountId, page, sortDirection }) => {
      const { data, error } = await safeCall(() =>
        getBankLines({ accountId, page, pageSize: 20, sortProperty: "entryDate", sortDirection: sortDirection ?? "DESC" }),
      );
      if (error) return textResult(`Fejl: ${error}`);

      const result = data as Record<string, unknown>;
      const lines = (result.bankLines ?? []) as Array<Record<string, unknown>>;
      const paging = (result.meta as Record<string, unknown>)?.paging as Record<string, unknown> | undefined;

      const compact = lines.map((l) =>
        `${l.entryDate} | ${String(l.amount).padStart(10)} | ${String(l.side).padStart(6)} | ${String(l.description ?? "").slice(0, 50)} | ID:${l.id} matchId:${l.matchId}`,
      ).join("\n");

      return textResult(
        `**Banklinjer** (side ${paging?.page ?? "?"} af ${paging?.pageCount ?? "?"}, total: ${paging?.total ?? "?"}):\n\n${compact}`,
      );
    },
  );

  server.tool(
    "billy_banklinjer_uafstemte",
    "Hent uafstemte banklinjer (kompakt format, maks 30). Brug denne til bankafstemning.",
    {
      accountId: z.string().describe("Bank-konto-ID (brug billy_kontoplan med bankOnly=true)"),
      limit: z.number().optional().describe("Maks antal (standard 30)"),
    },
    async ({ accountId, limit }) => {
      const { data, error } = await safeCall(() => getUnreconciledBankLines(accountId));
      if (error) return textResult(`Fejl: ${error}`);

      const result = data as { bankLines: Array<Record<string, unknown>>; total: number; allTotal: number };
      const maxLines = limit ?? 30;
      const lines = result.bankLines.slice(0, maxLines);

      const compact = lines.map((l) =>
        `${l.entryDate} | ${String(l.amount).padStart(10)} | ${String(l.side).padStart(6)} | ${String(l.description ?? "").slice(0, 50)} | ID:${l.id} matchId:${l.matchId}`,
      ).join("\n");

      return textResult(
        `**Uafstemte banklinjer** (${result.total} af ${result.allTotal} total)${result.total > maxLines ? ` — viser første ${maxLines}` : ""}:\n\n${compact}`,
      );
    },
  );

  server.tool(
    "billy_bankafstem_link",
    "Knyt en bankmatch til en faktura, regning eller dagbogstransaktion via subject association. Dagbogstransaktion SKAL være godkendt først (brug billy_transaktion_godkend).",
    {
      matchId: z.string().describe("Match-ID (banklinjeMatchId fra banklinjen)"),
      subjectReference: z.string().describe("Reference: 'invoice:ID', 'bill:ID' eller 'daybookTransaction:ID'"),
      amount: z.number().optional().describe("Beløb (valgfrit, ved delbetaling)"),
    },
    async ({ matchId, subjectReference, amount }) => {
      const { data, error } = await safeCall(() =>
        createSubjectAssociation({ matchId, subjectReference, amount }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Subject association oprettet:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_transaktion_godkend",
    "Godkend en dagbogstransaktion (state → approved). SKAL gøres før bankmatch kan godkendes.",
    { id: z.string().describe("Dagbogstransaktion-ID") },
    async ({ id }) => {
      const { data, error } = await safeCall(() => approveDaybookTransaction(id));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Transaktion godkendt:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankmatch_godkend",
    "Godkend en bankmatch (finaliserer afstemningen).",
    { matchId: z.string().describe("Match-ID") },
    async ({ matchId }) => {
      const { data, error } = await safeCall(() =>
        updateBankLineMatch(matchId, { isApproved: true }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bankmatch godkendt:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankmatches",
    "List bankmatches. Brug isApproved=false for at se uafsluttede afstemninger.",
    {
      isApproved: z.boolean().optional().describe("Kun godkendte/ikke-godkendte?"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ isApproved, page }) => {
      const { data, error } = await safeCall(() => getBankLineMatches({ isApproved, page }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bankmatches:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BOGFØRING (DAGBOG/JOURNAL)              ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_dagboeger",
    "List dagbøger (journals) i Billy.",
    {},
    async () => {
      const { data, error } = await safeCall(getDaybooks);
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Dagbøger:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_posteringer_list",
    "Hent bogføringsposteringer fra Billy (kompakt format). Filtrer på konto og datointerval.",
    {
      accountId: z.string().optional().describe("Konto-ID"),
      minEntryDate: z.string().optional().describe("Fra dato YYYY-MM-DD"),
      maxEntryDate: z.string().optional().describe("Til dato YYYY-MM-DD"),
      page: z.number().optional().describe("Sidetal (20 pr. side)"),
    },
    async ({ accountId, minEntryDate, maxEntryDate, page }) => {
      const { data, error } = await safeCall(() => getPostings({ accountId, minEntryDate, maxEntryDate, page, pageSize: 20 }));
      if (error) return textResult(`Fejl: ${error}`);

      const result = data as Record<string, unknown>;
      const postings = (result.postings ?? []) as Array<Record<string, unknown>>;
      const paging = (result.meta as Record<string, unknown>)?.paging as Record<string, unknown> | undefined;

      const compact = postings.map((p) =>
        `${p.entryDate} | ${String(p.amount).padStart(10)} | ${String(p.side).padStart(6)} | ${String(p.text ?? "").slice(0, 40)} | acc:${p.accountId} | tax:${p.taxRateId ?? "—"}`,
      ).join("\n");

      return textResult(
        `**Posteringer** (side ${paging?.page ?? "?"} af ${paging?.pageCount ?? "?"}, total: ${paging?.total ?? "?"}):\n\n${compact}`,
      );
    },
  );

  server.tool(
    "billy_transaktioner",
    "Hent dagbogstransaktioner. Filtrer på dagbog, status, dato.",
    {
      daybookId: z.string().optional().describe("Dagbog-ID"),
      state: z.string().optional().describe("Status-filter"),
      minEntryDate: z.string().optional().describe("Fra dato YYYY-MM-DD"),
      maxEntryDate: z.string().optional().describe("Til dato YYYY-MM-DD"),
      q: z.string().optional().describe("Søg i transaktioner"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ daybookId, state, minEntryDate, maxEntryDate, q, page }) => {
      const { data, error } = await safeCall(() =>
        getDaybookTransactions({ daybookId, state, minEntryDate, maxEntryDate, q, page }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Transaktioner:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bogfoer",
    "Opret en ny bogføringspostering i Billy (dagbogstransaktion med debet/kredit-linjer).",
    {
      daybookId: z.string().describe("Dagbog-ID (brug billy_dagbøger for at finde det)"),
      entryDate: z.string().describe("Dato YYYY-MM-DD"),
      description: z.string().optional().describe("Beskrivelse af posteringen"),
      lines: z.string().describe("Posteringslinjer som JSON-array: [{accountId, amount, side ('debit'/'credit'), text, taxRateId}]"),
    },
    async ({ daybookId, entryDate, description, lines }) => {
      const parsedLines = JSON.parse(lines) as Array<{
        accountId: string;
        amount: number;
        side: string;
        text?: string;
        taxRateId?: string;
      }>;
      const { data, error } = await safeCall(() =>
        createDaybookTransaction({ daybookId, entryDate, description, lines: parsedLines }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Postering oprettet:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  MOMS                                    ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_moms",
    "Hent momsopgørelser (sales tax returns) fra Billy.",
    { isSettled: z.boolean().optional().describe("Kun afsluttede/åbne perioder?") },
    async ({ isSettled }) => {
      const { data, error } = await safeCall(() => getSalesTaxReturns({ isSettled }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Momsopgørelser:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_moms_detalje",
    "Hent detaljer for en specifik momsperiode.",
    { id: z.string().describe("SalesTaxReturn-ID") },
    async ({ id }) => {
      const { data, error } = await safeCall(() => getSalesTaxReturn(id));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Momsperiode:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_momssatser",
    "Hent alle momssatser konfigureret i Billy.",
    {},
    async () => {
      const { data, error } = await safeCall(getTaxRates);
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Momssatser:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BILAG/FILER                             ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_bilag",
    "List bilag/vedhæftninger for en postering, faktura eller regning.",
    { ownerId: z.string().optional().describe("Ejer-ID (faktura, regning, transaktion)") },
    async ({ ownerId }) => {
      const { data, error } = await safeCall(() => getAttachments({ ownerId }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bilag:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  PRODUKTER                               ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_produkter",
    "Søg og list produkter i Billy.",
    { q: z.string().optional().describe("Søg på produktnavn") },
    async ({ q }) => {
      const { data, error } = await safeCall(() => getProducts({ q }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Produkter:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BETALINGER                              ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_betalinger",
    "List bankbetalinger i Billy.",
    { page: z.number().optional().describe("Sidetal") },
    async ({ page }) => {
      const { data, error } = await safeCall(() => getBankPayments({ page }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Betalinger:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_betaling_opret",
    "Registrer en betaling i Billy (knyt betaling til faktura/regning).",
    {
      contactId: z.string().describe("Kontakt-ID"),
      entryDate: z.string().describe("Betalingsdato YYYY-MM-DD"),
      cashAmount: z.number().describe("Beløb"),
      cashSide: z.string().describe("'debit' eller 'credit'"),
      cashAccountId: z.string().describe("Bankkonto-ID"),
      associations: z.string().describe("Tilknytninger som JSON-array: [{subjectReference: 'invoice:ID', amount}]"),
    },
    async ({ contactId, entryDate, cashAmount, cashSide, cashAccountId, associations }) => {
      const parsedAssoc = JSON.parse(associations) as Record<string, unknown>[];
      const { data, error } = await safeCall(() =>
        createBankPayment({ contactId, entryDate, cashAmount, cashSide, cashAccountId, associations: parsedAssoc }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Betaling registreret:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  START                                   ║
  // ╚══════════════════════════════════════════╝

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal fejl:", error);
  process.exit(1);
});
