// handlers/message.js
// Dispatches incoming Telegram 'message' updates to lib/router.js with top-level try/catch error safety.

import { api } from 'sdk';
import { handleMessageUpdate } from '../lib/router.js';

export default async function (message, ctx) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;

  try {
    await handleMessageUpdate(message, ctx);
  } catch (err) {
    console.error(`[handler:message] Unexpected error for user ${userId ?? 'unknown'}:`, err);
    if (chatId) {
      try {
        await api.sendMessage({
          chat_id: chatId,
          text: '⚠️ An unexpected error occurred. Please try again.',
        });
      } catch (sendErr) {
        console.error('[handler:message] Failed to send error message to user:', sendErr);
      }
    }
  }
}
