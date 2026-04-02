# dk-bogfoerer-crew

AI-drevet bogfører for danske virksomheder. Installeres i Claude Code og integrerer med **Billy.dk** og **Gmail**.

## Hvad det gør

- **Bilagsklassificering** — beskriv et bilag → få konto, momskode og fradrag
- **Bogføring i Billy** — opret posteringer direkte i dit regnskabsprogram
- **Gmail-fakturaer** — hent fakturaer fra din email og bogfør dem
- **Bankafstemning** — gennemgå uafstemte banklinjer og match dem
- **Momsopgørelse** — beregn momstilsvar og klargør indberetning
- **Lønkørsel** — beregn løn med A-skat, AM-bidrag, ATP, pension, feriepenge
- **Frist-overvågning** — hold styr på alle indberetningsfrister
- **Årsafslutning** — trin-for-trin guide med tjekliste
- **Lovopslag** — hent præcise lovtekster fra Retsinformation API
- **Fejldetektion** — find typiske bogføringsfejl (forkert momsfradrag, manglende bilag)

## Installation

```bash
git clone https://github.com/DIT_BRUGERNAVN/dk-bogfoerer-crew.git
cd dk-bogfoerer-crew
bash install.sh
```

Installeren:
1. Bygger 2 MCP-servere (dk-bogfoerer + Billy)
2. Installerer 6 agents og 8 skills
3. Registrerer MCP-serverne i Claude Code
4. Spørger om dit Billy API token

### Forudsætninger

- [Claude Code](https://claude.ai/code) (CLI, desktop eller IDE)
- [Node.js](https://nodejs.org/) 18+
- [Billy.dk](https://www.billy.dk/) konto med API token
- Gmail MCP (valgfrit — til faktura-indhentning)

### Billy API token

1. Log ind på [billy.dk](https://www.billy.dk/)
2. Gå til **Indstillinger → Adgangstokens**
3. Opret et nyt token
4. Indsæt det under installation

## Brug

Efter installation, genstart Claude Code og brug:

```
/onboarding          ← Opsæt bogføring for din virksomhed
/bogfoer             ← Konter og bogfør et bilag
/gmail-bilag         ← Hent fakturaer fra Gmail
/bankafstem          ← Afstem banklinjer
/momsopgoer          ← Klargør momsindberetning
/loenkoersel         ← Kør løn
/deadline            ← Vis næste frister
/aarsafslutning      ← Årsafslutning med tjekliste
```

Eller bare sig det i naturligt sprog:

> "Jeg har en restaurantregning på 2.400 kr. med 3 gæster"
> "Hvornår skal jeg indberette moms?"
> "Beregn løn for 35.000 kr. brutto med 37% træk"
> "Tjek mine uafstemte banklinjer"

## Arkitektur

```
dk-bogfoerer-crew/
├── install.sh              ← Kør denne
├── CLAUDE.md               ← Dispatcher + crew-instruktioner
│
├── agents/                 ← 6 AI-agents
│   ├── konterer.md         ← Bilag → konto + moms → Billy
│   ├── momsraadgiver.md    ← Moms/skat-ekspert + lovtekst
│   ├── loenberegner.md     ← Lønkørsel
│   ├── deadliner.md        ← Frist-overvågning
│   ├── fejlfinder.md       ← Bogføringskontrol
│   └── aarsafslutter.md    ← Årsafslutning
│
├── skills/                 ← 8 slash-commands
│   ├── bogfoer.md          ← /bogfoer
│   ├── gmail-bilag.md      ← /gmail-bilag
│   ├── bankafsttem.md      ← /bankafstem
│   ├── momsopgoer.md       ← /momsopgoer
│   ├── loenkoersel.md      ← /loenkoersel
│   ├── aarsafslutning.md   ← /aarsafslutning
│   ├── deadline-check.md   ← /deadline
│   └── onboarding.md       ← /onboarding
│
├── bogfoerer-mcp/          ← MCP: Moms, skat, kontoplan, løn, retsinformation
│   └── (42 tools)
│
└── billy-mcp/              ← MCP: Billy.dk integration
    └── (22 tools)
```

### MCP-servere

| Server | Tools | Kilde |
|--------|-------|-------|
| dk-bogfoerer | 42 | Moms/skat-regler (statisk JSON) + Retsinformation API (live lovtekst) |
| billy | 22 | Billy.dk REST API (banklinjer, fakturaer, bogføring, moms) |
| Gmail | 6 | Google Gmail MCP (email-søgning, læs beskeder) |

### Dataflow

```
Gmail ──→ /gmail-bilag ──→ Henter fakturaer
                                │
                                ▼
                         konterer-agent
                         (bilag_klassificer)
                                │
                                ▼
Billy ←── billy_bogfoer ←── Opretter postering
  │
  ├── bankLines ──→ /bankafstem ──→ Matcher banklinjer
  ├── salesTaxReturns ──→ /momsopgoer ──→ Klargør indberetning
  └── postings ──→ fejlfinder ──→ Tjekker for fejl
```

## Lovgivning og disclaimer

Dette værktøj er en **assistent** — ikke en certificeret bogfører eller revisor.

- Det juridiske ansvar for bogføring ligger hos **virksomhedsejeren** (Bogføringsloven §5-6)
- Værktøjet erstatter IKKE professionel revisorådgivning
- Tjek altid konteringer før godkendelse
- Brug `/onboarding` for at opsætte korrekt

## Bidrag

Pull requests er velkomne. Se [CONTRIBUTING.md](CONTRIBUTING.md) for retningslinjer.

## Licens

MIT
