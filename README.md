# agent-press

Newspaper-style reports for your AI coding sessions. Generates a self-contained HTML page with AI-written narratives about what you accomplished — complete with project spotlights, trend analysis, and celebratory headlines.

## Usage

```bash
npx agent-press                 # today's report
npx agent-press 2026-03-24      # specific date
npx agent-press --week          # last 7 days
npx agent-press --last-week     # previous Mon–Sun
npx agent-press --month         # last calendar month
```

Reports are saved to `~/.agent-press/reports/` and opened in your browser.

## Supported Editors

Reads session data directly from local storage — no API keys, no cloud, no setup:

- **Claude Code** — `~/.claude/projects/`
- **Cursor** — `~/.cursor/chats/` + workspace storage
- **OpenCode** — `~/.local/share/opencode/`
- **Antigravity** — global storage + brain directory

## AI Narratives

agent-press uses an AI coding CLI to generate witty, story-driven narratives about your sessions. It tries these in order and uses the first one available:

1. **Claude Code** (`claude -p`)
2. **Codex** (`codex exec`)
3. **Gemini CLI** (`gemini -p`)
4. **OpenCode** (`opencode run`)

If none are installed, it falls back to template-based narratives — you still get a full report, just without the AI storytelling.

### Example narrative

> Stop the presses! Tuesday saw our developer tear through 33 sessions and nearly 900K tokens like a caffeine-fueled freight train. The kai project ran a tight five-session sprint across two editors, with Antigravity handling the heavy UI lifting and Claude Code swooping in for the closer. Four Antigravity sessions feeding into one Claude Code cleanup suggests a well-oiled assembly line: build fast, then polish.

## Report Sections

- **Lead Story** — AI-generated summary of the day/week/month
- **Project Spotlights** — per-project narratives about what was built
- **The Forecast** — trend analysis with hourly activity chart
- **The Tool Shed** — editor usage breakdown with commentary
- **The Markets** — cost analysis
- **Sports Page** — coding streaks, records, longest sessions

## Requirements

- Node.js 18+
- At least one supported editor installed with session history
- (Optional) An AI CLI for narrative generation — works without one

## License

MIT
