# dk-bogfoerer-crew

AI-drevet bogfoerer for danske virksomheder. Installeres i Claude Code og integrerer med **Billy.dk** og **Gmail**.

## Hvad det goer

- **Bilagsklassificering** — beskriv et bilag → faa konto, momskode og fradrag
- **Bogfoering i Billy** — opret posteringer direkte i dit regnskabsprogram
- **Gmail-fakturaer** — hent fakturaer fra din email og bogfoer dem
- **Bankafsteming** — gennemgaa uafstemte banklinjer og match dem
- **Momsopgoerelse** — beregn momstilsvar og klargoor indberetning
- **Loenkoersel** — beregn loen med A-skat, AM-bidrag, ATP, pension, feriepenge
- **Frist-overvaaagning** — hold styr paa alle indberetningsfrister
- **Aarsafslutning** — trin-for-trin guide med tjekliste
- **Lovopslag** — hent praecise lovtekster fra Retsinformation API
- **Fejldetektion** — find typiske bogfoeringsfejl (forkert momsfradrag, manglende bilag)

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
4. Spoerger om dit Billy API token

### Forudsaetninger

- [Claude Code](https://claude.ai/code) (CLI, desktop eller IDE)
- [Node.js](https://nodejs.org/) 18+
- [Billy.dk](https://www.billy.dk/) konto med API token
- Gmail MCP (valgfrit — til faktura-indhentning)

### Billy API token

1. Log ind paa [billy.dk](https://www.billy.dk/)
2. Gaa til **Indstillinger → Adgangstokens**
3. Opret et nyt token
4. Indsaet det under installation

## Brug

Efter installation, genstart Claude Code og brug:

```
/onboarding          ← Opsaet bogfoering for din virksomhed
/bogfoer             ← Konter og bogfoer et bilag
/gmail-bilag         ← Hent fakturaer fra Gmail
/bankafstem          ← Afstem banklinjer
/momsopgoer          ← Klargoor momsindberetning
/loenkoersel         ← Koer loen
/deadline            ← Vis naeste frister
/aarsafslutning      ← Aarsafslutning med tjekliste
```

Eller bare sig det i naturligt sprog:

> "Jeg har en restaurantregning paa 2.400 kr. med 3 gaester"
> "Hvornaar skal jeg indberette moms?"
> "Beregn loen for 35.000 kr. brutto med 37% traek"
> "Tjek mine uafstemte banklinjer"

## Arkitektur

```
dk-bogfoerer-crew/
├── install.sh              ← Koer denne
├── CLAUDE.md               ← Dispatcher + crew-instruktioner
│
├── agents/                 ← 6 AI-agents
│   ├── konterer.md         ← Bilag → konto + moms → Billy
│   ├── momsraadgiver.md    ← Moms/skat-ekspert + lovtekst
│   ├── loenberegner.md     ← Loenkoersel
│   ├── deadliner.md        ← Frist-overvaaagning
│   ├── fejlfinder.md       ← Bogfoeringskontrol
│   └── aarsafslutter.md    ← Aarsafslutning
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
├── bogfoerer-mcp/          ← MCP: Moms, skat, kontoplan, loen, retsinformation
│   └── (42 tools)
│
└── billy-mcp/              ← MCP: Billy.dk integration
    └── (22 tools)
```

### MCP-servere

| Server | Tools | Kilde |
|--------|-------|-------|
| dk-bogfoerer | 42 | Moms/skat-regler (statisk JSON) + Retsinformation API (live lovtekst) |
| billy | 22 | Billy.dk REST API (banklinjer, fakturaer, bogfoering, moms) |
| Gmail | 6 | Google Gmail MCP (email-soegning, laes beskeder) |

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
  ├── salesTaxReturns ──→ /momsopgoer ──→ Klargoor indberetning
  └── postings ──→ fejlfinder ──→ Tjekker for fejl
```

## Lovgivning og disclaimer

Dette vaerktoej er en **assistent** — ikke en certificeret bogfoerer eller revisor.

- Det juridiske ansvar for bogfoering ligger hos **virksomhedsejeren** (Bogfoeringsloven §5-6)
- Vaerktoejet erstatter IKKE professionel revisorraadgivning
- Tjek altid konteringer foer godkendelse
- Brug `/onboarding` for at opsaette korrekt

## Bidrag

Pull requests er velkomne. Se [CONTRIBUTING.md](CONTRIBUTING.md) for retningslinjer.

## Licens

MIT
