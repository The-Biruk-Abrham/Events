// lib/broadcast.js
// Telegram Channel broadcast engine with length-limit handling and in-place updates.
// Respects limits: 1024 for media captions, 4096 for text messages.

import { formatChannelPost, safeEscape } from './formatters.js';
import { TELEGRAM_MEDIA_CAPTION_LIMIT, TELEGRAM_TEXT_MESSAGE_LIMIT } from './config.js';

/**
 * Prepares the broadcast message payload and handles caption/text splitting without truncation.
 * Pure logic function for direct unit-testing.
 */
export function prepareBroadcastPayload(event, useMarkdown = true) {
  const raw = event.raw_content || event.rawContent || {};
  const mediaType = raw.media_type || raw.mediaType || 'text';
  const fileIds = raw.file_ids || raw.fileIds || [];
  const isForwarded = Boolean(raw.is_forwarded);
  const isMedia = ['photo', 'video', 'document', 'animation'].includes(mediaType) && fileIds.length > 0;

  const rawPostText = formatChannelPost(event);
  const postText = useMarkdown
    ? rawPostText
    : rawPostText.replace(/[\\*_[\]`]/g, '');

  if (isMedia) {
    if (postText.length <= TELEGRAM_MEDIA_CAPTION_LIMIT) {
      return {
        isMedia: true,
        mediaType,
        fileId: fileIds[0],
        mediaCaption: postText,
        followUpText: null,
      };
    }

    // Long caption case (> 1024 chars):
    // For forwarded messages: send media with empty caption or first line, and full text as reply.
    // For manual submissions: send media with short title header and full text as reply.
    let mediaCaption = '';
    if (isForwarded) {
      // First line if short, or empty caption
      const firstLine = postText.split('\n')[0].trim();
      mediaCaption = firstLine.length <= 200 ? firstLine : '';
    } else {
      const title = event.title || 'Upcoming Event';
      mediaCaption = useMarkdown ? `📢 *${safeEscape(title)}*` : `📢 ${title}`;
    }

    return {
      isMedia: true,
      mediaType,
      fileId: fileIds[0],
      mediaCaption,
      followUpText: postText,
    };
  }

  // Text-only message
  if (postText.length <= TELEGRAM_TEXT_MESSAGE_LIMIT) {
    return {
      isMedia: false,
      mediaType: 'text',
      fileId: null,
      mainText: postText,
      followUpText: null,
    };
  }

  // Very long text (> 4096 chars): split into chunks
  const mainText = postText.slice(0, TELEGRAM_TEXT_MESSAGE_LIMIT);
  const followUpText = postText.slice(TELEGRAM_TEXT_MESSAGE_LIMIT, TELEGRAM_TEXT_MESSAGE_LIMIT * 2);
  return {
    isMedia: false,
    mediaType: 'text',
    fileId: null,
    mainText,
    followUpText,
  };
}

/**
 * Broadcasts an approved event to the public Telegram channel.
 * Returns { channelMessageId, channelExtraMessageId }
 */
export async function broadcastEventToChannel({ api, event, channelId }) {
  if (!channelId) {
    throw new Error('Public channel ID is not configured.');
  }

  async function sendWithMode(useMarkdown) {
    const payload = prepareBroadcastPayload(event, useMarkdown);
    const parseMode = useMarkdown ? 'Markdown' : undefined;

    if (payload.isMedia) {
      let sentMsg = null;
      const baseParams = {
        chat_id: channelId,
        caption: payload.mediaCaption || undefined,
        parse_mode: parseMode,
      };

      if (payload.mediaType === 'photo') {
        sentMsg = await api.sendPhoto({ ...baseParams, photo: payload.fileId });
      } else if (payload.mediaType === 'video') {
        sentMsg = await api.sendVideo({ ...baseParams, video: payload.fileId });
      } else if (payload.mediaType === 'document') {
        sentMsg = await api.sendDocument({ ...baseParams, document: payload.fileId });
      } else if (payload.mediaType === 'animation') {
        sentMsg = await api.sendAnimation({ ...baseParams, animation: payload.fileId });
      }

      if (!sentMsg) {
        throw new Error(`Unsupported media type: ${payload.mediaType}`);
      }

      let extraMsgId = null;
      if (payload.followUpText) {
        try {
          const extra = await api.sendMessage({
            chat_id: channelId,
            text: payload.followUpText,
            reply_to_message_id: sentMsg.message_id,
            parse_mode: parseMode,
          });
          extraMsgId = extra.message_id;
        } catch (e) {
          console.warn('[broadcast] Failed to send reply follow-up message:', e);
        }
      }

      return {
        channelMessageId: sentMsg.message_id,
        channelExtraMessageId: extraMsgId,
      };
    }

    // Text-only message
    const mainMsg = await api.sendMessage({
      chat_id: channelId,
      text: payload.mainText,
      parse_mode: parseMode,
    });

    let extraMsgId = null;
    if (payload.followUpText) {
      try {
        const extra = await api.sendMessage({
          chat_id: channelId,
          text: payload.followUpText,
          reply_to_message_id: mainMsg.message_id,
          parse_mode: parseMode,
        });
        extraMsgId = extra.message_id;
      } catch (e) {
        console.warn('[broadcast] Failed to send text follow-up message:', e);
      }
    }

    return {
      channelMessageId: mainMsg.message_id,
      channelExtraMessageId: extraMsgId,
    };
  }

  try {
    return await sendWithMode(true);
  } catch (err) {
    console.warn('[broadcast] Markdown broadcast failed, retrying with plain text:', err);
    return await sendWithMode(false);
  }
}

/**
 * Updates an already broadcasted event in the public channel in place.
 */
export async function updateChannelMessageInPlace({ api, event, channelId, messageId, extraMessageId = null }) {
  if (!channelId || !messageId) return false;

  const raw = event.raw_content || event.rawContent || {};
  const isMedia = ['photo', 'video', 'document', 'animation'].includes(raw.media_type) && (raw.file_ids || []).length > 0;
  const postText = formatChannelPost(event);

  try {
    if (isMedia) {
      if (postText.length <= TELEGRAM_MEDIA_CAPTION_LIMIT) {
        await api.editMessageCaption({
          chat_id: channelId,
          message_id: messageId,
          caption: postText,
          parse_mode: 'Markdown',
        });
      } else {
        const title = event.title || 'Upcoming Event';
        const shortCaption = `📢 *${safeEscape(title)}*`;
        await api.editMessageCaption({
          chat_id: channelId,
          message_id: messageId,
          caption: shortCaption,
          parse_mode: 'Markdown',
        });
        if (extraMessageId) {
          await api.editMessageText({
            chat_id: channelId,
            message_id: extraMessageId,
            text: postText,
            parse_mode: 'Markdown',
          });
        }
      }
    } else {
      await api.editMessageText({
        chat_id: channelId,
        message_id: messageId,
        text: postText.slice(0, TELEGRAM_TEXT_MESSAGE_LIMIT),
        parse_mode: 'Markdown',
      });
    }
    return true;
  } catch (err) {
    console.warn('[broadcast] editMessage in place failed:', err);
    return false;
  }
}
