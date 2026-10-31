// lib/auth_rules.js
// Pure permission checking rules (SDK-free, unit-testable).

export function checkIsOwner(userId, ownerId) {
  if (!ownerId || !userId) return false;
  return Number(userId) === Number(ownerId) && Number(ownerId) !== 0;
}

export function checkIsAdmin(userId, ownerId, adminRows = []) {
  if (checkIsOwner(userId, ownerId)) return true;
  if (!userId) return false;
  return adminRows.some((a) => Number(a.telegramId ?? a.telegram_id) === Number(userId) && Boolean(a.isActive ?? a.is_active));
}

export function checkIsVerifiedRep(userId, ownerId, officerRows = [], clubId = null) {
  if (checkIsOwner(userId, ownerId)) return true;
  if (!userId) return false;
  if (clubId !== null && clubId !== undefined) {
    return officerRows.some((o) =>
      Number(o.telegramId ?? o.telegram_id) === Number(userId) &&
      Number(o.clubId ?? o.club_id) === Number(clubId)
    );
  }
  return officerRows.some((o) => Number(o.telegramId ?? o.telegram_id) === Number(userId));
}

export function checkCanSubmit(userId, ownerId, adminRows = [], officerRows = []) {
  return (
    checkIsOwner(userId, ownerId) ||
    checkIsAdmin(userId, ownerId, adminRows) ||
    checkIsVerifiedRep(userId, ownerId, officerRows)
  );
}

export function checkCanPublishDirectly(userId, ownerId, adminRows = []) {
  return checkIsOwner(userId, ownerId) || checkIsAdmin(userId, ownerId, adminRows);
}
