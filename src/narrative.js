import { execFileSync } from 'child_process';
import { fmt, fmtCost } from './report-data.js';

const JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    leadStory: { type: 'string', description: '3-5 sentence lead paragraph summarizing the period. Witty, celebratory newspaper tone. Reference specific projects and numbers.' },
    projectSpotlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          narrative: { type: 'string', description: '2-4 sentence narrative about what was accomplished in this project, what patterns you notice, what went well.' },
        },
        required: ['project', 'narrative'],
      },
      description: 'One spotlight per project with 2+ sessions. Tell the story of what happened.',
    },
    forecast: { type: 'string', description: '2-3 sentence trend analysis about work patterns, peak hours, and activity distribution.' },
    toolShed: { type: 'string', description: '2-3 sentence editorial about which editors/models were used and why that matters.' },
    sportsPage: { type: 'string', description: '2-3 sentence celebratory paragraph about streaks, records, and notable sessions.' },
  },
  required: ['leadStory', 'projectSpotlights', 'forecast', 'toolShed', 'sportsPage'],
});

// ── AI CLI chain: try each in order, use first available ──

const AI_CLIS = [
  {
    name: 'Claude Code',
    cmd: 'claude',
    check: () => execFileSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }),
    run: (prompt) => execFileSync('claude', ['-p'], { input: prompt, encoding: 'utf-8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }),
  },
  {
    name: 'Codex',
    cmd: 'codex',
    check: () => execFileSync('codex', ['--version'], { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }),
    run: (prompt) => execFileSync('codex', ['exec', '-'], { input: prompt, encoding: 'utf-8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }),
  },
  {
    name: 'Gemini CLI',
    cmd: 'gemini',
    check: () => execFileSync('gemini', ['--version'], { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }),
    run: (prompt) => execFileSync('gemini', ['-p', prompt], { encoding: 'utf-8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }),
  },
];

function findAvailableCli() {
  for (const cli of AI_CLIS) {
    try {
      cli.check();
      return cli;
    } catch { /* not available */ }
  }
  return null;
}

export async function generateNarratives(reportData) {
  const cli = findAvailableCli();

  if (!cli) {
    console.log('  No AI CLI found — using template narratives');
    console.log('  (Install any of: claude, codex, or gemini for AI-generated storytelling)');
    return fallbackNarratives(reportData);
  }

  console.log(`  Using ${cli.name} for narratives...`);

  const context = buildContext(reportData);
  const prompt = buildPrompt(reportData, context);
  const jsonPrompt = prompt + `\n\nRespond ONLY with valid JSON matching this schema (no markdown, no code blocks, just raw JSON):\n${JSON_SCHEMA}`;

  try {
    const result = cli.run(jsonPrompt);

    // Extract JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch (err) {
    console.error(`  ⚠ ${cli.name} narrative generation failed, using templates`);
    return fallbackNarratives(reportData);
  }
}

function buildContext(data) {
  const lines = [];
  const { rangeType, rangeLabel, frontPage, editorRoundup, projectBeat, modelWatch, toolTimes, markets, weatherReport, sports, taskStories, dailyBreakdown, context } = data;

  lines.push(`Period: ${rangeLabel} (${rangeType})`);
  lines.push(`Sessions: ${frontPage.sessions} | Tokens: ${fmt(frontPage.tokens.input + frontPage.tokens.output)} | Est. Cost: ${fmtCost(frontPage.cost)} | Active Hours: ${frontPage.activeHours}`);
  lines.push(`All-time: ${context.allTimeTotal} sessions over ${context.totalDays} days (avg ${context.dailyAverage}/day)`);
  lines.push(`vs Average: ${frontPage.comparisons.vsAverage > 0 ? '+' : ''}${frontPage.comparisons.vsAverage}% | vs Previous Period: ${frontPage.comparisons.vsPrevious > 0 ? '+' : ''}${frontPage.comparisons.vsPrevious}`);
  lines.push('');

  if (dailyBreakdown && dailyBreakdown.length > 0) {
    lines.push('Daily breakdown:');
    for (const d of dailyBreakdown) lines.push(`  ${d.day} ${d.dateLabel}: ${d.count} sessions`);
    lines.push('');
  }

  lines.push('Editors:');
  for (const e of editorRoundup) lines.push(`  ${e.label}: ${e.count} sessions (${e.pct}%)`);
  lines.push('');

  lines.push('Projects:');
  for (const p of projectBeat) lines.push(`  ${p.name}: ${p.count} sessions`);
  lines.push('');

  lines.push('Models:');
  for (const m of modelWatch) lines.push(`  ${m.name}: ${m.count} calls (${m.pct}%)`);
  lines.push('');

  if (toolTimes.length > 0) {
    lines.push('Top tools:');
    for (const t of toolTimes) lines.push(`  ${t.name}: ${t.count} calls`);
    lines.push('');
  }

  lines.push(`Peak hour: ${weatherReport.peakLabel}`);
  lines.push(`Streak: ${sports.currentStreak}d current, ${sports.longestStreak}d longest`);
  if (sports.longestSession) lines.push(`Longest session: "${sports.longestSession.name || 'Untitled'}" (${sports.longestSession.bubbleCount} msgs, ${sports.longestSession.editorLabel})`);
  if (sports.priciestSession?.cost > 0) lines.push(`Priciest session: "${sports.priciestSession.name || 'Untitled'}" (${fmtCost(sports.priciestSession.cost)})`);
  lines.push('');

  if (markets.totalCost > 0) {
    lines.push(`Cost: ${fmtCost(markets.totalCost)} total, ${fmtCost(markets.costPerSession)}/session`);
    for (const e of markets.byEditor) lines.push(`  ${e.label}: ${fmtCost(e.cost)}`);
    lines.push('');
  }

  const byProject = {};
  for (const t of taskStories) {
    const key = t.project || 'Other';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(t);
  }

  lines.push('Sessions by project:');
  for (const [project, sessions] of Object.entries(byProject)) {
    lines.push(`\n  [${project}] — ${sessions.length} sessions:`);
    for (const s of sessions.slice(0, 15)) {
      const parts = [`    - "${s.name}"`];
      if (s.editorLabel) parts.push(`via ${s.editorLabel}`);
      if (s.model) parts.push(`(${s.model})`);
      if (s.bubbleCount) parts.push(`${s.bubbleCount} msgs`);
      if (s.cost > 0) parts.push(fmtCost(s.cost));
      lines.push(parts.join(' '));
    }
    if (sessions.length > 15) lines.push(`    ... and ${sessions.length - 15} more`);
  }

  return lines.join('\n');
}

function buildPrompt(data, context) {
  const periodWord = data.rangeType === 'day' ? 'day' : data.rangeType === 'week' ? 'week' : 'month';

  return `You are the editor-in-chief of "The ${periodWord === 'day' ? 'Daily' : periodWord === 'week' ? 'Weekly' : 'Monthly'} Agent", a witty developer newspaper.

Given this coding session data for ${data.rangeLabel}, write newspaper-style narratives. Be specific — reference actual project names, session titles, and numbers. Tell the STORY of what happened, not just the stats.

For project spotlights: Look at the session titles to understand what was being worked on. Group related sessions into a narrative about the development journey. What features were built? What bugs were fixed? What does the activity pattern suggest?

Tone: Playful and celebratory, like a sports writer covering a championship season. Celebrate wins, note interesting patterns, make the developer feel good about their work. Use metaphors and colorful language.

${context}`;
}

function fallbackNarratives(data) {
  const { frontPage, editorRoundup, projectBeat, weatherReport, sports, rangeType, markets, taskStories } = data;
  const periodWord = rangeType === 'day' ? 'day' : rangeType === 'week' ? 'week' : 'month';
  const topEditor = editorRoundup[0];
  const topProject = projectBeat[0];

  let leadStory = `A ${frontPage.sessions > (data.context.dailyAverage * (rangeType === 'day' ? 1 : rangeType === 'week' ? 7 : 30)) ? 'productive' : 'steady'} ${periodWord} with ${frontPage.sessions} sessions`;
  if (topProject) leadStory += ` across ${projectBeat.length} project${projectBeat.length > 1 ? 's' : ''}`;
  leadStory += '.';
  if (topEditor) leadStory += ` ${topEditor.label} led the charge with ${topEditor.count} sessions (${topEditor.pct}%).`;
  if (topProject) leadStory += ` The ${topProject.name} project saw the most action at ${topProject.count} sessions.`;
  if (frontPage.cost > 0) leadStory += ` An estimated ${fmtCost(frontPage.cost)} was spent, averaging ${fmtCost(markets.costPerSession)} per session.`;

  const projectSpotlights = projectBeat.filter(p => p.count >= 2).map(p => {
    const sessions = taskStories.filter(t => t.project === p.name);
    const named = sessions.filter(s => s.name).slice(0, 3);
    let narrative = `${p.count} sessions in the ${p.name} project.`;
    if (named.length > 0) narrative += ` Work included ${named.map(s => `"${s.name}"`).join(', ')}.`;
    return { project: p.name, narrative };
  });

  const forecast = `Activity peaked at ${weatherReport.peakLabel}. ${frontPage.activeHours} distinct hours saw coding activity.`;
  const toolShed = topEditor ? `${topEditor.label} was the primary tool, handling ${topEditor.pct}% of sessions.` : 'Multiple editors were used across the period.';
  const sportsPage = `Current coding streak: ${sports.currentStreak} day${sports.currentStreak !== 1 ? 's' : ''}. Longest ever: ${sports.longestStreak} days.${sports.longestSession ? ` The longest session was "${sports.longestSession.name || 'Untitled'}" with ${sports.longestSession.bubbleCount} messages.` : ''}`;

  return { leadStory, projectSpotlights, forecast, toolShed, sportsPage };
}
