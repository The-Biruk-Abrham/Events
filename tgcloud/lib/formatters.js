// lib/formatters.js
// Event formatting for Telegram messages and channel broadcasts.
// Pure functions, safe for testing outside tgcloud.

import {
  formatDateFull,
  formatTimeRange,
  formatWeekDayHeader,
  getTodayRange,
} from './time.js';
import { t } from './i18n.js';

export const CATEGORY_EMOJIS = {
  academic: '🎓',
  'career/workshop': '💼',
  sports: '⚽',
  entertainment: '🎭',
  'club social': '🎉',
  religious: '🕊️',
  other: '📌',
};

/**
 * Escapes characters for Telegram Markdown V1 to prevent parsing errors.
 */
export function safeEscape(text) {
  if (text === null || text === undefined) return '';
  const s = String(text);
  return s.replace(/[\\*_[\]`]/g, (ch) => `\\${ch}`);
}

/**
 * Returns matching emoji for an event category.
 */
export function getCategoryEmoji(categoryName = '') {
  if (!categoryName) return '📌';
  const key = String(categoryName).toLowerCase().trim();
  return CATEGORY_EMOJIS[key] || '📌';
}

/**
 * Formats a single event card for compact list views (/today, /events).
 */
export function formatEventCard(event, index = null) {
  const timeStr = formatTimeRange(event.start_datetime ?? event.startDatetime, event.end_datetime ?? event.endDatetime);
  const catName = event.category_name || event.categoryName || event.custom_category || event.customCategory || 'General';
  const emoji = getCategoryEmoji(catName);
  const title = safeEscape(event.title || 'Untitled Event');
  const club = safeEscape(event.club_name || event.clubName || event.custom_club || event.customClub || 'University Club');
  const location = safeEscape(event.location || 'Campus');
  const categoryEscaped = safeEscape(catName);

  const prefix = index !== null ? `${index}. ` : '';

  const lines = [
    `${prefix}*${title}*`,
    `  ${emoji} \`${categoryEscaped}\` • 🏢 ${club}`,
    `  ⏰ ${timeStr} • 📍 ${location}`,
  ];

  if (event.recurring && (event.recurrence_pattern || event.recurrencePattern)) {
    lines.append
    lines.push(`  🔄 _${safeEscape(event.recurrence_pattern || event.recurrencePattern)}_`);
  }

  return lines.join('\n');
}

/**
 * Formats full detailed view of an event in Addis Ababa time.
 */
export function formatSingleEvent(event) {
  const startSec = event.start_datetime ?? event.startDatetime;
  const endSec = event.end_datetime ?? event.endDatetime;
  const dateStr = formatDateFull(startSec);
  const timeStr = formatTimeRange(startSec, endSec);

  const catName = event.category_name || event.categoryName || event.custom_category || event.customCategory || 'General';
  const emoji = getCategoryEmoji(catName);
  const title = safeEscape(event.title || 'Untitled Event');
  const club = safeEscape(event.club_name || event.clubName || event.custom_club || event.customClub || 'University Club');
  const location = safeEscape(event.location || 'Campus');
  const categoryEscaped = safeEscape(catName);

  const isCustomClub = Boolean(event.is_custom_club || (!event.clubId && !event.club && (event.custom_club || event.customClub)));
  const isCustomCat = Boolean(event.is_custom_category || (!event.categoryId && !event.category && (event.custom_category || event.customCategory)));

  let clubLine = `🏛️ *Organizer:* ${club}`;
  if (isCustomClub) {
    clubLine = `⚠️ *Organizer:* ${club} _(CUSTOM / UNVERIFIED ENTRY)_`;
  }

  let catLine = `${emoji} *Category:* ${categoryEscaped}`;
  if (isCustomCat) {
    catLine = `⚠️ *Category:* ${categoryEscaped} _(CUSTOM / UNLISTED)_`;
  }

  const lines = [
    `✨ *${title}* ✨`,
    '────────────────────────────',
    clubLine,
    catLine,
    `📅 *Date:* ${dateStr}`,
    `⏰ *Time:* ${timeStr}`,
    `📍 *Location:* ${location}`,
  ];

  const recPattern = event.recurrence_pattern || event.recurrencePattern;
  if (event.recurring && recPattern) {
    lines.push(`🔄 *Recurrence:* ${safeEscape(recPattern)}`);
  }

  const raw = event.raw_content || event.rawContent || {};
  const caption = (raw.caption || '').trim();
  if (caption) {
    lines.push('');
    lines.push('📝 *Original Announcement:*');
    lines.push(`${safeEscape(caption)}`);
  }

  return lines.join('\n');
}

/**
 * Formats today's events list with pagination.
 * Returns { text, totalPages, totalCount }
 */
export function formatTodayEvents(events, page = 1, pageSize = 3, lang = 'en') {
  const { formattedToday } = getTodayRange();
  const totalCount = events.length;

  if (totalCount === 0) {
    return {
      text: t('events.today_empty', lang, { todayDate: formattedToday }),
      totalPages: 0,
      totalCount: 0,
    };
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * pageSize;
  const pageEvents = events.slice(startIdx, startIdx + pageSize);

  const header = t('events.today_header', lang, { todayDate: formattedToday, count: totalCount });
  const cards = pageEvents.map((ev, i) => formatEventCard(ev, startIdx + i + 1));
  const body = cards.join('\n\n');
  const footer = totalPages > 1 ? t('common.page_footer', lang, { page: currentPage, total: totalPages }) : '';

  return {
    text: header + body + footer,
    totalPages,
    totalCount,
  };
}

/**
 * Formats the 7-day upcoming events schedule grouped by day.
 */
export function formatWeekEvents(events, lang = 'en') {
  if (!events || events.length === 0) {
    return t('events.week_empty', lang);
  }

  // Group events by day header (e.g. "Saturday, Sep 05")
  const groups = new Map();
  for (const ev of events) {
    const startSec = ev.start_datetime ?? ev.startDatetime;
    const dayLabel = formatWeekDayHeader(startSec);
    if (!groups.has(dayLabel)) {
      groups.set(dayLabel, []);
    }
    groups.get(dayLabel).push(ev);
  }

  const header = t('events.week_header', lang, { count: events.length });
  const sections = [];

  for (const [dayLabel, dayEvents] of groups.entries()) {
    const dayHeader = `📅 *${dayLabel}* (${dayEvents.length})`;
    const cards = dayEvents.map((ev) => {
      const startSec = ev.start_datetime ?? ev.startDatetime;
      const endSec = ev.end_datetime ?? ev.endDatetime;
      const timeStr = formatTimeRange(startSec, endSec);
      const catName = ev.category_name || ev.categoryName || ev.custom_category || ev.customCategory || 'General';
      const emoji = getCategoryEmoji(catName);
      const title = safeEscape(ev.title || 'Untitled Event');
      const club = safeEscape(ev.club_name || ev.clubName || ev.custom_club || ev.customClub || 'Club');
      const loc = safeEscape(ev.location || 'Campus');

      return (
        `  • *${title}*\n` +
        `    ${emoji} ${safeEscape(catName)} • ⏰ ${timeStr}\n` +
        `    🏢 ${club} • 📍 ${loc}`
      );
    });

    sections.push(`${dayHeader}\n${cards.join('\n')}`);
  }

  return header + sections.join('\n\n');
}

/**
 * Formats category-filtered events with pagination.
 * Returns { text, totalPages, totalCount }
 */
export function formatCategoryEvents(categoryName, events, page = 1, pageSize = 3, lang = 'en') {
  const emoji = getCategoryEmoji(categoryName);
  const totalCount = events.length;

  if (totalCount === 0) {
    return {
      text: t('events.category_empty', lang, { categoryName: safeEscape(categoryName), emoji }),
      totalPages: 0,
      totalCount: 0,
    };
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * pageSize;
  const pageEvents = events.slice(startIdx, startIdx + pageSize);

  const header = t('events.category_header', lang, { categoryName: safeEscape(categoryName), emoji, count: totalCount });
  const cards = pageEvents.map((ev, i) => formatEventCard(ev, startIdx + i + 1));
  const body = cards.join('\n\n');
  const footer = totalPages > 1 ? t('common.page_footer', lang, { page: currentPage, total: totalPages }) : '';

  return {
    text: header + body + footer,
    totalPages,
    totalCount,
  };
}

/**
 * Dedicated channel post formatter.
 * 1. Forwarded submissions: returns original caption/text completely untouched.
 * 2. Manual submissions: builds full structured post from all fields.
 */
export function formatChannelPost(event) {
  const raw = event.raw_content || event.rawContent || {};
  const isForwarded = Boolean(raw.is_forwarded);
  const caption = (raw.caption || '').trim();

  // Forwarded post: preserves original content completely untouched
  if (isForwarded) {
    return caption || event.title || 'Upcoming Event';
  }

  // Manual submission: compose full formatted announcement
  const startSec = event.start_datetime ?? event.startDatetime;
  const endSec = event.end_datetime ?? event.endDatetime;
  const dateStr = formatDateFull(startSec);
  const timeStr = formatTimeRange(startSec, endSec);

  const catName = event.category_name || event.categoryName || event.custom_category || event.customCategory || 'General';
  const emoji = getCategoryEmoji(catName);
  const title = safeEscape(event.title || 'Untitled Event');
  const club = safeEscape(event.club_name || event.clubName || event.custom_club || event.customClub || 'University Club');
  const location = safeEscape(event.location || 'Campus');
  const categoryEscaped = safeEscape(catName);

  const isCustomClub = Boolean(event.is_custom_club || (!event.clubId && !event.club && (event.custom_club || event.customClub)));
  const isCustomCat = Boolean(event.is_custom_category || (!event.categoryId && !event.category && (event.custom_category || event.customCategory)));

  const clubLine = isCustomClub ? `🏛️ *Organizer:* ${club} _(Custom)_` : `🏛️ *Organizer:* ${club}`;
  const catLine = isCustomCat ? `${emoji} *Category:* ${categoryEscaped} _(Custom)_` : `${emoji} *Category:* ${categoryEscaped}`;

  const lines = [
    '📢 *NEW CAMPUS EVENT*',
    '────────────────────────────',
    `✨ *${title}* ✨`,
    clubLine,
    catLine,
    `📅 *Date:* ${dateStr}`,
    `⏰ *Time:* ${timeStr}`,
    `📍 *Location:* ${location}`,
  ];

  const recPattern = event.recurrence_pattern || event.recurrencePattern;
  if (event.recurring && recPattern) {
    lines.push(`🔄 *Recurrence:* ${safeEscape(recPattern)}`);
  }

  const basePost = lines.join('\n');
  if (caption) {
    return `${basePost}\n\n📝 *Description:*\n${safeEscape(caption)}`;
  }
  return basePost;
}

/**
 * Formats the admin review card sent to the Admin Group.
 */
export function formatAdminPendingCard(event, maxLen = 1000) {
  const startSec = event.start_datetime ?? event.startDatetime;
  const endSec = event.end_datetime ?? event.endDatetime;
  const dateStr = formatDateFull(startSec);
  const timeStr = formatTimeRange(startSec, endSec);

  const catName = event.category_name || event.categoryName || event.custom_category || event.customCategory || 'General';
  const emoji = getCategoryEmoji(catName);
  const title = safeEscape(event.title || 'Untitled Event');
  const club = safeEscape(event.club_name || event.clubName || event.custom_club || event.customClub || 'University Club');
  const location = safeEscape(event.location || 'Campus');
  const categoryEscaped = safeEscape(catName);

  const isCustomClub = Boolean(event.is_custom_club || (!event.clubId && !event.club && (event.custom_club || event.customClub)));
  const isCustomCat = Boolean(event.is_custom_category || (!event.categoryId && !event.category && (event.custom_category || event.customCategory)));

  const clubLine = isCustomClub
    ? `🏛️ *Organizer:* ${club} _(CUSTOM / UNVERIFIED ENTRY)_`
    : `🏛️ *Organizer:* ${club}`;

  const catLine = isCustomCat
    ? `${emoji} *Category:* ${categoryEscaped} _(CUSTOM / UNLISTED)_`
    : `${emoji} *Category:* ${categoryEscaped}`;

  const headerLines = [
    '🔔 *NEW EVENT PENDING APPROVAL*',
    '────────────────────────────',
    `✨ *${title}* ✨`,
    clubLine,
    catLine,
    `📅 *Date:* ${dateStr}`,
    `⏰ *Time:* ${timeStr}`,
    `📍 *Location:* ${location}`,
  ];

  const recPattern = event.recurrence_pattern || event.recurrencePattern;
  if (event.recurring && recPattern) {
    headerLines.push(`🔄 *Recurrence:* ${safeEscape(recPattern)}`);
  }

  const raw = event.raw_content || event.rawContent || {};
  const caption = (raw.caption || '').trim();
  const structuredText = headerLines.join('\n');

  if (caption) {
    const availableLen = maxLen - structuredText.length - 30;
    if (availableLen > 40) {
      let capEsc = safeEscape(caption);
      if (capEsc.length > availableLen) {
        capEsc = capEsc.slice(0, availableLen).trimEnd() + '...';
      }
      return `${structuredText}\n\n📝 *Original Announcement:*\n_${capEsc}_`;
    }
  }

  return structuredText;
}
