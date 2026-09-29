const test = require('node:test');
const assert = require('node:assert');
const C = require('../calc.js');
const iso = C.toISO;
const dow = n => new Date(n * 86400000).getUTCDay();
const sem = (extra) => C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15,
  weekends: 'count', years: 2, gapWeeks: 4, nextYear: 'anniversary', ...extra });

test('semester, weekends count: term closes out Sunday, next term starts Monday', () => {
  const r = sem({});
  assert.ok(r.ok, r.errors.join());
  const [s1, s2] = r.years[0].periods;
  assert.equal(iso(s1.start), '2026-08-24');
  assert.equal(iso(s1.end), '2026-12-06');   // Sunday of week 15
  assert.equal(iso(s2.start), '2027-01-04'); // Monday after 4 weeks off
  assert.equal(dow(s2.start), 1);
});

test('semester, weekdays only: term ends Friday, next term starts Monday', () => {
  const r = sem({ weekends: 'exclude', gapWeeks: 0 });
  const [s1, s2] = r.years[0].periods;
  assert.equal(iso(s1.end), '2026-12-04');
  assert.equal(iso(s2.start), '2026-12-07');
});

test('a full break week adds a week; a partial-week break does not', () => {
  assert.equal(iso(sem({ breaks: [{ start: '2026-11-23', end: '2026-11-29' }] }).years[0].periods[0].end), '2026-12-13');
  assert.equal(iso(sem({ breaks: [{ start: '2026-11-25', end: '2026-11-27' }] }).years[0].periods[0].end), '2026-12-06');
});

test('weekdays only: a Mon-Fri break removes the week even though the weekend is free', () => {
  const r = sem({ weekends: 'exclude', breaks: [{ start: '2026-11-23', end: '2026-11-27' }] });
  assert.equal(iso(r.years[0].periods[0].end), '2026-12-11');
});

test('mid-week start counts as week 1 and later terms start Monday', () => {
  const r = sem({ start: '2026-09-08', weekends: 'exclude' }); // Tuesday after Labor Day
  const [s1, s2] = r.years[0].periods;
  assert.equal(iso(s1.start), '2026-09-08');
  assert.equal(iso(s1.end), '2026-12-18');
  assert.equal(dow(s2.start), 1);
  assert.equal(iso(r.years[1].start), '2027-09-07'); // Tuesday after Labor Day 2027
});

test('weekend start date with weekdays only begins Monday and is noted', () => {
  const r = sem({ start: '2026-08-22', weekends: 'exclude' });
  assert.equal(iso(r.years[0].start), '2026-08-24');
  assert.ok(r.notes.some(n => /not an instructional day/.test(n)));
});

test('next year starts on the same weekday nearest the anniversary', () => {
  const r = sem({ years: 4 });
  assert.deepEqual(r.years.map(y => iso(y.start)), ['2026-08-24', '2027-08-23', '2028-08-21', '2029-08-27']);
});

test('"right after the last term" starts the next year on the following Monday', () => {
  const r = sem({ nextYear: 'next', gapWeeks: 0 });
  assert.equal(iso(r.years[0].end), '2027-03-21');
  assert.equal(iso(r.years[1].start), '2027-03-22');
});

test('anniversary conflict is reported as an error', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-08-24', termWeeks: 12,
    weekends: 'count', years: 2, gapWeeks: 9, nextYear: 'anniversary' });
  assert.equal(r.ok, false);
});

test('breaks repeat each year on the same weekdays and extend terms', () => {
  const r = sem({ breaks: [{ start: '2026-11-23', end: '2026-11-29' }] });
  const y2 = r.years[1];
  assert.equal(iso(y2.periods[0].end), '2027-12-12');
  assert.ok(y2.breaks.some(b => b.repeated && iso(b.start) === '2027-11-22'));
  const off = sem({ breaks: [{ start: '2026-11-23', end: '2026-11-29' }], repeatBreaks: false });
  assert.equal(iso(off.years[1].periods[0].end), '2027-12-05');
});

test('an entered next-year break replaces the repeated copy', () => {
  const r = sem({ breaks: [{ start: '2026-11-23', end: '2026-11-29' }, { start: '2027-11-24', end: '2027-11-30' }] });
  const nov = r.years[1].breaks.filter(b => b.start >= C.parseISO('2027-11-01') && b.start <= C.parseISO('2027-12-31'));
  assert.equal(nov.length, 1);
  assert.equal(iso(nov[0].start), '2027-11-24');
});

test('trimester: three terms, summer required and counted', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'trimester', start: '2026-08-24', termWeeks: 15, summerWeeks: 14,
    weekends: 'exclude', gapWeeks: 1, years: 2, nextYear: 'anniversary', summer: 'none' });
  assert.ok(r.ok, r.errors.join());
  const p = r.years[0].periods;
  assert.equal(p.length, 3);
  assert.match(p[2].label, /summer, required/);
  assert.equal(r.ayWeeks, 44);
  assert.equal(iso(p[2].end), '2027-07-09');
  p.forEach(t => { assert.equal(dow(t.start), 1); assert.equal(dow(t.end), 5); });
});

test('quarter: summer trailer is last and adds no AY weeks; header is first', () => {
  const base = { measure: 'credit', calendar: 'quarter', termWeeks: 10, summerWeeks: 8, weekends: 'exclude', gapWeeks: 1, years: 2, nextYear: 'anniversary' };
  const t = C.calculate({ ...base, start: '2026-09-21', summer: 'trailer' });
  assert.ok(t.ok, t.errors.join());
  assert.equal(t.years[0].periods.length, 4);
  assert.match(t.years[0].periods[3].label, /trailer/);
  assert.equal(t.years[0].periods[3].countsTowardAY, false);
  assert.equal(t.ayWeeks, 30);
  const h = C.calculate({ ...base, start: '2026-06-22', summer: 'header' });
  assert.match(h.years[0].periods[0].label, /header/);
  assert.equal(C.calculate({ ...base, start: '2026-09-21', summer: 'none' }).years[0].periods.length, 3);
});

test('nonstandard classification', () => {
  const run = w => C.calculate({ measure: 'credit', calendar: 'nonstandard', nsTermWeeks: w, start: '2026-08-31', weekends: 'count', years: 1 });
  assert.match(run('10, 10, 11').classification, /SE9W/);
  assert.match(run('8, 8, 8, 8').classification, /under 9 weeks/);
  assert.match(run('12, 9, 9').classification, /not substantially equal/);
  assert.equal(run('8, 8, 8').ok, false); // 24 weeks < 30
});

test('clock hours: AY closes out the week the hours finish when hours drive', () => {
  // 900 hours at 25 h/week = 36 weeks > 26 weeks.
  const r = C.calculate({ measure: 'clock', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 26, ayHours: 900,
    hoursPerWeek: 25, weekends: 'exclude', years: 2 });
  assert.ok(r.ok, r.errors.join());
  const a = r.years[0];
  assert.equal(a.drivenBy, 'hours');
  assert.equal(iso(a.end), '2027-05-14'); // Friday of week 36
  assert.equal(a.periods[0].weeks, 18);
  assert.equal(iso(r.years[1].start), '2027-05-17'); // next Monday
});

test('non-term credit: weeks drive when hours finish early', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 30, ayHours: 24,
    creditUnit: 'semester', hoursPerWeek: 1, weekends: 'count', years: 1 });
  assert.equal(r.years[0].drivenBy, 'weeks');
  assert.equal(iso(r.years[0].end), '2027-04-04'); // Sunday of week 30
});

test('clock hours force non-term; bad inputs return errors', () => {
  assert.equal(C.calculate({ measure: 'clock', calendar: 'semester', start: '2026-09-07', hoursPerWeek: 30, weekends: 'count', years: 1 }).calendar, 'nonterm');
  assert.equal(C.calculate({ start: 'nope' }).ok, false);
  assert.equal(sem({ breaks: [{ start: '2026-10-10', end: '2026-10-01' }] }).ok, false);
});
