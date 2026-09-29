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
  assert.equal(iso(r.years[1].start), '2027-08-24');
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
