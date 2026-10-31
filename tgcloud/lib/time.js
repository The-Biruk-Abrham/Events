// lib/time.js
// Fixed +03:00 offset time calculations for Africa/Addis_Ababa (no DST)
// Implemented entirely by hand without relying on Intl or external timezone libraries.

export const ADDIS_OFFSET_SECONDS = 3 * 3600; // +03:00 is exactly 10,800 seconds

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Returns current unix timestamp in seconds.
 */
export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Decomposes a unix timestamp (seconds) into Addis Ababa local components.
 */
export function getAddisComponents(unixSec) {
  const shiftedMs = (Number(unixSec) + ADDIS_OFFSET_SECONDS) * 1000;
  const d = new Date(shiftedMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // 1 - 12
    date: d.getUTCDate(), // 1 - 31
    dayOfWeek: d.getUTCDay(), // 0 = Sun
    hours: d.getUTCHours(), // 0 - 23
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
  };
}

/**
 * Formats time in 12-hour AM/PM format (e.g. "5:00 PM", "8:30 AM").
 */
export function formatTime12(hours, minutes) {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mStr = String(minutes).padStart(2, '0');
  return `${h12}:${mStr} ${ampm}`;
}

/**
 * Formats a time range between two unix timestamps in Addis Ababa time.
 * Example: "5:00 PM – 8:30 PM" or "5:00 PM"
 */
export function formatTimeRange(startUnixSec, endUnixSec = null) {
  if (!startUnixSec && startUnixSec !== 0) return 'TBD';
  const s = getAddisComponents(startUnixSec);
  const startStr = formatTime12(s.hours, s.minutes);
  if (endUnixSec || endUnixSec === 0) {
    const e = getAddisComponents(endUnixSec);
    const endStr = formatTime12(e.hours, e.minutes);
    return `${startStr} – ${endStr}`;
  }
  return startStr;
}

/**
 * Formats date e.g. "Saturday, September 05, 2026"
 */
export function formatDateFull(unixSec) {
  if (!unixSec && unixSec !== 0) return 'TBD';
  const c = getAddisComponents(unixSec);
  const dayName = DAYS[c.dayOfWeek];
  const monthName = MONTHS[c.month - 1];
  const dateStr = String(c.date).padStart(2, '0');
  return `${dayName}, ${monthName} ${dateStr}, ${c.year}`;
}

/**
 * Formats date and time e.g. "Saturday, September 05, 2026 at 5:00 PM"
 */
export function formatDateTimeDisplay(unixSec) {
  if (!unixSec && unixSec !== 0) return 'TBD';
  const c = getAddisComponents(unixSec);
  const dayName = DAYS[c.dayOfWeek];
  const monthName = MONTHS[c.month - 1];
  const dateStr = String(c.date).padStart(2, '0');
  const timeStr = formatTime12(c.hours, c.minutes);
  return `${dayName}, ${monthName} ${dateStr}, ${c.year} at ${timeStr}`;
}

/**
 * Formats datetime with explicit 12-hour AM/PM and 24-hour Addis confirmation for submission previews.
 * E.g. "Saturday, September 05, 2026 at 02:30 PM (14:30 Addis Ababa time)"
 */
export function formatPreviewDateTime(unixSec) {
  if (!unixSec && unixSec !== 0) return 'TBD';
  const c = getAddisComponents(unixSec);
  const dayName = DAYS[c.dayOfWeek];
  const monthName = MONTHS[c.month - 1];
  const dateStr = String(c.date).padStart(2, '0');
  const h12 = c.hours % 12 === 0 ? 12 : c.hours % 12;
  const ampm = c.hours >= 12 ? 'PM' : 'AM';
  const mStr = String(c.minutes).padStart(2, '0');
  const h24Str = String(c.hours).padStart(2, '0');
  return `${dayName}, ${monthName} ${dateStr}, ${c.year} at ${String(h12).padStart(2, '0')}:${mStr} ${ampm} (${h24Str}:${mStr} Addis Ababa time)`;
}

/**
 * Formats day header for week groupings e.g. "Saturday, Sep 05"
 */
export function formatWeekDayHeader(unixSec) {
  if (!unixSec && unixSec !== 0) return 'Date TBD';
  const c = getAddisComponents(unixSec);
  const dayName = DAYS[c.dayOfWeek];
  const monthShort = MONTHS_SHORT[c.month - 1];
  const dateStr = String(c.date).padStart(2, '0');
  return `${dayName}, ${monthShort} ${dateStr}`;
}

/**
 * Checks number of days in a given Gregorian month (handles leap years).
 */
export function getDaysInMonth(year, month) {
  // Month is 1-12. Date.UTC(year, month, 0) returns the last day of the target month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parses user input in DD/MM/YYYY HH:MM (or DD/MM/YY HH:MM) 24-hour format into unix seconds.
 * Throws a descriptive Error if invalid.
 */
export function parseEventDateTimeInput(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') {
    throw new Error('Invalid input: date/time string is required.');
  }

  const match = inputStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error("Invalid datetime format: expected 'DD/MM/YYYY HH:MM' in 24-hour clock (e.g. 15/09/2026 14:30).");
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);

  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month (${month}): must be between 01 and 12.`);
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    throw new Error(`Invalid day (${day}) for month ${month}/${year}: must be between 01 and ${maxDays}.`);
  }

  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour (${hour}): must be between 00 and 23 (24-hour clock).`);
  }

  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute (${minute}): must be between 00 and 59.`);
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const unixSec = Math.floor(utcMs / 1000) - ADDIS_OFFSET_SECONDS;
  return unixSec;
}

/**
 * Computes the exact Addis Ababa start and end boundaries for "today".
 * Start of today is 00:00:00 Addis Ababa time.
 * End of today is 24 hours later (start + 86400).
 */
export function getTodayRange(referenceSec = nowSec()) {
  const c = getAddisComponents(referenceSec);
  const startUtcMs = Date.UTC(c.year, c.month - 1, c.date, 0, 0, 0);
  const startSec = Math.floor(startUtcMs / 1000) - ADDIS_OFFSET_SECONDS;
  const endSec = startSec + 86400;
  return {
    start: startSec,
    end: endSec,
    formattedToday: formatDateFull(startSec),
  };
}

/**
 * Computes the upcoming 7 days boundary for "this week" in Addis Ababa time.
 * From start of today (00:00:00) to 7 days later (start + 7 * 86400).
 */
export function getWeekRange(referenceSec = nowSec()) {
  const { start } = getTodayRange(referenceSec);
  const endSec = start + 7 * 86400;
  return {
    start,
    end: endSec,
  };
}
