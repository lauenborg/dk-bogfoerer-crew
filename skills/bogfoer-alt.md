---
name: bogfoer-alt
description: "Komplet bogføringsflow — matcher banklinjer, henter fakturaer, afstemmer moms/skat, opdaterer indberetningstal. Alt i ét."
---

# /bogfoer-alt — Komplet bogføring

Kører hele bogførings-pipelinen i ét flow. Når dette er kørt, er alt opdateret og klar til indberetning.

## Pipeline

```
1. MATCH      → Match banklinjer med Gmail-fakturaer
2. AFSTEM     → Afstem resterende banklinjer
3. MOMS       → Beregn og verificér moms
4. SKAT       → Beregn forventet skat
5. STATUS     → Opdatér indberetningstal + referat
```

## Trin 1: Match banklinjer med fakturaer

1. Hent uafstemte banklinjer: `billy_banklinjer_uafstemte`
2. For hver linje — søg i Gmail efter matchende faktura
3. Kør igennem konterer-agenten (bilag_klassificer + tjek_bilag)
4. Spørg ved tvivl
5. Bogfør og afstem i Billy
6. Opdater memory/leverandoerer.json

## Trin 2: Afstem resterende

For banklinjer uden Gmail-match:
- Privathævninger → konto 7130
- Bankgebyrer → konto 7200 (momsfri)
- Renter → konto 7000/6000 (momsfri)
- Ukendte → spørg brugeren

## Trin 3: Momsafstemning

Kør /momsafstem automatisk:
- Tjek alle posteringer i perioden
- Verificér EU reverse charge (begge poster)
- Beregn momstilsvar
- Gem i `memory/indberetning.json`:

```json
{
  "moms": {
    "periode": "1. halvår 2026",
    "startDato": "2026-01-01",
    "slutDato": "2026-06-30",
    "frist": "2026-09-01",
    "salgsmoms": 12500,
    "koebsmoms": 9840,
    "euKoebMoms": 1200,
    "euSalgMoms": 1200,
    "tilsvar": 3860,
    "sidstOpdateret": "2026-04-02",
    "status": "løbende",
    "rubrikker": {
      "rubrik_a_salgsmoms": 12500,
      "rubrik_b_koebsmoms": 9840,
      "rubrik_c_eu_koeb": 1200,
      "rubrik_d_eu_salg": 0,
      "momstilsvar": 3860
    }
  }
}
```

## Trin 4: Skatteafstemning

Kør /skatafstem automatisk:
- Beregn resultat (omsætning - omkostninger)
- Tjek fradrag og privatandele
- Gem i `memory/indberetning.json`:

```json
{
  "skat": {
    "regnskabsaar": 2026,
    "omsaetning": 125000,
    "omkostninger": 62000,
    "resultatFoerRenter": 63000,
    "finansiellePoster": -1200,
    "resultatFoerSkat": 61800,
    "forventetSkat": {
      "am_bidrag": 4944,
      "bundskat": 6826,
      "kommuneskat": 14208,
      "total": 25978
    },
    "sidstOpdateret": "2026-04-02",
    "felter_aarsopgoerelse": {
      "rubrik_111": 125000,
      "rubrik_221": 62000,
      "rubrik_250": 1200,
      "overskud_virksomhed": 61800
    }
  }
}
```

## Trin 5: Status og referat

Vis opsummering:

```
═══ Bogføring komplet ═══

Banklinjer: 261 total → 245 afstemt, 16 resterende
  ✓ Automatisk matchet: 180 (Gmail-fakturaer)
  ✓ Manuelt afstemt: 65 (gebyrer, privathævninger)
  ○ Afventer: 16 (spørg mig)

Moms (1. halvår 2026):
  Salgsmoms:    12.500 kr.
  Købsmoms:      9.840 kr.
  Tilsvar:       3.860 kr.
  Frist: 1/9-2026 (152 dage)
  → Klar til indberetning: rubrik A-D udfyldt

Skat (2026, løbende):
  Omsætning:   125.000 kr.
  Resultat:     61.800 kr.
  Forventet skat: ~25.978 kr.

Næste frister:
  1/5: Privat selvangivelse
  1/9: Momsindberetning

Referat opdateret: memory/referat.md
Indberetningstal: memory/indberetning.json
```

Opdater `memory/referat.md` med alt der blev gjort.

## Hvornår bruges /bogfoer-alt?

- **Ugentligt/månedligt:** Kør den regelmæssigt for at holde alt opdateret
- **Før indberetning:** Kør den lige inden moms- eller skatteindberetning
- **Ved årsafslutning:** Kør den som forberedelse til årsopgørelse

## Indberetningstal (memory/indberetning.json)

Denne fil holder løbende styr på alle tal der skal bruges ved indberetning:

- **Moms:** Rubrik A (salgsmoms), B (købsmoms), C (EU-køb), D (EU-salg), momstilsvar
- **Skat:** Omsætning, omkostninger, resultat, fradrag, forventet skat
- **Årsopgørelse:** Rubrik 111, 221, 250 osv. — klar til at udfylde

Når du kører `/momsopgoer` eller `/aarsafslutning`, læser de fra denne fil.
