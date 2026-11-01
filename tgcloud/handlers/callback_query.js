// handlers/callback_query.js
// Dispatches incoming Telegram 'callback_query' updates to lib/router.js with top-level try/catch error safety.

import { api } from 'sdk';
import { handleCallbackQueryUpdate } from '../lib/router.js';

export default async function (callbackQuery, ctx) {
  const userId = callbackQuery?.from?.id;
  const queryId = callbackQuery?.id;
  const chatId = callbackQuery?.message?.chat?.id;

  try {
    await handleCallbackQueryUpdate(callbackQuery, ctx);
  } catch (err) {
    console.error(`[handler:callback_query] Unexpected error for user ${userId ?? 'unknown'}:`, err);
    if (queryId) {
      try {
        await api.answerCallbackQuery({
          callback_query_id: queryId,
          text: '⚠️ An unexpected error occurred. Please try again.',
          show_alert: true,
        });
      } catch (ackErr) {
        // Query may be expired or already answered
      }
    }
    if (chatId) {
      try {
        await api.sendMessage({
          chat_id: chatId,
          text: '⚠️ An unexpected error occurred. Please try again.',
        });
      } catch (sendErr) {
        console.error('[handler:callback_query] Failed to send error message to user:', sendErr);
      }
    }
  }
}
