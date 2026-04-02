---
name: skatafstem
description: "Løbende skatteafstemning — tjek fradrag, privatandele, og beregn forventet skat."
---

# /skatafstem — Løbende skatteafstemning

Tjek at skattemæssige fradrag og indberetninger er korrekte.

## Trin

### 1. Hent posteringer
- Brug `billy_posteringer_list` for indeværende regnskabsår

### 2. Tjek skattemæssige forhold

**For EMV (enkeltmandsvirksomhed):**
- Privathævninger (konto 7130) — påvirker ikke skat, kun egenkapital
- Virksomhedsordningen: brug `skat_virksomhedsordning` for at tjekke regler
- B-skat: brug `deadline_oversigt` for næste rate

**For ApS/A/S:**
- Selskabsskat 22%: brug `skat_selskab`
- Aconto-betalinger: er de betalt? (20/3 og 20/11)
- Lønomkostninger: er A-skat og AM-bidrag indberettet?

### 3. Fradragstjek
For hver udgiftstype — er det skattemæssigt fradragsberettiget?
- **Repræsentation:** Kun 25% skattefradrag (Ligningsloven §8 stk. 4)
- **Personbil:** Ingen fradrag for private km, kun erhvervsmæssige
- **Telefon/internet:** Ved blandet brug — er der korrigeret for privatandel?
- **Hjemmekontor:** Har brugeren hjemmekontor? Evt. fradrag

### 4. Perioderesultat
Beregn et estimeret resultat:

```
Skatteafstemning pr. 2/4-2026

Omsætning:                    125.000 kr.
Vareforbrug:                  -15.000 kr.
Bruttoavance:                 110.000 kr.

Driftsomkostninger:           -45.000 kr.
  Heraf ikke-fradragsberettiget:  -2.500 kr. (repræsentation 75%)
Resultat før renter:           65.000 kr.

Finansielle poster:            -1.200 kr.
Resultat før skat:             63.800 kr.

Forventet skat (EMV):
  AM-bidrag 8%:                 5.104 kr.
  Bundskat 12,01%:              7.050 kr.
  Kommuneskat ~25%:            14.674 kr.
  ─────────────────────────────────
  Ca. samlet skat:             26.828 kr. (~42%)
```

### 5. Advarsler
- Manglende privatandels-korrektion
- Repræsentation bogført med fuldt fradrag
- Manglende B-skat indbetalinger
- AM-bidrag/A-skat ikke indberettet for ansatte

### 6. Dokumentér i referat
Gem i `memory/referat.md`
