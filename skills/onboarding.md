---
name: onboarding
description: "Oopret ny bogfoeringsklient. Konfigurer Billy-integration, virksomhedstype og momsperiode."
---

# /onboarding — Opsaet bogfoering

Guider brugeren igennem opsaetning af bogfoering.

## Trin

1. **Firmainfo** — Spoerg om:
   - Firmanavn
   - CVR-nummer
   - Virksomhedstype (ApS, EMV, A/S)
   - Momsperiode (halvaar/kvartal/maaned)
   - Branche

2. **Billy-integration** — Verificer at Billy API token virker:
   - Brug `billy_firma` for at hente firmainfo
   - Vis firmanavn og bekraeft det er korrekt

3. **Gmail-integration** — Tjek om Gmail MCP er tilgaengelig:
   - Brug `gmail_get_profile` for at verificere
   - Foreslaa Gmail-labels til faktura-haandtering

4. **Kontoplan** — Hent kontoplan fra Billy:
   - Brug `billy_kontoplan` 
   - Sammenlign med standardkontoplanen

5. **Frister** — Vis naeste deadlines:
   - Brug `deadline_oversigt` med den valgte virksomhedstype og momsperiode

6. **Bekraeft** — Opsummer konfigurationen og bekraeft at alt er klar
