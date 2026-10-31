// lib/auth.js
// Authentication and authorization checks backed by the tgcloud database.

import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { admins, clubOfficers } from '../schema.js';
import { OWNER_ID } from './config.js';
import {
  checkIsOwner,
  checkIsAdmin,
  checkIsVerifiedRep,
  checkCanSubmit,
  checkCanPublishDirectly,
} from './auth_rules.js';

export function isOwner(userId) {
  return checkIsOwner(userId, OWNER_ID);
}

export async function isAdmin(userId) {
  if (isOwner(userId)) return true;
  if (!userId) return false;

  const adminRow = await db.select()
    .from(admins)
    .where(and(eq(admins.telegramId, Number(userId)), eq(admins.isActive, true)))
    .get();

  return Boolean(adminRow);
}

export async function isVerifiedRep(userId, clubId = null) {
  if (isOwner(userId)) return true;
  if (!userId) return false;

  if (clubId !== null && clubId !== undefined) {
    const row = await db.select()
      .from(clubOfficers)
      .where(and(eq(clubOfficers.telegramId, Number(userId)), eq(clubOfficers.clubId, Number(clubId))))
      .get();
    return Boolean(row);
  }

  const row = await db.select()
    .from(clubOfficers)
    .where(eq(clubOfficers.telegramId, Number(userId)))
    .get();
  return Boolean(row);
}

export async function canSubmit(userId) {
  if (isOwner(userId)) return true;
  if (await isAdmin(userId)) return true;
  return await isVerifiedRep(userId);
}

export async function canPublishDirectly(userId) {
  if (isOwner(userId)) return true;
  return await isAdmin(userId);
}
