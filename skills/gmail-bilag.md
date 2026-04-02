---
name: gmail-bilag
description: "Hent fakturaer og kvitteringer fra Gmail. Søger efter ubehandlede faktura-emails."
---

# /gmail-bilag — Hent fakturaer fra Gmail

Søg i Gmail efter fakturaer og kvitteringer der skal bogføres.

## Trin

1. Brug `gmail_search_messages` med søgning: `subject:(faktura OR invoice OR kvittering OR receipt) newer_than:30d`
2. List resultaterne for brugeren
3. For hver email brugeren vælger:
   a. Brug `gmail_read_message` for at læse indholdet
   b. Ekstraher: leverandør, beløb, moms, dato
   c. Brug konterer-agenten til at klassificere og bogføre

## Typiske søgninger

- `from:faktura@leverandoer.dk` — specifik leverandør
- `subject:faktura newer_than:7d` — fakturaer fra sidste uge
- `has:attachment filename:pdf newer_than:30d` — PDF-bilag
- `label:inbox -label:bogfoert` — ubogførte (hvis brugeren bruger labels)
