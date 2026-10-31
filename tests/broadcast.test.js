import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBroadcastPayload } from '../tgcloud/lib/broadcast.js';

describe('Broadcast Caption Splitting and Telegram Limits', () => {
  const baseEvent = {
    title: 'Testing Limits Event',
    club_name: 'AASTU Tech Club',
    category_name: 'Technology',
    start_datetime: 1788555600,
    location: 'ICT Center',
  };

  it('handles 900-character media caption within single message', () => {
    const caption900 = 'A'.repeat(900);
    const event = {
      ...baseEvent,
      raw_content: {
        media_type: 'photo',
        file_ids: ['photo_id_123'],
        is_forwarded: true,
        caption: caption900,
      },
    };

    const payload = prepareBroadcastPayload(event);
    assert.equal(payload.isMedia, true);
    assert.equal(payload.mediaCaption, caption900);
    assert.equal(payload.followUpText, null);
  });

  it('handles exact 1024-character media caption within single message', () => {
    const caption1024 = 'B'.repeat(1024);
    const event = {
      ...baseEvent,
      raw_content: {
        media_type: 'photo',
        file_ids: ['photo_id_123'],
        is_forwarded: true,
        caption: caption1024,
      },
    };

    const payload = prepareBroadcastPayload(event);
    assert.equal(payload.isMedia, true);
    assert.equal(payload.mediaCaption.length, 1024);
    assert.equal(payload.followUpText, null);
  });

  it('handles 1025-character media caption by preparing follow-up reply message', () => {
    const caption1025 = 'C'.repeat(1025);
    const event = {
      ...baseEvent,
      raw_content: {
        media_type: 'photo',
        file_ids: ['photo_id_123'],
        is_forwarded: true,
        caption: caption1025,
      },
    };

    const payload = prepareBroadcastPayload(event);
    assert.equal(payload.isMedia, true);
    assert.equal(payload.mediaCaption.length <= 1024, true);
    assert.equal(payload.followUpText, caption1025);
  });

  it('handles 4100-character text message by splitting into 4096 and remainder follow-up', () => {
    const text4100 = 'D'.repeat(4100);
    const event = {
      ...baseEvent,
      raw_content: {
        media_type: 'text',
        file_ids: [],
        is_forwarded: true,
        caption: text4100,
      },
    };

    const payload = prepareBroadcastPayload(event);
    assert.equal(payload.isMedia, false);
    assert.equal(payload.mainText.length, 4096);
    assert.equal(payload.followUpText.length, 4);
    assert.equal(payload.mainText + payload.followUpText, text4100);
  });
});
