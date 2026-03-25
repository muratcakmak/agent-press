import { execFileSync } from 'child_process';
import { fmt, fmtCost } from './report-data.js';
import type { ReportData, NarrativesOutput, ProjectSpotlight, SessionAnalysis } from './types.js';

const JSON_SCHEMA: string = JSON.stringify({
  type: 'object',
  properties: {
    leadStory: {
      type: 'string',
      description: 'A 4-6 sentence lead paragraph. Open with a punchy hook ("Stop the presses", "Hold the front page"). Reference: total sessions, tokens, cost, top project, % vs average. Use metaphors — sports, weather, Wall Street. End with a kicker sentence. Min 80 words.',
    },
    projectSpotlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          narrative: {
            type: 'string',
            description: '3-5 sentence narrative. Name specific tasks from session titles. Describe what was built/fixed. Note which editors were used and why that matters. If there was one huge session, call it out with message count and cost. Comment on the development pattern. Min 50 words.',
          },
        },
        required: ['project', 'narrative'],
      },
      description: 'One entry per project with 2+ sessions. Tell the STORY — what was built, what patterns emerge, what stands out. Never just list session names.',
    },
    forecast: {
      type: 'string',
      description: '3-4 sentences about work patterns. Name the peak hour. Comment on whether this is a morning/afternoon/night coder. Mention the streak. Predict what tomorrow might bring based on momentum. Use weather metaphors. Min 40 words.',
    },
    toolShed: {
      type: 'string',
      description: '3-4 sentences about editor and model usage. State which editor dominated and by how much. If multiple editors were used, describe the workflow pattern. Name the top model and call count. Comment on cost efficiency. Min 40 words.',
    },
    sportsPage: {
      type: 'string',
      description: '3-4 sentences celebrating achievements. Reference the streak (and how close to record). Name the longest session with message count. Name the priciest session with cost. Use sports metaphors — records, championships, MVP. Min 40 words.',
    },
  },
  required: ['leadStory', 'projectSpotlights', 'forecast', 'toolShed', 'sportsPage'],
});

// ── AI CLI chain ──

interface AiCli {
  name: string;
  check: () => string;
  run: (prompt: string) => string;
}

const EXEC_OPTS = { encoding: 'utf-8' as const, timeout: 120000, maxBuffer: 4 * 1024 * 1024 };
const CHECK_OPTS = { encoding: 'utf-8' as const, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'] };

const AI_CLIS: AiCli[] = [
  {
    name: 'Claude Code',
    check: () => execFileSync('claude', ['--version'], CHECK_OPTS),
    run: (prompt: string) => execFileSync('claude', ['-p'], { ...EXEC_OPTS, input: prompt }),
  },
  {
    name: 'Codex',
    check: () => execFileSync('codex', ['--version'], CHECK_OPTS),
    run: (prompt: string) => execFileSync('codex', ['exec', '-'], { ...EXEC_OPTS, input: prompt }),
  },
  {
    name: 'Gemini CLI',
    check: () => execFileSync('gemini', ['--version'], CHECK_OPTS),
    run: (prompt: string) => execFileSync('gemini', ['-p', prompt], EXEC_OPTS),
  },
  {
    name: 'OpenCode',
    check: () => execFileSync('opencode', ['--version'], CHECK_OPTS),
    run: (prompt: string) => execFileSync('opencode', ['run', prompt], EXEC_OPTS),
  },
];

function findAvailableCli(): AiCli | null {
  for (const cli of AI_CLIS) {
    try { cli.check(); return cli; } catch { /* not available */ }
  }
  return null;
}

/** Truncate session name to something readable — remove prompt leakage */
function cleanSessionName(name: string | null): string {
  if (!name) return 'Untitled session';
  // Remove system-reminder leakage, XML tags, and very long prompt text
  let clean = name
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // If it looks like a raw prompt (starts with "You are"), truncate
  if (clean.startsWith('You are ') || clean.startsWith('Given this ')) {
    return 'AI narrative generation session';
  }
  // Cap at 80 chars
  if (clean.length > 80) clean = clean.substring(0, 77) + '...';
  return clean || 'Untitled session';
}

export async function generateNarratives(reportData: ReportData): Promise<NarrativesOutput> {
  const cli = findAvailableCli();

  if (!cli) {
    console.log('  No AI CLI found — using template narratives');
    return fallbackNarratives(reportData);
  }

  console.log(`  Using ${cli.name} for narratives...`);

  const context = buildContext(reportData);
  const prompt = buildPrompt(reportData, context);
  const jsonPrompt = prompt + `\n\nIMPORTANT: Respond ONLY with valid JSON matching this schema. No markdown, no code blocks, no explanation — just the raw JSON object.\n\n${JSON_SCHEMA}`;

  try {
    const result = cli.run(jsonPrompt);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed: NarrativesOutput = JSON.parse(jsonMatch[0]);
    // Validate minimum quality
    if (!parsed.leadStory || parsed.leadStory.length < 50) throw new Error('Lead story too short');
    return parsed;
  } catch {
    console.error(`  ⚠ ${cli.name} narrative generation failed, using templates`);
    return fallbackNarratives(reportData);
  }
}

function buildContext(data: ReportData): string {
  const lines: string[] = [];
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

  if (modelWatch.length > 0) {
    lines.push('Models:');
    for (const m of modelWatch) lines.push(`  ${m.name}: ${m.count} calls (${m.pct}%)`);
    lines.push('');
  }

  if (toolTimes.length > 0) {
    lines.push('Top tools:');
    for (const t of toolTimes) lines.push(`  ${t.name}: ${t.count} calls`);
    lines.push('');
  }

  lines.push(`Peak hour: ${weatherReport.peakLabel}`);
  lines.push(`Streak: ${sports.currentStreak}d current, ${sports.longestStreak}d longest`);
  if (sports.longestSession) lines.push(`Longest session: "${cleanSessionName(sports.longestSession.name)}" (${sports.longestSession.bubbleCount} msgs, ${sports.longestSession.editorLabel})`);
  if (sports.priciestSession?.cost && sports.priciestSession.cost > 0) lines.push(`Priciest session: "${cleanSessionName(sports.priciestSession.name)}" (${fmtCost(sports.priciestSession.cost)})`);
  lines.push('');

  if (markets.totalCost > 0) {
    lines.push(`Cost: ${fmtCost(markets.totalCost)} total, ${fmtCost(markets.costPerSession)}/session`);
    for (const e of markets.byEditor) lines.push(`  ${e.label}: ${fmtCost(e.cost)}`);
    lines.push('');
  }

  // Session titles grouped by project — cleaned
  const byProject: Record<string, SessionAnalysis[]> = {};
  for (const t of taskStories) {
    const key = t.project || 'Other';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(t);
  }

  lines.push('Sessions by project:');
  for (const [project, sessions] of Object.entries(byProject)) {
    lines.push(`\n  [${project}] — ${sessions.length} sessions:`);
    for (const s of sessions.slice(0, 12)) {
      const name = cleanSessionName(s.name);
      const parts: string[] = [`    - "${name}"`];
      if (s.editorLabel) parts.push(`via ${s.editorLabel}`);
      if (s.bubbleCount) parts.push(`${s.bubbleCount} msgs`);
      if (s.cost > 0) parts.push(fmtCost(s.cost));
      lines.push(parts.join(' '));
    }
    if (sessions.length > 12) lines.push(`    ... and ${sessions.length - 12} more`);
  }

  return lines.join('\n');
}

function buildPrompt(data: ReportData, context: string): string {
  return `You are the editor-in-chief of "The Agent Press", a witty developer newspaper that covers AI coding sessions.

WRITING STYLE:
- Write like a sharp sports journalist covering a championship season
- Open with punchy hooks: "Stop the presses!", "Hold the front page!", "What a day at the desk!"
- Use vivid metaphors from sports, weather, Wall Street, or war rooms
- Reference SPECIFIC project names, session counts, costs, and message counts
- Celebrate accomplishments — this is a victory lap, not a boring report
- End paragraphs with memorable kicker lines
- Each section should be 3-6 sentences, minimum 40-80 words

WHAT TO WRITE about ${data.rangeLabel}:

1. LEAD STORY (4-6 sentences, 80+ words): The big picture. How many sessions, tokens, cost. Which project dominated. How this compares to average. A memorable opening and closing line.

2. PROJECT SPOTLIGHTS (3-5 sentences each, 50+ words): For each project with 2+ sessions, tell the STORY. What was being built or fixed? Which editor was used? Was there one huge marathon session? What pattern do you see in the session titles? Don't just list titles — weave them into a narrative.

3. FORECAST (3-4 sentences, 40+ words): When does this developer code? Morning, afternoon, night? Comment on the streak. What might tomorrow bring?

4. TOOL SHED (3-4 sentences, 40+ words): Which editor dominated? If multiple were used, describe the workflow (e.g., "Antigravity builds, Claude Code polishes"). Name the top AI model.

5. SPORTS PAGE (3-4 sentences, 40+ words): Celebrate the streak. Name the longest session (messages) and priciest session (cost). Use sports language.

DATA:
${context}`;
}

// ── Rich fallback templates (no AI needed) ──

function fallbackNarratives(data: ReportData): NarrativesOutput {
  const { frontPage, editorRoundup, projectBeat, weatherReport, sports, rangeType, markets, taskStories, context: ctx } = data;
  const periodWord = rangeType === 'day' ? 'day' : rangeType === 'week' ? 'week' : 'month';
  const topEditor = editorRoundup[0];
  const topProject = projectBeat[0];
  const secondProject = projectBeat[1];
  const vsAvg = frontPage.comparisons.vsAverage;
  const totalTokens = frontPage.tokens.input + frontPage.tokens.output;

  // ── Lead Story ──
  const intensity = vsAvg > 200 ? 'an absolute barn-burner of a' : vsAvg > 100 ? 'a powerhouse' : vsAvg > 50 ? 'a solid' : vsAvg > 0 ? 'a respectable' : vsAvg > -30 ? 'a steady' : 'a quiet';
  let leadStory = `It was ${intensity} ${periodWord} — ${frontPage.sessions} sessions across ${frontPage.activeHours} active hours, burning through ${fmt(totalTokens)} tokens`;
  if (frontPage.cost > 0) leadStory += ` at an estimated ${fmtCost(frontPage.cost)}`;
  leadStory += '.';
  if (topProject) {
    leadStory += ` The ${topProject.name} project commanded the headlines with ${topProject.count} sessions`;
    if (secondProject) leadStory += `, while ${secondProject.name} kept the presses running with ${secondProject.count}`;
    leadStory += '.';
  }
  if (vsAvg > 0) {
    leadStory += ` That's ${Math.abs(vsAvg)}% above the daily average of ${ctx.dailyAverage} sessions — `;
    leadStory += vsAvg > 150 ? 'the kind of output that makes Monday meetings jealous.' : 'a pace that says "I came to ship."';
  } else if (vsAvg < -30) {
    leadStory += ` A slower pace than the ${ctx.dailyAverage}/day average, but even the best pitchers need a recovery day.`;
  }
  if (topEditor) leadStory += ` ${topEditor.label} led the charge, handling ${topEditor.count} of ${frontPage.sessions} sessions (${topEditor.pct}%).`;

  // ── Project Spotlights ──
  const projectSpotlights: ProjectSpotlight[] = projectBeat.filter(p => p.count >= 2).slice(0, 6).map(p => {
    const sessions = taskStories.filter(t => t.project === p.name);
    const named = sessions.filter(s => s.name).map(s => cleanSessionName(s.name));
    const editors = [...new Set(sessions.map(s => s.editorLabel))];
    const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
    const maxSession = sessions.reduce((max, s) => s.bubbleCount > (max?.bubbleCount || 0) ? s : max, sessions[0]);

    let narrative = `${p.count} sessions kept the ${p.name} project humming`;
    if (editors.length > 1) {
      narrative += `, with ${editors.join(' and ')} tag-teaming the effort`;
    } else if (editors[0]) {
      narrative += ` via ${editors[0]}`;
    }
    narrative += '.';

    if (named.length > 0 && named.length <= 3) {
      narrative += ` The work spanned ${named.map(n => `"${n}"`).join(', ')}.`;
    } else if (named.length > 3) {
      narrative += ` The agenda was packed — from "${named[0]}" to "${named[named.length - 1]}" and ${named.length - 2} tasks in between.`;
    }

    if (maxSession && maxSession.bubbleCount > 50) {
      narrative += ` The standout was a ${maxSession.bubbleCount}-message deep dive`;
      if (maxSession.cost > 0) narrative += ` that rang up ${fmtCost(maxSession.cost)}`;
      narrative += '.';
    }

    if (totalCost > 0 && sessions.length > 2) {
      narrative += ` Total investment: ${fmtCost(totalCost)} across ${sessions.length} sessions.`;
    }

    return { project: p.name, narrative };
  });

  // ── Forecast ──
  const peakHour = weatherReport.peakHour;
  const timeOfDay = peakHour < 9 ? 'early bird' : peakHour < 12 ? 'morning' : peakHour < 17 ? 'afternoon' : peakHour < 21 ? 'evening' : 'night owl';
  let forecast = `Peak productivity landed at ${weatherReport.peakLabel}, confirming our developer as a certified ${timeOfDay} coder.`;
  forecast += ` With ${frontPage.activeHours} active hours logged, the workday spanned a solid stretch of the clock.`;
  if (sports.currentStreak > 1) {
    forecast += ` The ${sports.currentStreak}-day streak shows no signs of slowing — expect continued momentum.`;
  }
  if (vsAvg > 100) {
    forecast += ` At this pace, tomorrow's forecast calls for heavy coding with a chance of refactoring.`;
  } else if (vsAvg < -20) {
    forecast += ` The lighter load suggests either a strategic pause or a storm brewing on the horizon.`;
  }

  // ── Tool Shed ──
  let toolShed = '';
  if (topEditor) {
    toolShed = `${topEditor.label} dominated the newsroom with ${topEditor.count} of ${frontPage.sessions} sessions (${topEditor.pct}%)`;
    const secondEditor = editorRoundup[1];
    if (secondEditor && secondEditor.count > 1) {
      toolShed += `, while ${secondEditor.label} contributed ${secondEditor.count} sessions`;
      if (editorRoundup.length > 2) toolShed += ` — suggesting a multi-tool workflow where each editor plays its role`;
    }
    toolShed += '.';
  }
  if (markets.totalCost > 0) {
    toolShed += ` The total tab came to ${fmtCost(markets.totalCost)}, averaging ${fmtCost(markets.costPerSession)} per session.`;
    if (markets.byEditor.length > 1) {
      toolShed += ` ${markets.byEditor[0].label} accounted for the lion's share of spending.`;
    }
  }

  // ── Sports Page ──
  let sportsPage = `Current coding streak: ${sports.currentStreak} day${sports.currentStreak !== 1 ? 's' : ''} and counting`;
  if (sports.currentStreak >= sports.longestStreak && sports.longestStreak > 1) {
    sportsPage += ` — that ties the all-time record! Can we break it tomorrow?`;
  } else if (sports.longestStreak > sports.currentStreak) {
    sportsPage += ` (the all-time record stands at ${sports.longestStreak} days)`;
  }
  sportsPage += '.';
  if (sports.longestSession) {
    sportsPage += ` The marathon award goes to "${cleanSessionName(sports.longestSession.name)}" at ${sports.longestSession.bubbleCount} messages — the kind of session that starts as a quick fix and ends as an epic.`;
  }
  if (sports.priciestSession && sports.priciestSession.cost > 0) {
    sportsPage += ` The big spender was "${cleanSessionName(sports.priciestSession.name)}" at ${fmtCost(sports.priciestSession.cost)}.`;
  }

  return { leadStory, projectSpotlights, forecast, toolShed, sportsPage };
}
