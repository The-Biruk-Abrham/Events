// lib/services/officers.js
// Club officer management service. Enforces owner authorization on mutations.

import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { clubOfficers, clubs } from '../../schema.js';
import { isOwner } from '../auth.js';
import { nowSec } from '../time.js';
import { getClubById, getClubs } from './clubs.js';

export async function getOfficersForClub(clubId) {
  if (!clubId) return [];
  const rows = await db.select()
    .from(clubOfficers)
    .where(eq(clubOfficers.clubId, Number(clubId)))
    .all();
  return rows.map((r) => r.telegramId);
}

export async function getClubsForOfficer(telegramId) {
  if (!telegramId) return [];

  // Owner represents all clubs
  if (isOwner(telegramId)) {
    return await getClubs();
  }

  const officerRows = await db.select()
    .from(clubOfficers)
    .where(eq(clubOfficers.telegramId, Number(telegramId)))
    .all();

  if (officerRows.length === 0) {
    return [];
  }

  const clubIds = new Set(officerRows.map((r) => r.clubId));
  const allClubs = await getClubs();
  return allClubs.filter((c) => clubIds.has(c.id));
}

export async function addOfficer(actorId, clubId, officerTelegramId) {
  if (!isOwner(actorId)) {
    throw new Error('Unauthorized: Only the bot owner is permitted to add club representatives.');
  }

  const club = await getClubById(clubId);
  if (!club) {
    throw new Error(`Club #${clubId} does not exist.`);
  }

  const numericOfficerId = Number(officerTelegramId);
  if (!numericOfficerId || isNaN(numericOfficerId)) {
    throw new Error('Invalid officer Telegram ID.');
  }

  const existing = await db.select()
    .from(clubOfficers)
    .where(and(
      eq(clubOfficers.clubId, Number(clubId)),
      eq(clubOfficers.telegramId, numericOfficerId)
    ))
    .get();

  if (!existing) {
    await db.insert(clubOfficers)
      .values({
        clubId: Number(clubId),
        telegramId: numericOfficerId,
        createdAt: nowSec(),
      })
      .run();
  }

  const updatedOfficers = await getOfficersForClub(clubId);
  return {
    club,
    officers: updatedOfficers,
  };
}

export async function removeOfficer(actorId, clubId, officerTelegramId) {
  if (!isOwner(actorId)) {
    throw new Error('Unauthorized: Only the bot owner is permitted to remove club representatives.');
  }

  const club = await getClubById(clubId);
  if (!club) {
    throw new Error(`Club #${clubId} does not exist.`);
  }

  const numericOfficerId = Number(officerTelegramId);
  await db.delete(clubOfficers)
    .where(and(
      eq(clubOfficers.clubId, Number(clubId)),
      eq(clubOfficers.telegramId, numericOfficerId)
    ))
    .run();

  const updatedOfficers = await getOfficersForClub(clubId);
  return {
    club,
    officers: updatedOfficers,
  };
}
