---
name: bankafstem
description: "Gennemgaa uafstemte banklinjer fra Billy og match dem med konti/fakturaer."
---

# /bankafstem — Bankafsteming

Gennemgaa uafstemte banklinjer og match dem.

## Trin

1. Brug `billy_banklinjer` med `isMatched: false` for at hente uafstemte linjer
2. For hver banklinje:
   a. Vis: dato, beloeb, beskrivelse
   b. Foreslaa match baseret paa beskrivelsen (brug `bilag_klassificer`)
   c. Spoerg brugeren om godkendelse
   d. Brug `billy_bankmatch` til at matche linjen
3. Opsummer: antal matchede, resterende uafstemte

## Typiske matches

- "Rente" → konto 7000 (Renteudgifter) eller 6000 (Renteindtaegter), momsfri
- "Gebyr" → konto 7200 (Bankgebyrer), momsfri
- Leverandoernavn → match med regning (bill)
- Kundenavn → match med faktura (invoice)
