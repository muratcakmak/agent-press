import { getAllChats, getMessages, EDITOR_META } from './editors/index.js';
import { calculateCost, normalizeModelName } from './pricing.js';
import { generateNarratives } from './narrative.js';

/**
 * @param {object} opts
 * @param {number} opts.dateFrom - start of range (ms)
 * @param {number} opts.dateTo   - end of range (ms)
 * @param {string} opts.rangeType - 'day' | 'week' | 'month'
 * @param {string} opts.label    - human-readable range label
 */
export async function generateReport(opts) {
  const { dateFrom, dateTo, rangeType, label } = opts;
  const rangeDays = Math.max(1, Math.round((dateTo - dateFrom) / 86400000));

  // Get all chats
  const allChats = getAllChats();

  // Filter to target range
  const rangChats = allChats.filter(c => {
    const ts = c.lastUpdatedAt || c.createdAt;
    return ts && ts >= dateFrom && ts <= dateTo;
  });

  // Compute all-time daily counts for comparison (using local dates)
  const dailyCounts = {};
  for (const c of allChats) {
    const ts = c.lastUpdatedAt || c.createdAt;
    if (!ts) continue;
    const dt = new Date(ts);
    const d = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    dailyCounts[d] = (dailyCounts[d] || 0) + 1;
  }

  const allDays = Object.keys(dailyCounts).sort();
  const totalDays = allDays.length;
  const allTimeTotal = allChats.length;
  const dailyAverage = totalDays > 0 ? allTimeTotal / totalDays : 0;
  const sessionCount = rangChats.length;

  // Edition number (based on range end date)
  const endDayStr = toLocalDateStr(new Date(dateTo));
  const oldestDay = allDays[0] || endDayStr;
  const editionNumber = Math.max(1, Math.round((new Date(endDayStr) - new Date(oldestDay)) / 86400000) + 1);

  // Daily breakdown (for week/month reports)
  const dailyBreakdown = [];
  if (rangeType !== 'day') {
    const cursor = new Date(dateFrom);
    const endDate = new Date(dateTo);
    while (cursor <= endDate) {
      const ds = toLocalDateStr(cursor);
      const dayLabel = cursor.toLocaleDateString('en-US', { weekday: 'short' });
      const dateLabel = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyBreakdown.push({
        day: dayLabel,
        date: ds,
        dateLabel,
        count: dailyCounts[ds] || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Analyze each chat in range
  const sessionAnalyses = [];
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  let totalCost = 0;
  const modelFreq = {};
  const toolFreq = {};
  const hourly = new Array(24).fill(0);
  const editorCounts = {};
  const projectCounts = {};

  for (const chat of rangChats) {
    const ts = chat.lastUpdatedAt || chat.createdAt;
    if (ts) hourly[new Date(ts).getHours()]++;

    editorCounts[chat.source] = (editorCounts[chat.source] || 0) + 1;

    if (chat.folder) {
      const projectName = chat.folder.split(/[/\\]/).filter(Boolean).slice(-1)[0] || chat.folder;
      if (!projectCounts[projectName]) projectCounts[projectName] = { name: projectName, fullPath: chat.folder, count: 0, editors: {} };
      projectCounts[projectName].count++;
      projectCounts[projectName].editors[chat.source] = (projectCounts[projectName].editors[chat.source] || 0) + 1;
    }

    const messages = getMessages(chat);
    let sessionCost = 0;
    const sessionModels = new Set();

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      if (msg._model) {
        const normalized = normalizeModelName(msg._model) || msg._model;
        sessionModels.add(normalized);
        modelFreq[normalized] = (modelFreq[normalized] || 0) + 1;
      }
      if (msg._inputTokens) totalInput += msg._inputTokens;
      if (msg._outputTokens) totalOutput += msg._outputTokens;
      if (msg._cacheRead) totalCacheRead += msg._cacheRead;
      if (msg._cacheWrite) totalCacheWrite += msg._cacheWrite;
      if (msg._model && (msg._inputTokens || msg._outputTokens)) {
        const cost = calculateCost(msg._model, msg._inputTokens, msg._outputTokens, msg._cacheRead, msg._cacheWrite);
        if (cost) sessionCost += cost;
      }
      if (msg._toolCalls) {
        for (const tc of msg._toolCalls) { toolFreq[tc.name] = (toolFreq[tc.name] || 0) + 1; }
      }
    }

    totalCost += sessionCost;
    sessionAnalyses.push({
      name: chat.name,
      editor: chat.source,
      editorLabel: EDITOR_META[chat.source]?.label || chat.source,
      project: chat.folder ? chat.folder.split(/[/\\]/).filter(Boolean).slice(-1)[0] : null,
      bubbleCount: chat.bubbleCount || messages.length,
      model: [...sessionModels][0] || null,
      cost: sessionCost,
      createdAt: chat.createdAt,
      lastUpdatedAt: chat.lastUpdatedAt,
    });
  }

  // Headline
  const headline = generateHeadline(sessionCount, dailyCounts, dailyAverage, endDayStr, allDays, rangeType, rangeDays);

  // Active hours & peak
  const activeHours = hourly.filter(h => h > 0).length;
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const peakLabel = `${peakHour % 12 || 12}:00 ${peakHour < 12 ? 'AM' : 'PM'}`;

  // Comparisons
  const avgForRange = dailyAverage * rangeDays;
  const vsAverage = avgForRange > 0 ? Math.round(((sessionCount - avgForRange) / avgForRange) * 100) : 0;
  // vs previous equivalent period
  const prevFrom = dateFrom - (dateTo - dateFrom + 1);
  const prevTo = dateFrom - 1;
  const prevCount = allChats.filter(c => { const ts = c.lastUpdatedAt || c.createdAt; return ts && ts >= prevFrom && ts <= prevTo; }).length;
  const vsPrevious = sessionCount - prevCount;

  // Editor roundup
  const editorRoundup = Object.entries(editorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id, label: EDITOR_META[id]?.label || id, color: EDITOR_META[id]?.color || '#6b7280',
      count, pct: sessionCount > 0 ? Math.round((count / sessionCount) * 100) : 0,
    }));

  // Project beat
  const projectBeat = Object.values(projectCounts)
    .sort((a, b) => b.count - a.count).slice(0, 8)
    .map(p => ({
      name: p.name, fullPath: p.fullPath, count: p.count,
      topEditor: Object.entries(p.editors).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }));

  // Model watch
  const totalModelCalls = Object.values(modelFreq).reduce((s, v) => s + v, 0);
  const modelWatch = Object.entries(modelFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count, pct: totalModelCalls > 0 ? Math.round((count / totalModelCalls) * 100) : 0 }));

  // Tool times
  const toolTimes = Object.entries(toolFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Cost by editor
  const costByEditor = {};
  for (const sa of sessionAnalyses) costByEditor[sa.editor] = (costByEditor[sa.editor] || 0) + sa.cost;

  // Streaks
  const streaks = computeStreaks(allDays, endDayStr);

  // Percentile
  const allDailyCounts = Object.values(dailyCounts).sort((a, b) => a - b);
  const dailyRate = rangeType === 'day' ? sessionCount : Math.round(sessionCount / rangeDays);
  const rank = allDailyCounts.filter(c => c <= dailyRate).length;
  const percentile = allDailyCounts.length > 0 ? Math.round((rank / allDailyCounts.length) * 100) : 0;

  // Notable sessions
  const longestSession = [...sessionAnalyses].sort((a, b) => b.bubbleCount - a.bubbleCount)[0] || null;
  const priciestSession = [...sessionAnalyses].sort((a, b) => b.cost - a.cost)[0] || null;

  const taskStories = sessionAnalyses.filter(s => s.name).sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));

  // Build report data first (without narratives)
  const reportData = {
    date: endDayStr,
    rangeType,
    rangeLabel: label,
    dateFormatted: label,
    editionNumber,
    headline,
    dailyBreakdown,
    frontPage: {
      sessions: sessionCount,
      tokens: { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite },
      cost: totalCost,
      activeHours,
      comparisons: { vsAverage, vsPrevious },
    },
    taskStories,
    editorRoundup,
    projectBeat,
    modelWatch,
    toolTimes,
    markets: {
      totalCost,
      byEditor: Object.entries(costByEditor).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
        .map(([id, cost]) => ({ id, label: EDITOR_META[id]?.label || id, cost })),
      costPerSession: sessionCount > 0 ? totalCost / sessionCount : 0,
    },
    weatherReport: { hourly, peakHour, peakLabel },
    sports: {
      currentStreak: streaks.current, longestStreak: streaks.longest,
      todayPercentile: percentile, longestSession, priciestSession,
    },
    context: { dailyAverage: Math.round(dailyAverage * 10) / 10, totalDays, allTimeTotal },
  };

  // Generate narratives via Claude Code
  console.log('  Generating narratives...');
  reportData.narratives = await generateNarratives(reportData);

  return reportData;
}

function generateHeadline(count, dailyCounts, dailyAverage, endDayStr, allDays, rangeType, rangeDays) {
  const suffix = rangeType === 'week' ? ' This Week' : rangeType === 'month' ? ' This Month' : '';

  if (count === 0) {
    if (rangeType === 'day') return { text: 'REST DAY', subtitle: 'The Machines Take a Well-Deserved Break', type: 'zero' };
    return { text: 'ALL QUIET', subtitle: `No sessions detected${suffix.toLowerCase()}`, type: 'zero' };
  }

  if (rangeType === 'day') {
    // Single-day headline logic
    const allDailyCounts = Object.values(dailyCounts);
    const prevMax = Math.max(...allDailyCounts.filter((_, i) => Object.keys(dailyCounts)[i] !== endDayStr), 0);
    if (count > prevMax && allDays.length > 7) return { text: `EXTRA! EXTRA! ${count} Sessions`, subtitle: 'An All-Time Record Day!', type: 'record' };

    const month = endDayStr.substring(0, 7);
    const monthCounts = Object.entries(dailyCounts).filter(([d]) => d.startsWith(month) && d !== endDayStr).map(([, c]) => c);
    const monthMax = Math.max(...monthCounts, 0);
    if (count > monthMax && monthCounts.length > 3) {
      const monthName = new Date(endDayStr).toLocaleDateString('en-US', { month: 'long' });
      return { text: `Busiest Day of ${monthName}`, subtitle: `${count} Sessions Shipped`, type: 'monthly-record' };
    }

    if (dailyAverage > 0 && count >= dailyAverage * 3) return { text: `Session Surge! ${count} Sessions`, subtitle: `${Math.round(count / dailyAverage)}x the Daily Average`, type: 'surge' };
    if (dailyAverage > 0 && count > dailyAverage) return { text: `${count} Sessions Logged`, subtitle: `${Math.round(((count - dailyAverage) / dailyAverage) * 100)}% Above the Daily Average`, type: 'above-average' };
    if (count === 1) return { text: 'A Singular Focus', subtitle: 'One Deep Session Today', type: 'singular' };
    return { text: `${count} Sessions Filed`, subtitle: 'Another Day at the Terminal', type: 'normal' };
  }

  // Multi-day headlines
  const expectedAvg = dailyAverage * rangeDays;
  const dailyRate = Math.round((count / rangeDays) * 10) / 10;

  if (expectedAvg > 0 && count >= expectedAvg * 2) {
    return { text: `${count} Sessions${suffix}!`, subtitle: `${Math.round(count / expectedAvg)}x the expected volume — what a run!`, type: 'surge' };
  }
  if (expectedAvg > 0 && count > expectedAvg * 1.3) {
    const pct = Math.round(((count - expectedAvg) / expectedAvg) * 100);
    return { text: `${count} Sessions${suffix}`, subtitle: `${pct}% above average — ${dailyRate}/day`, type: 'above-average' };
  }
  if (expectedAvg > 0 && count < expectedAvg * 0.5) {
    return { text: `${count} Sessions${suffix}`, subtitle: `A quieter stretch — ${dailyRate}/day`, type: 'below-average' };
  }
  return { text: `${count} Sessions${suffix}`, subtitle: `${dailyRate} sessions/day on average`, type: 'normal' };
}

function computeStreaks(allDays, dayStr) {
  let current = 0, longest = 0, temp = 1;
  for (let i = 1; i < allDays.length; i++) {
    const diff = (new Date(allDays[i]) - new Date(allDays[i - 1])) / 86400000;
    if (diff === 1) temp++;
    else { if (temp > longest) longest = temp; temp = 1; }
  }
  if (temp > longest) longest = temp;

  const today = new Date(dayStr);
  if (allDays.length > 0) {
    const last = new Date(allDays[allDays.length - 1]);
    if ((today - last) / 86400000 <= 1) {
      current = 1;
      for (let i = allDays.length - 2; i >= 0; i--) {
        if ((new Date(allDays[i + 1]) - new Date(allDays[i])) / 86400000 === 1) current++;
        else break;
      }
    }
  }
  return { current, longest };
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmt(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function fmtCost(n) {
  if (n == null || n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  if (n >= 100) return '$' + Math.round(n);
  return '$' + n.toFixed(2);
}
