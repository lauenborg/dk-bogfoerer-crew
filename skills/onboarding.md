---
name: onboarding
description: "Opret ny bogføringsklient. Konfigurer Billy-integration, virksomhedstype og momsperiode."
---

# /onboarding — Opsæt bogføring

Guider brugeren igennem opsætning af bogføring.

## Trin

1. **Firmainfo** — Spørg om:
   - Firmanavn
   - CVR-nummer
   - Virksomhedstype (ApS, EMV, A/S)
   - Momsperiode (halvår/kvartal/måned)
   - Branche

2. **Billy-integration** — Verificer at Billy API token virker:
   - Brug `billy_firma` for at hente firmainfo
   - Vis firmanavn og bekræft det er korrekt

3. **Gmail-integration** — Tjek om Gmail MCP er tilgængelig:
   - Brug `gmail_get_profile` for at verificere
   - Foreslå Gmail-labels til faktura-håndtering

4. **Kontoplan** — Hent kontoplan fra Billy:
   - Brug `billy_kontoplan` 
   - Sammenlign med standardkontoplanen

5. **Frister** — Vis næste deadlines:
   - Brug `deadline_oversigt` med den valgte virksomhedstype og momsperiode

6. **Bekræft** — Opsummer konfigurationen og bekræft at alt er klar
