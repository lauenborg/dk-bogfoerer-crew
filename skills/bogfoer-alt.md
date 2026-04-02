---
name: bogfoer-alt
description: "Komplet bogføring — matcher bilag fra Billy + Gmail med banklinjer, afstemmer det der kan, logger resten."
---

# /bogfoer-alt — Komplet bogføring

## ⛔ HUSK: Aldrig bogfør uden bilag (undtagen gebyrer/privat/renter)

## Flow

```
1. BILAG    → Find uknyttede bilag i Billy (billy_bilag_uknyttede)
2. BANK     → Hent uafstemte banklinjer (billy_banklinjer_uafstemte)
3. MATCH    → Match bilag med banklinjer (beløb + leverandør + dato)
4. AFSTEM   → KUN banklinjer MED matchende bilag + undtagne typer
5. GMAIL    → Søg fakturaer for resterende (uden bilag)
6. LOG      → Gem i afventer_bilag.json
7. RAPPORT  → Vis opsummering
```

## Trin 1: Find bilag i Billy

Brug `billy_bilag_uknyttede` — finder bilag sendt til Shine der ikke er matchet.
Hvert bilag har: leverandør, beløb, dato, valuta.

## Trin 2: Hent uafstemte banklinjer

Brug `billy_banklinjer_uafstemte` med bankens accountId.

## Trin 3: Match bilag med banklinjer

For hvert uknyttet bilag — find den banklinje der matcher:
- Beløb matcher (±1 kr. tolerance pga. valutakurs)
- Dato matcher (±5 dage)
- Leverandør matcher (bilag.supplier ≈ banklinje.description)

## Trin 4: Afstem — KUN med bilag eller undtagne typer

**A) Banklinje HAR matchende bilag:**
1. Kør igennem konterer-agenten (bilag_klassificer → konto + momskode)
2. Spørg bruger om godkendelse (ÉT spørgsmål ad gangen)
3. Opret regning (bill) → knyt bilag → afstem banklinje
4. Opdater memory

**B) Banklinje er UNDTAGET type (OK uden bilag):**
- Privathævning → konto 7130, direkte afstem
- Bankgebyr → konto 7200, direkte afstem
- Rente → konto 7000/6000, direkte afstem
- Moms/skat-betaling → direkte afstem

**C) Banklinje HAR IKKE bilag og er IKKE undtaget:**
- ⛔ BOGFØR IKKE
- Søg i Gmail (trin 5)
- Gem i afventer_bilag.json (trin 6)

## Trin 5: Gmail-søgning for resterende

For banklinjer UDEN bilag og IKKE undtaget:
1. Søg i Gmail: `from:leverandør subject:(faktura OR invoice OR receipt)`
2. Fundet → gem med status `email_fundet` + Gmail-link
3. Ikke fundet → gem med status `mangler_bilag` + instruktion

## Trin 6: Gem i afventer_bilag.json

Se CLAUDE.md for format og statusser.

## Trin 7: Vis rapport

```
═══ Bogføring ═══

Afstemt (med bilag):
  ✓ Apify 237,96 kr. — konto 4400, EU reverse charge
  ✓ Simply.com 972,73 kr. — konto 4400, fuld moms

Afstemt (uden bilag — undtagne):
  ✓ Privathævning 5.000 kr. → konto 7130
  ✓ Lunar gebyr 289 kr. → konto 7200

⛔ IKKE afstemt — afventer bilag:
  Videresend til Shine:
    ○ Amazon 1.177 kr. — [Gmail-link]
    ○ Adobe 237 kr. — [Gmail-link]

  Find manuelt:
    ✗ GitHub 499 kr. — github.com/settings/billing
    ✗ Apple 779 kr. — appleid.apple.com/purchase-history

Shine: [fra memory/regler.json]
Sig "bilag klar" når du har videresendt/fundet dem.
```

Opdater `memory/referat.md` med alt der blev gjort.
