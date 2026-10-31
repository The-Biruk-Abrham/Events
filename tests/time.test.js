import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEventDateTimeInput,
  formatTimeRange,
  formatDateFull,
  formatDateTimeDisplay,
  formatPreviewDateTime,
  formatWeekDayHeader,
  getTodayRange,
  getWeekRange,
  getAddisComponents,
  ADDIS_OFFSET_SECONDS,
} from '../tgcloud/lib/time.js';

describe('Time and Date Module (Addis Ababa +03:00)', () => {
  it('correctly shifts unix timestamp to Addis Ababa time (+03:00)', () => {
    // 2026-09-05 14:00:00 UTC is 17:00:00 in Addis Ababa
    const utcSec = Date.UTC(2026, 8, 5, 14, 0, 0) / 1000;
    const c = getAddisComponents(utcSec);
    assert.equal(c.year, 2026);
    assert.equal(c.month, 9);
    assert.equal(c.date, 5);
    assert.equal(c.hours, 17);
    assert.equal(c.minutes, 0);
  });

  it('parses valid DD/MM/YYYY HH:MM in Addis Ababa time', () => {
    const unixSec = parseEventDateTimeInput('15/09/2026 14:30');
    const c = getAddisComponents(unixSec);
    assert.equal(c.year, 2026);
    assert.equal(c.month, 9);
    assert.equal(c.date, 15);
    assert.equal(c.hours, 14);
    assert.equal(c.minutes, 30);
  });

  it('parses 2-digit year DD/MM/YY HH:MM format', () => {
    const unixSec = parseEventDateTimeInput('15/09/26 09:15');
    const c = getAddisComponents(unixSec);
    assert.equal(c.year, 2026);
    assert.equal(c.month, 9);
    assert.equal(c.date, 15);
    assert.equal(c.hours, 9);
    assert.equal(c.minutes, 15);
  });

  it('rejects invalid datetime formats', () => {
    assert.throws(() => parseEventDateTimeInput('2026-09-15 14:30'), /expected 'DD\/MM\/YYYY HH:MM'/);
    assert.throws(() => parseEventDateTimeInput('invalid-date'), /expected 'DD\/MM\/YYYY HH:MM'/);
    assert.throws(() => parseEventDateTimeInput(''), /required/);
  });

  it('rejects out-of-range dates and times', () => {
    // Invalid month
    assert.throws(() => parseEventDateTimeInput('15/13/2026 14:30'), /Invalid month/);
    // Invalid day (Feb 30)
    assert.throws(() => parseEventDateTimeInput('30/02/2026 14:30'), /Invalid day/);
    // Invalid hour (25)
    assert.throws(() => parseEventDateTimeInput('15/09/2026 25:00'), /Invalid hour/);
    // Invalid minute (60)
    assert.throws(() => parseEventDateTimeInput('15/09/2026 14:60'), /Invalid minute/);
  });

  it('formats time ranges in 12-hour clock with AM/PM', () => {
    const dt1 = parseEventDateTimeInput('05/09/2026 17:00');
    const dt2 = parseEventDateTimeInput('05/09/2026 20:30');
    const range = formatTimeRange(dt1, dt2);
    assert.equal(range, '5:00 PM – 8:30 PM');

    const single = formatTimeRange(dt1, null);
    assert.equal(single, '5:00 PM');
  });

  it('shows clear AM/PM and 24-hour confirmation in previews', () => {
    const dt = parseEventDateTimeInput('05/09/2026 14:30');
    const preview = formatPreviewDateTime(dt);
    assert.match(preview, /Saturday, September 05, 2026 at 02:30 PM \(14:30 Addis Ababa time\)/);
  });

  it('computes exact midnight boundaries for today in Addis Ababa', () => {
    // Exactly midnight in Addis Ababa: 2026-09-05 00:00:00 (+03:00)
    // Corresponding UTC: 2026-09-04 21:00:00 UTC
    const exactMidnightSec = Date.UTC(2026, 8, 4, 21, 0, 0) / 1000;
    const { start, end } = getTodayRange(exactMidnightSec);

    assert.equal(start, exactMidnightSec);
    assert.equal(end, exactMidnightSec + 86400);

    // 1 second before midnight in Addis Ababa belongs to previous day
    const oneSecBefore = exactMidnightSec - 1;
    const prevRange = getTodayRange(oneSecBefore);
    assert.equal(prevRange.start, exactMidnightSec - 86400);
    assert.equal(prevRange.end, exactMidnightSec);
  });

  it('computes upcoming 7-day week boundary', () => {
    const refSec = Date.UTC(2026, 8, 5, 12, 0, 0) / 1000;
    const { start, end } = getWeekRange(refSec);
    assert.equal(end - start, 7 * 86400);
  });
});
