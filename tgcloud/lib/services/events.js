// lib/services/events.js
// Event lifecycle and queries service.
// Enforces permissions on mutations and uses atomic updates for race-condition safety.

import { db } from 'sdk';
import { eq, and, asc, gte, lt, sql } from 'sdk/db';
import { events, categories, clubs } from '../../schema.js';
import { canSubmit, canPublishDirectly } from '../auth.js';
import { getTodayRange, getWeekRange, nowSec } from '../time.js';
import { MAX_CUSTOM_NAME_LENGTH } from '../config.js';

export async function getCategories() {
  return await db.select().from(categories).orderBy(asc(categories.name)).all();
}

export async function getCategoryById(categoryId) {
  if (!categoryId) return null;
  return await db.select().from(categories).where(eq(categories.id, Number(categoryId))).get();
}

/**
 * Hydrates an event row with club_name and category_name.
 */
async function hydrateEvent(ev) {
  if (!ev) return null;
  let clubName = ev.customClub || '';
  if (ev.clubId) {
    const c = await db.select().from(clubs).where(eq(clubs.id, ev.clubId)).get();
    if (c) clubName = c.name;
  }

  let categoryName = ev.customCategory || '';
  if (ev.categoryId) {
    const cat = await db.select().from(categories).where(eq(categories.id, ev.categoryId)).get();
    if (cat) categoryName = cat.name;
  }

  return {
    ...ev,
    club_name: clubName || 'University Club',
    clubName: clubName || 'University Club',
    category_name: categoryName || 'General',
    categoryName: categoryName || 'General',
  };
}

/**
 * Queries events. Public views strictly filter by status='approved'.
 */
export async function getEvents({
  status = 'approved',
  range = null,
  categoryId = null,
  categoryName = null,
} = {}) {
  const allEvents = await db.select().from(events).orderBy(asc(events.startDatetime)).all();
  const allClubs = await db.select().from(clubs).all();
  const allCategories = await db.select().from(categories).all();

  const clubMap = new Map(allClubs.map((c) => [c.id, c.name]));
  const catMap = new Map(allCategories.map((c) => [c.id, c.name]));

  let filtered = allEvents.filter((ev) => {
    if (status && ev.status !== status) return false;
    return true;
  });

  if (range === 'today') {
    const { start, end } = getTodayRange();
    filtered = filtered.filter((ev) => ev.startDatetime >= start && ev.startDatetime < end);
  } else if (range === 'week') {
    const { start, end } = getWeekRange();
    filtered = filtered.filter((ev) => ev.startDatetime >= start && ev.startDatetime < end);
  }

  if (categoryId) {
    filtered = filtered.filter((ev) => Number(ev.categoryId) === Number(categoryId));
  } else if (categoryName) {
    const target = String(categoryName).toLowerCase().trim();
    filtered = filtered.filter((ev) => {
      const cName = (ev.categoryId ? catMap.get(ev.categoryId) : ev.customCategory) || '';
      return cName.toLowerCase().trim() === target;
    });
  }

  return filtered.map((ev) => {
    const cName = (ev.clubId ? clubMap.get(ev.clubId) : ev.customClub) || 'University Club';
    const catName = (ev.categoryId ? catMap.get(ev.categoryId) : ev.customCategory) || 'General';
    return {
      ...ev,
      club_name: cName,
      clubName: cName,
      category_name: catName,
      categoryName: catName,
    };
  });
}

export async function getEventById(eventId) {
  if (!eventId) return null;
  const ev = await db.select().from(events).where(eq(events.id, Number(eventId))).get();
  return await hydrateEvent(ev);
}

/**
 * Creates an event submission.
 * Enforces permissions: only verified officers, admins, or owner can submit.
 * Automatically marks as approved if submitted by admin/owner (direct publish).
 */
export async function createEvent(actorId, {
  title,
  clubId = null,
  customClub = '',
  categoryId = null,
  customCategory = '',
  startDatetime,
  endDatetime = null,
  location = '',
  rawContent = {},
  recurring = false,
  recurrencePattern = null,
}) {
  const allowed = await canSubmit(actorId);
  if (!allowed) {
    throw new Error('Unauthorized: You are not registered as a verified club representative or administrator.');
  }

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) {
    throw new Error('Event title is required.');
  }

  if (!startDatetime || typeof startDatetime !== 'number') {
    throw new Error('Valid startDatetime (unix timestamp integer) is required.');
  }

  if (customClub && customClub.length > MAX_CUSTOM_NAME_LENGTH) {
    throw new Error(`Custom club name exceeds ${MAX_CUSTOM_NAME_LENGTH} characters.`);
  }

  if (customCategory && customCategory.length > MAX_CUSTOM_NAME_LENGTH) {
    throw new Error(`Custom category name exceeds ${MAX_CUSTOM_NAME_LENGTH} characters.`);
  }

  const now = nowSec();
  const directPublish = await canPublishDirectly(actorId);

  const status = directPublish ? 'approved' : 'pending';
  const approvedAt = directPublish ? now : null;
  const approvedBy = directPublish ? String(actorId) : null;

  const insertValues = {
    title: cleanTitle,
    clubId: clubId ? Number(clubId) : null,
    customClub: (customClub || '').trim(),
    categoryId: categoryId ? Number(categoryId) : null,
    customCategory: (customCategory || '').trim(),
    startDatetime,
    endDatetime: endDatetime ? Number(endDatetime) : null,
    location: (location || '').trim(),
    rawContent: rawContent || {},
    status,
    recurring: Boolean(recurring),
    recurrencePattern: recurrencePattern ? String(recurrencePattern).trim() : null,
    submittedAt: now,
    approvedAt,
    approvedBy,
  };

  const created = await db.insert(events).values(insertValues).returning().run();
  return await hydrateEvent(created[0]);
}

/**
 * Approves a pending event atomically.
 * Prevents double-tapped approvals from publishing or updating twice.
 */
export async function approveEvent(actorId, eventId, channelMessageId = null) {
  const allowed = await canPublishDirectly(actorId);
  if (!allowed) {
    throw new Error('Unauthorized: Only administrators are authorized to approve events.');
  }

  const numericId = Number(eventId);
  const now = nowSec();

  // Atomic update: only update if current status is 'pending'
  const updateData = {
    status: 'approved',
    approvedAt: now,
    approvedBy: String(actorId),
  };
  if (channelMessageId) {
    updateData.channelMessageId = Number(channelMessageId);
  }

  const result = await db.update(events)
    .set(updateData)
    .where(and(eq(events.id, numericId), eq(events.status, 'pending')))
    .run();

  if (result.rowsAffected === 0) {
    const current = await getEventById(numericId);
    if (!current) {
      throw new Error(`Event #${numericId} not found.`);
    }
    if (current.status === 'approved') {
      const err = new Error('ALREADY_APPROVED');
      err.code = 'ALREADY_APPROVED';
      err.event = current;
      throw err;
    }
    if (current.status === 'rejected') {
      const err = new Error('ALREADY_REJECTED');
      err.code = 'ALREADY_REJECTED';
      err.event = current;
      throw err;
    }
    throw new Error(`Event cannot be approved from current status: ${current.status}`);
  }

  return await getEventById(numericId);
}

/**
 * Rejects a pending event atomically.
 */
export async function rejectEvent(actorId, eventId) {
  const allowed = await canPublishDirectly(actorId);
  if (!allowed) {
    throw new Error('Unauthorized: Only administrators are authorized to reject events.');
  }

  const numericId = Number(eventId);
  const result = await db.update(events)
    .set({
      status: 'rejected',
      approvedBy: String(actorId),
    })
    .where(and(eq(events.id, numericId), eq(events.status, 'pending')))
    .run();

  if (result.rowsAffected === 0) {
    const current = await getEventById(numericId);
    if (!current) throw new Error(`Event #${numericId} not found.`);
    if (current.status === 'approved') {
      const err = new Error('ALREADY_APPROVED');
      err.code = 'ALREADY_APPROVED';
      err.event = current;
      throw err;
    }
    if (current.status === 'rejected') {
      const err = new Error('ALREADY_REJECTED');
      err.code = 'ALREADY_REJECTED';
      err.event = current;
      throw err;
    }
    throw new Error(`Event cannot be rejected from status: ${current.status}`);
  }

  return await getEventById(numericId);
}

/**
 * Updates structured fields of an event (used by admin in-place edit).
 */
export async function updateEventFields(actorId, eventId, fields = {}) {
  const allowed = await canPublishDirectly(actorId);
  if (!allowed) {
    throw new Error('Unauthorized: Only administrators can edit events.');
  }

  const numericId = Number(eventId);
  const allowedFields = {};

  if (fields.title !== undefined) allowedFields.title = String(fields.title).trim();
  if (fields.location !== undefined) allowedFields.location = String(fields.location).trim();
  if (fields.startDatetime !== undefined) allowedFields.startDatetime = Number(fields.startDatetime);
  if (fields.endDatetime !== undefined) allowedFields.endDatetime = fields.endDatetime ? Number(fields.endDatetime) : null;
  if (fields.clubId !== undefined) allowedFields.clubId = fields.clubId ? Number(fields.clubId) : null;
  if (fields.customClub !== undefined) allowedFields.customClub = String(fields.customClub).trim();
  if (fields.categoryId !== undefined) allowedFields.categoryId = fields.categoryId ? Number(fields.categoryId) : null;
  if (fields.customCategory !== undefined) allowedFields.customCategory = String(fields.customCategory).trim();
  if (fields.rawContent !== undefined) allowedFields.rawContent = fields.rawContent;
  if (fields.channelMessageId !== undefined) allowedFields.channelMessageId = fields.channelMessageId ? Number(fields.channelMessageId) : null;

  await db.update(events)
    .set(allowedFields)
    .where(eq(events.id, numericId))
    .run();

  return await getEventById(numericId);
}

/**
 * Updates channel message ID and optional extra message ID.
 */
export async function setChannelMessageIds(actorId, eventId, channelMessageId, extraMessageId = null) {
  const allowed = await canPublishDirectly(actorId);
  if (!allowed) {
    throw new Error('Unauthorized: Only administrators can update channel message IDs.');
  }

  const ev = await getEventById(eventId);
  if (!ev) return null;

  const raw = { ...(ev.rawContent || ev.raw_content || {}) };
  if (extraMessageId) {
    raw.channel_extra_message_id = extraMessageId;
  }

  await db.update(events)
    .set({
      channelMessageId: Number(channelMessageId),
      rawContent: raw,
    })
    .where(eq(events.id, Number(eventId)))
    .run();

  return await getEventById(eventId);
}
