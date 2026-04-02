---
name: gmail-bilag
description: "Hent fakturaer og kvitteringer fra Gmail. Soeger efter ubehandlede faktura-emails."
---

# /gmail-bilag — Hent fakturaer fra Gmail

Soeg i Gmail efter fakturaer og kvitteringer der skal bogfoeres.

## Trin

1. Brug `gmail_search_messages` med soegning: `subject:(faktura OR invoice OR kvittering OR receipt) newer_than:30d`
2. List resultaterne for brugeren
3. For hver email brugeren vælger:
   a. Brug `gmail_read_message` for at laese indholdet
   b. Ekstraher: leverandoer, beloeb, moms, dato
   c. Brug konterer-agenten til at klassificere og bogfoere

## Typiske soegninger

- `from:faktura@leverandoer.dk` — specifik leverandoer
- `subject:faktura newer_than:7d` — fakturaer fra sidste uge
- `has:attachment filename:pdf newer_than:30d` — PDF-bilag
- `label:inbox -label:bogfoert` — ubogfoerte (hvis brugeren bruger labels)
