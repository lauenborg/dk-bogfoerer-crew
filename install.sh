#!/usr/bin/env bash
set -euo pipefail

# ─── dk-bogfoerer-crew installer ───
# Installer AI Bogfoerer for danske virksomheder
# Saetter MCP-servere, agents, skills og CLAUDE.md op

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_JSON="$HOME/.claude.json"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  dk-bogfoerer-crew — AI Bogfoerer for Danmark   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Tjek forudsaetninger ───

if ! command -v node &> /dev/null; then
  echo "FEJL: Node.js er ikke installeret. Installer via: brew install node"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "FEJL: npm er ikke installeret."
  exit 1
fi

echo "✓ Node.js $(node --version) fundet"

# ─── Billy API token ───

echo ""
if [ -z "${BILLY_API_TOKEN:-}" ]; then
  echo "Billy API token kraeves for at integrere med dit regnskabsprogram."
  echo "Find dit token: Billy → Indstillinger → Adgangstokens"
  echo ""
  read -rp "Indsaet dit Billy API token: " BILLY_TOKEN
  if [ -z "$BILLY_TOKEN" ]; then
    echo "ADVARSEL: Intet Billy token angivet. Billy-integration vil ikke virke."
    echo "Du kan tilfoeje det senere i ~/.claude.json under mcpServers.billy.env"
    BILLY_TOKEN="INDSAET_DIT_TOKEN_HER"
  fi
else
  BILLY_TOKEN="$BILLY_API_TOKEN"
  echo "✓ Billy API token fundet i environment"
fi

# ─── Byg MCP-servere ───

echo ""
echo "Bygger dk-bogfoerer MCP server..."
cd "$SCRIPT_DIR/bogfoerer-mcp"
if [ ! -d "node_modules" ]; then
  npm install --silent 2>&1 | tail -1
fi
npm run build --silent 2>&1
echo "✓ dk-bogfoerer MCP bygget (42 tools)"

echo ""
echo "Bygger Billy MCP server..."
cd "$SCRIPT_DIR/billy-mcp"
if [ ! -d "node_modules" ]; then
  npm install --silent 2>&1 | tail -1
fi
npm run build --silent 2>&1
echo "✓ Billy MCP bygget (26 tools)"

# ─── Kopier agents ───

echo ""
echo "Installerer agents..."
mkdir -p "$CLAUDE_DIR/agents"
for agent in "$SCRIPT_DIR/agents/"*.md; do
  cp "$agent" "$CLAUDE_DIR/agents/"
  echo "  ✓ $(basename "$agent")"
done

# ─── Kopier skills ───

echo ""
echo "Installerer skills..."
SKILLS_DIR="$CLAUDE_DIR/skills"
for skill in "$SCRIPT_DIR/skills/"*.md; do
  skill_name="$(basename "${skill%.md}")"
  mkdir -p "$SKILLS_DIR/$skill_name"
  cp "$skill" "$SKILLS_DIR/$skill_name/SKILL.md"
  echo "  ✓ $skill_name/"
done

# ─── Registrer MCP-servere i ~/.claude.json ───

echo ""
echo "Registrerer MCP-servere..."

# Opret ~/.claude.json hvis den ikke eksisterer
if [ ! -f "$CLAUDE_JSON" ]; then
  echo '{"mcpServers":{}}' > "$CLAUDE_JSON"
fi

# Brug python3 til at opdatere JSON (tilgaengelig paa macOS)
python3 << PYEOF
import json, os

config_path = os.path.expanduser("~/.claude.json")
with open(config_path) as f:
    config = json.load(f)

if "mcpServers" not in config:
    config["mcpServers"] = {}

# dk-bogfoerer MCP
config["mcpServers"]["dk-bogfoerer"] = {
    "command": "node",
    "args": ["$SCRIPT_DIR/bogfoerer-mcp/dist/index.js"]
}

# Billy MCP
config["mcpServers"]["billy"] = {
    "command": "node",
    "args": ["$SCRIPT_DIR/billy-mcp/dist/index.js"],
    "env": {
        "BILLY_API_TOKEN": "$BILLY_TOKEN"
    }
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)

print("  ✓ dk-bogfoerer MCP registreret")
print("  ✓ Billy MCP registreret")
PYEOF

# ─── Faerdig ───

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Installation faerdig!                          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "MCP-servere:"
echo "  • dk-bogfoerer (42 tools) — moms, skat, kontoplan, loen, retsinformation"
echo "  • billy (26 tools) — Billy.dk integration"
echo "  • Gmail — (brug din eksisterende Gmail MCP)"
echo ""
echo "Agents:"
echo "  • konterer — klassificerer bilag og bogfoerer"
echo "  • momsraadgiver — moms/skat-ekspert"
echo "  • loenberegner — loenkoersel"
echo "  • deadliner — frist-overvaaagning"
echo "  • fejlfinder — bogfoeringskontrol"
echo "  • aarsafslutter — aarsafslutning"
echo ""
echo "Skills (slash-commands):"
echo "  /bogfoer /gmail-bilag /bankafstem /momsopgoer"
echo "  /loenkoersel /aarsafslutning /deadline /onboarding"
echo ""
echo "Naeste skridt:"
echo "  1. Genstart Claude Code"
echo "  2. Koer /onboarding for at komme igang"
echo "  3. Eller sig bare 'Hej, jeg har en faktura der skal bogfoeres'"
echo ""
