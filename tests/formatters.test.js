import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeEscape,
  getCategoryEmoji,
  formatEventCard,
  formatSingleEvent,
  formatTodayEvents,
  formatWeekEvents,
  formatCategoryEvents,
  formatChannelPost,
  formatAdminPendingCard,
} from '../tgcloud/lib/formatters.js';
import { parseEventDateTimeInput } from '../tgcloud/lib/time.js';

describe('Formatters and Localization', () => {
  const sampleEvent = {
    id: 1,
    title: 'Robotics & AI Expo 2026',
    club_name: 'AASTU Robotics & AI Society',
    category_name: 'Career/Workshop',
    start_datetime: parseEventDateTimeInput('05/09/2026 17:00'),
    end_datetime: parseEventDateTimeInput('05/09/2026 20:00'),
    location: 'Auditorium Hall',
    recurring: false,
    recurrence_pattern: null,
    raw_content: {
      media_type: 'photo',
      caption: '🤖 Don\'t miss our live drone flight showcase!',
      file_ids: ['sample_photo_id_123'],
      is_forwarded: false,
    },
  };

  it('safely escapes Telegram Markdown V1 reserved characters', () => {
    const raw = 'Special characters: *bold* _italic_ `code` [link] \\backslash';
    const escaped = safeEscape(raw);
    assert.equal(escaped, 'Special characters: \\*bold\\* \\_italic\\_ \\`code\\` \\[link\\] \\\\backslash');
  });

  it('maps category names to category emojis with fallback', () => {
    assert.equal(getCategoryEmoji('Academic'), '🎓');
    assert.equal(getCategoryEmoji('Sports'), '⚽');
    assert.equal(getCategoryEmoji('Career/Workshop'), '💼');
    assert.equal(getCategoryEmoji('Entertainment'), '🎭');
    assert.equal(getCategoryEmoji('Club Social'), '🎉');
    assert.equal(getCategoryEmoji('Religious'), '🕊️');
    assert.equal(getCategoryEmoji('UnknownCategory'), '📌');
    assert.equal(getCategoryEmoji(''), '📌');
  });

  it('formats event card for compact list views', () => {
    const card = formatEventCard(sampleEvent, 1);
    assert.match(card, /1\. \*Robotics & AI Expo 2026\*/);
    assert.match(card, /AASTU Robotics & AI Society/);
    assert.match(card, /Auditorium Hall/);
    assert.match(card, /5:00 PM – 8:00 PM/);
  });

  it('formats single event detailed view', () => {
    const view = formatSingleEvent(sampleEvent);
    assert.match(view, /Robotics & AI Expo 2026/);
    assert.match(view, /AASTU Robotics & AI Society/);
    assert.match(view, /Career\/Workshop/);
    assert.match(view, /Don't miss our live drone flight showcase!/);
  });

  it('flags custom club and category in single event view', () => {
    const customEvent = {
      ...sampleEvent,
      clubId: null,
      custom_club: 'Autonomous Systems Group',
      is_custom_club: true,
      categoryId: null,
      custom_category: 'AI & Drones',
      is_custom_category: true,
    };
    const view = formatSingleEvent(customEvent);
    assert.match(view, /CUSTOM \/ UNVERIFIED ENTRY/);
    assert.match(view, /CUSTOM \/ UNLISTED/);
  });

  it('formats today events empty and populated', () => {
    const emptyRes = formatTodayEvents([], 1);
    assert.equal(emptyRes.totalCount, 0);
    assert.match(emptyRes.text, /Today at AASTU/);
    assert.match(emptyRes.text, /No events scheduled for today/);

    const populatedRes = formatTodayEvents([sampleEvent], 1, 2);
    assert.equal(populatedRes.totalCount, 1);
    assert.equal(populatedRes.totalPages, 1);
    assert.match(populatedRes.text, /Robotics & AI Expo 2026/);
  });

  it('formats week events grouped by day', () => {
    const emptyWeek = formatWeekEvents([]);
    assert.match(emptyWeek, /No events scheduled for this week yet/);

    const event2 = {
      ...sampleEvent,
      id: 2,
      title: 'Football Championship',
      category_name: 'Sports',
      start_datetime: parseEventDateTimeInput('06/09/2026 16:00'),
      end_datetime: parseEventDateTimeInput('06/09/2026 18:00'),
    };

    const weekText = formatWeekEvents([sampleEvent, event2]);
    assert.match(weekText, /This Week at AASTU \(2 Total\)/);
    assert.match(weekText, /Saturday, Sep 05/);
    assert.match(weekText, /Sunday, Sep 06/);
    assert.match(weekText, /Robotics & AI Expo 2026/);
    assert.match(weekText, /Football Championship/);
  });

  it('formats forwarded channel post with untouched original caption and NO extra headers', () => {
    const originalCaption = '🎉 AASTU Hackathon 2026! Bring your laptops to ICT 508 on Saturday at 2pm.';
    const forwardedEvent = {
      ...sampleEvent,
      raw_content: {
        media_type: 'photo',
        is_forwarded: true,
        caption: originalCaption,
        file_ids: ['photo_id'],
      },
    };
    const post = formatChannelPost(forwardedEvent);
    assert.equal(post, originalCaption);
    assert.doesNotMatch(post, /NEW CAMPUS EVENT/);
    assert.doesNotMatch(post, /Organizer:/);
    assert.doesNotMatch(post, /Location:/);
  });

  it('formats manual channel post with full structured summary from all fields', () => {
    const manualEvent = {
      ...sampleEvent,
      raw_content: {
        media_type: 'text',
        is_forwarded: false,
        caption: 'Please bring your student ID and laptop.',
      },
    };
    const post = formatChannelPost(manualEvent);
    assert.match(post, /NEW CAMPUS EVENT/);
    assert.match(post, /Robotics & AI Expo 2026/);
    assert.match(post, /AASTU Robotics & AI Society/);
    assert.match(post, /Career\/Workshop/);
    assert.match(post, /Auditorium Hall/);
    assert.match(post, /Please bring your student ID and laptop\./);
  });

  it('formats admin pending review card with structured fields and caption snippet', () => {
    const card = formatAdminPendingCard(sampleEvent);
    assert.match(card, /NEW EVENT PENDING APPROVAL/);
    assert.match(card, /Robotics & AI Expo 2026/);
    assert.match(card, /AASTU Robotics & AI Society/);
    assert.match(card, /Career\/Workshop/);
    assert.match(card, /Auditorium Hall/);
    assert.match(card, /Don't miss our live drone flight showcase!/);
  });
});
