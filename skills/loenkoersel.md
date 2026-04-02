---
name: loenkoersel
description: "Kør løn for medarbejdere med beregning af A-skat, AM-bidrag, ATP, pension og feriepenge."
---

# /loenkoersel — Lønkørsel

Beregn og bogfør løn for medarbejdere.

## Trin

1. Spørg om medarbejderdata: bruttolønnen, skattekort (trækprocent + trækfradrag), pensionsaftale
2. Brug loenberegner-agenten med `loen_beregn` 
3. Vis detaljeret lønberegning
4. Spørg om godkendelse
5. Bogfør i Billy:
   - Debet: Lønomkostninger (konto 4200)
   - Kredit: Skyldig A-skat (15300), Skyldig AM-bidrag (15310), Skyldig løn (15600), Skyldig pension (15700), Skyldig ATP (via kontoplan)
6. Påmind om indberetningsfrist (10. i følgende måned)

Brug loenberegner-agenten til beregningen.
