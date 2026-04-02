#!/usr/bin/env node

import { readFile, mkdir, writeFile, readdir, stat, copyFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import {
  getToken, setToken, getOrganization, getDaybooks, getAccounts, getTaxRates,
  uploadFile,
} from "./billy-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_REPO = "lauenborg/dk-bogfoerer-crew";
const DEFAULT_INSTALL_DIR = join(process.env.HOME ?? "~", ".dk-bogfoerer");

function getCrewRoot(): string {
  // Lokal udvikling: brug relativ sti hvis agents/ eksisterer
  const localRoot = resolve(__dirname, "..", "..");
  if (existsSync(join(localRoot, "agents"))) return localRoot;
  // Installeret: brug ~/.dk-bogfoerer
  return DEFAULT_INSTALL_DIR;
}

async function ensureCrewInstalled(): Promise<string> {
  const crewRoot = getCrewRoot();

  // Allerede installeret lokalt (udvikling)?
  if (existsSync(join(crewRoot, "agents")) && existsSync(join(crewRoot, "bogfoerer-mcp", "src"))) {
    return crewRoot;
  }

  // Klon fra GitHub
  console.log(`  Henter dk-bogfoerer-crew fra GitHub...\n`);

  if (existsSync(DEFAULT_INSTALL_DIR)) {
    // Opdater eksisterende
    try {
      execSync("git pull --ff-only", { cwd: DEFAULT_INSTALL_DIR, stdio: "pipe" });
      console.log("  ✓ Opdateret til seneste version");
    } catch {
      console.log("  ⚠ Kunne ikke opdatere. Bruger eksisterende version.");
    }
  } else {
    try {
      execSync(`git clone https://github.com/${GITHUB_REPO}.git "${DEFAULT_INSTALL_DIR}"`, { stdio: "pipe" });
      console.log("  ✓ Klonet fra GitHub");
    } catch (e) {
      console.error(`  ✗ Kunne ikke klone: ${(e as Error).message}`);
      console.error(`  Prøv manuelt: git clone https://github.com/${GITHUB_REPO}.git ~/.dk-bogfoerer`);
      process.exit(1);
    }
  }

  return DEFAULT_INSTALL_DIR;
}

// ─── Readline helper ───

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: ReturnType<typeof createRl>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function askChoice(rl: ReturnType<typeof createRl>, question: string, choices: readonly string[]): Promise<string> {
  console.log(`  ${question}`);
  for (let i = 0; i < choices.length; i++) {
    console.log(`    ${i + 1}) ${choices[i]}`);
  }
  const answer = await ask(rl, "Vælg nummer", "1");
  const idx = parseInt(answer, 10) - 1;
  return choices[Math.max(0, Math.min(idx, choices.length - 1))];
}

// ─── Hjælpetekst ───

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════╗
║  dk-bogfoerer — AI Bogfører for Danmark          ║
╚══════════════════════════════════════════════════╝

Brug:
  dk-bogfoerer setup                Interaktiv førstegangsopsætning (start her!)
  dk-bogfoerer init [sti]           Opret mappestruktur for bogføring
  dk-bogfoerer dump <mappe>         Upload fakturaer/bilag til Billy
  dk-bogfoerer status               Vis Billy-forbindelse og firmainfo
  dk-bogfoerer deadlines            Vis næste indberetningsfrister
  dk-bogfoerer help                 Vis denne hjælp

Første gang? Kør:
  dk-bogfoerer setup
  `);
}

// ─── SETUP command (interaktiv førstegangsopsætning) ───

async function cmdSetup(): Promise<void> {
  const rl = createRl();
  const claudeJson = join(process.env.HOME ?? "~", ".claude.json");
  const claudeDir = join(process.env.HOME ?? "~", ".claude");

  console.log(`
╔══════════════════════════════════════════════════╗
║  dk-bogfoerer setup                              ║
║  Interaktiv opsætning af AI Bogfører             ║
╚══════════════════════════════════════════════════╝
`);

  // ─── Trin 1: Billy API token ───

  console.log("  ── Trin 1/6: Billy API token ──\n");
  console.log("  For at forbinde til dit regnskabsprogram (Billy) skal du bruge et API token.");
  console.log("  Find det i Billy: Indstillinger → Adgangstokens → Opret nyt token\n");

  const billyToken = await ask(rl, "Indsæt dit Billy API token");

  if (!billyToken) {
    console.log("\n  ⚠ Intet token angivet. Du kan tilføje det senere med 'dk-bogfoerer setup'.\n");
  } else {
    // Test token
    setToken(billyToken);
    try {
      const org = await getOrganization();
      console.log(`\n  ✓ Forbundet til Billy: ${org.name} (CVR: ${org.registrationNo ?? "—"})\n`);
    } catch (e) {
      console.log(`\n  ✗ Token virkede ikke: ${(e as Error).message}`);
      console.log("  Du kan prøve igen med 'dk-bogfoerer setup'.\n");
    }
  }

  // ─── Trin 2: Gmail ───

  console.log("  ── Trin 2/7: Gmail (faktura-indhentning) ──\n");

  // Tjek om Gmail MCP er konfigureret
  let gmailConfigured = false;
  if (existsSync(claudeJson)) {
    const existing = JSON.parse(await readFile(claudeJson, "utf-8")) as Record<string, unknown>;
    const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
    gmailConfigured = "claude_ai_Gmail" in servers || Object.keys(servers).some((k) => k.toLowerCase().includes("gmail"));
  }

  if (gmailConfigured) {
    console.log("  ✓ Gmail MCP er allerede konfigureret i Claude Code.\n");
  } else {
    console.log("  Gmail-integration lader dig hente fakturaer direkte fra din email.");
    console.log("  Det er en built-in Claude Code integration — du aktiverer den sådan:\n");
    console.log("    1. Åbn Claude Code");
    console.log("    2. Skriv /mcp");
    console.log("    3. Vælg 'Claude AI' → aktiver 'Gmail'");
    console.log("    4. Log ind med din Google-konto\n");
    console.log("  Når det er aktiveret kan du bruge /gmail-bilag til at søge fakturaer.\n");

    const gmailNow = await askChoice(rl, "Vil du aktivere Gmail nu? (kræver genstart af Claude Code)", ["Senere", "Vis mig hvordan"]);
    if (gmailNow === "Vis mig hvordan") {
      console.log("\n  I Claude Code terminalen:");
      console.log("    1. Tryk Ctrl+C for at stoppe denne setup (vi gemmer dit Billy token)");
      console.log("    2. Skriv: /mcp");
      console.log("    3. Scroll ned til 'Claude AI' sektionen");
      console.log("    4. Aktiver 'Gmail' og log ind");
      console.log("    5. Kør 'dk-bogfoerer setup' igen for at færdiggøre\n");
    }
  }

  // ─── Trin 3: Virksomhedsinfo ───

  console.log("  ── Trin 3/7: Virksomhedsinfo ──\n");

  let firmanavn = "";
  let cvr = "";
  if (billyToken) {
    try {
      const org = await getOrganization();
      firmanavn = (org.name as string) ?? "";
      cvr = (org.registrationNo as string) ?? "";
    } catch { /* ignore */ }
  }

  firmanavn = await ask(rl, "Firmanavn", firmanavn || undefined);
  cvr = await ask(rl, "CVR-nummer", cvr || undefined);

  const virksomhedstype = await askChoice(rl, "Virksomhedstype:", [
    "ApS (Anpartsselskab)",
    "EMV (Enkeltmandsvirksomhed)",
    "A/S (Aktieselskab)",
    "I/S (Interessentskab)",
  ]);
  const vtKort = virksomhedstype.split(" ")[0].toLowerCase();

  // ─── Trin 3: Momsperiode ───

  console.log("\n  ── Trin 4/7: Momsperiode ──\n");
  console.log("  Afhænger af din omsætning:");
  console.log("    Under 5 mio. kr.   → Halvår");
  console.log("    5-50 mio. kr.      → Kvartal");
  console.log("    Over 50 mio. kr.   → Måned\n");

  const momsperiode = await askChoice(rl, "Din momsperiode:", [
    "Halvår (under 5 mio.)",
    "Kvartal (5-50 mio.)",
    "Måned (over 50 mio.)",
  ]);
  const mpKort = momsperiode.split(" ")[0].toLowerCase();

  // ─── Trin 4: Har du ansatte? ───

  console.log("\n  ── Trin 5/7: Ansatte ──\n");
  const harAnsatte = await askChoice(rl, "Har virksomheden ansatte?", ["Ja", "Nej"]);
  const ansatte = harAnsatte === "Ja";

  const branche = await ask(rl, "Branche (f.eks. 'konsulent', 'handel', 'håndværker')", "generel");

  // ─── Trin 5: Bogføringsmappe ───

  console.log("\n  ── Trin 6/7: Bogføringsmappe ──\n");
  const defaultPath = join(process.cwd(), firmanavn ? firmanavn.toLowerCase().replace(/[^a-z0-9æøåäöü]/g, "-").replace(/-+/g, "-") : "bogfoering");
  const bogfoeringsSti = await ask(rl, "Hvor skal bogføringsmappen oprettes?", defaultPath);

  // ─── Trin 6: Installer ───

  console.log("\n  ── Trin 7/7: Installation ──\n");
  console.log("  Installerer...\n");

  // 6a: Hent/opdater crew fra GitHub + byg MCP-servere
  const CREW_ROOT = await ensureCrewInstalled();
  const bogfoeringMcpDir = join(CREW_ROOT, "bogfoerer-mcp");
  const billyMcpDir = join(CREW_ROOT, "billy-mcp");

  if (existsSync(bogfoeringMcpDir)) {
    try {
      if (!existsSync(join(bogfoeringMcpDir, "node_modules"))) {
        execSync("npm install --silent", { cwd: bogfoeringMcpDir, stdio: "ignore" });
      }
      if (!existsSync(join(bogfoeringMcpDir, "dist"))) {
        execSync("npm run build --silent", { cwd: bogfoeringMcpDir, stdio: "ignore" });
      }
      console.log("  ✓ dk-bogfoerer MCP klar (42 tools: moms, skat, kontoplan, løn, retsinformation)");
    } catch {
      console.log("  ⚠ Kunne ikke bygge dk-bogfoerer MCP. Kør 'npm install && npm run build' i bogfoerer-mcp/");
    }
  }

  if (existsSync(billyMcpDir)) {
    try {
      if (!existsSync(join(billyMcpDir, "node_modules"))) {
        execSync("npm install --silent", { cwd: billyMcpDir, stdio: "ignore" });
      }
      if (!existsSync(join(billyMcpDir, "dist"))) {
        execSync("npm run build --silent", { cwd: billyMcpDir, stdio: "ignore" });
      }
      console.log("  ✓ Billy MCP klar (26 tools: banklinjer, fakturaer, bogføring, moms)");
    } catch {
      console.log("  ⚠ Kunne ikke bygge Billy MCP. Kør 'npm install && npm run build' i billy-mcp/");
    }
  }

  // 6b: Registrer MCP-servere i ~/.claude.json
  let claudeConfig: Record<string, unknown> = {};
  if (existsSync(claudeJson)) {
    claudeConfig = JSON.parse(await readFile(claudeJson, "utf-8")) as Record<string, unknown>;
  }
  const mcpServers = (claudeConfig.mcpServers ?? {}) as Record<string, unknown>;

  if (existsSync(join(bogfoeringMcpDir, "dist", "index.js"))) {
    mcpServers["dk-bogfoerer"] = {
      command: "node",
      args: [join(bogfoeringMcpDir, "dist", "index.js")],
    };
  }
  if (existsSync(join(billyMcpDir, "dist", "index.js"))) {
    mcpServers["billy"] = {
      command: "node",
      args: [join(billyMcpDir, "dist", "index.js")],
      ...(billyToken ? { env: { BILLY_API_TOKEN: billyToken } } : {}),
    };
  }

  claudeConfig.mcpServers = mcpServers;
  await writeFile(claudeJson, JSON.stringify(claudeConfig, null, 2), "utf-8");
  console.log("  ✓ MCP-servere registreret i Claude Code");

  // 6c: Installer agents
  const agentsSource = join(CREW_ROOT, "agents");
  const agentsTarget = join(claudeDir, "agents");
  if (existsSync(agentsSource)) {
    await mkdir(agentsTarget, { recursive: true });
    const agentFiles = await readdir(agentsSource);
    for (const f of agentFiles) {
      if (f.endsWith(".md")) {
        await copyFile(join(agentsSource, f), join(agentsTarget, f));
      }
    }
    console.log(`  ✓ ${agentFiles.filter((f) => f.endsWith(".md")).length} agents installeret`);
  }

  // 6d: Installer skills
  const skillsSource = join(CREW_ROOT, "skills");
  const skillsTarget = join(claudeDir, "skills");
  if (existsSync(skillsSource)) {
    const skillFiles = await readdir(skillsSource);
    for (const f of skillFiles) {
      if (f.endsWith(".md")) {
        const skillName = f.replace(".md", "");
        await mkdir(join(skillsTarget, skillName), { recursive: true });
        await copyFile(join(skillsSource, f), join(skillsTarget, skillName, "SKILL.md"));
      }
    }
    console.log(`  ✓ ${skillFiles.filter((f) => f.endsWith(".md")).length} skills installeret`);
  }

  // 6e: Opret bogføringsmappe
  const target = resolve(bogfoeringsSti);
  const dirs = [
    "bilag/indgaaende",
    "bilag/udgaaende",
    "bilag/dump",
    "bank",
    "moms",
    "rapporter",
    ...(ansatte ? ["loen"] : []),
    "aarsafslutning",
  ];
  for (const dir of dirs) {
    await mkdir(join(target, dir), { recursive: true });
  }

  // Config
  const config = {
    firmanavn,
    cvr,
    virksomhedstype: vtKort,
    momsperiode: mpKort,
    branche,
    har_ansatte: ansatte,
    regnskabsaar: "kalenderår",
    oprettet: new Date().toISOString().slice(0, 10),
    billy_token_sat: !!billyToken,
  };
  await writeFile(join(target, "config.json"), JSON.stringify(config, null, 2), "utf-8");

  // CLAUDE.md — dispatcher-instruktioner tilpasset denne virksomhed
  const claudeMd = `# ${firmanavn || "Bogføring"} — AI Bogfører

Du er AI-bogfører for **${firmanavn || "denne virksomhed"}**${cvr ? ` (CVR: ${cvr})` : ""}.
Virksomhedstype: **${virksomhedstype}** | Momsperiode: **${momsperiode}** | ${ansatte ? "Har ansatte" : "Ingen ansatte"} | Branche: ${branche}

## Dine regler

- Slå ALTID regler op via MCP-tools — stol aldrig på hukommelsen
- Spørg ALTID brugeren om godkendelse før du bogfører noget i Billy
- Citer lovtekst med lov_paragraf når du rådgiver om regler
- Advar om usikkerhed — anbefal professionel revisor ved komplekse spørgsmål
- Svar på dansk

## MCP-servere

| Server | Tools | Hvad den gør |
|--------|-------|---------------|
| **dk-bogfoerer** | 42 | Momsregler, skatteregler, kontoplan, lønsatser, deadlines, Retsinformation (lovtekst) |
| **billy** | 26 | Billy.dk: banklinjer, fakturaer, regninger, bogføring, momsopgørelse, bankafstemning |
| **Gmail** | 6 | Email: søg fakturaer, læs beskeder |

## Slash-commands

| Kommando | Hvad den gør |
|----------|--------------|
| \`/bogfoer\` | Konter og bogfør et bilag i Billy |
| \`/gmail-bilag\` | Hent fakturaer fra Gmail og bogfør dem |
| \`/bankafstem\` | Gennemgå uafstemte banklinjer fra Billy |
| \`/momsopgoer\` | Beregn momstilsvar og klargør indberetning |
${ansatte ? "| `/loenkoersel` | Kør løn for medarbejdere |\n" : ""}| \`/aarsafslutning\` | Komplet årsafslutning med tjekliste |
| \`/deadline\` | Vis næste indberetningsfrister |
| \`/onboarding\` | Genkonfigurer bogføring |

## Agents

| Agent | Hvornår |
|-------|----------|
| **konterer** | Brugeren har et bilag/faktura/kvittering |
| **momsraadgiver** | Spørgsmål om moms, skat, lovregler |
${ansatte ? "| **loenberegner** | Lønkørsel, satser, personalegoder |\n" : ""}| **deadliner** | Frister og deadlines |
| **fejlfinder** | Tjek konteringer for fejl |
| **aarsafslutter** | Årsafslutning |

## Dispatcher

Når brugeren skriver noget:
1. Slash-command → aktiver den skill
2. Bilag/faktura/kvittering → **konterer**
3. Moms/skat-spørgsmål → **momsraadgiver**
${ansatte ? "4. Løn → **loenberegner**\n" : ""}${ansatte ? "5" : "4"}. Frister → **deadliner**
${ansatte ? "6" : "5"}. Kontrol/gennemgang → **fejlfinder**
${ansatte ? "7" : "6"}. Årsafslutning → **aarsafslutter**
${ansatte ? "8" : "7"}. Ellers → svar direkte med MCP-tools

## Denne virksomhed

- **Momsperiode:** ${mpKort} — frister via \`deadline_oversigt\`
- **Type:** ${vtKort.toUpperCase()}${vtKort === "emv" ? " — husk virksomhedsordningen (skat_virksomhedsordning)" : ""}${vtKort === "aps" || vtKort === "as" ? " — husk selskabsskat 22% (skat_selskab)" : ""}
${ansatte ? "- **Ansatte:** Ja — lønkørsel med A-skat/AM-bidrag" : "- **Ingen ansatte** — spring lønrelaterede tools over"}
- **Branche:** ${branche}

## Vigtige love (brug lov_paragraf)

- **Momsloven** (2024/209) — ML §13 (fritagelser), §37 (fradrag), §42 (restaurant/hotel)
- **Bogføringsloven** (2022/700) — registrering, opbevaring, digitale krav
${vtKort === "emv" ? "- **Virksomhedsskatteloven** (2021/1836) — virksomhedsordningen\n" : ""}${vtKort === "aps" || vtKort === "as" ? "- **Selskabsskatteloven** (2025/279) — 22% selskabsskat\n" : ""}- **Kildeskatteloven** (2024/460) — A-skat, AM-bidrag
- **Ligningsloven** (2025/1500) — fradrag, kørselsgodtgørelse

## Hukommelse

Du har en lokal hukommelse i \`memory/\`-mappen. Den holder styr på ting du lærer om denne virksomhed.

### Automatisk opdatering

Efter HVER bogføring eller rådgivning, tjek om du har lært noget nyt der bør gemmes:

- **Ny leverandør-kontering:** Første gang du konterer en faktura fra en leverandør, gem mappingen i \`memory/leverandoerer.json\`
- **Korrektioner:** Hvis brugeren retter din kontering, gem den korrekte kontering så du gør det rigtigt næste gang
- **Særlige regler:** Hvis virksomheden har specielle momsregler, delvis momsfradrag, eller andre undtagelser
- **Beslutninger:** Hvis brugeren træffer en beslutning om bogføringspraksis (f.eks. "vi bogfører altid kantineudgifter på 4230")

### Hukommelsesfiler

| Fil | Indhold |
|-----|---------|
| \`memory/leverandoerer.json\` | Leverandør → konto + momskode mapping |
| \`memory/konteringer.json\` | Typiske konteringer og korrektioner |
| \`memory/regler.json\` | Virksomhedsspecifikke regler og beslutninger |
| \`memory/log.json\` | Kronologisk log over bogførte poster |

### Sådan bruger du hukommelsen

1. **Før kontering:** Læs \`memory/leverandoerer.json\` — kender du leverandøren? Brug den gemte kontering.
2. **Efter kontering:** Opdater \`memory/leverandoerer.json\` med nye leverandører og \`memory/log.json\` med posteringen.
3. **Ved korrektioner:** Opdater \`memory/konteringer.json\` med den korrekte kontering.
4. **Ved nye regler:** Opdater \`memory/regler.json\`.

### Format: leverandoerer.json
\`\`\`json
{
  "leverandoerer": {
    "Adobe Systems": { "konto": "4400", "momskode": "koeb_25", "beskrivelse": "Software-licenser" },
    "Sunset Boulevard": { "konto": "3700", "momskode": "rest_25pct_fradrag", "beskrivelse": "Restaurant/frokost" }
  }
}
\`\`\`

### Format: konteringer.json
\`\`\`json
{
  "konteringer": [
    {
      "dato": "2026-04-02",
      "hvad": "Brugeren rettede: restaurant-udgift var bogført med fuld moms, skal være 25% fradrag",
      "foer": { "konto": "4100", "momskode": "koeb_25" },
      "efter": { "konto": "3700", "momskode": "rest_25pct_fradrag" },
      "laering": "Restaurant/forplejning skal altid på 3700 med 25% momsfradrag"
    }
  ]
}
\`\`\`

### Format: regler.json
\`\`\`json
{
  "regler": [
    {
      "dato": "2026-04-02",
      "regel": "Vi bruger altid konto 4230 til kantineordning, ikke 3700",
      "kilde": "Brugeren"
    }
  ]
}
\`\`\`
`;

  await writeFile(join(target, "CLAUDE.md"), claudeMd, "utf-8");
  console.log("  ✓ CLAUDE.md genereret (tilpasset din virksomhed)");

  // Opret memory-mappe med tomme filer
  await mkdir(join(target, "memory"), { recursive: true });
  await writeFile(join(target, "memory", "leverandoerer.json"), JSON.stringify({ leverandoerer: {} }, null, 2), "utf-8");
  await writeFile(join(target, "memory", "konteringer.json"), JSON.stringify({ konteringer: [] }, null, 2), "utf-8");
  await writeFile(join(target, "memory", "regler.json"), JSON.stringify({ regler: [] }, null, 2), "utf-8");
  await writeFile(join(target, "memory", "log.json"), JSON.stringify({ poster: [] }, null, 2), "utf-8");
  console.log("  ✓ Hukommelse oprettet (memory/)");

  // Hent data fra Billy
  if (billyToken) {
    try {
      const accounts = await getAccounts();
      await writeFile(join(target, "kontoplan-billy.json"), JSON.stringify(accounts, null, 2), "utf-8");
      console.log(`  ✓ Kontoplan hentet fra Billy (${accounts.length} konti)`);
    } catch { /* stille */ }

    try {
      const daybooks = await getDaybooks();
      await writeFile(join(target, "dagboeger.json"), JSON.stringify(daybooks, null, 2), "utf-8");
    } catch { /* stille */ }

    try {
      const taxRates = await getTaxRates();
      await writeFile(join(target, "momssatser.json"), JSON.stringify(taxRates, null, 2), "utf-8");
    } catch { /* stille */ }
  }

  // README
  const readme = [
    `# ${firmanavn || "Bogføring"}`,
    "",
    `| Felt | Værdi |`,
    `|------|--------|`,
    `| CVR | ${cvr || "—"} |`,
    `| Type | ${virksomhedstype} |`,
    `| Momsperiode | ${momsperiode} |`,
    `| Branche | ${branche} |`,
    `| Ansatte | ${ansatte ? "Ja" : "Nej"} |`,
    "",
    "## Brug",
    "```bash",
    "# Smid fakturaer i dump-mappen og upload til Billy",
    `dk-bogfoerer dump ${join(target, "bilag/dump/")}`,
    "",
    "# Se frister",
    "dk-bogfoerer deadlines",
    "",
    "# I Claude Code:",
    "/bogfoer          # Konter et bilag",
    "/gmail-bilag      # Hent fakturaer fra email",
    "/bankafstem       # Afstem banklinjer",
    "/momsopgoer       # Klargør momsindberetning",
    ...(ansatte ? ["/loenkoersel      # Kør løn"] : []),
    "/aarsafslutning   # Årsafslutning",
    "/deadline         # Vis frister",
    "```",
    "",
    "## Mappestruktur",
    "```",
    "bilag/dump/          ← Smid filer her → dk-bogfoerer dump",
    "bilag/indgaaende/    ← Købsfakturaer",
    "bilag/udgaaende/     ← Salgsfakturaer",
    "bank/                ← Kontoudtog",
    ...(ansatte ? ["loen/                ← Lønsedler"] : []),
    "moms/                ← Momsindberetninger",
    "aarsafslutning/      ← Årsregnskab",
    "rapporter/           ← Perioderegnskaber",
    "```",
  ].join("\n");
  await writeFile(join(target, "README.md"), readme, "utf-8");
  await writeFile(join(target, ".gitignore"), "config.json\n*.billy.json\n.processed/\n", "utf-8");

  console.log(`  ✓ Bogføringsmappe oprettet: ${target}`);

  // ─── Opsummering ───

  console.log(`
╔══════════════════════════════════════════════════╗
║  Setup færdig!                                   ║
╚══════════════════════════════════════════════════╝

  Firma:           ${firmanavn || "—"}
  CVR:             ${cvr || "—"}
  Type:            ${virksomhedstype}
  Momsperiode:     ${momsperiode}
  Ansatte:         ${ansatte ? "Ja" : "Nej"}
  Billy:           ${billyToken ? "✓ Forbundet" : "✗ Ikke forbundet"}
  Gmail:           ${gmailConfigured ? "✓ Aktiv" : "○ Ikke aktiveret (brug /mcp i Claude Code)"}

  Bogføringsmappe: ${target}

  Næste skridt:
    1. Genstart Claude Code (luk og åben igen)
    2. Smid fakturaer i: ${join(target, "bilag/dump/")}
    3. Kør: dk-bogfoerer dump ${join(target, "bilag/dump/")}
    4. Eller åbn Claude Code og skriv /bogfoer
  `);

  rl.close();
}

// ─── INIT command (hurtig mappeopsaetning uden interaktion) ───

async function cmdInit(targetPath?: string): Promise<void> {
  const target = resolve(targetPath ?? ".");
  console.log("\n  dk-bogfoerer init\n");

  let orgName = "Ukendt";
  try {
    const org = await getOrganization();
    orgName = (org.name as string) ?? "Ukendt";
    console.log(`  ✓ Billy: ${orgName}`);
  } catch {
    console.log("  ⚠ Billy ikke forbundet. Kør 'dk-bogfoerer setup' først.");
  }

  const dirs = ["bilag/indgaaende", "bilag/udgaaende", "bilag/dump", "bank", "loen", "moms", "aarsafslutning", "rapporter"];
  for (const dir of dirs) await mkdir(join(target, dir), { recursive: true });

  await writeFile(join(target, "config.json"), JSON.stringify({ firmanavn: orgName, oprettet: new Date().toISOString().slice(0, 10) }, null, 2), "utf-8");
  await writeFile(join(target, ".gitignore"), "config.json\n*.billy.json\n.processed/\n", "utf-8");

  console.log(`  ✓ Mappestruktur oprettet: ${target}\n`);
}

// ─── DUMP command ───

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp", ".heic"]);

async function cmdDump(dumpPath: string): Promise<void> {
  const target = resolve(dumpPath);
  if (!existsSync(target)) {
    console.error(`  Fejl: "${target}" eksisterer ikke.`);
    process.exit(1);
  }

  console.log(`\n  dk-bogfoerer dump — ${target}\n`);

  try { getToken(); } catch (e) {
    console.error(`  ${(e as Error).message}`);
    console.error("  Kør 'dk-bogfoerer setup' først.");
    process.exit(1);
  }

  const entries = await readdir(target);
  const files = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const filePath = join(target, entry);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;
    if (!SUPPORTED_EXTENSIONS.has(extname(entry).toLowerCase())) continue;
    files.push({ path: filePath, name: entry, size: fileStat.size });
  }

  if (files.length === 0) {
    console.log("  Ingen filer fundet. Formater: PDF, PNG, JPG, GIF, WEBP, TIFF, BMP, HEIC");
    return;
  }

  console.log(`  ${files.length} filer fundet:\n`);

  const processedDir = join(target, ".processed");
  await mkdir(processedDir, { recursive: true });

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const buffer = await readFile(file.path);
      const base64 = buffer.toString("base64");
      const uploadResult = await uploadFile(file.name, base64);
      const fileId = uploadResult.id as string;

      console.log(`  ✓ ${file.name} (${(file.size / 1024).toFixed(0)} KB) → Billy: ${fileId}`);

      await copyFile(file.path, join(processedDir, file.name));
      await unlink(file.path);

      await writeFile(join(processedDir, `${file.name}.billy.json`), JSON.stringify({
        original_name: file.name,
        billy_file_id: fileId,
        uploaded_at: new Date().toISOString(),
        size_bytes: file.size,
      }, null, 2), "utf-8");

      uploaded++;
    } catch (e) {
      console.log(`  ✗ ${file.name}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`
  Uploaded: ${uploaded} | Fejlede: ${failed}
  Filer flyttet til: ${processedDir}

  Åbn Claude Code og skriv /bogfoer for at kontere filerne.
  `);
}

// ─── STATUS command ───

async function cmdStatus(): Promise<void> {
  console.log("\n  dk-bogfoerer status\n");
  try {
    getToken();
    const org = await getOrganization();
    console.log(`  Firma:     ${org.name}`);
    console.log(`  CVR:       ${org.registrationNo ?? "—"}`);
    console.log(`  Valuta:    ${org.baseCurrencyId ?? "DKK"}`);
    console.log(`  Billy ID:  ${org.id}`);

    const daybooks = await getDaybooks();
    console.log(`  Dagbøger: ${daybooks.length} stk`);
    for (const db of daybooks) {
      console.log(`    - ${db.name} (${db.id})`);
    }
    console.log("\n  ✓ Billy OK\n");
  } catch (e) {
    console.error(`  ✗ ${(e as Error).message}`);
    console.error("  Kør 'dk-bogfoerer setup' for at konfigurere.\n");
  }
}

// ─── DEADLINES command ───

async function cmdDeadlines(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n  dk-bogfoerer deadlines (${today})\n`);

  const deadlines = [
    { frist: "2026-09-01", beskrivelse: "Moms: 1. halvår 2026" },
    { frist: "2027-03-01", beskrivelse: "Moms: 2. halvår 2026" },
    { frist: "2026-05-11", beskrivelse: "A-skat/AM-bidrag: April" },
    { frist: "2026-06-10", beskrivelse: "A-skat/AM-bidrag: Maj" },
    { frist: "2026-07-10", beskrivelse: "A-skat/AM-bidrag: Juni" },
    { frist: "2026-08-10", beskrivelse: "A-skat/AM-bidrag: Juli" },
    { frist: "2026-09-10", beskrivelse: "A-skat/AM-bidrag: August" },
    { frist: "2026-10-12", beskrivelse: "A-skat/AM-bidrag: September" },
    { frist: "2026-11-10", beskrivelse: "A-skat/AM-bidrag: Oktober" },
    { frist: "2026-12-10", beskrivelse: "A-skat/AM-bidrag: November" },
    { frist: "2026-11-20", beskrivelse: "Selskabsskat: 2. aconto-rate" },
    { frist: "2026-05-01", beskrivelse: "Privat selvangivelse" },
    { frist: "2026-05-31", beskrivelse: "Årsrapport til Erhvervsstyrelsen" },
    { frist: "2026-06-30", beskrivelse: "Selskabsselvangivelse" },
    { frist: "2026-07-01", beskrivelse: "Udvidet selvangivelse (selvstændige)" },
  ];

  const kommende = deadlines
    .filter((d) => d.frist >= today)
    .sort((a, b) => a.frist.localeCompare(b.frist))
    .slice(0, 8);

  if (kommende.length === 0) {
    console.log("  Ingen kommende deadlines.");
    return;
  }

  for (const d of kommende) {
    const dage = Math.ceil((new Date(d.frist).getTime() - new Date(today).getTime()) / 86400000);
    const urgency = dage <= 7 ? " ⚠ SNART!" : dage <= 30 ? " ←" : "";
    console.log(`  ${d.frist}  ${d.beskrivelse}  (${dage} dage)${urgency}`);
  }
  console.log();
}

// ─── Main router ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "setup":
      await cmdSetup();
      break;
    case "init":
      await cmdInit(args[1]);
      break;
    case "dump":
      if (!args[1]) {
        console.error("  Brug: dk-bogfoerer dump <mappe>");
        process.exit(1);
      }
      await cmdDump(args[1]);
      break;
    case "status":
      await cmdStatus();
      break;
    case "deadlines":
      await cmdDeadlines();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    case undefined:
      // Første gang? Kør setup
      if (!existsSync(join(process.env.HOME ?? "~", ".claude.json")) ||
          !process.env.BILLY_API_TOKEN) {
        console.log("\n  Velkommen! Kører førstegangsopsætning...\n");
        await cmdSetup();
      } else {
        printHelp();
      }
      break;
    default:
      console.error(`  Ukendt kommando: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fejl:", error.message);
  process.exit(1);
});
