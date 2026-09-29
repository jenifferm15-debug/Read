/*
 * Academic year calculator engine.
 *
 * Pure date math with no DOM access, so it runs in the browser (window.AYCalc)
 * and in Node (module.exports) for tests.
 *
 * Dates are handled as integer "day numbers" (days since 1970-01-01 UTC) so
 * daylight-saving shifts can never move a date.
 *
 * Rules applied (34 CFR 668.3, 668.4, 668.8; FSA Handbook Vol. 3 ch. 1 and Vol. 8):
 *  - An academic year (AY) needs at least 30 weeks of instructional time for
 *    credit-hour programs (26 with an ED-approved reduction) and 26 weeks for
 *    clock-hour programs.
 *  - An AY needs at least 24 semester/trimester hours, 36 quarter hours, or
 *    900 clock hours for an undergraduate program.
 *  - A week of instructional time is 7 consecutive days containing at least one
 *    day of regularly scheduled instruction or exams. All counting here is done
 *    in whole Monday-Sunday instructional weeks. A mid-week start (such as the
 *    Tuesday after Labor Day) makes that first week count as week 1. A period
 *    always closes out its last week, and the next period starts on a Monday. A week that is entirely
 *    a scheduled break has no instruction, so it is skipped and the end moves out.
 *  - Standard terms: semesters (2 per AY), quarters (3 per AY), and trimesters
 *    (3 per AY here: the summer trimester is mandatory and counts toward the AY).
 *  - A quarter program may add an optional summer quarter as a header (first
 *    payment period of the AY) or trailer (last payment period of the AY). It is
 *    an extra payment period and does not count toward the AY's weeks.
 *  - Nonstandard terms are "substantially equal" when no term differs from any
 *    other by more than 2 weeks; SE9W also requires every term to be 9+ weeks.
 *  - Term-based programs: each term is a payment period.
 *  - Non-term and clock-hour programs: the AY ends only when the student has
 *    completed BOTH the weeks and the hours. Payment period 1 ends at the later
 *    of half the weeks and half the hours.
 */
(function (root) {
  'use strict';

  var MS_PER_DAY = 86400000;
  var MAX_SCAN_DAYS = 365 * 20;

  var CALENDARS = {
    semester: { label: 'Semester', termsPerAY: 2, defaultWeeks: 15, typical: [14, 17], creditUnit: 'semester' },
    trimester: { label: 'Trimester', termsPerAY: 3, mandatorySummer: true, defaultWeeks: 15, typical: [14, 17], creditUnit: 'semester' },
    quarter: { label: 'Quarter', termsPerAY: 3, defaultWeeks: 10, typical: [10, 12], creditUnit: 'quarter' },
    nonstandard: { label: 'Nonstandard term' },
    nonterm: { label: 'Non-term' }
  };

  var MIN_WEEKS = { credit: 30, creditReduced: 26, clock: 26 };
  var MIN_HOURS = { semester: 24, quarter: 36, clock: 900 };

  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(t / MS_PER_DAY);
  }

  function toISO(n) {
    return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
  }

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDate(n) {
    var d = new Date(n * MS_PER_DAY);
    return DOW[d.getUTCDay()] + ', ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }

  function dayOfWeek(n) {
    return new Date(n * MS_PER_DAY).getUTCDay();
  }

  function isWeekend(n) {
    var w = dayOfWeek(n);
    return w === 0 || w === 6;
  }

  function addYears(n, years) {
    var d = new Date(n * MS_PER_DAY);
    var y = d.getUTCFullYear() + years, m = d.getUTCMonth(), day = d.getUTCDate();
    // Feb 29 falls back to Feb 28 in non-leap years.
    var t = Date.UTC(y, m, day);
    if (new Date(t).getUTCMonth() !== m) t = Date.UTC(y, m + 1, 0);
    return Math.round(t / MS_PER_DAY);
  }

  // The same weekday as `n`, in the week nearest its anniversary `years` later.
  // Mon Aug 24, 2026 -> Mon Aug 23, 2027 (Aug 24, 2027 is a Tuesday).
  function sameWeekdayAnniversary(n, years) {
    var t = addYears(n, years);
    var delta = (dayOfWeek(n) - dayOfWeek(t) + 7) % 7;
    if (delta > 3) delta -= 7;
    return t + delta;
  }

  // Copies each entered break into later years at the same weekday and length,
  // so Thanksgiving week Mon-Sun stays Mon-Sun. A copy is dropped when it
  // overlaps a break the user entered, since that entry is the real date.
  function repeatBreaks(entered, years) {
    var out = entered.map(function (b) { return { start: b.start, end: b.end, repeated: false }; });
    entered.forEach(function (b) {
      for (var k = 1; k <= years; k++) {
        var s = sameWeekdayAnniversary(b.start, k);
        var e = s + (b.end - b.start);
        var clash = entered.some(function (o) { return s <= o.end && e >= o.start; });
        if (!clash) out.push({ start: s, end: e, repeated: true });
      }
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  // Builds a predicate telling whether a day is an instructional day.
  function makeCounter(weekendsCount, breaks) {
    return function (n) {
      if (!weekendsCount && isWeekend(n)) return false;
      for (var i = 0; i < breaks.length; i++) {
        if (n >= breaks[i].start && n <= breaks[i].end) return false;
      }
      return true;
    };
  }

  function nextCounted(from, counts) {
    for (var d = from, i = 0; i < MAX_SCAN_DAYS; d++, i++) {
      if (counts(d)) return d;
    }
    throw new Error('No instructional day found within 20 years. Check your breaks.');
  }

  // Instructional weeks run Monday through Sunday.
  function Weeks(counts) {
    this.counts = counts;
  }
  // The Monday on or before day d.
  Weeks.prototype.weekOf = function (d) {
    return d - ((dayOfWeek(d) + 6) % 7);
  };
  // Instructional days in the week beginning ws, ignoring days before `from`.
  Weeks.prototype.days = function (ws, from) {
    var out = [];
    for (var d = Math.max(ws, from || ws); d < ws + 7; d++) if (this.counts(d)) out.push(d);
    return out;
  };
  // Starting on day `from`, returns the `n`th week that has instruction. The week
  // containing `from` is week 1 even if `from` is mid-week. Weeks that are entirely
  // breaks (or only weekends, when weekends don't count) are skipped.
  Weeks.prototype.count = function (from, n) {
    var got = 0, first = null, skipped = 0;
    for (var i = 0, ws = this.weekOf(from); i < MAX_SCAN_DAYS / 7; i++, ws += 7) {
      var days = this.days(ws, from);
      if (!days.length) { if (first !== null) skipped++; continue; }
      if (first === null) first = days[0];
      got++;
      if (got >= n) return { first: first, last: days[days.length - 1], lastWeek: ws, skippedWeeks: skipped };
    }
    throw new Error('Period runs longer than 20 years. Check your inputs.');
  };

  function toNumber(v) {
    if (v === '' || v === null || v === undefined) return NaN;
    return Number(v);
  }

  function parseWeekList(s) {
    if (Array.isArray(s)) return s.map(toNumber);
    return String(s || '')
      .split(/[,\s;]+/)
      .filter(function (x) { return x.length; })
      .map(toNumber);
  }

  function normalizeBreaks(list, errors) {
    var out = [];
    (list || []).forEach(function (b, i) {
      if (!b || (!b.start && !b.end)) return;
      var s = parseISO(b.start), e = parseISO(b.end || b.start);
      if (s === null || e === null) {
        errors.push('Break ' + (i + 1) + ' needs a valid start and end date.');
        return;
      }
      if (e < s) {
        errors.push('Break ' + (i + 1) + ' ends before it starts.');
        return;
      }
      out.push({ start: s, end: e, label: b.label || '' });
    });
    return out;
  }

  function weeksLabel(w) {
    return (Math.round(w * 10) / 10) + (w === 1 ? ' week' : ' weeks');
  }

  function calculate(raw) {
    var errors = [];
    var checks = [];
    var notes = [];

    var measure = raw.measure === 'clock' ? 'clock' : 'credit';
    var calendar = CALENDARS[raw.calendar] ? raw.calendar : 'semester';
    if (measure === 'clock' && calendar !== 'nonterm') {
      calendar = 'nonterm';
      notes.push('Clock-hour programs are calculated as non-term programs, so the calendar was set to non-term.');
    }
    var cal = CALENDARS[calendar];
    var weekendsCount = raw.weekends !== 'exclude';
    var daysPerWeek = weekendsCount ? 7 : 5;
    var years = Math.max(1, Math.min(6, Math.floor(toNumber(raw.years)) || 2));
    var gapWeeks = Math.max(0, Math.floor(toNumber(raw.gapWeeks)) || 0);
    var reduced = !!raw.reducedWeeks && measure === 'credit';

    var start = parseISO(raw.start);
    if (start === null) errors.push('Enter a valid start date.');
    var breaks = normalizeBreaks(raw.breaks, errors);
    var repeating = raw.repeatBreaks !== false && breaks.length > 0;
    if (repeating) breaks = repeatBreaks(breaks, years + 1);
    var counts = makeCounter(weekendsCount, breaks);

    // Hours unit and regulatory minimums.
    var hourUnit, minHours;
    if (measure === 'clock') {
      hourUnit = 'clock';
    } else if (calendar === 'nonstandard' || calendar === 'nonterm') {
      hourUnit = raw.creditUnit === 'quarter' ? 'quarter' : 'semester';
    } else {
      hourUnit = cal.creditUnit;
    }
    minHours = MIN_HOURS[hourUnit];
    var minWeeks = measure === 'clock' ? MIN_WEEKS.clock : (reduced ? MIN_WEEKS.creditReduced : MIN_WEEKS.credit);
    var ayHours = toNumber(raw.ayHours);
    if (!(ayHours > 0)) ayHours = minHours;

    // Term structure (weeks of instructional time per term) for one AY.
    // Each term: { weeks, label, countsTowardAY }. Optional summer terms are
    // payment periods but add no weeks of instructional time to the AY.
    var terms = null;
    var termWeeks = null;
    var classification = '';
    var classDetail = '';
    if (calendar === 'semester' || calendar === 'trimester' || calendar === 'quarter') {
      var tw = Math.ceil(toNumber(raw.termWeeks));
      if (!(tw > 0)) tw = cal.defaultWeeks;
      var sw = Math.ceil(toNumber(raw.summerWeeks));
      if (!(sw > 0)) sw = tw;
      var lower = cal.label.toLowerCase();
      terms = [];
      if (cal.mandatorySummer) {
        terms.push({ weeks: tw, label: cal.label + ' 1', countsTowardAY: true });
        terms.push({ weeks: tw, label: cal.label + ' 2', countsTowardAY: true });
        terms.push({ weeks: sw, label: cal.label + ' 3 (summer, required)', countsTowardAY: true, summer: true });
        classDetail = 'Three trimesters make one academic year, including a required summer trimester of ' + weeksLabel(sw) + '.';
      } else {
        for (var t = 0; t < cal.termsPerAY; t++) terms.push({ weeks: tw, label: cal.label + ' ' + (t + 1), countsTowardAY: true });
        classDetail = cal.termsPerAY + ' ' + lower + 's of ' + weeksLabel(tw) + ' make one academic year.';
        var summerMode = calendar === 'quarter' ? raw.summer : 'none';
        if (summerMode === 'header' || summerMode === 'trailer') {
          var st = { weeks: sw, label: 'Summer quarter (' + summerMode + ')', countsTowardAY: false, summer: true };
          if (summerMode === 'header') terms.unshift(st); else terms.push(st);
          classDetail += ' An optional summer quarter of ' + weeksLabel(sw) + ' is added as a ' + summerMode +
            (summerMode === 'header' ? ', the first payment period of the year.' : ', the last payment period of the year.');
          checks.push({ level: 'ok', text: 'The summer ' + summerMode + ' is an extra payment period. Its weeks are not counted toward the ' +
            'academic year minimum, and it cannot also be used as a header or trailer for another year.' });
        }
      }
      classification = 'Standard term: ' + lower + 's';
      if (tw < cal.typical[0] || tw > cal.typical[1]) {
        checks.push({ level: 'warn', text: cal.label + 's are typically ' + cal.typical[0] + '–' + cal.typical[1] +
          ' weeks. A ' + weeksLabel(tw) + ' term may not qualify as a standard term. Confirm with the FSA Handbook or calculate it as a nonstandard term.' });
      } else {
        checks.push({ level: 'ok', text: weeksLabel(tw) + ' is within the typical ' + cal.typical[0] + '–' + cal.typical[1] + ' week range for a standard ' + lower + '.' });
      }
      if (cal.mandatorySummer && (sw < cal.typical[0] || sw > cal.typical[1])) {
        checks.push({ level: 'warn', text: 'The required summer trimester is ' + weeksLabel(sw) + ', outside the typical ' + cal.typical[0] + '–' + cal.typical[1] +
          ' weeks. It may not qualify as a standard term.' });
      }
    } else if (calendar === 'nonstandard') {
      termWeeks = parseWeekList(raw.nsTermWeeks).map(Math.ceil);
      if (!termWeeks.length || termWeeks.some(function (w) { return !(w > 0); })) {
        errors.push('List the length of each nonstandard term in weeks, for example 8, 8, 8, 8.');
        termWeeks = null;
      } else {
        terms = termWeeks.map(function (w, i) { return { weeks: w, label: 'Term ' + (i + 1), countsTowardAY: true }; });
        var minT = Math.min.apply(null, termWeeks), maxT = Math.max.apply(null, termWeeks);
        var equal = maxT - minT <= 2;
        var se9w = equal && minT >= 9;
        if (se9w) {
          classification = 'Nonstandard terms: substantially equal, 9+ weeks (SE9W)';
          classDetail = 'No term differs from another by more than 2 weeks and every term is at least 9 weeks.';
        } else if (equal) {
          classification = 'Nonstandard terms: substantially equal, under 9 weeks';
          classDetail = 'Terms are within 2 weeks of each other, but at least one is shorter than 9 weeks, so they are not SE9W.';
        } else {
          classification = 'Nonstandard terms: not substantially equal';
          classDetail = 'At least two terms differ by more than 2 weeks (' + weeksLabel(minT) + ' vs ' + weeksLabel(maxT) + ').';
        }
        checks.push({ level: 'ok', text: 'Each term is its own payment period. ' +
          'A student must complete the ' + ayHours + ' ' + hourUnit + ' hours and the weeks of the academic year before moving to the next one.' });
      }
    } else {
      classification = measure === 'clock' ? 'Clock-hour program (non-term)' : 'Credit-hour non-term program';
      classDetail = 'The academic year ends when the student completes both the weeks and the hours. Each academic year has two payment periods.';
    }

    var ayWeeks;
    if (terms) {
      ayWeeks = terms.reduce(function (a, t) { return a + (t.countsTowardAY ? t.weeks : 0); }, 0);
    } else {
      ayWeeks = Math.ceil(toNumber(raw.ayWeeks));
      if (!(ayWeeks > 0)) ayWeeks = minWeeks;
    }

    // Regulatory minimums.
    if (ayWeeks < minWeeks) {
      errors.push('The academic year has ' + weeksLabel(ayWeeks) + ' of instructional time. The minimum is ' + minWeeks +
        (measure === 'clock' ? ' for clock-hour programs.' : (reduced ? ' with an approved reduction.' : ' for credit-hour programs (26 only with ED approval).')));
    } else {
      checks.push({ level: 'ok', text: weeksLabel(ayWeeks) + ' of instructional time meets the ' + minWeeks + '-week minimum.' });
    }
    if (ayHours < minHours) {
      checks.push({ level: 'warn', text: ayHours + ' ' + hourUnit + ' hours is below the ' + minHours + '-hour undergraduate minimum. Graduate programs may define fewer; undergraduate programs cannot.' });
    } else {
      checks.push({ level: 'ok', text: ayHours + ' ' + hourUnit + ' hours meets the ' + minHours + '-hour undergraduate minimum.' });
    }

    var hoursPerWeek = toNumber(raw.hoursPerWeek);
    if (calendar === 'nonterm' && !(hoursPerWeek > 0)) {
      errors.push('Enter the scheduled hours per week so the hours side of the academic year can be dated.');
    }

    if (errors.length || start === null) {
      return { ok: false, errors: errors, checks: checks, notes: notes, classification: classification, classDetail: classDetail, calendar: calendar };
    }

    var ays = [];
    var first;
    try {
      first = nextCounted(start, counts);
      var weeks = new Weeks(counts);
      if (terms) {
        ays = buildTermYears(first, terms, years, gapWeeks, raw.nextYear === 'anniversary', weeks, errors);
      } else {
        ays = buildNonTermYears(first, ayWeeks, ayHours, hoursPerWeek, years, daysPerWeek, weeks, hourUnit);
      }
    } catch (e) {
      errors.push(e.message);
    }
    if (errors.length) {
      return { ok: false, errors: errors, checks: checks, notes: notes, classification: classification, classDetail: classDetail, calendar: calendar };
    }

    // Overlap guard: every AY must start after the previous one ends.
    var overlap = false;
    for (var k = 1; k < ays.length; k++) {
      if (ays[k].start <= ays[k - 1].end) overlap = true;
    }
    if (overlap) {
      errors.push('Academic years overlap. Increase the break between years or shorten the terms.');
      return { ok: false, errors: errors, checks: checks, notes: notes, classification: classification, classDetail: classDetail, calendar: calendar };
    }
    checks.push({ level: 'ok', text: 'No academic years overlap. Each one starts after the previous one ends.' });

    if (first !== start) {
      notes.push('The start date ' + formatDate(start) + ' is not an instructional day, so the first week begins ' + formatDate(first) + '.');
    }
    notes.push('Instructional weeks run Monday through Sunday. Each term closes out its last week and the next term starts on a Monday.' +
      (dayOfWeek(first) !== 1 ? ' The ' + formatDate(first) + ' start is mid-week, so that partial week counts as week 1.' : ''));
    if (!weekendsCount) {
      notes.push('Weekends are not instructional days. A week counts when it has at least one weekday of instruction, and terms end on the last weekday of the week.');
    } else {
      notes.push('Weekends are instructional days, so each week runs 7 calendar days and a term ends on the last day of its final week.');
    }
    if (breaks.length) {
      notes.push('A week that falls entirely inside a break has no instruction and is not counted, so the term runs one week longer. ' +
        'A break that covers only part of a week (for example Wednesday through Friday) does not remove the week, because the week still has instruction.');
    }
    if (repeating) {
      notes.push('Breaks repeat each year on the same weekdays in the week nearest the original dates, so each year has a similar break.');
    }
    ays.forEach(function (ay) {
      ay.breaks = breaks.filter(function (b) { return b.start <= ay.end && b.end >= ay.start; });
    });

    return {
      ok: true,
      errors: [],
      checks: checks,
      notes: notes,
      classification: classification,
      classDetail: classDetail,
      calendar: calendar,
      measure: measure,
      hourUnit: hourUnit,
      ayWeeks: ayWeeks,
      ayHours: ayHours,
      daysPerWeek: daysPerWeek,
      years: ays
    };
  }

  function buildTermYears(first, terms, years, gapWeeks, anniversary, weeks, errors) {
    var ays = [];
    var cursor = first; // always a week start
    for (var y = 0; y < years; y++) {
      if (y > 0) {
        var prev = ays[y - 1];
        if (anniversary) {
          var target = sameWeekdayAnniversary(first, y);
          if (target <= prev.end) {
            errors.push('Academic year ' + (y + 1) + ' would start ' + formatDate(target) + ', before academic year ' + y +
              ' ends on ' + formatDate(prev.end) + '. Choose "Right after the last term", use fewer weeks off, or shorten the terms.');
            return ays;
          }
          cursor = target;
        } else {
          cursor = prev.lastWeek + 7 * (1 + gapWeeks);
        }
      }
      var periods = [];
      for (var i = 0; i < terms.length; i++) {
        var r = weeks.count(cursor, terms[i].weeks);
        periods.push({
          label: terms[i].label,
          start: r.first,
          end: r.last,
          weeks: terms[i].weeks,
          breakWeeks: r.skippedWeeks,
          countsTowardAY: terms[i].countsTowardAY,
          summer: !!terms[i].summer,
          calendarDays: r.last - r.first + 1,
          lastWeek: r.lastWeek
        });
        cursor = r.lastWeek + 7 * (1 + gapWeeks);
      }
      var last = periods[periods.length - 1];
      ays.push({
        index: y + 1,
        start: periods[0].start,
        end: last.end,
        lastWeek: last.lastWeek,
        periods: periods,
        drivenBy: 'terms'
      });
    }
    return ays;
  }

  // Non-term: walk week by week, tracking weeks of instruction and hours. Hours
  // accrue per instructional day, so a week shortened by a break earns fewer.
  // Each milestone closes out the week in which it is reached.
  function buildNonTermYears(first, ayWeeks, ayHours, hoursPerWeek, years, daysPerWeek, weeks, hourUnit) {
    var ays = [];
    var hoursPerDay = hoursPerWeek / daysPerWeek;
    var halfWeeks = Math.ceil(ayWeeks / 2);
    var EPS = 1e-9;
    var ws = weeks.weekOf(first);
    for (var y = 0; y < years; y++) {
      var wCount = 0, hours = 0, start = null;
      var m = {}; // milestone -> { week start, last day, weeks so far }
      for (var i = 0; i < MAX_SCAN_DAYS / 7; i++, ws += 7) {
        var days = weeks.days(ws, y === 0 ? first : ws);
        if (!days.length) continue;
        if (start === null) start = days[0];
        wCount++;
        hours += days.length * hoursPerDay;
        var hit = { week: ws, last: days[days.length - 1], n: wCount };
        if (!m.halfW && wCount >= halfWeeks) m.halfW = hit;
        if (!m.halfH && hours >= ayHours / 2 - EPS) m.halfH = hit;
        if (!m.w && wCount >= ayWeeks) m.w = hit;
        if (!m.h && hours >= ayHours - EPS) m.h = hit;
        if (m.w && m.h) break;
      }
      if (!(m.w && m.h)) throw new Error('Academic year runs longer than 20 years. Check hours per week.');
      var pp1 = m.halfH.week > m.halfW.week ? m.halfH : m.halfW;
      var endHit = m.h.week > m.w.week ? m.h : m.w;
      var pp2 = weeks.count(pp1.week + 7, 1);
      ays.push({
        index: y + 1,
        start: start,
        end: endHit.last,
        lastWeek: endHit.week,
        weeksEnd: m.w.last,
        hoursEnd: m.h.last,
        drivenBy: m.h.week > m.w.week ? 'hours' : (m.w.week > m.h.week ? 'weeks' : 'both'),
        periods: [
          { label: 'Payment period 1', start: start, end: pp1.last, weeks: pp1.n, hours: ayHours / 2,
            drivenBy: m.halfH.week > m.halfW.week ? 'hours' : 'weeks', calendarDays: pp1.last - start + 1 },
          { label: 'Payment period 2', start: pp2.first, end: endHit.last, weeks: endHit.n - pp1.n, hours: ayHours / 2,
            drivenBy: m.h.week > m.w.week ? 'hours' : 'weeks', calendarDays: endHit.last - pp2.first + 1 }
        ],
        hourUnit: hourUnit
      });
      ws = endHit.week + 7;
    }
    return ays;
  }

  var api = {
    calculate: calculate,
    parseISO: parseISO,
    toISO: toISO,
    formatDate: formatDate,
    CALENDARS: CALENDARS,
    MIN_WEEKS: MIN_WEEKS,
    MIN_HOURS: MIN_HOURS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AYCalc = api;
})(typeof window !== 'undefined' ? window : this);
