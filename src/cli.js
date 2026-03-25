#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateReport } from './report-data.js';
import { generateHtml } from './report-html.js';

const REPORTS_DIR = path.join(os.homedir(), '.agent-press', 'reports');

const args = process.argv.slice(2);

function localToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseOpts() {
  const today = localToday();

  if (args.includes('--week')) {
    const end = new Date(today + 'T23:59:59.999');
    const start = new Date(today + 'T00:00:00');
    start.setDate(start.getDate() - 6);
    const startStr = toLocalDateStr(start);
    const endDate = new Date(today + 'T00:00:00');
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      dateFrom: start.getTime(),
      dateTo: end.getTime(),
      rangeType: 'week',
      label: `${startLabel} – ${endLabel}`,
      filename: `weekly-agent-${startStr}.html`,
    };
  }

  if (args.includes('--last-week')) {
    const todayDate = new Date(today + 'T00:00:00');
    const dow = todayDate.getDay(); // 0=Sun
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(todayDate);
    thisMonday.setDate(todayDate.getDate() - daysToMonday);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    const prevSunday = new Date(thisMonday);
    prevSunday.setDate(thisMonday.getDate() - 1);
    const startStr = toLocalDateStr(prevMonday);
    const startLabel = prevMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = prevSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      dateFrom: prevMonday.getTime(),
      dateTo: new Date(toLocalDateStr(prevSunday) + 'T23:59:59.999').getTime(),
      rangeType: 'week',
      label: `${startLabel} – ${endLabel}`,
      filename: `weekly-agent-${startStr}.html`,
    };
  }

  if (args.includes('--month')) {
    const todayDate = new Date(today + 'T00:00:00');
    const prevMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
    const lastDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0); // last day of prev month
    const monthLabel = prevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthSlug = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    return {
      dateFrom: prevMonth.getTime(),
      dateTo: new Date(toLocalDateStr(lastDay) + 'T23:59:59.999').getTime(),
      rangeType: 'month',
      label: monthLabel,
      filename: `monthly-agent-${monthSlug}.html`,
    };
  }

  // Single day (default or YYYY-MM-DD arg)
  const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dayStr = dateArg || today;
  const date = new Date(dayStr + 'T00:00:00');
  const dateFormatted = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return {
    dateFrom: new Date(dayStr + 'T00:00:00').getTime(),
    dateTo: new Date(dayStr + 'T23:59:59.999').getTime(),
    rangeType: 'day',
    label: dateFormatted,
    filename: `daily-agent-${dayStr}.html`,
  };
}

const opts = parseOpts();
const titles = { day: 'The Daily Agent', week: 'The Weekly Agent', month: 'The Monthly Agent' };

console.log('');
console.log(`  ✦ ${titles[opts.rangeType]} — ${opts.label}`);
console.log('');

try {
  console.log('  Scanning editors...');
  const data = await generateReport(opts);

  console.log(`  ${data.frontPage.sessions} sessions found`);

  const html = generateHtml(data);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, opts.filename);

  fs.writeFileSync(outPath, html);
  console.log(`  ✓ Saved: ${outPath}`);
  console.log(`  ${data.headline.text} — ${data.headline.subtitle}`);
  console.log('');

  const open = await import('open');
  await open.default(outPath);
} catch (err) {
  console.error(`  ✗ Error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
