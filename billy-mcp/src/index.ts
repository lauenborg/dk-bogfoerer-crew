import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getOrganization, getAccounts, getAccountGroups,
  getContacts, getContact, createContact,
  getInvoices, getInvoice, createInvoice,
  getBills, getBill,
  getBankLines, createBankLineMatch, updateBankLineMatch, getBankLineMatches, createSubjectAssociation,
  getDaybookTransactions, createDaybookTransaction, getDaybooks,
  getPostings,
  getSalesTaxReturns, getSalesTaxReturn, getTaxRates,
  uploadFile, createAttachment, getAttachments,
  getProducts,
  getBankPayments, createBankPayment,
} from "./billy-client.js";

function jsonText(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function textResult(text: string) {
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
    "Hent info om firmaet i Billy (navn, CVR, adresse, regnskabsaar).",
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
    "Hent kontoplan fra Billy. Viser alle konti med grupper og momskoder.",
    { pageSize: z.number().optional().describe("Antal konti (standard 200)") },
    async ({ pageSize }) => {
      const { data, error } = await safeCall(() => getAccounts({ pageSize }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Kontoplan:**\n\n${jsonText(data)}`);
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
    "Soeg og list kontakter (kunder/leverandoerer) i Billy.",
    {
      q: z.string().optional().describe("Soeg paa navn"),
      isCustomer: z.boolean().optional().describe("Kun kunder?"),
      isSupplier: z.boolean().optional().describe("Kun leverandoerer?"),
    },
    async ({ q, isCustomer, isSupplier }) => {
      const { data, error } = await safeCall(() => getContacts({ q, isCustomer, isSupplier }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Kontakter:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_kontakt_opret",
    "Opret en ny kontakt (kunde eller leverandoer) i Billy.",
    {
      name: z.string().describe("Kontaktens navn"),
      registrationNo: z.string().optional().describe("CVR-nummer"),
      isCustomer: z.boolean().optional().describe("Er det en kunde?"),
      isSupplier: z.boolean().optional().describe("Er det en leverandoer?"),
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
    "List salgsfakturaer fra Billy. Filtrer paa status og betaling.",
    {
      contactId: z.string().optional().describe("Filtrer paa kontakt-ID"),
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
  // ║  REGNINGER (KOEB)                        ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_regninger",
    "List koebsfakturaer/regninger fra Billy.",
    {
      contactId: z.string().optional().describe("Filtrer paa leverandoer-ID"),
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
    "Hent banklinjer fra Billy. Vis uafstemte linjer for bankafsteming.",
    {
      accountId: z.string().optional().describe("Bank-konto-ID"),
      isMatched: z.boolean().optional().describe("Kun matchede/umatchede? (false = uafstemte)"),
      minEntryDate: z.string().optional().describe("Fra dato YYYY-MM-DD"),
      maxEntryDate: z.string().optional().describe("Til dato YYYY-MM-DD"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ accountId, isMatched, minEntryDate, maxEntryDate, page }) => {
      const { data, error } = await safeCall(() =>
        getBankLines({ accountId, isMatched, minEntryDate, maxEntryDate, page }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Banklinjer:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankmatch",
    "Opret en match for en banklinje (trin 1 af afsteming). Returnerer match-ID til brug i billy_bankafstem_link.",
    {
      bankLineId: z.string().describe("Banklinje-ID"),
      accountId: z.string().describe("Modkonto-ID (den konto udgiften/indtaegten skal bogfoeres paa)"),
      amount: z.number().describe("Beloeb"),
      entryDate: z.string().describe("Dato YYYY-MM-DD"),
      side: z.string().describe("'debit' eller 'credit'"),
    },
    async ({ bankLineId, accountId, amount, entryDate, side }) => {
      const { data, error } = await safeCall(() =>
        createBankLineMatch({ bankLineId, accountId, amount, entryDate, side }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bankmatch oprettet:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankafstem_link",
    "Knyt en bankmatch til en faktura, regning eller dagbogstransaktion via subject association (trin 2 af afsteming).",
    {
      bankLineMatchId: z.string().describe("Match-ID fra billy_bankmatch"),
      subjectReference: z.string().describe("Reference til emnet: 'invoice:ID', 'bill:ID' eller 'daybookTransaction:ID'"),
      amount: z.number().optional().describe("Beloeb (valgfrit, bruges ved delbetaling)"),
    },
    async ({ bankLineMatchId, subjectReference, amount }) => {
      const { data, error } = await safeCall(() =>
        createSubjectAssociation({ bankLineMatchId, subjectReference, amount }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Subject association oprettet:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankmatch_godkend",
    "Godkend en bankmatch (trin 3 af afsteming). Matchen opretter posteringen i Billy.",
    { matchId: z.string().describe("Match-ID fra billy_bankmatch") },
    async ({ matchId }) => {
      const { data, error } = await safeCall(() =>
        updateBankLineMatch(matchId, { isApproved: true }),
      );
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bankmatch godkendt:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_bankafstem",
    "Komplet bankafsteming i ét kald: opretter dagbogstransaktion, matcher banklinjen, linker og godkender. Brug dette for simple udgifter/indtaegter der ikke er knyttet til en eksisterende faktura/regning.",
    {
      bankLineId: z.string().describe("Banklinje-ID"),
      daybookId: z.string().describe("Dagbog-ID (brug billy_dagboeger)"),
      accountId: z.string().describe("Modkonto-ID (udgifts-/indtaegtskonto)"),
      bankAccountId: z.string().describe("Bankkonto-ID"),
      amount: z.number().describe("Beloeb (positivt tal)"),
      entryDate: z.string().describe("Dato YYYY-MM-DD"),
      description: z.string().optional().describe("Beskrivelse"),
      taxRateId: z.string().optional().describe("Momssats-ID (brug billy_momssatser)"),
      side: z.string().describe("'debit' for udgift, 'credit' for indtaegt"),
    },
    async ({ bankLineId, daybookId, accountId, bankAccountId, amount, entryDate, description, taxRateId, side }) => {
      const parts: string[] = [];

      // Trin 1: Opret dagbogstransaktion
      const txLines = [
        { accountId, amount, side, text: description, taxRateId },
        { accountId: bankAccountId, amount, side: side === "debit" ? "credit" : "debit", text: description },
      ];
      const { data: txData, error: txError } = await safeCall(() =>
        createDaybookTransaction({ daybookId, entryDate, description, lines: txLines }),
      );
      if (txError) return textResult(`Fejl ved dagbogstransaktion: ${txError}`);

      const txResult = txData as Record<string, unknown>;
      const txArr = Array.isArray(txResult.daybookTransactions) ? txResult.daybookTransactions[0] : txResult.daybookTransaction;
      const txId = (txArr as Record<string, unknown> | undefined)?.id as string | undefined;
      parts.push(`✓ Dagbogstransaktion oprettet: ${txId ?? "ukendt ID"}`);

      // Trin 2: Opret bankmatch
      const { data: matchData, error: matchError } = await safeCall(() =>
        createBankLineMatch({ bankLineId, accountId, amount, entryDate, side }),
      );
      if (matchError) {
        parts.push(`✗ Fejl ved bankmatch: ${matchError}`);
        return textResult(parts.join("\n"));
      }

      const matchResult = matchData as Record<string, unknown>;
      const matchArr = Array.isArray(matchResult.bankLineMatches) ? matchResult.bankLineMatches[0] : matchResult.bankLineMatch;
      const matchId = (matchArr as Record<string, unknown> | undefined)?.id as string | undefined;
      parts.push(`✓ Bankmatch oprettet: ${matchId ?? "ukendt ID"}`);

      // Trin 3: Link match til dagbogstransaktion
      if (matchId && txId) {
        const { error: linkError } = await safeCall(() =>
          createSubjectAssociation({ bankLineMatchId: matchId, subjectReference: `daybookTransaction:${txId}` }),
        );
        if (linkError) {
          parts.push(`✗ Fejl ved link: ${linkError}`);
        } else {
          parts.push(`✓ Linket til dagbogstransaktion`);
        }
      }

      // Trin 4: Godkend match
      if (matchId) {
        const { error: approveError } = await safeCall(() =>
          updateBankLineMatch(matchId, { isApproved: true }),
        );
        if (approveError) {
          parts.push(`✗ Fejl ved godkendelse: ${approveError}`);
        } else {
          parts.push(`✓ Bankmatch godkendt — afsteming faerdig`);
        }
      }

      return textResult(`**Bankafsteming:**\n\n${parts.join("\n")}`);
    },
  );

  server.tool(
    "billy_bankmatches",
    "List eksisterende bankmatches. Brug til at se status paa afsteming.",
    {
      bankLineId: z.string().optional().describe("Filtrer paa banklinje-ID"),
      isApproved: z.boolean().optional().describe("Kun godkendte/ikke-godkendte?"),
    },
    async ({ bankLineId, isApproved }) => {
      const { data, error } = await safeCall(() => getBankLineMatches({ bankLineId, isApproved }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Bankmatches:**\n\n${jsonText(data)}`);
    },
  );

  // ╔══════════════════════════════════════════╗
  // ║  BOGFOERING (DAGBOG/JOURNAL)             ║
  // ╚══════════════════════════════════════════╝

  server.tool(
    "billy_dagboeger",
    "List dagboeger (journals) i Billy.",
    {},
    async () => {
      const { data, error } = await safeCall(getDaybooks);
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Dagboeger:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_posteringer_list",
    "Hent bogfoeringsposteringer fra Billy. Filtrer paa konto og datointerval.",
    {
      accountId: z.string().optional().describe("Konto-ID"),
      minEntryDate: z.string().optional().describe("Fra dato YYYY-MM-DD"),
      maxEntryDate: z.string().optional().describe("Til dato YYYY-MM-DD"),
      page: z.number().optional().describe("Sidetal"),
    },
    async ({ accountId, minEntryDate, maxEntryDate, page }) => {
      const { data, error } = await safeCall(() => getPostings({ accountId, minEntryDate, maxEntryDate, page }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Posteringer:**\n\n${jsonText(data)}`);
    },
  );

  server.tool(
    "billy_transaktioner",
    "Hent dagbogstransaktioner. Filtrer paa dagbog, status, dato.",
    {
      daybookId: z.string().optional().describe("Dagbog-ID"),
      state: z.string().optional().describe("Status-filter"),
      minEntryDate: z.string().optional().describe("Fra dato YYYY-MM-DD"),
      maxEntryDate: z.string().optional().describe("Til dato YYYY-MM-DD"),
      q: z.string().optional().describe("Soeg i transaktioner"),
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
    "Opret en ny bogfoeringspostering i Billy (dagbogstransaktion med debet/kredit-linjer).",
    {
      daybookId: z.string().describe("Dagbog-ID (brug billy_dagboeger for at finde det)"),
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
    "Hent momsopgoerelser (sales tax returns) fra Billy.",
    { isSettled: z.boolean().optional().describe("Kun afsluttede/aabne perioder?") },
    async ({ isSettled }) => {
      const { data, error } = await safeCall(() => getSalesTaxReturns({ isSettled }));
      if (error) return textResult(`Fejl: ${error}`);
      return textResult(`**Momsopgoerelser:**\n\n${jsonText(data)}`);
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
    "Soeg og list produkter i Billy.",
    { q: z.string().optional().describe("Soeg paa produktnavn") },
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
      cashAmount: z.number().describe("Beloeb"),
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
