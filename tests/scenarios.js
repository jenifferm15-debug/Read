// Runs a broad set of scenarios, prints every period, and checks the week rules:
//  - every period starts on the week's start weekday (unless that day is a break)
//  - every period ends by closing out its last week
//  - the next period starts in a later week than the previous one ended
//  - each term contains exactly its weeks of instruction
//  - academic years never overlap; later years start on the same weekday
const C = require('../calc.js');
const f = C.formatDate;
const DAY = 86400000;
const dow = n => new Date(n * DAY).getUTCDay();

const S = [
  ['Semester, Mon start, weekends count, Thanksgiving', { calendar: 'semester', start: '2026-08-24', termWeeks: 15, gapWeeks: 4, nextYear: 'anniversary', weekends: 'count', breaks: [{ start: '2026-11-23', end: '2026-11-29' }] }],
  ['Semester, Mon start, weekdays only, Thanksgiving', { calendar: 'semester', start: '2026-08-24', termWeeks: 15, gapWeeks: 4, nextYear: 'anniversary', weekends: 'exclude', breaks: [{ start: '2026-11-23', end: '2026-11-29' }] }],
  ['Semester, partial Thanksgiving break Wed-Fri', { calendar: 'semester', start: '2026-08-24', termWeeks: 15, gapWeeks: 4, nextYear: 'anniversary', weekends: 'exclude', breaks: [{ start: '2026-11-25', end: '2026-11-27' }] }],
  ['Semester, Tue start after Labor Day', { calendar: 'semester', start: '2026-09-08', termWeeks: 15, gapWeeks: 4, nextYear: 'anniversary', weekends: 'exclude' }],
  ['Semester, start on a Saturday, weekdays only', { calendar: 'semester', start: '2026-08-22', termWeeks: 16, gapWeeks: 3, nextYear: 'anniversary', weekends: 'exclude' }],
  ['Semester, right after last term, 0 weeks off', { calendar: 'semester', start: '2026-08-24', termWeeks: 15, gapWeeks: 0, nextYear: 'next', weekends: 'count' }],
  ['Semester, winter break entered inside spring', { calendar: 'semester', start: '2026-08-24', termWeeks: 15, gapWeeks: 1, nextYear: 'anniversary', weekends: 'exclude', breaks: [{ start: '2026-12-21', end: '2027-01-03' }, { start: '2027-03-15', end: '2027-03-19' }] }],
  ['Trimester, summer required, weekdays only', { calendar: 'trimester', start: '2026-08-24', termWeeks: 15, summerWeeks: 14, gapWeeks: 1, nextYear: 'anniversary', weekends: 'exclude', breaks: [{ start: '2026-11-23', end: '2026-11-27' }] }],
  ['Trimester, weekends count', { calendar: 'trimester', start: '2026-08-31', termWeeks: 14, gapWeeks: 1, nextYear: 'anniversary', weekends: 'count' }],
  ['Quarter, no summer', { calendar: 'quarter', start: '2026-09-21', termWeeks: 10, summer: 'none', gapWeeks: 1, nextYear: 'anniversary', weekends: 'exclude', breaks: [{ start: '2026-11-23', end: '2026-11-27' }] }],
  ['Quarter, summer trailer', { calendar: 'quarter', start: '2026-09-21', termWeeks: 10, summer: 'trailer', summerWeeks: 8, gapWeeks: 1, nextYear: 'anniversary', weekends: 'exclude' }],
  ['Quarter, summer header', { calendar: 'quarter', start: '2026-06-22', termWeeks: 10, summer: 'header', summerWeeks: 10, gapWeeks: 1, nextYear: 'anniversary', weekends: 'count' }],
  ['Nonstandard 8-week terms x4 (not SE9W)', { calendar: 'nonstandard', nsTermWeeks: '8,8,8,8', start: '2026-08-24', gapWeeks: 1, nextYear: 'next', weekends: 'exclude', breaks: [{ start: '2026-11-23', end: '2026-11-29' }] }],
  ['Nonstandard SE9W 10,10,11', { calendar: 'nonstandard', nsTermWeeks: '10,10,11', start: '2027-01-04', gapWeeks: 1, nextYear: 'next', weekends: 'count' }],
  ['Nonstandard 12,9,9 (not equal)', { calendar: 'nonstandard', nsTermWeeks: '12,9,9', start: '2026-10-05', gapWeeks: 2, nextYear: 'anniversary', weekends: 'exclude' }],
  ['Non-term credit, weeks drive', { calendar: 'nonterm', start: '2026-09-08', ayWeeks: 30, ayHours: 24, creditUnit: 'semester', hoursPerWeek: 1, weekends: 'exclude' }],
  ['Clock 900 hrs @25/wk (hours drive)', { measure: 'clock', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 26, ayHours: 900, hoursPerWeek: 25, weekends: 'exclude', breaks: [{ start: '2026-12-21', end: '2027-01-01' }] }],
  ['Clock 900 hrs @36/wk (weeks drive)', { measure: 'clock', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 26, ayHours: 900, hoursPerWeek: 36, weekends: 'exclude' }],
  ['Clock 900 hrs @30/wk, 3-day break mid-week', { measure: 'clock', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 26, ayHours: 900, hoursPerWeek: 30, weekends: 'exclude', breaks: [{ start: '2026-11-25', end: '2026-11-27' }] }],
  ['Clock, Wed start, weekends count', { measure: 'clock', calendar: 'nonterm', start: '2026-09-09', ayWeeks: 26, ayHours: 900, hoursPerWeek: 32, weekends: 'count' }],
];

let failures = 0;
const fail = (name, msg) => { failures++; console.log('   ✗ ' + msg); };

for (const [name, input] of S) {
  const r = C.calculate({ measure: 'credit', years: 3, ...input });
  console.log('\n■ ' + name);
  if (!r.ok) { console.log('   ERROR: ' + r.errors.join(' | ')); failures++; continue; }
  console.log('   ' + r.classification);
  const weekendsCount = input.weekends !== 'exclude';
  const breaks = r.years.flatMap(y => y.breaks || []);
  const inBreak = d => breaks.some(b => d >= b.start && d <= b.end);
  const instr = d => (weekendsCount || (dow(d) !== 0 && dow(d) !== 6)) && !inBreak(d);
  const weekStart = d => d - ((dow(d) + 6) % 7); // Monday
  const startDow = dow(r.years[0].start);
  let prev = null;
  r.years.forEach((ay, yi) => {
    console.log(`   AY${ay.index}: ${f(ay.start)} → ${f(ay.end)}` + (ay.drivenBy !== 'terms' ? `  [ends on ${ay.drivenBy}]` : ''));
    if (yi > 0 && r.calendar !== 'nonterm' && dow(ay.start) !== startDow && !inBreak(ay.start)) fail(name, `AY${ay.index} starts on a different weekday`);
    ay.periods.forEach((p, pi) => {
      console.log(`      ${p.label.padEnd(30)} ${f(p.start)} → ${f(p.end)}  ${p.weeks} wks` + (p.breakWeeks ? ` (+${p.breakWeeks} break wk)` : ''));
      const ws = weekStart(p.start);
      // starts on the first instructional day of its week
      // (the first period of an academic year may begin mid-week, e.g. after Labor Day)
      if (pi > 0 || r.calendar === 'nonterm' && yi > 0) for (let d = ws; d < p.start; d++) if (instr(d)) fail(name, `${p.label} starts mid-week (${f(p.start)})`);
      // ends on the last instructional day of its week
      for (let d = p.end + 1; d < weekStart(p.end) + 7; d++) if (instr(d)) fail(name, `${p.label} ends mid-week (${f(p.end)})`);
      if (prev) {
        if (p.start <= prev.end) fail(name, `${p.label} overlaps previous period`);
        if (weekStart(p.start) <= weekStart(prev.end)) fail(name, `${p.label} starts in the same week the previous period ended`);
      }
      {
        let n = 0;
        for (let w = ws; w <= weekStart(p.end); w += 7) {
          let has = false; for (let d = Math.max(w, p.start); d < w + 7; d++) if (instr(d)) has = true;
          if (has) n++;
        }
        if (n !== p.weeks) fail(name, `${p.label} has ${n} instructional weeks, expected ${p.weeks}`);
      }
      prev = p;
    });
  });
}
console.log('\n' + (failures ? failures + ' rule violation(s)' : 'All scenarios follow the week rules.'));
process.exit(failures ? 1 : 0);
