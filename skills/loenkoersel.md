---
name: loenkoersel
description: "Koer loen for medarbejdere med beregning af A-skat, AM-bidrag, ATP, pension og feriepenge."
---

# /loenkoersel — Loenkoersel

Beregn og bogfoer loen for medarbejdere.

## Trin

1. Spoerg om medarbejderdata: bruttoeloen, skattekort (traekprocent + traekfradrag), pensionsaftale
2. Brug loenberegner-agenten med `loen_beregn` 
3. Vis detaljeret loenberegning
4. Spoerg om godkendelse
5. Bogfoer i Billy:
   - Debet: Loenomkostninger (konto 4200)
   - Kredit: Skyldig A-skat (15300), Skyldig AM-bidrag (15310), Skyldig loen (15600), Skyldig pension (15700), Skyldig ATP (via kontoplan)
6. Paaamind om indberetningsfrist (10. i foelgende maaned)

Brug loenberegner-agenten til beregningen.
