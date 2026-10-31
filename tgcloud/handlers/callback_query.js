// handlers/callback_query.js
// Dispatches incoming Telegram 'callback_query' updates to lib/router.js

import { handleCallbackQueryUpdate } from '../lib/router.js';

export default async function (callbackQuery, ctx) {
  await handleCallbackQueryUpdate(callbackQuery, ctx);
}
