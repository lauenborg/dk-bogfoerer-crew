---
name: bogfoer-alt
description: "Komplet bogføring — matcher bilag fra Billy + Gmail med banklinjer, afstemmer det der kan, logger resten."
---

# /bogfoer-alt — Komplet bogføring

## Flow

```
1. BILAG    → Find uknyttede bilag i Billy (sendt via Shine)
2. BANK     → Hent uafstemte banklinjer
3. MATCH    → Match bilag med banklinjer (beløb + leverandør + dato)
4. AFSTEM   → Afstem dem der matcher (med korrekt moms/konto)
5. GMAIL    → Søg efter fakturaer for resterende banklinjer
6. LOG      → Gem alt i afventer_bilag.json
7. RAPPORT  → Vis opsummering
```

## Trin 1: Find bilag i Billy

Brug `billy_bilag_uknyttede` — finder bilag sendt til Shine der ikke er matchet endnu.
Hvert bilag har: leverandør, beløb, dato.

## Trin 2: Hent uafstemte banklinjer

Brug `billy_banklinjer_uafstemte` med bankens accountId.

## Trin 3: Match bilag med banklinjer

For hvert uknyttet bilag — find den banklinje der matcher:
- **Beløb matcher** (inden for 1 kr. tolerance pga. valutakurs)
- **Dato matcher** (±3 dage)
- **Leverandør matcher** (bilag.supplier ≈ banklinje.description)

Når en match findes:
1. Kør igennem konterer-agenten (bilag_klassificer → konto + momskode)
2. Vis kontering → spørg bruger om godkendelse
3. Opret regning (bill) i Billy → knyt bilag → afstem banklinje
4. Opdater memory/leverandoerer.json

## Trin 4: Afstem simple banklinjer (uden bilag)

Banklinjer der IKKE kræver bilag — afstem direkte:
- Privathævning (Transfer/Overførsel til privat) → konto 7130
- Bankgebyrer (Lunar Plan, gebyr) → konto 7200, momsfri
- Renter → konto 7000/6000, momsfri
- Moms/skat-betaling → konto 15200/15300/15400

## Trin 5: Gmail-søgning for resterende

For banklinjer der kræver bilag men IKKE har et match i Billy:
1. Søg i Gmail: `from:leverandør subject:(faktura OR invoice OR receipt)`
2. Fundet → gem Gmail-link i `afventer_bilag.json` med status `email_fundet`
3. Ikke fundet → gem med status `mangler_bilag` + konkret instruktion

## Trin 6: Gem i afventer_bilag.json

Se CLAUDE.md for format. To statusser:
- `email_fundet`: Gmail-link klar, brugeren videresender til Shine
- `mangler_bilag`: konkret instruktion om hvor faktura kan downloades

## Trin 7: Vis rapport

```
═══ Bogføring ═══

Afstemt (med bilag fra Billy):
  ✓ Apify 237,96 kr. — konto 4400, EU reverse charge
  ✓ Simply.com 972,73 kr. — konto 4400, fuld moms

Afstemt (uden bilag):
  ✓ Privathævning 5.000 kr. → konto 7130
  ✓ Lunar gebyr 289 kr. → konto 7200

Afventer bilag — videresend til Shine:
  ○ Amazon 1.177 kr. — https://mail.google.com/...
  ○ Adobe 237 kr. — https://mail.google.com/...

Mangler bilag — find manuelt:
  ✗ GitHub 499 kr. — github.com/settings/billing → marts
  ✗ Apple 779 kr. — appleid.apple.com → purchase history

Shine: [din Shine-email]
Sig "bilag klar" når du har videresendt/fundet dem.
```

Opdater `memory/referat.md` med alt der blev gjort.
