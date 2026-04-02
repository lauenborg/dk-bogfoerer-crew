---
name: bankafstem
description: "Gennemgå uafstemte banklinjer fra Billy og match dem med konti/fakturaer."
---

# /bankafstem — Bankafstemning

Gennemgå uafstemte banklinjer og match dem.

## Trin

1. Brug `billy_banklinjer_uafstemte` for at hente uafstemte linjer
2. For hver uafstemt banklinje:
   a. Vis: dato, beløb, beskrivelse
   b. Tjek `memory/leverandoerer.json` — kender vi afsender/modtager?
   c. Foreslå match baseret på beskrivelsen (brug `bilag_klassificer`)
   d. Spørg brugeren om godkendelse
   e. Brug `billy_bankmatch` til at oprette match (kræver account + feeAccount + lines)
   f. Hvis det skal linkes til en faktura/regning: brug `billy_bankafstem_link`
   g. Brug `billy_bankmatch_godkend` til at finalisere
3. Opsummer: antal matchede, resterende uafstemte

## Vigtige parametre for billy_bankmatch

- `account`: Modkonto-ID (udgifts-/indtægtskonto)
- `feeAccount`: Gebyr-konto-ID (typisk bankens konto)
- `lines`: JSON-array af banklinje-ID'er: ["id1"]
- `entryDate`, `amount`, `side`: Fra banklinjen

## Typiske matches

- "Rente" → modkonto 7000 (Renteudgifter), momsfri
- "Gebyr" → modkonto 7200 (Bankgebyrer), momsfri
- Leverandørnavn → match med regning via billy_bankafstem_link
- Kundenavn → match med faktura via billy_bankafstem_link
