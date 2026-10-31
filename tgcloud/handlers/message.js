// handlers/message.js
// Dispatches incoming Telegram 'message' updates to lib/router.js

import { handleMessageUpdate } from '../lib/router.js';

export default async function (message, ctx) {
  await handleMessageUpdate(message, ctx);
}
