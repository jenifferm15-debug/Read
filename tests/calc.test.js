const test = require('node:test');
const assert = require('node:assert');
const C = require('../calc.js');
const iso = C.toISO;

test('semester, weekends counted: 15-week terms, 30-week AY', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15,
    weekends: 'count', years: 2, gapDays: 0, nextYear: 'next' });
  assert.ok(r.ok, r.errors.join());
  const [a, b] = r.years;
  assert.equal(iso(a.periods[0].start), '2026-08-24');
  assert.equal(iso(a.periods[0].end), '2026-12-06'); // 105 days
  assert.equal(iso(a.end), '2027-03-21');           // 210 days
  assert.equal(iso(b.start), '2027-03-22');
  assert.ok(b.start > a.end);
});

test('semester, weekdays only ends on a Friday', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15,
    weekends: 'exclude', years: 1 });
  assert.equal(iso(r.years[0].periods[0].end), '2026-12-04');
});

test('breaks extend the term', () => {
  const base = { measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15, weekends: 'count', years: 1 };
  const r = C.calculate({ ...base, breaks: [{ start: '2026-11-23', end: '2026-11-29' }] });
  assert.equal(iso(r.years[0].periods[0].end), '2026-12-13');
});

test('anniversary next year starts same date next year', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15,
    weekends: 'count', years: 2, gapDays: 35, nextYear: 'anniversary' });
  assert.ok(r.ok, r.errors.join());
  assert.equal(iso(r.years[1].start), '2027-08-23');
});

test('anniversary conflict is an error, not an overlap', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-08-24', termWeeks: 12,
    weekends: 'count', years: 2, gapDays: 60, nextYear: 'anniversary' });
  assert.equal(r.ok, false);
});

test('quarter default is 3 x 10 weeks', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-09-21', weekends: 'count', years: 1 });
  assert.equal(r.years[0].periods.length, 3);
  assert.equal(r.ayWeeks, 30);
  assert.equal(r.ayHours, 36);
});

test('nonstandard SE9W classification', () => {
  const se = C.calculate({ measure: 'credit', calendar: 'nonstandard', nsTermWeeks: '10, 10, 11', start: '2026-09-01', weekends: 'count', years: 1 });
  assert.match(se.classification, /SE9W/);
  const not = C.calculate({ measure: 'credit', calendar: 'nonstandard', nsTermWeeks: '8, 8, 8, 8', start: '2026-09-01', weekends: 'count', years: 1 });
  assert.match(not.classification, /under 9 weeks/);
  const uneq = C.calculate({ measure: 'credit', calendar: 'nonstandard', nsTermWeeks: '12, 9, 9', start: '2026-09-01', weekends: 'count', years: 1 });
  assert.match(uneq.classification, /not substantially equal/);
});

test('nonstandard under 30 weeks is an error', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'nonstandard', nsTermWeeks: '8, 8, 8', start: '2026-09-01', weekends: 'count', years: 1 });
  assert.equal(r.ok, false);
});

test('clock-hour: AY ends at later of weeks and hours', () => {
  // 900 hours at 25 h/week = 36 weeks > 26 weeks, so hours drive the end.
  const r = C.calculate({ measure: 'clock', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 26, ayHours: 900,
    hoursPerWeek: 25, weekends: 'exclude', years: 2 });
  assert.ok(r.ok, r.errors.join());
  const a = r.years[0];
  assert.equal(a.drivenBy, 'hours');
  assert.equal(a.end - a.start + 1, 36 * 7 - 2); // 36 weeks Mon..Fri
  assert.equal(r.years[1].start, a.end + 3);    // Friday -> next Monday
  assert.equal(a.periods[0].drivenBy, 'hours');
});

test('non-term: weeks drive the end when hours finish early', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'nonterm', start: '2026-09-07', ayWeeks: 30, ayHours: 24,
    creditUnit: 'semester', hoursPerWeek: 1, weekends: 'count', years: 1 });
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.years[0].drivenBy, 'weeks');
  assert.equal(r.years[0].end - r.years[0].start + 1, 210);
});

test('clock hours force non-term', () => {
  const r = C.calculate({ measure: 'clock', calendar: 'semester', start: '2026-09-07', hoursPerWeek: 30, weekends: 'count', years: 1 });
  assert.equal(r.calendar, 'nonterm');
});

test('weekend start date is noted and counting starts Monday', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-22', weekends: 'exclude', years: 1 });
  assert.equal(iso(r.years[0].start), '2026-08-24');
  assert.ok(r.notes.some(n => /not a counted day/.test(n)));
});

test('bad inputs return errors', () => {
  assert.equal(C.calculate({ start: 'nope' }).ok, false);
  const r = C.calculate({ calendar: 'semester', start: '2026-08-24', breaks: [{ start: '2026-10-10', end: '2026-10-01' }] });
  assert.equal(r.ok, false);
});

test('trimester: summer trimester is required and counts toward the AY', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'trimester', start: '2026-08-24', termWeeks: 15, summerWeeks: 14,
    weekends: 'count', gapDays: 7, years: 2, nextYear: 'anniversary' });
  assert.ok(r.ok, r.errors.join());
  const a = r.years[0];
  assert.equal(a.periods.length, 3);
  assert.match(a.periods[2].label, /summer, required/);
  assert.equal(r.ayWeeks, 44);
  assert.equal(iso(a.periods[2].end), '2027-07-11');
  assert.equal(iso(r.years[1].start), '2027-08-23');
});

test('trimester summer cannot be turned off', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'trimester', start: '2026-08-24', summer: 'none', weekends: 'count', years: 1 });
  assert.equal(r.years[0].periods.length, 3);
});

test('quarter: summer trailer is the last payment period and adds no AY weeks', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-09-21', termWeeks: 10, summer: 'trailer', summerWeeks: 8,
    weekends: 'count', gapDays: 7, years: 2, nextYear: 'anniversary' });
  assert.ok(r.ok, r.errors.join());
  const p = r.years[0].periods;
  assert.equal(p.length, 4);
  assert.match(p[3].label, /trailer/);
  assert.equal(p[3].countsTowardAY, false);
  assert.equal(r.ayWeeks, 30);
  assert.equal(r.years[0].end, p[3].end);
  assert.ok(r.years[1].start > r.years[0].end);
});

test('quarter: summer header is the first payment period', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-06-22', termWeeks: 10, summer: 'header', summerWeeks: 10,
    weekends: 'count', gapDays: 7, years: 1 });
  const p = r.years[0].periods;
  assert.match(p[0].label, /header/);
  assert.equal(iso(p[0].start), '2026-06-22');
  assert.equal(p.length, 4);
});

test('quarter with no summer stays at 3 terms', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'quarter', start: '2026-09-21', summer: 'none', weekends: 'count', years: 1 });
  assert.equal(r.years[0].periods.length, 3);
});

test('next year starts on the same weekday nearest the anniversary', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15,
    weekends: 'count', years: 4, gapDays: 28, nextYear: 'anniversary' });
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(r.years.map(y => iso(y.start)), ['2026-08-24', '2027-08-23', '2028-08-21', '2029-08-27']);
  r.years.forEach(y => assert.equal(new Date(y.start * 86400000).getUTCDay(), 1));
});

test('breaks repeat each year on the same weekdays and extend terms', () => {
  const base = { measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15, weekends: 'count',
    years: 2, gapDays: 28, nextYear: 'anniversary', breaks: [{ start: '2026-11-23', end: '2026-11-29' }] };
  const r = C.calculate(base);
  const y2 = r.years[1];
  assert.equal(iso(y2.periods[0].start), '2027-08-23');
  assert.equal(iso(y2.periods[0].end), '2027-12-12'); // 15 weeks + the repeated Nov 22-28 break
  assert.ok(y2.breaks.some(b => b.repeated && iso(b.start) === '2027-11-22' && iso(b.end) === '2027-11-28'));
  const off = C.calculate({ ...base, repeatBreaks: false });
  assert.equal(iso(off.years[1].periods[0].end), '2027-12-05');
});

test('an entered next-year break replaces the repeated copy', () => {
  const r = C.calculate({ measure: 'credit', calendar: 'semester', start: '2026-08-24', termWeeks: 15, weekends: 'count',
    years: 2, gapDays: 28, nextYear: 'anniversary',
    breaks: [{ start: '2026-11-23', end: '2026-11-29' }, { start: '2027-11-24', end: '2027-11-30' }] });
  const nov2027 = r.years[1].breaks.filter(b => b.start >= C.parseISO('2027-11-01') && b.start <= C.parseISO('2027-12-31'));
  assert.equal(nov2027.length, 1);
  assert.equal(iso(nov2027[0].start), '2027-11-24');
});
