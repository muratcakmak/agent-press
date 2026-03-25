import { fmt, fmtCost } from './report-data.js';
import type { ReportData, RangeType, NarrativesOutput } from './types.js';

function esc(str: unknown): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Convert narrative text with newlines into multiple <p> tags */
function narrativeParagraphs(text: string | undefined): string {
  if (!text) return '';
  return text.split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('\n      ');
}

/** Build a text summary for chart accessibility */
function hourlyAriaLabel(hourly: number[]): string {
  const peak = hourly.indexOf(Math.max(...hourly));
  const total = hourly.reduce((a, b) => a + b, 0);
  return `Hourly activity chart. ${total} total sessions. Peak at ${peak}:00 with ${hourly[peak]} sessions.`;
}

const MASTHEAD: Record<RangeType, { title: string; tagline: string }> = {
  day:   { title: 'The Daily Agent',   tagline: '"All the Code That\'s Fit to Ship"' },
  week:  { title: 'The Weekly Agent',  tagline: '"Your Week in Code, Front to Back"' },
  month: { title: 'The Monthly Agent', tagline: '"A Month of Code in Review"' },
};

export function generateHtml(data: ReportData): string {
  const { rangeType, rangeLabel, editionNumber, frontPage, context } = data;
  const mast = MASTHEAD[rangeType] || MASTHEAD.day;
  const hourlyMax = Math.max(...data.weatherReport.hourly, 1);

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(mast.title)} — ${esc(rangeLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: oklch(0.09 0.005 270);
    --bg-card: oklch(0.12 0.005 270);
    --fg: oklch(0.88 0 0);
    --fg-muted: oklch(0.62 0 0);
    --fg-dim: oklch(0.50 0 0);
    --accent: oklch(0.62 0.2 265);
    --border: oklch(1 0 0 / 8%);
    --border-strong: oklch(1 0 0 / 15%);
    --chart-high: oklch(0.65 0.18 265);
    --chart-med: oklch(0.55 0.15 265);
    --chart-low: oklch(0.45 0.12 265);
    --chart-min: oklch(0.30 0.06 265);
    --serif: 'Instrument Serif', Georgia, 'Times New Roman', serif;
    --sans: 'Inter', -apple-system, system-ui, sans-serif;
    --mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .page { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }

  /* ── Masthead ── */
  .masthead {
    text-align: center;
    padding: 1.5rem 0 1rem;
    border-top: 3px double var(--border-strong);
    border-bottom: 3px double var(--border-strong);
    margin-bottom: 1.5rem;
  }
  .masthead-meta {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-dim);
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .masthead h1 {
    font-family: var(--serif);
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 400;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    line-height: 1.1;
  }
  .masthead-tagline {
    font-family: var(--serif);
    font-style: italic;
    font-size: 13px;
    color: var(--fg-muted);
    margin-top: 0.25rem;
  }
  .masthead-date {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-dim);
    margin-top: 0.5rem;
    letter-spacing: 0.08em;
  }

  /* ── Headline ── */
  .headline {
    text-align: center;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
  }
  .headline h2 {
    font-family: var(--serif);
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 400;
    line-height: 1.15;
    margin-bottom: 0.25rem;
  }
  .headline p {
    font-family: var(--serif);
    font-style: italic;
    font-size: 15px;
    color: var(--fg-muted);
  }

  /* ── KPI strip ── */
  .kpi-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    background: var(--border);
    margin-bottom: 1.5rem;
  }
  .kpi-strip .kpi {
    background: var(--bg);
    padding: 0.6rem 0.8rem;
    flex: 1 1 120px;
    text-align: center;
    min-width: 0;
  }
  .kpi-strip .kpi-value {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 600;
  }
  .kpi-strip .kpi-label {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 2px;
  }

  /* ── Articles ── */
  .article { margin-bottom: 2.5rem; }
  .article h3 {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
  }
  .article-body {
    font-family: var(--serif);
    font-size: 15px;
    line-height: 1.75;
    color: var(--fg);
  }
  .article-body p { margin-bottom: 0.75rem; }

  /* ── Lead story drop cap ── */
  .lead-story .article-body p:first-child::first-letter {
    font-family: var(--serif);
    font-size: 3.2em;
    float: left;
    line-height: 0.8;
    padding-right: 0.08em;
    padding-top: 0.05em;
    color: var(--accent);
  }

  /* ── Project spotlights ── */
  .spotlights {
    column-count: 2;
    column-gap: 2rem;
    column-rule: 1px solid var(--border);
  }
  @media (max-width: 768px) { .spotlights { column-count: 1; } }
  .spotlight { break-inside: avoid; margin-bottom: 1.5rem; }
  .spotlight h4 {
    font-family: var(--serif);
    font-size: 1.1rem;
    font-weight: 400;
    margin-bottom: 0.25rem;
  }
  .spotlight-meta {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-dim);
    margin-bottom: 0.4rem;
  }
  .spotlight-body {
    font-family: var(--serif);
    font-size: 14px;
    line-height: 1.7;
    color: var(--fg-muted);
  }

  /* ── Data aside ── */
  .data-aside {
    background: var(--bg-card);
    padding: 1rem;
    margin: 1rem 0;
  }
  .data-aside-label {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.5rem;
  }

  /* ── Bar chart ── */
  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.25rem;
    font-family: var(--mono);
    font-size: 11px;
  }
  .bar-label {
    width: 80px;
    flex-shrink: 0;
    color: var(--fg-muted);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track { flex: 1; height: 12px; }
  .bar-fill { height: 100%; min-width: 3px; }
  .bar-value {
    width: 35px;
    flex-shrink: 0;
    color: var(--fg-dim);
    font-size: 10px;
  }

  /* ── Hourly chart ── */
  .hourly-chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 50px;
    margin: 0.4rem 0;
  }
  .hourly-bar { flex: 1; min-width: 0; }
  .hourly-labels {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 9px;
    color: var(--fg-dim);
    margin-top: 0.2rem;
  }

  /* ── Daily breakdown ── */
  .daily-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 40px;
    margin: 0.4rem 0;
  }
  .daily-bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .daily-bar-val { font-family: var(--mono); font-size: 9px; color: var(--fg-dim); }
  .daily-bar-label { font-family: var(--mono); font-size: 9px; color: var(--fg-dim); }

  /* ── Divider ── */
  .divider {
    text-align: center;
    color: var(--fg-dim);
    font-size: 12px;
    margin: 2rem 0;
    letter-spacing: 0.3em;
  }

  /* ── Streak badges ── */
  .streak-badges { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0; }
  .streak-badge {
    font-family: var(--mono);
    font-size: 11px;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border-strong);
    color: var(--fg-muted);
  }
  .streak-badge strong { color: var(--fg); }

  /* ── Footer ── */
  .footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 3px double var(--border-strong);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-dim);
  }

  /* ── Empty state ── */
  .empty-state { text-align: center; padding: 4rem 2rem; }
  .empty-state h2 { font-family: var(--serif); font-size: 2rem; margin-bottom: 0.5rem; }
  .empty-state p { font-family: var(--serif); font-style: italic; color: var(--fg-muted); }

  /* ── Print ── */
  @media print {
    :root {
      --bg: #fff;
      --bg-card: #f5f5f5;
      --fg: #111;
      --fg-muted: #444;
      --fg-dim: #666;
      --accent: #333;
      --border: #ddd;
      --border-strong: #333;
      --chart-high: #333;
      --chart-med: #666;
      --chart-low: #999;
      --chart-min: #ccc;
    }
    .page { padding: 0; }
    .bar-fill { opacity: 1 !important; }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <header class="masthead" role="banner">
    <div class="masthead-meta"><span>Vol. I</span><span>Price: Free</span></div>
    <h1>${esc(mast.title)}</h1>
    <div class="masthead-tagline">${mast.tagline}</div>
    <div class="masthead-date">${esc(rangeLabel)} · Edition No. ${editionNumber}</div>
  </header>

  <main>
${frontPage.sessions === 0 ? renderEmptyState() : renderContent(data, hourlyMax)}
  </main>

  <footer class="footer" role="contentinfo">
    <span>${esc(mast.title)} · ${esc(rangeLabel)}</span>
    <span>${context.allTimeTotal} sessions across ${context.totalDays} days · avg ${context.dailyAverage}/day</span>
  </footer>

</div>
</body>
</html>`;
}

function renderEmptyState(): string {
  return `
    <div class="empty-state">
      <h2>Slow News Day</h2>
      <p>No sessions detected. Even the best developers need rest.<br>Tomorrow's edition awaits.</p>
    </div>`;
}

function renderContent(data: ReportData, hourlyMax: number): string {
  const { rangeType, headline, frontPage, narratives, editorRoundup, projectBeat, dailyBreakdown, weatherReport, sports, markets } = data;
  const n: Partial<NarrativesOutput> = narratives || {};
  const editorMaxCount = Math.max(...editorRoundup.map(e => e.count), 1);
  const hasDailyBreakdown = dailyBreakdown && dailyBreakdown.length > 1;
  const dailyMax = hasDailyBreakdown ? Math.max(...dailyBreakdown.map(d => d.count), 1) : 1;

  // Build editor bar chart aria label
  const editorAriaLabel = editorRoundup.length > 0
    ? `Editor usage: ${editorRoundup.map(e => `${e.label} ${e.count} sessions`).join(', ')}.`
    : '';

  // Build daily breakdown aria label
  const dailyAriaLabel = hasDailyBreakdown
    ? `Daily breakdown: ${dailyBreakdown.map(d => `${d.day} ${d.count}`).join(', ')}.`
    : '';

  return `
    <!-- Headline -->
    <div class="headline">
      <h2>${esc(headline.text)}</h2>
      <p>${esc(headline.subtitle)}</p>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-strip" role="list" aria-label="Key metrics">
      <div class="kpi" role="listitem"><div class="kpi-value">${frontPage.sessions}</div><div class="kpi-label">Sessions</div></div>
      <div class="kpi" role="listitem"><div class="kpi-value">${esc(fmt(frontPage.tokens.input + frontPage.tokens.output))}</div><div class="kpi-label">Tokens</div></div>
      <div class="kpi" role="listitem"><div class="kpi-value">${esc(fmtCost(frontPage.cost))}</div><div class="kpi-label">Est. Cost</div></div>
      <div class="kpi" role="listitem"><div class="kpi-value">${frontPage.activeHours}</div><div class="kpi-label">Active Hours</div></div>
    </div>

    <!-- Lead Story -->
    ${n.leadStory ? `
    <article class="article lead-story">
      <h3>Lead Story</h3>
      <div class="article-body">
        ${narrativeParagraphs(n.leadStory)}
      </div>
    </article>` : ''}

    ${hasDailyBreakdown ? `
    <div class="data-aside" role="img" aria-label="${esc(dailyAriaLabel)}">
      <div class="data-aside-label">Daily Breakdown</div>
      <div class="daily-chart" aria-hidden="true">
        ${dailyBreakdown.map(d => {
          const h = Math.max((d.count / dailyMax) * 100, d.count > 0 ? 8 : 2);
          const intensity = d.count / dailyMax;
          const color = intensity > 0.75 ? 'var(--chart-high)' : intensity > 0.5 ? 'var(--chart-med)' : intensity > 0.25 ? 'var(--chart-low)' : 'var(--chart-min)';
          return `<div class="daily-bar-wrap"><div class="daily-bar-val">${d.count || ''}</div><div style="width:100%;height:${h}%;background:${color};min-height:2px"></div><div class="daily-bar-label">${esc(d.day)}</div></div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="divider" aria-hidden="true">— ✦ —</div>

    <!-- Project Spotlights -->
    ${(n.projectSpotlights && n.projectSpotlights.length > 0) ? `
    <article class="article">
      <h3>Project Spotlights</h3>
      <div class="spotlights">
        ${n.projectSpotlights.map(s => {
          const pb = projectBeat.find(p => p.name === s.project);
          return `
        <div class="spotlight">
          <h4>${esc(s.project)}</h4>
          <div class="spotlight-meta">${pb ? `${pb.count} sessions` : ''}</div>
          <div class="spotlight-body">${esc(s.narrative)}</div>
        </div>`;
        }).join('')}
      </div>
    </article>` : ''}

    <div class="divider" aria-hidden="true">— ✦ —</div>

    <!-- The Forecast -->
    ${n.forecast ? `
    <article class="article">
      <h3>The Forecast</h3>
      <div class="article-body">
        ${narrativeParagraphs(n.forecast)}
      </div>
      <div class="data-aside" role="img" aria-label="${esc(hourlyAriaLabel(weatherReport.hourly))}">
        <div class="data-aside-label">Peak Hours</div>
        <div class="hourly-chart" aria-hidden="true">
          ${weatherReport.hourly.map((v, i) => {
            const h = Math.max((v / hourlyMax) * 100, v > 0 ? 5 : 1);
            const intensity = v / hourlyMax;
            const color = intensity > 0.75 ? 'var(--chart-high)' : intensity > 0.5 ? 'var(--chart-med)' : intensity > 0.25 ? 'var(--chart-low)' : 'var(--chart-min)';
            return `<div class="hourly-bar" style="height:${h}%;background:${color}" title="${i}:00 — ${v} sessions"></div>`;
          }).join('')}
        </div>
        <div class="hourly-labels" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
    </article>` : ''}

    <!-- The Tool Shed -->
    ${n.toolShed ? `
    <article class="article">
      <h3>The Tool Shed</h3>
      <div class="article-body">
        ${narrativeParagraphs(n.toolShed)}
      </div>
      ${editorRoundup.length > 0 ? `
      <div class="data-aside" role="img" aria-label="${esc(editorAriaLabel)}">
        <div class="data-aside-label">Editor Usage</div>
        <div aria-hidden="true">
        ${editorRoundup.map(e => `
          <div class="bar-row">
            <span class="bar-label">${esc(e.label)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round((e.count / editorMaxCount) * 100)}%;background:${e.color}"></span></span>
            <span class="bar-value">${e.count}</span>
          </div>
        `).join('')}
        </div>
      </div>` : ''}
    </article>` : ''}

    <!-- The Markets -->
    ${markets.totalCost > 0 ? `
    <article class="article">
      <h3>The Markets</h3>
      <div class="article-body">
        <p>Total estimated spend: <strong style="font-family:var(--mono)">${esc(fmtCost(markets.totalCost))}</strong> (${esc(fmtCost(markets.costPerSession))}/session).
        ${markets.byEditor.length > 0 ? markets.byEditor.map(e => `${esc(e.label)}: ${esc(fmtCost(e.cost))}`).join(' · ') + '.' : ''}</p>
      </div>
    </article>` : ''}

    <!-- Sports Page -->
    ${n.sportsPage ? `
    <article class="article">
      <h3>Sports Page</h3>
      <div class="article-body">
        ${narrativeParagraphs(n.sportsPage)}
      </div>
      <div class="streak-badges" role="list" aria-label="Coding streaks">
        <div class="streak-badge" role="listitem"><strong>${sports.currentStreak}d</strong> streak</div>
        <div class="streak-badge" role="listitem"><strong>${sports.longestStreak}d</strong> longest</div>
        <div class="streak-badge" role="listitem">Top <strong>${100 - sports.todayPercentile}%</strong></div>
      </div>
    </article>` : ''}`;
}
