// lib/state_machine.js
// Pure state machine definitions, transitions, payload extraction, and validation rules.
// Free of SDK dependencies for comprehensive unit testing.

import { safeEscape } from './formatters.js';
import { formatPreviewDateTime, parseEventDateTimeInput } from './time.js';
import { MAX_CUSTOM_NAME_LENGTH } from './config.js';

export const SUBMISSION_STATES = {
  CONTENT: 'sub:content',
  TITLE: 'sub:title',
  CLUB: 'sub:club',
  CUSTOM_CLUB: 'sub:custom_club',
  CATEGORY: 'sub:category',
  CUSTOM_CATEGORY: 'sub:custom_category',
  DATETIME: 'sub:datetime',
  LOCATION: 'sub:location',
  CONFIRM: 'sub:confirm',
  EDIT_FIELD: 'sub:edit_field',
};

export const OWNER_STATES = {
  ADD_OFFICER_INPUT: 'own:add_officer',
  RM_OFFICER_INPUT: 'own:rm_officer',
  CREATE_CLUB_NAME: 'own:club_name',
  CREATE_CLUB_GENRE: 'own:club_genre',
};

export const ADMIN_STATES = {
  EDIT_INPUT: 'adm:edit_input',
};

export const UNIDENTIFIABLE_FORWARD_ERROR =
  "⚠️ This forward doesn't include the sender's account info (it may be from a channel, " +
  "or the sender has forward privacy on). Please ask them to send you a direct message " +
  "you can forward instead, or type their numeric Telegram ID manually.";

/**
 * Extracts raw content from incoming message payload.
 */
export function extractRawContent(message, user) {
  if (!message) {
    return {
      media_type: 'text',
      file_ids: [],
      caption: '',
      is_forwarded: false,
      submitter_telegram_id: user?.id || null,
      submitter_username: user?.username || null,
      forward_info: {},
    };
  }

  let mediaType = 'text';
  let fileIds = [];
  let caption = '';

  if (message.photo && message.photo.length > 0) {
    mediaType = 'photo';
    // Telegram sends photos sorted by size; last is highest resolution
    fileIds = [message.photo[message.photo.length - 1].file_id];
    caption = message.caption || '';
  } else if (message.video) {
    mediaType = 'video';
    fileIds = [message.video.file_id];
    caption = message.caption || '';
  } else if (message.animation) {
    mediaType = 'animation';
    fileIds = [message.animation.file_id];
    caption = message.caption || '';
  } else if (message.document) {
    mediaType = 'document';
    fileIds = [message.document.file_id];
    caption = message.caption || '';
  } else if (message.audio) {
    mediaType = 'audio';
    fileIds = [message.audio.file_id];
    caption = message.caption || message.audio.title || '';
  } else if (message.voice) {
    mediaType = 'voice';
    fileIds = [message.voice.file_id];
    caption = message.caption || '';
  } else if (message.poll) {
    mediaType = 'poll';
    caption = `Poll: ${message.poll.question}`;
  } else if (message.text) {
    mediaType = 'text';
    caption = message.text;
  } else if (message.caption) {
    mediaType = 'media';
    caption = message.caption;
  }

  let isForwarded = false;
  const forwardInfo = {};

  if (message.forward_origin) {
    isForwarded = true;
    const origin = message.forward_origin;
    forwardInfo.origin_type = origin.type;
    if (origin.chat) {
      forwardInfo.chat_title = origin.chat.title;
      forwardInfo.chat_username = origin.chat.username;
    } else if (origin.sender_user) {
      forwardInfo.sender_name = origin.sender_user.full_name || origin.sender_user.first_name;
    }
  } else if (message.forward_from_chat) {
    isForwarded = true;
    forwardInfo.chat_title = message.forward_from_chat.title;
    forwardInfo.chat_username = message.forward_from_chat.username;
  } else if (message.forward_date || message.forward_from) {
    isForwarded = true;
  }

  return {
    media_type: mediaType,
    file_ids: fileIds,
    caption: caption.trim(),
    is_forwarded: isForwarded,
    submitter_telegram_id: user?.id ? Number(user.id) : null,
    submitter_username: user?.username ? String(user.username) : null,
    forward_info: forwardInfo,
  };
}

/**
 * Extracts a target Telegram ID from a message (typed numeric ID or forwarded message).
 * Returns { id, name, error }
 */
export function extractTelegramIdFromMessage(message) {
  if (!message) {
    return { id: null, name: null, error: 'No message received.' };
  }

  const isForward = Boolean(
    message.forward_origin ||
    message.forward_from ||
    message.forward_from_chat ||
    message.forward_sender_name ||
    message.forward_date
  );

  if (isForward) {
    if (message.forward_origin) {
      const origin = message.forward_origin;
      if (origin.type === 'user' && origin.sender_user) {
        const u = origin.sender_user;
        const display = u.full_name || (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : (u.username ? `@${u.username}` : String(u.id)));
        return { id: u.id, name: display, error: null };
      }
      return { id: null, name: null, error: UNIDENTIFIABLE_FORWARD_ERROR };
    }

    if (message.forward_from) {
      const u = message.forward_from;
      const display = u.full_name || (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : (u.username ? `@${u.username}` : String(u.id)));
      return { id: u.id, name: display, error: null };
    }

    return { id: null, name: null, error: UNIDENTIFIABLE_FORWARD_ERROR };
  }

  const text = (message.text || '').trim();
  if (/^\d+$/.test(text)) {
    return { id: parseInt(text, 10), name: `ID \`${text}\``, error: null };
  }

  return {
    id: null,
    name: null,
    error: '❌ Please either *forward a message* from the representative, or type their numeric Telegram ID (e.g. `123456789`).',
  };
}

/**
 * Builds full structured submission preview text.
 */
export function renderSubmissionPreview(sub, isDirectPublish = false) {
  const titleEsc = safeEscape(sub.title || 'Untitled');
  let clubEsc = safeEscape(sub.club_name || sub.clubName || 'Not Selected');
  if (sub.is_custom_club || sub.isCustomClub) {
    clubEsc += ' _(Custom / Unverified)_';
  }

  let catEsc = safeEscape(sub.category_name || sub.categoryName || 'Not Selected');
  if (sub.is_custom_category || sub.isCustomCategory) {
    catEsc += ' _(Custom / Unlisted)_';
  }

  const dtDisplay = sub.start_datetime ? formatPreviewDateTime(sub.start_datetime) : 'Not Set';
  const locationEsc = safeEscape(sub.location || 'Not Set');

  const raw = sub.raw_content || sub.rawContent || {};
  const mediaType = (raw.media_type || raw.mediaType || 'None');
  const mediaDisplay = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

  const lines = [
    '🔍 *SUBMISSION PREVIEW*',
    '────────────────────────────',
    `📌 *Title:* ${titleEsc}`,
    `🏛️ *Host Club:* ${clubEsc}`,
    `🏷️ *Category:* ${catEsc}`,
    `📅 *Date & Time:* ${safeEscape(dtDisplay)}`,
    `📍 *Venue:* ${locationEsc}`,
    `📷 *Media Attached:* ${mediaDisplay}`,
  ];

  const caption = (raw.caption || '').trim();
  if (caption) {
    const cleanCap = caption.length > 140 ? caption.slice(0, 140) + '...' : caption;
    lines.push(`📝 *Original Text:* _${safeEscape(cleanCap)}_`);
  }

  if (isDirectPublish || sub.is_direct_publish) {
    lines.push('\n⚡ *This will be published immediately to the channel (you are an admin/owner).*');
  } else {
    lines.push('\n_Check the details above. Tap any button below to edit a field, or Confirm to submit:_');
  }

  return lines.join('\n');
}

/**
 * State transition for Title received.
 * Returns { nextState, error, autoSelectedClub }
 */
export function processTitleInput(draft, titleText, verifiedClubs = []) {
  const cleanTitle = (titleText || '').trim();
  if (!cleanTitle) {
    return { error: 'Please enter a valid title:' };
  }

  const updatedDraft = { ...draft, title: cleanTitle };

  if (updatedDraft.editing_from_preview) {
    delete updatedDraft.editing_from_preview;
    return {
      nextState: SUBMISSION_STATES.CONFIRM,
      draft: updatedDraft,
    };
  }

  // Check verified clubs count
  if (verifiedClubs.length === 1) {
    const singleClub = verifiedClubs[0];
    updatedDraft.club = singleClub.id;
    updatedDraft.club_name = singleClub.name;
    updatedDraft.is_custom_club = false;
    return {
      nextState: SUBMISSION_STATES.CATEGORY,
      draft: updatedDraft,
      autoSelectedClub: singleClub,
    };
  }

  return {
    nextState: SUBMISSION_STATES.CLUB,
    draft: updatedDraft,
  };
}

/**
 * State transition for Custom Club input.
 */
export function processCustomClubInput(draft, clubNameText) {
  const clean = (clubNameText || '').trim();
  if (!clean) {
    return { error: 'Please type a valid club or organization name:' };
  }

  if (clean.length > MAX_CUSTOM_NAME_LENGTH) {
    return {
      error: `❌ *Name is too long* (${clean.length}/${MAX_CUSTOM_NAME_LENGTH} characters).\nPlease keep custom club names under ${MAX_CUSTOM_NAME_LENGTH} characters:\n\nType your club name again:`,
    };
  }

  const updatedDraft = {
    ...draft,
    club: null,
    custom_club: clean,
    club_name: clean,
    is_custom_club: true,
  };

  if (updatedDraft.editing_from_preview) {
    delete updatedDraft.editing_from_preview;
    return { nextState: SUBMISSION_STATES.CONFIRM, draft: updatedDraft };
  }

  return { nextState: SUBMISSION_STATES.CATEGORY, draft: updatedDraft };
}

/**
 * State transition for Custom Category input.
 */
export function processCustomCategoryInput(draft, catNameText) {
  const clean = (catNameText || '').trim();
  if (!clean) {
    return { error: 'Please type a valid category name:' };
  }

  if (clean.length > MAX_CUSTOM_NAME_LENGTH) {
    return {
      error: `❌ *Category name too long* (${clean.length}/${MAX_CUSTOM_NAME_LENGTH} characters).\nPlease keep custom category names under ${MAX_CUSTOM_NAME_LENGTH} characters:\n\nType your category name again:`,
    };
  }

  const updatedDraft = {
    ...draft,
    category: null,
    custom_category: clean,
    category_name: clean,
    is_custom_category: true,
  };

  if (updatedDraft.editing_from_preview) {
    delete updatedDraft.editing_from_preview;
    return { nextState: SUBMISSION_STATES.CONFIRM, draft: updatedDraft };
  }

  return { nextState: SUBMISSION_STATES.DATETIME, draft: updatedDraft };
}

/**
 * State transition for Datetime input.
 */
export function processDateTimeInput(draft, dtText) {
  try {
    const unixSec = parseEventDateTimeInput(dtText);
    const updatedDraft = {
      ...draft,
      start_datetime: unixSec,
    };

    if (updatedDraft.editing_from_preview) {
      delete updatedDraft.editing_from_preview;
      return { nextState: SUBMISSION_STATES.CONFIRM, draft: updatedDraft };
    }

    return { nextState: SUBMISSION_STATES.LOCATION, draft: updatedDraft };
  } catch (err) {
    return {
      error: '❌ *Invalid format.* Please enter date and time exactly as `DD/MM/YYYY HH:MM` (24-hour clock):\n_Example: 15/09/2026 14:30_',
    };
  }
}

/**
 * State transition for Location input.
 */
export function processLocationInput(draft, locText) {
  const clean = (locText || '').trim();
  if (!clean) {
    return { error: 'Please enter a valid venue / location:' };
  }

  const updatedDraft = {
    ...draft,
    location: clean,
  };

  return { nextState: SUBMISSION_STATES.CONFIRM, draft: updatedDraft };
}
