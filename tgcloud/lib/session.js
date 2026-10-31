// lib/session.js
// Database-backed user session management for conversational state machines.
// Sessions automatically expire after 1 hour of inactivity.

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';
import { nowSec } from './time.js';
import { SESSION_TTL_SECONDS } from './config.js';

export async function getSession(userId) {
  if (!userId) return null;
  const numericId = Number(userId);

  const row = await db.select()
    .from(sessions)
    .where(eq(sessions.userId, numericId))
    .get();

  if (!row) return null;

  const now = nowSec();
  if (now - row.updatedAt > SESSION_TTL_SECONDS) {
    // Session expired: clean up
    await db.delete(sessions).where(eq(sessions.userId, numericId)).run();
    return null;
  }

  return row;
}

export async function setSession(userId, state, data = {}) {
  if (!userId) return;
  const numericId = Number(userId);
  const now = nowSec();

  await db.insert(sessions)
    .values({
      userId: numericId,
      state,
      data: data || {},
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sessions.userId,
      set: {
        state,
        data: data || {},
        updatedAt: now,
      },
    })
    .run();
}

export async function clearSession(userId) {
  if (!userId) return;
  const numericId = Number(userId);
  await db.delete(sessions).where(eq(sessions.userId, numericId)).run();
}
