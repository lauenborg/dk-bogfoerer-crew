---
name: bogfoer-start
description: "Start bogføringssession — læser hukommelse, viser status, frister og uafstemte banklinjer."
---

# /bogfoer-start — Start bogføringssession

Kør dette ved starten af hver session. Læser al hukommelse og giver et komplet overblik.

## Trin

### 1. Vis velkomst
```
╔══════════════════════════════════════════════════╗
║  dk-bogfoerer-crew                               ║
║  AI Bogfører for danske virksomheder             ║
╚══════════════════════════════════════════════════╝
```

### 2. Læs hukommelse
Læs disse filer og opsummer:
- `memory/leverandoerer.json` → "X kendte leverandører"
- `memory/regler.json` → eventuelle virksomhedsspecifikke regler + Shine receipts-email
- `memory/afventer_bilag.json` → banklinjer der er klar til afstemning men venter på bilag
- `memory/referat.md` → seneste 5-10 linjer (hvad skete sidst?)
- `memory/indberetning.json` → aktuelle momstal og skatteestimat
- `memory/manuelle_downloads.json` → afventende downloads
- `config.json` → firmanavn, CVR, type, momsperiode

### 3. Tjek Billy-status
- `billy_kontoplan` med `bankOnly=true` → find bankkonto
- `billy_banklinjer_uafstemte` → antal uafstemte banklinjer
- `billy_moms` → åbne momsperioder

### 4. Tjek frister
- `deadline_naeste` → næste 3 frister med dage til

### 5. Vis samlet overblik

```
Firma: Lauenborg (CVR: 39387735) — EMV, halvårsmoms

Status:
  Kendte leverandører:    15
  Uafstemte banklinjer:   231
  Afventer bilag:         8 (klar til afstemning når bilag er sendt)
  Manuelle downloads:     3 afventer
  Sidst bogført:          2/4-2026

Moms (1. halvår 2026):
  Salgsmoms:    12.500 kr.
  Købsmoms:      9.840 kr.
  Tilsvar:       3.860 kr.

Næste frister:
  1/5: Privat selvangivelse (29 dage)
  1/9: Momsindberetning (152 dage)

Kommandoer:
  /bogfoer-alt     Komplet bogføring
  /match-bilag     Match banklinjer med emails
  /bankafstem      Afstem banklinjer
  /momsafstem      Tjek moms
  /deadline        Alle frister

Hvad vil du gerne gøre?
```

### 6. Dokumentér
Tilføj til `memory/referat.md`: "Session startet [dato]"
