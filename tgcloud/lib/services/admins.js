// lib/services/admins.js
// Admin management service. Enforces owner authorization on mutations.

import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { admins } from '../../schema.js';
import { isOwner } from '../auth.js';
import { nowSec } from '../time.js';

export async function getActiveAdmins() {
  return await db.select()
    .from(admins)
    .where(eq(admins.isActive, true))
    .all();
}

export async function addAdmin(actorId, telegramId, name = '', permissionLevel = 'moderator') {
  if (!isOwner(actorId)) {
    throw new Error('Unauthorized: Only the bot owner can configure admins.');
  }

  const tid = Number(telegramId);
  const existing = await db.select().from(admins).where(eq(admins.telegramId, tid)).get();
  const now = nowSec();

  if (existing) {
    await db.update(admins)
      .set({
        name: name || existing.name,
        permissionLevel,
        isActive: true,
      })
      .where(eq(admins.telegramId, tid))
      .run();
    return { ...existing, isActive: true, permissionLevel };
  }

  const created = await db.insert(admins)
    .values({
      telegramId: tid,
      name,
      permissionLevel,
      isActive: true,
      createdAt: now,
    })
    .returning()
    .run();

  return created[0];
}
