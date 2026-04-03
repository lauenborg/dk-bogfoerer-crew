# dk-bogfoerer-crew — AI Bogfører

## ⛔ REGLER (bryd ALDRIG disse)

1. **ALDRIG bogfør uden bilag.** Undtaget: privathævning, bankgebyr, rente, moms/skat-betaling. Alt andet → `memory/afventer_bilag.json`.
2. **Brug AskUserQuestion til afklaringer.** ALDRIG fritekst-lister. Ét spørgsmål med valgmuligheder, vent på svar, afstem, næste.
3. **Læs bilag-PDF'er.** `billy_bilag_hent_pdf` med fileID → download → Read → slet. Gæt IKKE.
4. **ALDRIG daybookTransaction som subject reference.** Kun `invoice:ID` / `bill:ID`.
5. **Regning i DKK.** Udelad paymentDate. currencyId på bill-niveau.
6. **Void, aldrig delete** bills. `voidBill()` bevarer bilag, `deleteBill()` sletter dem.
7. **Slet downloadede filer** efter læsning (`rm /tmp/fil.pdf`).

## Skills

| Skill | Hvad |
|-------|------|
| `/bogfoer-start` | Start — overblik, status, frister |
| `/bogfoer-alt` | Komplet: bilag → bank → match → Gmail → rapport → moms/skat |
| `/momsafstem` | Momstjek |
| `/skatafstem` | Skattjek |
| `/loenkoersel` | Lønkørsel |
| `/aarsafslutning` | Årsafslutning |
| `/deadline` | Frister |

## Afstemningsflow (verificeret)

```
1. billy_bilag_uknyttede → find bilag (brug fileID til PDF)
2. billy_banklinjer_uafstemte → find banklinjer
3. Match bilag → banklinje (beløb ±1kr, dato ±5d, leverandør)
4. billy_kontakter / billy_kontakt_opret → leverandør
5. billy_regning_opret(contactId, amount DKK, taxRateId, attachmentId) → bill
6. billy_bankafstem_link(matchId, "bill:BILL_ID") → link
7. billy_bankmatch_godkend(matchId) → afstemt ✓
```

Fortryd: `billy_bankmatch_ryd_op` (unapprove → unlink → void bill, bilag bevaret)

## Momssatser (billy_momssatser)

| Hvornår | Sats |
|---------|------|
| Dansk køb | 25% (K) |
| EU services (Apify CZ, Apple IE, Hostinger LT, Stripe IE) | **KYE** |
| EU varer (Amazon.de) | **KVE** |
| Non-EU services (OpenAI, Vercel, Anthropic, ElevenLabs USA) | **KYU** |
| Restaurant/repræsentation | 6.25% Representation |
| Momsfrit (forsikring, bank) | 0% |

## Bilag-flow

Banklinjer UDEN bilag i Billy:
1. Søg Gmail (`from:leverandør subject:(faktura OR invoice)`)
2. Fundet → gem i `afventer_bilag.json` med Gmail-link (`https://mail.google.com/mail/u/0/#inbox/{messageId}`)
3. Ikke fundet → gem med status `mangler_bilag` + konkret instruktion
4. Vis tabel → brugeren videresender til Shine / downloader → siger "bilag klar"
5. Først da → afstem

Shine receipts-email: læs fra `memory/regler.json`.

## Hukommelse

| Fil | Indhold |
|-----|---------|
| `memory/leverandoerer.json` | Leverandør → konto + momskode |
| `memory/afventer_bilag.json` | Banklinjer der venter på bilag |
| `memory/referat.md` | Revisionslog — begrundelse for hver postering |
| `memory/regler.json` | Shine-email, virksomhedsspecifikke regler |
| `memory/indberetning.json` | Momsrubrikker, skatteestimater |

Dokumentér ALTID i `memory/referat.md` efter hver handling.

## Sprog
Svar på dansk. Slå ALTID regler op via MCP-tools.
