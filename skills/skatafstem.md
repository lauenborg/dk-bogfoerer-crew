---
name: skatafstem
description: "Løbende skatteafstemning — tjek fradrag, privatandele, beregn forventet skat."
---

# /skatafstem — Skatteafstemning

Tjek at skattemæssige fradrag og indberetninger er korrekte.

## Hvad den tjekker

**EMV:**
- Privathævninger (konto 7130) — påvirker ikke skat, kun egenkapital
- Virksomhedsordningen: brug `skat_virksomhedsordning`
- B-skat: er raterne betalt?

**ApS/A/S:**
- Selskabsskat 22%: brug `skat_selskab`
- Aconto: betalt? (20/3 og 20/11)
- Løn: er A-skat og AM-bidrag indberettet?

## Fradragstjek
- Repræsentation: kun 25% skattefradrag
- Personbil: ingen fradrag for private km
- Telefon/internet: korrigeret for privatandel?

## Output
Beregn estimeret resultat og forventet skat. Gem i `memory/indberetning.json`.
