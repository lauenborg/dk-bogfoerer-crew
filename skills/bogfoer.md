---
name: bogfoer
description: "Konter og bogfør et bilag. Beskriv bilaget og få konto, momskode og bogføring i Billy."
---

# /bogfoer — Konter et bilag

Brugeren vil have et bilag konteret og bogført.

## Trin

1. Spørg hvad bilaget er (eller læs det hvis det er vedhæftet)
2. Brug `bilag_klassificer` fra dk-bogfoerer MCP til at finde konto + momskode
3. Brug `tjek_bilag` til at fange fejl
4. Vis konteringen og spørg om godkendelse
5. Når godkendt: brug `billy_dagboeger` for at finde den rigtige dagbog
6. Brug `billy_bogfoer` til at oprette posteringen i Billy
7. Bekræft at posteringen er oprettet

Brug konterer-agenten til at udføre arbejdet.
