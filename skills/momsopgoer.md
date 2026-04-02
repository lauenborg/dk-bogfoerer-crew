---
name: momsopgoer
description: "Beregn momstilsvar og klargør momsindberetning."
---

# /momsopgoer — Momsopgørelse

Hjælp brugeren med at klargøre momsindberetning.

## Trin

1. Brug `billy_moms` for at hente åbne momsperioder
2. Vis perioden og spørg brugeren om bekræftelse
3. Brug `billy_moms_detalje` for at hente detaljer
4. Opsummer:
   - Udgående moms (salgsmoms)
   - Indgående moms (købsmoms)
   - Momstilsvar (difference)
   - EU-køb og -salg
5. Brug `moms_frist` fra dk-bogfoerer for at vise indberetningsfristen
6. Advar hvis der er uoverensstemmelser

## Tjek før indberetning

- Er alle banklinjer afstemt?
- Er alle fakturaer og regninger bogført?
- Er momskoder korrekte (særligt 25%-fradrag på restaurant/repr.)?
- Er EU-handel korrekt håndteret (reverse charge)?
