---
name: momsopgoer
description: "Beregn momstilsvar og klargør momsindberetning."
---

# /momsopgoer — Momsopgoerelse

Hjaelp brugeren med at klargore momsindberetning.

## Trin

1. Brug `billy_moms` for at hente aabne momsperioder
2. Vis perioden og spoerg brugeren om bekraeftelse
3. Brug `billy_moms_detalje` for at hente detaljer
4. Opsummer:
   - Udgaaende moms (salgsmoms)
   - Indgaaende moms (koebsmoms)
   - Momstilsvar (difference)
   - EU-koeb og -salg
5. Brug `moms_frist` fra dk-bogfoerer for at vise indberetningsfristen
6. Advar hvis der er uoverensstemmelser

## Tjek foer indberetning

- Er alle banklinjer afstemt?
- Er alle fakturaer og regninger bogfoert?
- Er momskoder korrekte (saeligt 25%-fradrag paa restaurant/repr.)?
- Er EU-handel korrekt haandteret (reverse charge)?
