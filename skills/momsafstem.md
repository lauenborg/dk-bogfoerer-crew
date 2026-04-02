---
name: momsafstem
description: "Løbende momsafstemning — tjek at bogført moms stemmer med Billy og identificér mangler."
---

# /momsafstem — Løbende momsafstemning

Tjek at al moms er korrekt bogført og identificér mangler før indberetning.

## Trin

### 1. Hent momsperiode
- Brug `billy_moms` for at finde den aktuelle åbne momsperiode
- Brug `deadline_oversigt` for at vise hvornår den skal indberettes

### 2. Hent posteringer i perioden
- Brug `billy_posteringer_list` med periodedatoer
- Grupér efter momskode

### 3. Tjek hver postering
For hver postering med moms:
- Er momskoden korrekt for kontotypen?
- Særlige tjek:
  - **EU-køb:** Har den reverse charge (eu_koeb_25)? Begge poster (salgs- + købsmoms)?
  - **Restaurant/repr.:** Er det 25% fradrag og ikke 100%?
  - **Forsikring/bank:** Er det momsfrit og ikke bogført med moms?
  - **Personbil:** 0% fradrag?
  - **Eksport:** 0% moms med fuld fradragsret?

### 4. EU reverse charge tjek (VIGTIGT)
For hvert EU-køb skal der bogføres:
- **Salgsmoms:** +25% af beløb (konto 15220)
- **Købsmoms:** -25% af beløb (konto 15210)
- **Netto effekt:** 0 kr. (de udligner hinanden)
- **Men begge SKAL indberettes** på momsangivelsen

Hvis et EU-køb mangler reverse charge-postering → ADVAR.

Typiske EU-leverandører at tjekke:
- Software: Apify (CZ), GitHub (US→IE), AWS (IE), Google Cloud (IE), Adobe (IE)
- Tjenester: Cloudflare (US), Stripe (IE), DigitalOcean (US)

### 5. Opsummering
Vis en momsopgørelse:

```
Momsperiode: 1/1-2026 — 30/6-2026
Frist: 1/9-2026

Salgsmoms (udgående):
  Normalt salg 25%:           12.500 kr.
  EU reverse charge:           1.200 kr.
  ─────────────────────────────────
  Total salgsmoms:            13.700 kr.

Købsmoms (indgående):
  Fuldt fradrag (100%):        8.400 kr.
  Restaurant/repr. (25%):        240 kr.
  EU reverse charge:           1.200 kr.
  ─────────────────────────────────
  Total købsmoms:              9.840 kr.

MOMSTILSVAR:                   3.860 kr. (skal betales)

Advarsler:
  ⚠ 2 EU-køb mangler reverse charge-postering
  ⚠ 1 restaurantudgift bogført med 100% fradrag
```

### 6. Dokumentér i referat
Gem momsafstemningen i `memory/referat.md` med:
- Perioden
- Beregnet momstilsvar
- Eventuelle korrektioner foretaget
- Advarsler
