// lib/services/clubs.js
// Club data service. Enforces permissions on mutations.

import { db } from 'sdk';
import { eq, asc } from 'sdk/db';
import { clubs, clubOfficers } from '../../schema.js';
import { isOwner } from '../auth.js';
import { nowSec } from '../time.js';

export async function getClubs() {
  const allClubs = await db.select().from(clubs).orderBy(asc(clubs.name)).all();
  const allOfficers = await db.select().from(clubOfficers).all();

  const countMap = new Map();
  for (const off of allOfficers) {
    countMap.set(off.clubId, (countMap.get(off.clubId) || 0) + 1);
  }

  return allClubs.map((c) => ({
    ...c,
    officersCount: countMap.get(c.id) || 0,
  }));
}

export async function getClubById(clubId) {
  if (!clubId) return null;
  return await db.select().from(clubs).where(eq(clubs.id, Number(clubId))).get();
}

export async function createClub(actorId, { name, categoryType = '', contactInfo = '' }) {
  if (!isOwner(actorId)) {
    throw new Error('Unauthorized: Only the bot owner is permitted to register new clubs.');
  }

  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new Error('Club name cannot be blank.');
  }
  if (cleanName.length > 200) {
    throw new Error('Club name is too long (maximum 200 characters).');
  }

  const now = nowSec();
  const created = await db.insert(clubs)
    .values({
      name: cleanName,
      categoryType: (categoryType || '').trim(),
      contactInfo: (contactInfo || '').trim(),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .run();

  return created[0];
}
