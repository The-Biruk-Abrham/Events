import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isConfigured } from '../tgcloud/lib/config.js';
import { checkIsOwner } from '../tgcloud/lib/auth_rules.js';

describe('Config Safety and Placeholder Detection', () => {
  it('correctly identifies unset or zero placeholders as not configured', () => {
    assert.equal(isConfigured(0), false);
    assert.equal(isConfigured('0'), false);
    assert.equal(isConfigured(''), false);
    assert.equal(isConfigured(null), false);
    assert.equal(isConfigured(undefined), false);
    assert.equal(isConfigured(false), false);
  });

  it('correctly identifies string placeholders containing placeholder keywords', () => {
    assert.equal(isConfigured('@channel_placeholder'), false);
    assert.equal(isConfigured('YOUR_ID_PLACEHOLDER'), false);
  });

  it('correctly identifies valid configured IDs', () => {
    assert.equal(isConfigured(123456789), true);
    assert.equal(isConfigured(-1001234567890), true);
    assert.equal(isConfigured('@aastu_events'), true);
    assert.equal(isConfigured('@my_events_channel'), true);
  });

  it('ensures checkIsOwner returns false when ownerId is 0 or placeholder without crashing', () => {
    assert.equal(checkIsOwner(123456, 0), false);
    assert.equal(checkIsOwner(123456, null), false);
    assert.equal(checkIsOwner(0, 0), false);
  });
});
