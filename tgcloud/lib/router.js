// lib/router.js
// Central router for Telegram messages and callback queries.
// Implements session-based conversation flows, permission enforcement, and atomic state updates.

import { db, api } from 'sdk';
import { eq } from 'sdk/db';
import { events } from '../schema.js';
import {
  OWNER_ID,
  ADMIN_GROUP_ID,
  CHANNEL_ID,
  UNIVERSITY_NAME,
  isConfigured,
} from './config.js';
import { t } from './i18n.js';
import { isOwner, isAdmin, isVerifiedRep, canSubmit, canPublishDirectly } from './auth.js';
import {
  formatSingleEvent,
  formatTodayEvents,
  formatWeekEvents,
  formatCategoryEvents,
  formatAdminPendingCard,
  safeEscape,
} from './formatters.js';
import {
  buildStartKeyboard,
  buildPaginationKeyboard,
  buildCategoriesKeyboard,
  buildClubPickerKeyboard,
  buildSubmissionCategoryKeyboard,
  buildSubmissionConfirmKeyboard,
  buildAdminApprovalKeyboard,
  buildAdminEditFieldKeyboard,
  buildOwnerClubPickerKeyboard,
  buildOwnerOfficersListKeyboard,
  buildClubGenreKeyboard,
  buildRetryBroadcastKeyboard,
} from './keyboards.js';
import {
  getEvents,
  getEventById,
  getCategories,
  getCategoryById,
  createEvent,
  approveEvent,
  rejectEvent,
  updateEventFields,
  setChannelMessageIds,
} from './services/events.js';
import { getClubs, getClubById, createClub } from './services/clubs.js';
import {
  getOfficersForClub,
  getClubsForOfficer,
  addOfficer,
  removeOfficer,
} from './services/officers.js';
import { getSession, setSession, clearSession, transitionSession } from './session.js';
import {
  SUBMISSION_STATES,
  OWNER_STATES,
  ADMIN_STATES,
  extractRawContent,
  extractTelegramIdFromMessage,
  renderSubmissionPreview,
  processTitleInput,
  processCustomClubInput,
  processCustomCategoryInput,
  processDateTimeInput,
  processLocationInput,
} from './state_machine.js';
import {
  broadcastEventToChannel,
  updateChannelMessageInPlace,
} from './broadcast.js';
import { runSeed } from './seed.js';
import { nowSec, formatPreviewDateTime, parseEventDateTimeInput } from './time.js';

/**
 * Safely edits a callback query's message (caption for media messages, text for text messages).
 */
export async function safeEditQueryMessage(query, text, replyMarkup = null, parseMode = 'Markdown') {
  const msg = query.message;
  const isMedia = Boolean(msg && (msg.photo || msg.video || msg.animation || msg.document || msg.caption));
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;

  async function execute(pm) {
    const plainText = pm ? text : text.replace(/[\\*_[\]`]/g, '');
    if (isMedia) {
      try {
        await api.editMessageCaption({
          chat_id: chatId,
          message_id: messageId,
          caption: plainText,
          parse_mode: pm,
          reply_markup: replyMarkup || undefined,
        });
      } catch (err) {
        const desc = (err.description || '').toLowerCase();
        if (desc.includes('message is not modified')) return;
        if (desc.includes('no text in the message') || desc.includes('there is no caption')) {
          await api.editMessageText({
            chat_id: chatId,
            message_id: messageId,
            text: plainText,
            parse_mode: pm,
            reply_markup: replyMarkup || undefined,
          });
        } else {
          throw err;
        }
      }
    } else {
      try {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: plainText,
          parse_mode: pm,
          reply_markup: replyMarkup || undefined,
        });
      } catch (err) {
        const desc = (err.description || '').toLowerCase();
        if (desc.includes('message is not modified')) return;
        if (desc.includes('no text in the message')) {
          await api.editMessageCaption({
            chat_id: chatId,
            message_id: messageId,
            caption: plainText,
            parse_mode: pm,
            reply_markup: replyMarkup || undefined,
          });
        } else {
          throw err;
        }
      }
    }
  }

  try {
    await execute(parseMode);
  } catch (err) {
    const desc = (err.description || '').toLowerCase();
    if (desc.includes('message is not modified')) return;
    if (desc.includes("can't parse entities") || desc.includes('entity')) {
      await execute(undefined);
    } else {
      console.warn('[router] safeEditQueryMessage error:', err);
    }
  }
}

/**
 * Sends notification card for pending event to the Admin Group.
 */
async function sendAdminPendingNotification(event) {
  if (!isConfigured(ADMIN_GROUP_ID)) {
    console.warn('[router] ADMIN_GROUP_ID is not configured; pending notification card could not be sent to admin group.');
    return null;
  }

  const raw = event.raw_content || event.rawContent || {};
  const mediaType = raw.media_type;
  const fileIds = raw.file_ids || [];
  const cardCaption = formatAdminPendingCard(event);
  const kb = buildAdminApprovalKeyboard(event.id);

  async function trySend(useMarkdown) {
    const parseMode = useMarkdown ? 'Markdown' : undefined;
    const textToSend = useMarkdown ? cardCaption : cardCaption.replace(/[\\*_[\]`]/g, '');

    if (['photo', 'video', 'document', 'animation'].includes(mediaType) && fileIds.length > 0) {
      const base = {
        chat_id: ADMIN_GROUP_ID,
        caption: textToSend.slice(0, 1024),
        parse_mode: parseMode,
        reply_markup: kb,
      };
      if (mediaType === 'photo') return await api.sendPhoto({ ...base, photo: fileIds[0] });
      if (mediaType === 'video') return await api.sendVideo({ ...base, video: fileIds[0] });
      if (mediaType === 'document') return await api.sendDocument({ ...base, document: fileIds[0] });
      if (mediaType === 'animation') return await api.sendAnimation({ ...base, animation: fileIds[0] });
    }

    return await api.sendMessage({
      chat_id: ADMIN_GROUP_ID,
      text: textToSend.slice(0, 4096),
      parse_mode: parseMode,
      reply_markup: kb,
    });
  }

  try {
    return await trySend(true);
  } catch (err) {
    console.warn('[router] Admin pending notification markdown failed, retrying plain text:', err);
    try {
      return await trySend(false);
    } catch (e) {
      console.error('[router] Failed to send admin pending notification:', e);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// MESSAGE UPDATE ROUTER
// ---------------------------------------------------------------------------

export async function handleMessageUpdate(message, ctx) {
  if (!message) return;
  const chatId = message.chat.id;
  const user = message.from;
  const userId = user?.id;
  const text = (message.text || '').trim();

  // 1. Diagnostic / Identity Commands
  if (text === '/whoami') {
    const reply = t('command.whoami', 'en', {
      userId: userId || 'unknown',
      username: user?.username || '',
    });
    await api.sendMessage({ chat_id: chatId, text: reply, parse_mode: 'Markdown' });
    return;
  }

  if (text === '/chatid') {
    const reply = t('command.chatid', 'en', {
      chatId,
      chatType: message.chat.type,
      chatTitle: message.chat.title || '',
    });
    await api.sendMessage({ chat_id: chatId, text: reply, parse_mode: 'Markdown' });
    return;
  }

  // 2. Cancel Command (Works from ANY state)
  if (text === '/cancel') {
    await clearSession(userId);
    const userIsOwner = isOwner(userId);
    const userIsOfficer = await isVerifiedRep(userId);
    const kb = buildStartKeyboard({ isOwner: userIsOwner, isOfficer: userIsOfficer });
    await api.sendMessage({
      chat_id: chatId,
      text: t('common.cancelled', 'en'),
      reply_markup: kb,
    });
    return;
  }

  // 3. Setup Command (Owner only)
  if (text === '/setup') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }

    await api.setMyCommands({
      commands: [
        { command: 'start', description: 'Main menu and campus events overview' },
        { command: 'today', description: "View events happening today at AASTU" },
        { command: 'week', description: 'View the 7-day upcoming campus schedule' },
        { command: 'events', description: 'Browse events filtered by category' },
        { command: 'submit', description: 'Submit a new club event (verified officers)' },
        { command: 'cancel', description: 'Cancel active action and return to main menu' },
        { command: 'whoami', description: 'Display your Telegram User ID' },
        { command: 'chatid', description: 'Display the current Chat ID' },
        { command: 'help', description: 'Show bot commands and guide' },
      ],
    });

    await api.sendMessage({ chat_id: chatId, text: t('command.setup_success', 'en') });
    return;
  }

  // 4. Seed Command (Owner only)
  if (text === '/seed') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }

    const logs = await runSeed(userId);
    const logText = logs.length > 0 ? logs.join('\n') : 'All categories, clubs, and events already exist.';
    await api.sendMessage({
      chat_id: chatId,
      text: `🌱 *Development Seed Data Completed:*\n\n\`\`\`\n${logText}\n\`\`\``,
      parse_mode: 'Markdown',
    });
    return;
  }

  // 5. Start & Help Commands
  if (text.startsWith('/start') || text === '/help') {
    await clearSession(userId);
    const userIsOwner = isOwner(userId);
    const userIsOfficer = (await isVerifiedRep(userId)) || userIsOwner;

    const officerLines = userIsOfficer ? t('start.officer_command_line', 'en') : '';
    const ownerLines = userIsOwner ? t('start.owner_commands', 'en') : '';

    const welcome = t('start.welcome', 'en', {
      name: user?.first_name || 'Student',
      officerLines,
      ownerLines,
    });
    const kb = buildStartKeyboard({ isOwner: userIsOwner, isOfficer: userIsOfficer });
    await api.sendMessage({ chat_id: chatId, text: welcome, parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  // 6. Today Command
  if (text === '/today') {
    const todayEvents = await getEvents({ status: 'approved', range: 'today' });
    const { text: formatted, totalPages } = formatTodayEvents(todayEvents, 1, 3);
    const kb = buildPaginationKeyboard({
      currentPage: 1,
      totalPages,
      prefix: 'p:today',
      showMainMenu: true,
    });
    await api.sendMessage({
      chat_id: chatId,
      text: formatted,
      parse_mode: 'Markdown',
      reply_markup: kb || undefined,
    });
    return;
  }

  // 7. Week Command
  if (text === '/week') {
    const weekEvents = await getEvents({ status: 'approved', range: 'week' });
    const formatted = formatWeekEvents(weekEvents);
    const kb = buildPaginationKeyboard({
      currentPage: 1,
      totalPages: 1,
      prefix: 'noop',
      showMainMenu: true,
    });
    await api.sendMessage({
      chat_id: chatId,
      text: formatted,
      parse_mode: 'Markdown',
      reply_markup: kb || undefined,
    });
    return;
  }

  // 8. Events Command (/events or /events <category>)
  if (text.startsWith('/events')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const catQuery = parts.slice(1).join(' ');
      const catEvents = await getEvents({ status: 'approved', categoryName: catQuery });
      const { text: formatted, totalPages } = formatCategoryEvents(catQuery, catEvents, 1, 3);
      const kb = buildPaginationKeyboard({
        currentPage: 1,
        totalPages,
        prefix: `p:cat:${catQuery}`,
        backCallback: 'btn:categories',
        showMainMenu: true,
      });
      await api.sendMessage({
        chat_id: chatId,
        text: formatted,
        parse_mode: 'Markdown',
        reply_markup: kb || undefined,
      });
      return;
    }

    const categoriesList = await getCategories();
    const kb = buildCategoriesKeyboard(categoriesList);
    await api.sendMessage({
      chat_id: chatId,
      text: t('events.category_picker_prompt', 'en'),
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
    return;
  }

  // 9. Submit Command
  if (text === '/submit') {
    const allowed = await canSubmit(userId);
    if (!allowed) {
      await api.sendMessage({
        chat_id: chatId,
        text: t('submit.access_restricted', 'en'),
        parse_mode: 'Markdown',
      });
      return;
    }

    const verifiedClubs = await getClubsForOfficer(userId);
    const directPublish = await canPublishDirectly(userId);

    await setSession(userId, SUBMISSION_STATES.CONTENT, {
      verified_clubs: verifiedClubs,
      is_direct_publish: directPublish,
    });

    await api.sendMessage({
      chat_id: chatId,
      text: t('submit.intro', 'en'),
      parse_mode: 'Markdown',
    });
    return;
  }

  // 10. Owner Direct Commands
  if (text === '/add_club_admin') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }
    const clubsList = await getClubs();
    if (clubsList.length === 0) {
      await api.sendMessage({ chat_id: chatId, text: t('owner.no_clubs', 'en') });
      return;
    }
    const kb = buildOwnerClubPickerKeyboard(clubsList, 'add');
    await api.sendMessage({
      chat_id: chatId,
      text: t('owner.add_admin_step1', 'en'),
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
    return;
  }

  if (text === '/remove_club_admin') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }
    const clubsList = await getClubs();
    if (clubsList.length === 0) {
      await api.sendMessage({ chat_id: chatId, text: t('owner.no_clubs', 'en') });
      return;
    }
    const kb = buildOwnerClubPickerKeyboard(clubsList, 'rm');
    await api.sendMessage({
      chat_id: chatId,
      text: t('owner.remove_admin_step1', 'en'),
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
    return;
  }

  if (text === '/add_club') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }
    await setSession(userId, OWNER_STATES.CREATE_CLUB_NAME, {});
    await api.sendMessage({
      chat_id: chatId,
      text: t('owner.register_club_step1', 'en'),
      parse_mode: 'Markdown',
    });
    return;
  }

  if (text === '/officers') {
    if (!isConfigured(OWNER_ID)) {
      await api.sendMessage({ chat_id: chatId, text: t('config.owner_not_configured', 'en') });
      return;
    }
    if (!isOwner(userId)) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }
    const clubsList = await getClubs();
    const lines = [t('owner.all_officers_title', 'en'), '────────────────────────────'];
    for (const c of clubsList) {
      const officers = await getOfficersForClub(c.id);
      const offStr = officers.length > 0 ? officers.map((o) => `\`${o}\``).join(', ') : '_None_';
      lines.push(`🏛️ *${safeEscape(c.name)}* (ID: \`${c.id}\`)`);
      lines.push(`   Officers (${officers.length}): ${offStr}`);
    }
    await api.sendMessage({
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'Markdown',
    });
    return;
  }

  if (text === '/pending') {
    const adminAllowed = await canPublishDirectly(userId);
    if (!adminAllowed) {
      await api.sendMessage({ chat_id: chatId, text: t('common.access_denied', 'en') });
      return;
    }
    const pendingEvents = await getEvents({ status: 'pending' });
    if (pendingEvents.length === 0) {
      await api.sendMessage({ chat_id: chatId, text: '✅ No events currently pending approval.' });
      return;
    }
    await api.sendMessage({
      chat_id: chatId,
      text: `📋 *Pending Approvals (${pendingEvents.length} events):*`,
      parse_mode: 'Markdown',
    });
    for (const ev of pendingEvents) {
      const card = formatSingleEvent(ev);
      const kb = buildAdminApprovalKeyboard(ev.id);
      await api.sendMessage({
        chat_id: chatId,
        text: card,
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
    }
    return;
  }

  // 11. Check Active Session State
  const session = await getSession(userId);

  if (session) {
    const state = session.state;
    const data = session.data || {};

    // Album deduplication: If incoming message has a media_group_id matching an already captured media_group_id in this session,
    // ignore it safely so subsequent photos of an album do not corrupt session or fail title input.
    if (message.media_group_id && data.media_group_id && String(message.media_group_id) === String(data.media_group_id)) {
      return;
    }

    // OWNER FLOWS
    if (state === OWNER_STATES.ADD_OFFICER_INPUT) {
      const { id: targetId, name: targetName, error } = extractTelegramIdFromMessage(message);
      if (error) {
        await api.sendMessage({ chat_id: chatId, text: error, parse_mode: 'Markdown' });
        return;
      }
      try {
        const { club, officers } = await addOfficer(userId, data.club_id, targetId);
        await clearSession(userId);
        const officersListStr = officers.map((o) => `\`${o}\``).join(', ');
        const reply = t('owner.officer_added_success', 'en', {
          clubName: safeEscape(club.name),
          officerId: targetId,
          officerDisplay: safeEscape(targetName),
          count: officers.length,
          officersList: officersListStr,
        });
        await api.sendMessage({ chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      } catch (err) {
        await api.sendMessage({ chat_id: chatId, text: `⚠️ ${err.message}` });
      }
      return;
    }

    if (state === OWNER_STATES.RM_OFFICER_INPUT) {
      const { id: targetId, error } = extractTelegramIdFromMessage(message);
      if (error) {
        await api.sendMessage({ chat_id: chatId, text: error, parse_mode: 'Markdown' });
        return;
      }
      try {
        const { club, officers } = await removeOfficer(userId, data.club_id, targetId);
        await clearSession(userId);
        const officersListStr = officers.length > 0 ? officers.map((o) => `\`${o}\``).join(', ') : '_None_';
        const reply = t('owner.officer_removed_success', 'en', {
          clubName: safeEscape(club.name),
          officerId: targetId,
          count: officers.length,
          officersList: officersListStr,
        });
        await api.sendMessage({ chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      } catch (err) {
        await api.sendMessage({ chat_id: chatId, text: `⚠️ ${err.message}` });
      }
      return;
    }

    if (state === OWNER_STATES.CREATE_CLUB_NAME) {
      const clubName = (message.text || '').trim();
      if (!clubName) {
        await api.sendMessage({ chat_id: chatId, text: 'Please enter a valid club name:' });
        return;
      }
      if (clubName.length > 200) {
        await api.sendMessage({ chat_id: chatId, text: t('owner.club_name_too_long', 'en') });
        return;
      }
      await setSession(userId, OWNER_STATES.CREATE_CLUB_GENRE, { name: clubName });
      const kb = buildClubGenreKeyboard();
      await api.sendMessage({
        chat_id: chatId,
        text: t('owner.register_club_step2', 'en', { clubName: safeEscape(clubName) }),
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
      return;
    }

    if (state === OWNER_STATES.CREATE_CLUB_GENRE) {
      const genre = (message.text || 'General').trim();
      try {
        const created = await createClub(userId, { name: data.name, categoryType: genre });
        await clearSession(userId);
        const reply = t('owner.club_registered_success', 'en', {
          clubName: safeEscape(created.name),
          genre: safeEscape(created.categoryType),
          clubId: created.id,
        });
        await api.sendMessage({ chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      } catch (err) {
        await api.sendMessage({ chat_id: chatId, text: `⚠️ ${err.message}` });
      }
      return;
    }

    // ADMIN EDIT IN-PLACE FLOW
    if (state === ADMIN_STATES.EDIT_INPUT) {
      const field = data.field;
      const eventId = data.event_id;
      const inputVal = (message.text || '').trim();
      const updates = {};

      if (field === 'title') updates.title = inputVal;
      else if (field === 'location') updates.location = inputVal;
      else if (field === 'date') {
        try {
          updates.startDatetime = parseEventDateTimeInput(inputVal);
        } catch (e) {
          await api.sendMessage({ chat_id: chatId, text: t('submit.datetime_invalid', 'en'), parse_mode: 'Markdown' });
          return;
        }
      }

      try {
        const updatedEvent = await updateEventFields(userId, eventId, updates);
        await clearSession(userId);

        // Edit channel message in place if already published
        if (updatedEvent.channelMessageId && CHANNEL_ID) {
          const raw = updatedEvent.raw_content || updatedEvent.rawContent || {};
          await updateChannelMessageInPlace({
            api,
            event: updatedEvent,
            channelId: CHANNEL_ID,
            messageId: updatedEvent.channelMessageId,
            extraMessageId: raw.channel_extra_message_id,
          });
        }

        await api.sendMessage({
          chat_id: chatId,
          text: t('admin.edit_updated_success', 'en', { fieldName: field }),
          parse_mode: 'Markdown',
        });
      } catch (err) {
        await api.sendMessage({ chat_id: chatId, text: `⚠️ ${err.message}` });
      }
      return;
    }

    // SUBMISSION FLOWS
    if (state === SUBMISSION_STATES.CONTENT) {
      const raw = extractRawContent(message, user);
      const isAlbum = Boolean(message.media_group_id);
      const updatedDraft = {
        ...data,
        raw_content: raw,
        media_group_id: isAlbum ? String(message.media_group_id) : null,
      };

      if (isAlbum) {
        // Atomic transition ensures only the first item of concurrent album messages transitions state
        const transitioned = await transitionSession(userId, SUBMISSION_STATES.CONTENT, SUBMISSION_STATES.TITLE, updatedDraft);
        if (!transitioned) {
          // Another concurrent update from the same album already transitioned the session
          return;
        }
      } else {
        await setSession(userId, SUBMISSION_STATES.TITLE, updatedDraft);
      }

      const albumNotice = isAlbum ? t('submit.album_first_item_note', 'en') : '';
      await api.sendMessage({
        chat_id: chatId,
        text: albumNotice + t('submit.step_title', 'en'),
        parse_mode: 'Markdown',
      });
      return;
    }

    if (state === SUBMISSION_STATES.TITLE) {
      const verifiedClubs = data.verified_clubs || (await getClubsForOfficer(userId));
      const res = processTitleInput(data, message.text, verifiedClubs);
      if (res.error) {
        await api.sendMessage({ chat_id: chatId, text: res.error });
        return;
      }
      await setSession(userId, res.nextState, res.draft);

      if (res.nextState === SUBMISSION_STATES.CONFIRM) {
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
      } else if (res.nextState === SUBMISSION_STATES.CATEGORY) {
        const cats = await getCategories();
        const kb = buildSubmissionCategoryKeyboard(cats);
        const prompt = t('submit.step_club_auto_selected', 'en', { clubName: safeEscape(res.autoSelectedClub.name) });
        await api.sendMessage({ chat_id: chatId, text: prompt, parse_mode: 'Markdown', reply_markup: kb });
      } else {
        const kb = buildClubPickerKeyboard(verifiedClubs, isOwner(userId));
        await api.sendMessage({
          chat_id: chatId,
          text: t('submit.step_club_picker', 'en'),
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
      return;
    }

    if (state === SUBMISSION_STATES.CUSTOM_CLUB) {
      const res = processCustomClubInput(data, message.text);
      if (res.error) {
        await api.sendMessage({ chat_id: chatId, text: res.error, parse_mode: 'Markdown' });
        return;
      }
      await setSession(userId, res.nextState, res.draft);

      if (res.nextState === SUBMISSION_STATES.CONFIRM) {
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
      } else {
        const cats = await getCategories();
        const kb = buildSubmissionCategoryKeyboard(cats);
        await api.sendMessage({
          chat_id: chatId,
          text: t('submit.step_category_prompt', 'en'),
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
      return;
    }

    if (state === SUBMISSION_STATES.CUSTOM_CATEGORY) {
      const res = processCustomCategoryInput(data, message.text);
      if (res.error) {
        await api.sendMessage({ chat_id: chatId, text: res.error, parse_mode: 'Markdown' });
        return;
      }
      await setSession(userId, res.nextState, res.draft);

      if (res.nextState === SUBMISSION_STATES.CONFIRM) {
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
      } else {
        await api.sendMessage({
          chat_id: chatId,
          text: t('submit.step_datetime_prompt', 'en'),
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (state === SUBMISSION_STATES.DATETIME) {
      const res = processDateTimeInput(data, message.text);
      if (res.error) {
        await api.sendMessage({ chat_id: chatId, text: res.error, parse_mode: 'Markdown' });
        return;
      }
      await setSession(userId, res.nextState, res.draft);

      if (res.nextState === SUBMISSION_STATES.CONFIRM) {
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
      } else {
        await api.sendMessage({
          chat_id: chatId,
          text: t('submit.step_location_prompt', 'en'),
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (state === SUBMISSION_STATES.LOCATION) {
      const res = processLocationInput(data, message.text);
      if (res.error) {
        await api.sendMessage({ chat_id: chatId, text: res.error });
        return;
      }
      await setSession(userId, res.nextState, res.draft);
      const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
      const kb = buildSubmissionConfirmKeyboard();
      await api.sendMessage({
        chat_id: chatId,
        text: preview,
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
      return;
    }

    if (state === SUBMISSION_STATES.EDIT_FIELD) {
      const field = data.editing_field;
      if (field === 'title') {
        const res = processTitleInput(data, message.text, data.verified_clubs || []);
        if (res.error) {
          await api.sendMessage({ chat_id: chatId, text: res.error });
          return;
        }
        await setSession(userId, SUBMISSION_STATES.CONFIRM, res.draft);
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
        return;
      }
      if (field === 'dt') {
        const res = processDateTimeInput(data, message.text);
        if (res.error) {
          await api.sendMessage({ chat_id: chatId, text: res.error, parse_mode: 'Markdown' });
          return;
        }
        await setSession(userId, SUBMISSION_STATES.CONFIRM, res.draft);
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
        return;
      }
      if (field === 'loc') {
        const res = processLocationInput(data, message.text);
        if (res.error) {
          await api.sendMessage({ chat_id: chatId, text: res.error });
          return;
        }
        await setSession(userId, SUBMISSION_STATES.CONFIRM, res.draft);
        const preview = renderSubmissionPreview(res.draft, res.draft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await api.sendMessage({ chat_id: chatId, text: preview, parse_mode: 'Markdown', reply_markup: kb });
        return;
      }
    }
  }

  // 12. Idle Message Handling (outside any conversation)
  const isForwarded = Boolean(
    message.forward_origin ||
    message.forward_from ||
    message.forward_from_chat ||
    message.forward_date
  );

  const isMedia = Boolean(
    (message.photo && message.photo.length > 0) ||
    message.video ||
    message.animation ||
    message.document ||
    message.audio ||
    message.voice
  );

  const isOfficer = await isVerifiedRep(userId);
  const userIsOwner = isOwner(userId);

  if (isForwarded || isMedia) {
    if (message.media_group_id) {
      const existingSession = await getSession(userId);
      if (existingSession?.data?.idle_media_group_id === String(message.media_group_id)) {
        return;
      }
      await setSession(userId, 'idle', { idle_media_group_id: String(message.media_group_id) });
    }

    if (isOfficer || userIsOwner) {
      await api.sendMessage({
        chat_id: chatId,
        text: t('idle.officer_forward_hint', 'en'),
        parse_mode: 'Markdown',
        reply_markup: buildStartKeyboard({ isOwner: userIsOwner, isOfficer: true }),
      });
    } else {
      await api.sendMessage({
        chat_id: chatId,
        text: t('idle.regular_user_hint', 'en'),
        parse_mode: 'Markdown',
        reply_markup: buildStartKeyboard({ isOwner: false, isOfficer: false }),
      });
    }
    return;
  }

  // Regular idle text fallback
  await api.sendMessage({
    chat_id: chatId,
    text: t('idle.regular_user_hint', 'en'),
    parse_mode: 'Markdown',
    reply_markup: buildStartKeyboard({ isOwner: userIsOwner, isOfficer }),
  });
}

// ---------------------------------------------------------------------------
// CALLBACK QUERY ROUTER
// ---------------------------------------------------------------------------

export async function handleCallbackQueryUpdate(query, ctx) {
  if (!query) return;
  const queryId = query.id;
  const user = query.from;
  const userId = user?.id;
  const data = query.data || '';
  const chatId = query.message?.chat?.id;

  async function ack(text = undefined, showAlert = false) {
    try {
      await api.answerCallbackQuery({
        callback_query_id: queryId,
        text,
        show_alert: showAlert,
      });
    } catch (e) {
      // Ignore stale query answers
    }
  }

  if (data === 'noop') {
    await ack();
    return;
  }

  // 1. Navigation callbacks
  if (data === 'btn:main_menu') {
    await ack();
    await clearSession(userId);
    const userIsOwner = isOwner(userId);
    const userIsOfficer = (await isVerifiedRep(userId)) || userIsOwner;
    const officerLines = userIsOfficer ? t('start.officer_command_line', 'en') : '';
    const ownerLines = userIsOwner ? t('start.owner_commands', 'en') : '';
    const welcome = t('start.welcome', 'en', {
      name: user?.first_name || 'Student',
      officerLines,
      ownerLines,
    });
    const kb = buildStartKeyboard({ isOwner: userIsOwner, isOfficer: userIsOfficer });
    await safeEditQueryMessage(query, welcome, kb);
    return;
  }

  if (data === 'btn:today') {
    await ack();
    const todayEvents = await getEvents({ status: 'approved', range: 'today' });
    const { text: formatted, totalPages } = formatTodayEvents(todayEvents, 1, 3);
    const kb = buildPaginationKeyboard({
      currentPage: 1,
      totalPages,
      prefix: 'p:today',
      showMainMenu: true,
    });
    await safeEditQueryMessage(query, formatted, kb);
    return;
  }

  if (data.startsWith('p:today:')) {
    await ack();
    const targetPage = parseInt(data.split(':')[2], 10) || 1;
    const todayEvents = await getEvents({ status: 'approved', range: 'today' });
    const { text: formatted, totalPages } = formatTodayEvents(todayEvents, targetPage, 3);
    const kb = buildPaginationKeyboard({
      currentPage: targetPage,
      totalPages,
      prefix: 'p:today',
      showMainMenu: true,
    });
    await safeEditQueryMessage(query, formatted, kb);
    return;
  }

  if (data === 'btn:week') {
    await ack();
    const weekEvents = await getEvents({ status: 'approved', range: 'week' });
    const formatted = formatWeekEvents(weekEvents);
    const kb = buildPaginationKeyboard({
      currentPage: 1,
      totalPages: 1,
      prefix: 'noop',
      showMainMenu: true,
    });
    await safeEditQueryMessage(query, formatted, kb);
    return;
  }

  if (data === 'btn:categories') {
    await ack();
    const categoriesList = await getCategories();
    const kb = buildCategoriesKeyboard(categoriesList);
    await safeEditQueryMessage(query, t('events.category_picker_prompt', 'en'), kb);
    return;
  }

  if (data.startsWith('cat:sel:')) {
    await ack();
    const catId = parseInt(data.split(':')[2], 10);
    const cat = await getCategoryById(catId);
    const catName = cat?.name || 'Category';
    const catEvents = await getEvents({ status: 'approved', categoryId: catId });
    const { text: formatted, totalPages } = formatCategoryEvents(catName, catEvents, 1, 3);
    const kb = buildPaginationKeyboard({
      currentPage: 1,
      totalPages,
      prefix: `p:cat:${catId}`,
      backCallback: 'btn:categories',
      showMainMenu: true,
    });
    await safeEditQueryMessage(query, formatted, kb);
    return;
  }

  if (data.startsWith('p:cat:')) {
    await ack();
    const parts = data.split(':');
    const catId = parseInt(parts[2], 10);
    const targetPage = parseInt(parts[3], 10) || 1;
    const cat = await getCategoryById(catId);
    const catName = cat?.name || 'Category';
    const catEvents = await getEvents({ status: 'approved', categoryId: catId });
    const { text: formatted, totalPages } = formatCategoryEvents(catName, catEvents, targetPage, 3);
    const kb = buildPaginationKeyboard({
      currentPage: targetPage,
      totalPages,
      prefix: `p:cat:${catId}`,
      backCallback: 'btn:categories',
      showMainMenu: true,
    });
    await safeEditQueryMessage(query, formatted, kb);
    return;
  }

  // 2. Submission button start
  if (data === 'btn:submit') {
    await ack();
    const allowed = await canSubmit(userId);
    if (!allowed) {
      await safeEditQueryMessage(query, t('submit.access_restricted', 'en'));
      return;
    }

    const verifiedClubs = await getClubsForOfficer(userId);
    const directPublish = await canPublishDirectly(userId);

    await setSession(userId, SUBMISSION_STATES.CONTENT, {
      verified_clubs: verifiedClubs,
      is_direct_publish: directPublish,
    });

    await safeEditQueryMessage(query, t('submit.intro', 'en'));
    return;
  }

  // 3. Submission in-wizard callbacks
  if (data.startsWith('sub:')) {
    const session = await getSession(userId);
    const draft = session?.data || {};

    if (data === 'sub:x') {
      await ack();
      await clearSession(userId);
      await safeEditQueryMessage(query, t('common.cancelled', 'en'));
      return;
    }

    if (data === 'sub:c') {
      await ack();
      if (!draft.title || !draft.start_datetime) {
        await safeEditQueryMessage(query, '⚠️ Submission session incomplete or expired. Use /submit to start again.');
        await clearSession(userId);
        return;
      }

      await clearSession(userId); // Clear session to prevent double submission

      try {
        const created = await createEvent(userId, {
          title: draft.title,
          clubId: draft.club,
          customClub: draft.custom_club,
          categoryId: draft.category,
          customCategory: draft.custom_category,
          startDatetime: draft.start_datetime,
          location: draft.location || '',
          rawContent: draft.raw_content || {},
        });

        if (created.status === 'approved') {
          // Direct publish flow
          let broadcastRes = null;
          let broadcastError = null;

          if (!isConfigured(CHANNEL_ID)) {
            broadcastError = new Error('Public channel ID (CHANNEL_ID) is not configured.');
          } else {
            try {
              broadcastRes = await broadcastEventToChannel({
                api,
                event: created,
                channelId: CHANNEL_ID,
              });
              if (broadcastRes?.channelMessageId) {
                await setChannelMessageIds(userId, created.id, broadcastRes.channelMessageId, broadcastRes.channelExtraMessageId);
              }
            } catch (bErr) {
              broadcastError = bErr;
              console.error('[router] Direct publish broadcast error:', bErr);
            }
          }

          if (broadcastError) {
            // Failed broadcast:
            // 1. Never leave event approved but unposted: revert status to pending
            await db.update(events)
              .set({ status: 'pending', approvedAt: null, approvedBy: null })
              .where(eq(events.id, created.id))
              .run();

            // 2. Alert the admin group with retry button
            if (isConfigured(ADMIN_GROUP_ID)) {
              try {
                const retryKb = buildRetryBroadcastKeyboard(created.id);
                await api.sendMessage({
                  chat_id: ADMIN_GROUP_ID,
                  text: t('admin.broadcast_failed_alert', 'en', {
                    title: safeEscape(created.title),
                    error: safeEscape(broadcastError.message || String(broadcastError)),
                  }),
                  parse_mode: 'Markdown',
                  reply_markup: retryKb,
                });
              } catch (e) {
                console.warn('[router] Failed to alert admin group of direct publish broadcast failure:', e);
              }
            } else {
              console.warn('[router] ADMIN_GROUP_ID is not configured, cannot send failure alert.');
            }

            // 3. Inform the submitter
            await safeEditQueryMessage(query, t('admin.broadcast_failed_dm', 'en', { title: safeEscape(created.title) }));
            return;
          }

          // Direct publish succeeded: One-line info log to Admin Group
          if (isConfigured(ADMIN_GROUP_ID)) {
            try {
              const actorDisplay = user.first_name || user.username || String(userId);
              const logMsg = t('submit.admin_log_direct', 'en', {
                title: safeEscape(created.title),
                author: safeEscape(isOwner(userId) ? `${actorDisplay} (Owner)` : `${actorDisplay} (Admin)`),
              });
              await api.sendMessage({ chat_id: ADMIN_GROUP_ID, text: logMsg, parse_mode: 'Markdown' });
            } catch (e) {
              console.warn('[router] Failed to log direct publish to admin group:', e);
            }
          }

          await safeEditQueryMessage(query, t('submit.direct_published_success', 'en', { title: safeEscape(created.title) }));
        } else {
          // Club Representative approval queue flow
          await safeEditQueryMessage(query, t('submit.submitted_success', 'en', { title: safeEscape(created.title) }));
          // Send notification card to Admin Group
          await sendAdminPendingNotification(created);
        }
      } catch (err) {
        console.error('[router] Event submission error:', err);
        await safeEditQueryMessage(query, `⚠️ Failed to submit event: ${err.message}`);
      }
      return;
    }

    if (data.startsWith('sub:clb:')) {
      await ack();
      const clubParam = data.split(':')[2];
      if (clubParam === 'oth') {
        await setSession(userId, SUBMISSION_STATES.CUSTOM_CLUB, draft);
        await safeEditQueryMessage(query, t('submit.step_custom_club_prompt', 'en'));
        return;
      }

      const clubId = parseInt(clubParam, 10);
      const club = await getClubById(clubId);
      const updatedDraft = {
        ...draft,
        club: clubId,
        custom_club: '',
        club_name: club?.name || `Club #${clubId}`,
        is_custom_club: false,
      };

      if (updatedDraft.editing_from_preview) {
        delete updatedDraft.editing_from_preview;
        await setSession(userId, SUBMISSION_STATES.CONFIRM, updatedDraft);
        const preview = renderSubmissionPreview(updatedDraft, updatedDraft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await safeEditQueryMessage(query, preview, kb);
        return;
      }

      await setSession(userId, SUBMISSION_STATES.CATEGORY, updatedDraft);
      const cats = await getCategories();
      const kb = buildSubmissionCategoryKeyboard(cats);
      await safeEditQueryMessage(query, t('submit.step_category_prompt', 'en'), kb);
      return;
    }

    if (data.startsWith('sub:cat:')) {
      await ack();
      const catParam = data.split(':')[2];
      if (catParam === 'oth') {
        await setSession(userId, SUBMISSION_STATES.CUSTOM_CATEGORY, draft);
        await safeEditQueryMessage(query, t('submit.step_custom_category_prompt', 'en'));
        return;
      }

      const catId = parseInt(catParam, 10);
      const cat = await getCategoryById(catId);
      const updatedDraft = {
        ...draft,
        category: catId,
        custom_category: '',
        category_name: cat?.name || `Category #${catId}`,
        is_custom_category: false,
      };

      if (updatedDraft.editing_from_preview) {
        delete updatedDraft.editing_from_preview;
        await setSession(userId, SUBMISSION_STATES.CONFIRM, updatedDraft);
        const preview = renderSubmissionPreview(updatedDraft, updatedDraft.is_direct_publish);
        const kb = buildSubmissionConfirmKeyboard();
        await safeEditQueryMessage(query, preview, kb);
        return;
      }

      await setSession(userId, SUBMISSION_STATES.DATETIME, updatedDraft);
      await safeEditQueryMessage(query, t('submit.step_datetime_prompt', 'en'));
      return;
    }

    if (data.startsWith('sub:e:')) {
      await ack();
      const field = data.split(':')[2];
      const updatedDraft = { ...draft, editing_from_preview: true, editing_field: field };

      if (field === 'title') {
        await setSession(userId, SUBMISSION_STATES.EDIT_FIELD, updatedDraft);
        await safeEditQueryMessage(query, t('submit.step_title_edit', 'en'));
      } else if (field === 'club') {
        const verifiedClubs = updatedDraft.verified_clubs || (await getClubsForOfficer(userId));
        if (verifiedClubs.length === 1) {
          // Already locked to their only verified club
          delete updatedDraft.editing_from_preview;
          await setSession(userId, SUBMISSION_STATES.CONFIRM, updatedDraft);
          const preview = renderSubmissionPreview(updatedDraft, updatedDraft.is_direct_publish);
          const kb = buildSubmissionConfirmKeyboard();
          await safeEditQueryMessage(query, preview, kb);
        } else {
          await setSession(userId, SUBMISSION_STATES.CLUB, updatedDraft);
          const kb = buildClubPickerKeyboard(verifiedClubs, isOwner(userId));
          await safeEditQueryMessage(query, t('submit.step_club_picker', 'en'), kb);
        }
      } else if (field === 'cat') {
        await setSession(userId, SUBMISSION_STATES.CATEGORY, updatedDraft);
        const cats = await getCategories();
        const kb = buildSubmissionCategoryKeyboard(cats);
        await safeEditQueryMessage(query, t('submit.step_category_prompt', 'en'), kb);
      } else if (field === 'dt') {
        await setSession(userId, SUBMISSION_STATES.EDIT_FIELD, updatedDraft);
        await safeEditQueryMessage(query, t('submit.step_datetime_prompt', 'en'));
      } else if (field === 'loc') {
        await setSession(userId, SUBMISSION_STATES.EDIT_FIELD, updatedDraft);
        await safeEditQueryMessage(query, t('submit.step_location_prompt', 'en'));
      }
      return;
    }
  }

  // 4. Admin moderation callbacks
  if (data.startsWith('adm:')) {
    const adminAllowed = await canPublishDirectly(userId);
    if (!adminAllowed) {
      await ack(t('common.access_denied', 'en'), true);
      return;
    }

    if (data.startsWith('adm:app:')) {
      const eventId = parseInt(data.split(':')[2], 10);
      let approved = null;
      try {
        approved = await approveEvent(userId, eventId);
      } catch (err) {
        if (err.code === 'ALREADY_APPROVED' || err.code === 'ALREADY_REJECTED') {
          await ack(t('admin.already_processed', 'en'), true);
          return;
        }
        await ack(`⚠️ ${err.message}`, true);
        return;
      }

      await ack();

      // 1. Broadcast to Public Channel
      let broadcastRes = null;
      let broadcastError = null;

      if (!isConfigured(CHANNEL_ID)) {
        broadcastError = new Error('Public channel ID (CHANNEL_ID) is not configured.');
      } else {
        try {
          broadcastRes = await broadcastEventToChannel({
            api,
            event: approved,
            channelId: CHANNEL_ID,
          });
          if (broadcastRes?.channelMessageId) {
            await setChannelMessageIds(userId, approved.id, broadcastRes.channelMessageId, broadcastRes.channelExtraMessageId);
          }
        } catch (bErr) {
          broadcastError = bErr;
          console.error('[router] Channel broadcast error on approval:', bErr);
        }
      }

      if (broadcastError) {
        // Failed broadcast:
        // 1. Never leave event approved but unposted: revert status to pending
        await db.update(events)
          .set({ status: 'pending', approvedAt: null, approvedBy: null })
          .where(eq(events.id, approved.id))
          .run();

        // 2. Alert the admin group with retry button
        if (isConfigured(ADMIN_GROUP_ID)) {
          try {
            const retryKb = buildRetryBroadcastKeyboard(approved.id);
            await api.sendMessage({
              chat_id: ADMIN_GROUP_ID,
              text: t('admin.broadcast_failed_alert', 'en', {
                title: safeEscape(approved.title),
                error: safeEscape(broadcastError.message || String(broadcastError)),
              }),
              parse_mode: 'Markdown',
              reply_markup: retryKb,
            });
          } catch (e) {
            console.warn('[router] Failed to alert admin group of broadcast failure:', e);
          }
        }

        // 3. Inform the submitter
        const raw = approved.raw_content || approved.rawContent || {};
        if (raw.submitter_telegram_id) {
          try {
            await api.sendMessage({
              chat_id: raw.submitter_telegram_id,
              text: t('admin.broadcast_failed_dm', 'en', { title: safeEscape(approved.title) }),
              parse_mode: 'Markdown',
            });
          } catch (e) {}
        }

        return;
      }

      // 2. Update Admin Group card in place
      const channelInfo = broadcastRes?.channelMessageId ? ` (Channel Post #${broadcastRes.channelMessageId})` : '';
      const adminName = user.first_name || user.username || String(userId);
      const cardSummary = t('admin.approved_card', 'en', {
        adminName: safeEscape(adminName),
        channelInfo,
        title: safeEscape(approved.title),
        club: safeEscape(approved.club_name),
        time: approved.startDatetime ? formatPreviewDateTime(approved.startDatetime) : 'TBD',
        location: safeEscape(approved.location),
      });
      await safeEditQueryMessage(query, cardSummary);

      // 3. Notify submitter if channel broadcast was successful
      if (broadcastRes?.channelMessageId) {
        const raw = approved.raw_content || approved.rawContent || {};
        if (raw.submitter_telegram_id) {
          try {
            await api.sendMessage({
              chat_id: raw.submitter_telegram_id,
              text: t('admin.submitter_approved_dm', 'en', { title: safeEscape(approved.title) }),
              parse_mode: 'Markdown',
            });
          } catch (e) {}
        }
      }
      return;
    }

    if (data.startsWith('adm:rej:')) {
      const eventId = parseInt(data.split(':')[2], 10);
      let rejected = null;
      try {
        rejected = await rejectEvent(userId, eventId);
      } catch (err) {
        if (err.code === 'ALREADY_APPROVED' || err.code === 'ALREADY_REJECTED') {
          await ack(t('admin.already_processed', 'en'), true);
          return;
        }
        await ack(`⚠️ ${err.message}`, true);
        return;
      }

      await ack();

      const adminName = user.first_name || user.username || String(userId);
      const summary = t('admin.rejected_card', 'en', {
        adminName: safeEscape(adminName),
        title: safeEscape(rejected.title),
        club: safeEscape(rejected.club_name),
      });
      await safeEditQueryMessage(query, summary);

      const raw = rejected.raw_content || rejected.rawContent || {};
      if (raw.submitter_telegram_id) {
        try {
          await api.sendMessage({
            chat_id: raw.submitter_telegram_id,
            text: t('admin.submitter_rejected_dm', 'en', { title: safeEscape(rejected.title) }),
            parse_mode: 'Markdown',
          });
        } catch (e) {}
      }
      return;
    }

    if (data.startsWith('adm:edt:')) {
      await ack();
      const eventId = parseInt(data.split(':')[2], 10);
      const kb = buildAdminEditFieldKeyboard(eventId);
      await safeEditQueryMessage(query, t('admin.edit_menu_title', 'en'), kb);
      return;
    }

    if (data.startsWith('adm:ef:')) {
      await ack();
      const parts = data.split(':');
      const fieldCode = parts[2];
      const eventId = parseInt(parts[3], 10);

      if (fieldCode === 'dn') {
        // Done: return to approval card
        const ev = await getEventById(eventId);
        const card = formatAdminPendingCard(ev);
        const kb = buildAdminApprovalKeyboard(eventId);
        await safeEditQueryMessage(query, card, kb);
        return;
      }

      const fieldMap = {
        t: 'title',
        d: 'date',
        l: 'location',
        c: 'category',
        cl: 'club',
      };
      const fieldName = fieldMap[fieldCode] || 'title';

      await setSession(userId, ADMIN_STATES.EDIT_INPUT, {
        event_id: eventId,
        field: fieldName,
      });

      await api.sendMessage({
        chat_id: chatId,
        text: t('admin.edit_input_prompt', 'en', { fieldName }),
        parse_mode: 'Markdown',
      });
      return;
    }

    if (data.startsWith('adm:retry:')) {
      await ack();
      const eventId = parseInt(data.split(':')[2], 10);
      const ev = await getEventById(eventId);
      if (!ev) {
        await ack('Event not found', true);
        return;
      }

      if (!isConfigured(CHANNEL_ID)) {
        await safeEditQueryMessage(query, t('admin.retry_failed', 'en', { error: 'Public channel ID (CHANNEL_ID) is not configured.' }), buildRetryBroadcastKeyboard(eventId));
        return;
      }

      try {
        const res = await broadcastEventToChannel({
          api,
          event: ev,
          channelId: CHANNEL_ID,
        });

        // Broadcast succeeded: approve event atomically and save channelMessageId
        const now = nowSec();
        await db.update(events)
          .set({
            status: 'approved',
            approvedAt: now,
            approvedBy: String(userId),
            channelMessageId: res.channelMessageId,
          })
          .where(eq(events.id, ev.id))
          .run();

        if (res?.channelExtraMessageId) {
          await setChannelMessageIds(userId, ev.id, res.channelMessageId, res.channelExtraMessageId);
        }

        const raw = ev.raw_content || ev.rawContent || {};
        if (raw.submitter_telegram_id) {
          try {
            await api.sendMessage({
              chat_id: raw.submitter_telegram_id,
              text: t('admin.submitter_approved_dm', 'en', { title: safeEscape(ev.title) }),
              parse_mode: 'Markdown',
            });
          } catch (e) {}
        }

        await safeEditQueryMessage(query, t('admin.retry_success', 'en'));
      } catch (err) {
        await safeEditQueryMessage(query, t('admin.retry_failed', 'en', { error: safeEscape(err.message) }), buildRetryBroadcastKeyboard(eventId));
      }
      return;
    }
  }

  // 5. Owner management callbacks
  if (data.startsWith('own:')) {
    if (!isConfigured(OWNER_ID)) {
      await ack(t('config.owner_not_configured', 'en'), true);
      return;
    }
    if (!isOwner(userId)) {
      await ack(t('common.access_denied', 'en'), true);
      return;
    }

    if (data === 'own:x') {
      await ack();
      await clearSession(userId);
      const kb = buildStartKeyboard({ isOwner: true, isOfficer: true });
      await safeEditQueryMessage(query, t('common.cancelled', 'en'), kb);
      return;
    }

    if (data === 'own:add_adm') {
      await ack();
      const clubsList = await getClubs();
      if (clubsList.length === 0) {
        await safeEditQueryMessage(query, t('owner.no_clubs', 'en'));
        return;
      }
      const kb = buildOwnerClubPickerKeyboard(clubsList, 'add');
      await safeEditQueryMessage(query, t('owner.add_admin_step1', 'en'), kb);
      return;
    }

    if (data === 'own:rm_adm') {
      await ack();
      const clubsList = await getClubs();
      if (clubsList.length === 0) {
        await safeEditQueryMessage(query, t('owner.no_clubs', 'en'));
        return;
      }
      const kb = buildOwnerClubPickerKeyboard(clubsList, 'rm');
      await safeEditQueryMessage(query, t('owner.remove_admin_step1', 'en'), kb);
      return;
    }

    if (data === 'own:cre_clb') {
      await ack();
      await setSession(userId, OWNER_STATES.CREATE_CLUB_NAME, {});
      await safeEditQueryMessage(query, t('owner.register_club_step1', 'en'));
      return;
    }

    if (data.startsWith('own:ca:')) {
      await ack();
      const clubId = parseInt(data.split(':')[2], 10);
      const club = await getClubById(clubId);
      await setSession(userId, OWNER_STATES.ADD_OFFICER_INPUT, { club_id: clubId });
      const prompt = t('owner.add_admin_step2', 'en', { clubName: safeEscape(club?.name || `Club #${clubId}`) });
      await safeEditQueryMessage(query, prompt);
      return;
    }

    if (data.startsWith('own:cr:')) {
      await ack();
      const clubId = parseInt(data.split(':')[2], 10);
      const club = await getClubById(clubId);
      const officers = await getOfficersForClub(clubId);
      if (officers.length === 0) {
        await safeEditQueryMessage(query, t('owner.remove_admin_no_officers', 'en', { clubName: safeEscape(club?.name || `Club #${clubId}`) }));
        return;
      }
      await setSession(userId, OWNER_STATES.RM_OFFICER_INPUT, { club_id: clubId });
      const kb = buildOwnerOfficersListKeyboard(clubId, officers);
      const prompt = t('owner.remove_admin_list', 'en', {
        clubName: safeEscape(club?.name || `Club #${clubId}`),
        count: officers.length,
      });
      await safeEditQueryMessage(query, prompt, kb);
      return;
    }

    if (data.startsWith('own:rmo:')) {
      await ack();
      const parts = data.split(':');
      const clubId = parseInt(parts[2], 10);
      const officerId = parseInt(parts[3], 10);
      try {
        const { club, officers } = await removeOfficer(userId, clubId, officerId);
        await clearSession(userId);
        const officersListStr = officers.length > 0 ? officers.map((o) => `\`${o}\``).join(', ') : '_None_';
        const reply = t('owner.officer_removed_success', 'en', {
          clubName: safeEscape(club.name),
          officerId,
          count: officers.length,
          officersList: officersListStr,
        });
        await safeEditQueryMessage(query, reply);
      } catch (err) {
        await safeEditQueryMessage(query, `⚠️ ${err.message}`);
      }
      return;
    }

    if (data.startsWith('own:g:')) {
      await ack();
      const genre = data.split(':')[2];
      const session = await getSession(userId);
      const clubName = session?.data?.name;
      if (!clubName) {
        await safeEditQueryMessage(query, '⚠️ Session expired. Please start again with /add_club.');
        await clearSession(userId);
        return;
      }
      try {
        const created = await createClub(userId, { name: clubName, categoryType: genre });
        await clearSession(userId);
        const reply = t('owner.club_registered_success', 'en', {
          clubName: safeEscape(created.name),
          genre: safeEscape(created.categoryType),
          clubId: created.id,
        });
        await safeEditQueryMessage(query, reply);
      } catch (err) {
        await safeEditQueryMessage(query, `⚠️ ${err.message}`);
      }
      return;
    }
  }

  await ack();
}

