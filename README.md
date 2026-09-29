# Academic Year Calculator

A single-page calculator that turns a start date into Title IV academic year dates:
the end of the current academic year, the start and end of the next one, and the
payment periods inside each year. Academic years never overlap.

Open `index.html` in a browser. No build step or server is needed.

## What it handles

| Calendar | Academic year | Payment periods |
| --- | --- | --- |
| Semesters / trimesters | 2 terms (typically 14–17 weeks each) | Each term |
| Quarters | 3 terms (typically 10–12 weeks each) | Each term |
| Nonstandard terms | The terms you list; classified as SE9W, substantially equal under 9 weeks, or not substantially equal | Each term |
| Non-term / clock-hour | Ends at the **later** of completing the weeks and the hours | Two; PP1 ends at the later of half the weeks and half the hours |

Counting options:

- **Weekends count**: one week of instructional time is 7 calendar days.
- **Weekends don't count**: one week is 5 weekdays, and weekends push end dates out.
- **Scheduled breaks** are never counted and extend any period they fall inside.

Rule checks flag academic years under the 30-week (credit) or 26-week (clock or
ED-approved reduction) minimum, hours under 24 semester / 36 quarter / 900 clock,
and standard terms outside the typical length range.

References: 34 CFR 668.3, 668.4, 668.8; FSA Handbook Volumes 3 and 8.

## Files

- `calc.js` holds the date math. It has no DOM access and runs in Node for tests.
- `index.html` holds the form and results.
- `tests/calc.test.js` covers the engine. Run `npm test`.
