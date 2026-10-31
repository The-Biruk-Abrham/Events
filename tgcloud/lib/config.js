// Telegram Serverless Configuration for Addis Ababa Science and Technology University (AASTU) Events Hub
// Replace these placeholders with your actual Telegram IDs before production deployment.
// Tip: Use /whoami in DM to get your user ID, and /chatid in your group/channel to get their chat IDs.

export const OWNER_ID = 0; // PLACEHOLDER: Replace with numeric Telegram User ID of the bot owner (e.g. 123456789)
export const ADMIN_GROUP_ID = 0; // PLACEHOLDER: Replace with numeric Chat ID of the Admin Review Group (e.g. -1001234567890)
export const CHANNEL_ID = '@aastu_events'; // PLACEHOLDER: Replace with channel username (e.g. '@aastu_events') or channel ID (e.g. -1009876543210)

export const UNIVERSITY_NAME = 'Addis Ababa Science and Technology University (AASTU)';
export const BOT_NAME = 'AASTU Events Hub';

// Session duration: 1 hour of inactivity
export const SESSION_TTL_SECONDS = 3600;

// Maximum allowed length for custom club and custom category
export const MAX_CUSTOM_NAME_LENGTH = 50;

// Telegram limits
export const TELEGRAM_MEDIA_CAPTION_LIMIT = 1024;
export const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;
