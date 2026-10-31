import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkIsOwner,
  checkIsAdmin,
  checkIsVerifiedRep,
  checkCanSubmit,
  checkCanPublishDirectly,
} from '../tgcloud/lib/auth_rules.js';

describe('Auth Rules and Roles Matrix', () => {
  const OWNER_ID = 999000;
  const ADMIN_ROWS = [
    { telegramId: 100000001, isActive: true },
    { telegramId: 100000002, isActive: true },
    { telegramId: 100000003, isActive: false }, // Inactive
  ];
  const OFFICER_ROWS = [
    { clubId: 1, telegramId: 111222 },
    { clubId: 2, telegramId: 333444 },
  ];

  it('verifies owner correctly', () => {
    assert.equal(checkIsOwner(OWNER_ID, OWNER_ID), true);
    assert.equal(checkIsOwner(111222, OWNER_ID), false);
    assert.equal(checkIsOwner(OWNER_ID, 0), false); // Unset placeholder
  });

  it('verifies admin and permission inheritance for owner', () => {
    assert.equal(checkIsAdmin(OWNER_ID, OWNER_ID, ADMIN_ROWS), true);
    assert.equal(checkIsAdmin(100000001, OWNER_ID, ADMIN_ROWS), true);
    assert.equal(checkIsAdmin(100000003, OWNER_ID, ADMIN_ROWS), false); // Inactive admin rejected
    assert.equal(checkIsAdmin(555555, OWNER_ID, ADMIN_ROWS), false);
  });

  it('verifies club representative membership', () => {
    // Owner is considered rep for all clubs
    assert.equal(checkIsVerifiedRep(OWNER_ID, OWNER_ID, OFFICER_ROWS, 1), true);
    assert.equal(checkIsVerifiedRep(OWNER_ID, OWNER_ID, OFFICER_ROWS, 99), true);

    // Verified officer for club 1
    assert.equal(checkIsVerifiedRep(111222, OWNER_ID, OFFICER_ROWS, 1), true);
    // Not officer for club 2
    assert.equal(checkIsVerifiedRep(111222, OWNER_ID, OFFICER_ROWS, 2), false);
    // Any club check
    assert.equal(checkIsVerifiedRep(111222, OWNER_ID, OFFICER_ROWS), true);
    assert.equal(checkIsVerifiedRep(999999, OWNER_ID, OFFICER_ROWS), false);
  });

  it('enforces canSubmit capability', () => {
    assert.equal(checkCanSubmit(OWNER_ID, OWNER_ID, ADMIN_ROWS, OFFICER_ROWS), true);
    assert.equal(checkCanSubmit(100000001, OWNER_ID, ADMIN_ROWS, OFFICER_ROWS), true);
    assert.equal(checkCanSubmit(111222, OWNER_ID, ADMIN_ROWS, OFFICER_ROWS), true);
    assert.equal(checkCanSubmit(888888, OWNER_ID, ADMIN_ROWS, OFFICER_ROWS), false); // Regular student
  });

  it('enforces canPublishDirectly capability', () => {
    assert.equal(checkCanPublishDirectly(OWNER_ID, OWNER_ID, ADMIN_ROWS), true);
    assert.equal(checkCanPublishDirectly(100000001, OWNER_ID, ADMIN_ROWS), true);
    assert.equal(checkCanPublishDirectly(111222, OWNER_ID, ADMIN_ROWS), false); // Reps require admin approval
    assert.equal(checkCanPublishDirectly(888888, OWNER_ID, ADMIN_ROWS), false);
  });
});
