# Academic Year Calculator

A single-page calculator that turns a start date into Title IV academic year dates:
the end of the current academic year, the start and end of the next one, and the
payment periods inside each year. Academic years never overlap.

Open `index.html` in a browser. No build step or server is needed.

## What it handles

| Calendar | Academic year | Payment periods |
| --- | --- | --- |
| Semesters | 2 terms (typically 14–17 weeks each) | Each term |
| Trimesters | 3 terms, including a **required** summer trimester that counts toward the year | Each term |
| Quarters | 3 terms (typically 10–12 weeks each), plus an **optional** summer quarter as a header or trailer | Each term; the summer header/trailer is an extra payment period whose weeks don't count toward the minimum |
| Nonstandard terms | The terms you list; classified as SE9W, substantially equal under 9 weeks, or not substantially equal | Each term |
| Non-term / clock-hour | Ends at the **later** of completing the weeks and the hours | Two; PP1 ends at the later of half the weeks and half the hours |

Dates follow instructional weeks (Monday–Sunday). Every term or payment period
closes out its last week, and the next one starts on a Monday. A mid-week start
(such as the Tuesday after Labor Day) counts as week 1. A week that is entirely a
break isn't counted, so the term ends a week later; a partial-week break doesn't
change the end date.

Counting options:

- **Weekends count**: terms end on Sunday, the last day of the week.
- **Weekends don't count**: terms end on Friday, and a Monday–Friday break removes the week.
- **Scheduled breaks** are never counted and extend any period they fall inside.
  By default each break repeats every academic year on the same weekdays in the
  week nearest the original dates. A break entered for a later year replaces the copy.
- **Next academic year** (term calendars) starts on the same weekday as the first
  start, in the week nearest the anniversary (Mon Aug 24, 2026 → Mon Aug 23, 2027),
  or right after the last term.

Rule checks flag academic years under the 30-week (credit) or 26-week (clock or
ED-approved reduction) minimum, hours under 24 semester / 36 quarter / 900 clock,
and standard terms outside the typical length range.

References: 34 CFR 668.3, 668.4, 668.8; FSA Handbook Volumes 3 and 8.

## Files

- `calc.js` holds the date math. It has no DOM access and runs in Node for tests.
- `index.html` holds the form and results.
- `tests/calc.test.js` covers the engine and `tests/scenarios.js` runs 20 schedules and checks the week rules on every period. Run `npm test`.
