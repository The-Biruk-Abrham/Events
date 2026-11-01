import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRawContent,
  extractTelegramIdFromMessage,
  processTitleInput,
  processCustomClubInput,
  processCustomCategoryInput,
  processDateTimeInput,
  processLocationInput,
  renderSubmissionPreview,
  SUBMISSION_STATES,
  UNIDENTIFIABLE_FORWARD_ERROR,
} from '../tgcloud/lib/state_machine.js';

describe('State Machine & Submission Flows', () => {
  it('extracts raw content from photo message taking highest resolution', () => {
    const msg = {
      photo: [
        { file_id: 'thumb_id', width: 100 },
        { file_id: 'large_id', width: 800 },
      ],
      caption: '🚀 Hackathon Announcement!',
    };
    const user = { id: 123456, username: 'organizer' };

    const raw = extractRawContent(msg, user);
    assert.equal(raw.media_type, 'photo');
    assert.deepEqual(raw.file_ids, ['large_id']);
    assert.equal(raw.caption, '🚀 Hackathon Announcement!');
    assert.equal(raw.is_forwarded, false);
    assert.equal(raw.media_group_id, null);
    assert.equal(raw.submitter_telegram_id, 123456);
  });

  it('extracts raw content from album photo preserving media_group_id', () => {
    const msg = {
      photo: [
        { file_id: 'thumb_id', width: 100 },
        { file_id: 'best_photo_1', width: 1200 },
      ],
      media_group_id: '139847291847192',
      caption: 'Album First Photo Caption',
    };
    const user = { id: 654321, username: 'club_rep' };

    const raw = extractRawContent(msg, user);
    assert.equal(raw.media_type, 'photo');
    assert.deepEqual(raw.file_ids, ['best_photo_1']);
    assert.equal(raw.media_group_id, '139847291847192');
    assert.equal(raw.caption, 'Album First Photo Caption');
  });

  it('extracts raw content from forwarded channel post', () => {
    const msg = {
      document: { file_id: 'doc_123' },
      caption: 'Official guideline document',
      forward_origin: {
        type: 'channel',
        chat: { title: 'AASTU Official Channel', username: 'aastu_official' },
      },
    };
    const user = { id: 789012, username: 'forwarder' };

    const raw = extractRawContent(msg, user);
    assert.equal(raw.media_type, 'document');
    assert.deepEqual(raw.file_ids, ['doc_123']);
    assert.equal(raw.is_forwarded, true);
    assert.equal(raw.forward_info.chat_title, 'AASTU Official Channel');
  });

  it('extracts target telegram ID from user forward', () => {
    const msg = {
      forward_origin: {
        type: 'user',
        sender_user: { id: 555666777, full_name: 'Abebe Bikila', username: 'abebek' },
      },
    };
    const { id, name, error } = extractTelegramIdFromMessage(msg);
    assert.equal(id, 555666777);
    assert.equal(name, 'Abebe Bikila');
    assert.equal(error, null);
  });

  it('rejects channel or privacy-hidden forwards with clear instructions', () => {
    const channelMsg = {
      forward_origin: { type: 'channel', chat: { title: 'News' } },
    };
    const res1 = extractTelegramIdFromMessage(channelMsg);
    assert.equal(res1.id, null);
    assert.equal(res1.error, UNIDENTIFIABLE_FORWARD_ERROR);

    const hiddenMsg = {
      forward_origin: { type: 'hidden_user' },
    };
    const res2 = extractTelegramIdFromMessage(hiddenMsg);
    assert.equal(res2.id, null);
    assert.equal(res2.error, UNIDENTIFIABLE_FORWARD_ERROR);
  });

  it('extracts numeric ID from direct typed text', () => {
    const msg = { text: '987654321' };
    const { id, error } = extractTelegramIdFromMessage(msg);
    assert.equal(id, 987654321);
    assert.equal(error, null);
  });

  it('rejects invalid non-numeric text for officer ID input', () => {
    const msg = { text: 'not-a-number' };
    const { id, error } = extractTelegramIdFromMessage(msg);
    assert.equal(id, null);
    assert.match(error, /forward a message.*type their numeric Telegram ID/);
  });

  it('auto-fills club when user represents exactly 1 club and advances directly to CATEGORY', () => {
    const verifiedClubs = [{ id: 10, name: 'AASTU Coding Club' }];
    const res = processTitleInput({}, 'Hackathon 2026', verifiedClubs);

    assert.equal(res.nextState, SUBMISSION_STATES.CATEGORY);
    assert.equal(res.draft.title, 'Hackathon 2026');
    assert.equal(res.draft.club, 10);
    assert.equal(res.draft.club_name, 'AASTU Coding Club');
    assert.equal(res.draft.is_custom_club, false);
  });

  it('shows club picker when user represents multiple clubs', () => {
    const verifiedClubs = [
      { id: 10, name: 'AASTU Coding Club' },
      { id: 20, name: 'AASTU AI Society' },
    ];
    const res = processTitleInput({}, 'AI Summit 2026', verifiedClubs);

    assert.equal(res.nextState, SUBMISSION_STATES.CLUB);
    assert.equal(res.draft.title, 'AI Summit 2026');
  });

  it('validates custom club name max 50 characters', () => {
    const shortName = 'A'.repeat(50);
    const resValid = processCustomClubInput({}, shortName);
    assert.equal(resValid.nextState, SUBMISSION_STATES.CATEGORY);
    assert.equal(resValid.draft.custom_club, shortName);

    const longName = 'A'.repeat(51);
    const resInvalid = processCustomClubInput({}, longName);
    assert.match(resInvalid.error, /Name is too long.*51\/50 characters/);
  });

  it('validates custom category name max 50 characters', () => {
    const shortCat = 'B'.repeat(50);
    const resValid = processCustomCategoryInput({}, shortCat);
    assert.equal(resValid.nextState, SUBMISSION_STATES.DATETIME);
    assert.equal(resValid.draft.custom_category, shortCat);

    const longCat = 'B'.repeat(51);
    const resInvalid = processCustomCategoryInput({}, longCat);
    assert.match(resInvalid.error, /Category name too long.*51\/50 characters/);
  });

  it('validates date & time and advances to LOCATION', () => {
    const resValid = processDateTimeInput({}, '15/09/2026 14:30');
    assert.equal(resValid.nextState, SUBMISSION_STATES.LOCATION);
    assert.equal(typeof resValid.draft.start_datetime, 'number');

    const resInvalid = processDateTimeInput({}, 'invalid-date');
    assert.match(resInvalid.error, /Invalid format/);
  });

  it('handles edit single field from preview returning directly to CONFIRM', () => {
    const initialDraft = {
      title: 'Initial Title',
      club_name: 'Tech Club',
      location: 'Hall A',
      editing_from_preview: true,
    };

    const res = processTitleInput(initialDraft, 'Updated Title', []);
    assert.equal(res.nextState, SUBMISSION_STATES.CONFIRM);
    assert.equal(res.draft.title, 'Updated Title');
    assert.equal(res.draft.editing_from_preview, undefined);
  });

  it('renders submission preview with direct publish note for admin/owner', () => {
    const draft = {
      title: 'Grand Conference',
      club_name: 'AASTU Tech Club',
      category_name: 'Academic',
      start_datetime: 1788555600,
      location: 'Hall 508',
      raw_content: { media_type: 'photo', caption: 'Official announcement' },
    };

    const repPreview = renderSubmissionPreview(draft, false);
    assert.match(repPreview, /SUBMISSION PREVIEW/);
    assert.match(repPreview, /Check the details above/);
    assert.doesNotMatch(repPreview, /This will be published immediately/);

    const adminPreview = renderSubmissionPreview(draft, true);
    assert.match(adminPreview, /⚡ \*This will be published immediately to the channel/);
  });
});
