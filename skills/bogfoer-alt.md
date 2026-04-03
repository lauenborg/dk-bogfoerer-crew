---
name: bogfoer-alt
description: "Komplet bogføring — matcher bilag + banklinjer + Gmail, afstemmer, kører moms/skat-tjek."
---

# /bogfoer-alt — Komplet bogføring

## ⛔ HUSK: Aldrig bogfør uden bilag (undtagen gebyrer/privat/renter)

## Flow

```
1. BILAG     → billy_bilag_uknyttede (find bilag i Billy)
2. BANK      → billy_banklinjer_uafstemte (find uafstemte banklinjer)
3. MATCH     → Match bilag med banklinjer (beløb + leverandør + dato)
4. AFSTEM    → KUN med bilag eller undtagne typer
5. GMAIL     → Søg fakturaer for resterende
6. LOG       → Gem i afventer_bilag.json
7. RAPPORT   → Vis opsummering med tabeller
8. MOMS/SKAT → Kør momsafstem + skatafstem
```

## Trin 1: Find bilag i Billy

`billy_bilag_uknyttede` — finder bilag sendt til Shine der ikke er matchet.
Hvert bilag har: leverandør (supplier), beløb (amount), dato (documentDate), valuta.

Læs også PDF-indhold med `billy_bilag_hent_pdf` for at få præcise fakturadata.

## Trin 2: Hent uafstemte banklinjer

`billy_banklinjer_uafstemte` med bankens accountId.

## Trin 3: Match bilag med banklinjer

For hvert uknyttet bilag — find den banklinje der matcher:
- Beløb matcher (±1 kr. tolerance pga. valutakurs)
- Dato matcher (±5 dage)
- Leverandør matcher (bilag.supplier ≈ banklinje.description)

## Trin 4: Afstem — KUN med bilag eller undtagne typer

**A) Banklinje HAR matchende bilag:**
1. Kør `bilag_klassificer` → konto + momskode
2. Find/opret leverandør: `billy_kontakter` → `billy_kontakt_opret` hvis ny
3. Spørg bruger om godkendelse (ÉT spørgsmål ad gangen)
4. Opret regning med bilag: `billy_regning_opret` (sæt attachmentId)
5. Link regning til bankmatch: `billy_bankafstem_link` med `bill:REGNINGS_ID`
6. Godkend: `billy_bankmatch_godkend`
7. Opdater `memory/leverandoerer.json` og `memory/referat.md`

**B) Banklinje er UNDTAGET type (OK uden bilag):**
- Privathævning → konto 7130, `billy_bankmatch_godkend` direkte
- Bankgebyr → konto 7200, direkte
- Rente → konto 7000/6000, direkte
- Moms/skat-betaling → direkte

**C) Banklinje HAR IKKE bilag og er IKKE undtaget:**
- ⛔ BOGFØR IKKE — gå til trin 5

## Trin 5: Gmail-søgning for resterende

For banklinjer UDEN bilag og IKKE undtaget:
1. Søg i Gmail: `from:leverandør subject:(faktura OR invoice OR receipt)`
2. Fundet → gem med status `email_fundet` + Gmail-link (`https://mail.google.com/mail/u/0/#inbox/{messageId}`)
3. Ikke fundet → gem med status `mangler_bilag` + konkret instruktion

## Trin 6: Gem i memory/afventer_bilag.json

Format:
```json
{
  "afventer": [{
    "banklinje_id": "abc", "match_id": "def", "dato": "2026-03-27",
    "beloeb": 1177.67, "side": "credit", "beskrivelse": "Amazon",
    "konto": "4400", "momskode": "koeb_25",
    "status": "email_fundet",
    "gmail_link": "https://mail.google.com/mail/u/0/#inbox/MSG_ID",
    "instruktion": "Videresend til Shine"
  }]
}
```
Statusser: `email_fundet` (har Gmail-link) eller `mangler_bilag` (med konkret instruktion).

## Trin 7: Vis rapport

```
═══ Bogføring ═══

Afstemt (med bilag fra Billy):
  ✓ Apify 237,96 kr. → konto 4400, EU reverse charge
  ✓ Simply.com 972,73 kr. → konto 4400, fuld moms

Afstemt (uden bilag — undtagne):
  ✓ Privathævning 5.000 kr. → konto 7130
  ✓ Lunar gebyr 289 kr. → konto 7200

⛔ IKKE afstemt — videresend faktura-email til Shine:
  ┌──────────┬────────────┬──────────────────────────────────────────┐
  │ Dato     │ Beløb      │ Gmail-link                               │
  ├──────────┼────────────┼──────────────────────────────────────────┤
  │ 27/3     │ 1.177 kr.  │ Amazon — https://mail.google.com/...     │
  │ 31/3     │   237 kr.  │ Adobe — https://mail.google.com/...      │
  └──────────┴────────────┴──────────────────────────────────────────┘

⛔ IKKE afstemt — find faktura manuelt:
  ┌──────────┬────────────┬──────────────────────────────────────────┐
  │ Dato     │ Beløb      │ Hvad skal du gøre?                       │
  ├──────────┼────────────┼──────────────────────────────────────────┤
  │ 15/3     │   499 kr.  │ GitHub: github.com/settings/billing      │
  │ 25/3     │   779 kr.  │ Apple: appleid.apple.com/purchase-history │
  └──────────┴────────────┴──────────────────────────────────────────┘

Shine: [fra memory/regler.json]
Sig "bilag klar" når du har videresendt/fundet dem.
```

Opdater `memory/referat.md` med alt der blev gjort:
```markdown
## 2026-04-03
### Afstemt
- Apify 237,96 kr. → 4400, KYE (EU services) — begrundelse: software-abonnement
### Afventer bilag
- Simply.com 972,73 kr. → email fundet, videresendes til Shine
### Afklaret med bruger
- Apple 779 kr. → iCloud, erhverv (bruger svarede via AskUserQuestion)
```

## Trin 8: Moms- og skatteafstemning

Kør `/momsafstem` — tjek at moms er korrekt bogført (EU reverse charge, fradragssatser).
Kør `/skatafstem` — tjek fradrag, privatandele, beregn forventet skat.
Gem resultat i `memory/indberetning.json`.
