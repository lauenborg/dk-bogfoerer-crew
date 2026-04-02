---
name: bogfoer
description: "Konter og bogfoer et bilag. Beskriv bilaget og faa konto, momskode og bogfoering i Billy."
---

# /bogfoer — Konter et bilag

Brugeren vil have et bilag konteret og bogfoert.

## Trin

1. Spoerg hvad bilaget er (eller laes det hvis det er vedhæftet)
2. Brug `bilag_klassificer` fra dk-bogfoerer MCP til at finde konto + momskode
3. Brug `tjek_bilag` til at fange fejl
4. Vis konteringen og spoerg om godkendelse
5. Naar godkendt: brug `billy_dagboeger` for at finde den rigtige dagbog
6. Brug `billy_bogfoer` til at oprette posteringen i Billy
7. Bekraeft at posteringen er oprettet

Brug konterer-agenten til at udfore arbejdet.
