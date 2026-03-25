# agent-press

Newspaper-style reports for your AI coding sessions. Generates a self-contained HTML page with AI-written narratives about what you accomplished — project spotlights, trend analysis, cost breakdowns, and celebratory headlines.

## Install

```bash
npx agent-press
```

Or install globally:

```bash
npm install -g agent-press
```

## Usage

```bash
agent-press                     # today's report
agent-press 2026-03-24          # specific date
agent-press --week              # last 7 days
agent-press --last-week         # previous Mon–Sun
agent-press --month             # last calendar month
```

Reports are saved to `~/.agent-press/reports/` and opened in your browser.

## What You Get

A newspaper-style HTML report with AI-generated narratives:

- **Lead Story** — a witty summary of your coding day/week/month
- **Project Spotlights** — what was built in each project, what went well, patterns noticed
- **The Forecast** — when you code, peak hours, activity trends
- **The Tool Shed** — which editors and models you used
- **The Markets** — estimated cost breakdown by editor and model
- **Sports Page** — coding streaks, records, longest sessions

### Example

> Stop the presses! Tuesday saw our developer tear through 33 sessions and nearly 900K tokens like a caffeine-fueled freight train. The kai project ran a tight five-session sprint across two editors, with Antigravity handling the heavy UI lifting and Claude Code swooping in for the closer. Four Antigravity sessions feeding into one Claude Code cleanup suggests a well-oiled assembly line: build fast, then polish.

## Supported Editors

Reads session data directly from local storage — no API keys, no cloud, no setup:

| Editor | Data Location |
|--------|--------------|
| Claude Code | `~/.claude/projects/` |
| Cursor | `~/.cursor/chats/` + workspace storage |
| OpenCode | `~/.local/share/opencode/` |
| Antigravity | global storage + brain directory |

## AI Narrative Engine

agent-press uses an AI coding CLI to generate the narratives. It tries these in order and uses the first one available:

1. **Claude Code** — `claude -p`
2. **Codex** — `codex exec`
3. **Gemini CLI** — `gemini -p`
4. **OpenCode** — `opencode run`

If none are installed, you still get a full report with template-based narratives.

## Built With

- **TypeScript** — compiled with [tsgo](https://github.com/microsoft/typescript-go) (Go-based TypeScript compiler)
- **better-sqlite3** — reads Cursor, OpenCode, and Antigravity session databases
- Zero runtime dependencies beyond Node.js built-ins + SQLite

## Requirements

- Node.js 18+
- At least one supported editor with session history
- (Optional) An AI CLI for richer narratives

## License

MIT
