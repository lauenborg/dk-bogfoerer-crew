---
name: match-bilag
description: "Find faktura-emails der matcher uafstemte banklinjer. Download vedhæftede fakturaer og afstem automatisk."
---

# /match-bilag — Match banklinjer med emails

Find faktura-emails der matcher uafstemte banklinjer fra Billy, download vedhæftede fakturaer, og afstem.

## Workflow

For hver uafstemt banklinje:

### Trin 1: Hent uafstemte banklinjer
- Brug `billy_banklinjer_uafstemte` med bankens accountId
- Vis listen kompakt: dato, beløb, beskrivelse

### Trin 2: For hver banklinje — søg i Gmail
- Ekstraher leverandørnavn fra banklinjens beskrivelse
- Søg i Gmail med: `from:leverandør OR subject:leverandør amount:beløb newer_than:90d`
- Prøv flere søgestrategier:
  1. `subject:(faktura OR invoice) from:{leverandør}`
  2. `"{beløb}" from:{leverandør}`
  3. `subject:"{leverandør}" has:attachment`

### Trin 3: Analysér emailen
Når en matchende email er fundet:

**A) Email har vedhæftet PDF/billede:**
1. Læs emailen med `gmail_read_message`
2. Ekstraher: leverandør, beløb, moms, dato fra emailen/fakturaen
3. **Vedhæft bilag via Shine:** Videresend faktura-emailen til Shine receipts-adressen (læs fra `memory/regler.json` → `shine_receipts_email`). Brug `gmail_create_draft` med to-felt sat til Shine-adressen. Bed brugeren sende den.
4. **Kør igennem konterer-agenten:**
   - `bilag_klassificer` → korrekt konto + momskode (restaurant=25% fradrag, forsikring=momsfri, osv.)
   - `tjek_bilag` → fang fejl før bogføring
   - Tjek `memory/leverandoerer.json` → kender vi leverandøren?
5. Vis kontering og spørg brugeren om godkendelse
6. Opret dagbogstransaktion via `billy_bogfoer` med korrekt momskode
7. Godkend transaktion via `billy_transaktion_godkend`
8. Link til banklinjen via `billy_bankafstem_link`
9. Godkend match via `billy_bankmatch_godkend`
10. Opdater `memory/leverandoerer.json` med leverandør → konto + momskode

**B) Email har "download faktura"-link (ingen vedhæftning):**
1. Læs emailen
2. Find download-links i emailen (typisk: "Download faktura", "Se faktura", "View invoice")
3. Gem i `memory/manuelle_downloads.json`:
   ```json
   {
     "dato": "2026-03-27",
     "beløb": 1177.67,
     "leverandør": "Amazon",
     "banklinje_id": "...",
     "match_id": "...",
     "email_subject": "Your invoice",
     "download_url": "https://...",
     "status": "afventer_download"
   }
   ```
4. Fortæl brugeren: "Denne faktura skal downloades manuelt. Åbn linket, download PDF'en, og smid den i bilag/dump/"

**C) Ingen matchende email fundet:**
1. Gem i `memory/manuelle_downloads.json` med status "ingen_email_fundet"
2. Spørg brugeren om de har fakturaen et andet sted

### Trin 4: Opsummering
Vis en tabel:
```
Resultat:
  ✓ Automatisk afstemt: 5 banklinjer (email med vedhæftning)
  ○ Manuel download: 3 banklinjer (email med download-link)
  ✗ Ingen email: 2 banklinjer

Manuelle downloads gemt i: memory/manuelle_downloads.json
```

## Søgestrategier for typiske leverandører

| Banklinje-beskrivelse | Gmail-søgning |
|----------------------|---------------|
| "Amazon" | `from:auto-confirm@amazon.com OR from:order-update@amazon.com` |
| "Apple" | `from:no_reply@email.apple.com subject:receipt` |
| "Google" | `from:payments-noreply@google.com` |
| "Adobe" | `from:adobe.com subject:invoice` |
| "Simply.com" | `from:simply.com subject:faktura` |
| "Lunar" | `from:lunar.app subject:(kontoudtog OR statement)` |
| "APIFY" | `from:apify.com subject:(invoice OR faktura)` |

## Vigtige noter

- Spørg ALTID brugeren før du afstemmer
- Tjek at beløb matcher (email-faktura vs. banklinje)
- Husk momskode ved kontering (brug konterer-agenten)
- Opdater `memory/leverandoerer.json` med nye leverandør-email-mønstre
