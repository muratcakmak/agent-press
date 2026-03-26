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
agent-press                     # yesterday's report (default)
agent-press 2026-03-24          # specific date
agent-press --week              # last 7 days
agent-press --last-week         # previous Mon–Sun
agent-press --month             # last calendar month
```

### Pick Your AI Provider

```bash
agent-press --provider opencode              # use OpenCode directly
agent-press --provider openrouter            # use OpenRouter API
agent-press --provider claude-sonnet         # use Claude Sonnet
agent-press --provider openrouter --model google/gemini-2.5-flash:free  # free model
```

Available providers: `claude-opus`, `claude-sonnet`, `codex`, `gemini`, `opencode`, `openrouter`

By default, agent-press tries all available providers in order until one succeeds.

### Other Options

```bash
agent-press --verbose           # detailed logs (prompt, response, git, timing)
agent-press --help              # show all options
```

Reports are saved to `~/.agent-press/reports/` and opened in your browser.

## What You Get

A newspaper-style HTML report with AI-generated narratives:

- **Lead Story** — a witty summary of your coding day/week/month
- **Project Spotlights** — what was built in each project, informed by git commit history
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

agent-press uses AI to generate the narratives. It cascades through providers in order, skipping any that return empty or fail:

1. **Claude Code (Opus)** — `claude -p`
2. **Claude Code (Sonnet)** — `claude -p --model claude-sonnet-4-6`
3. **Codex** — `codex exec`
4. **Gemini CLI** — `gemini -p`
5. **OpenCode** — `opencode run`
6. **OpenRouter** — direct API call (requires `OPENROUTER_API_KEY`)

Use `--provider` to skip the cascade and pick one directly.

The AI context includes **git commit history** per project, giving the model real data about what was built — not just session titles.

If no AI provider is available, you still get a full report with template-based narratives enriched by git commits.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Required for `--provider openrouter` |
| `OPENROUTER_MODEL` | Override OpenRouter model (default: `anthropic/claude-haiku-4`) |

The `--model` flag also works and takes precedence over the env var.

## Built With

- **TypeScript** — compiled with [tsgo](https://github.com/microsoft/typescript-go) (Go-based TypeScript compiler)
- **better-sqlite3** — reads Cursor, OpenCode, and Antigravity session databases
- Zero runtime dependencies beyond Node.js built-ins + SQLite

## Requirements

- Node.js 18+
- At least one supported editor with session history
- (Optional) An AI CLI or OpenRouter API key for richer narratives

## License

MIT
