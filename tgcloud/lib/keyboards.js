// lib/keyboards.js
// Inline keyboard builders for Telegram Bot.
// Designed with compact callback_data (< 64 bytes).

import { t } from './i18n.js';
import { getCategoryEmoji } from './formatters.js';

/**
 * Builds quick action keyboard for /start.
 */
export function buildStartKeyboard({ isOwner = false, isOfficer = false, lang = 'en' } = {}) {
  const keyboard = [
    [
      { text: t('btn.today', lang), callback_data: 'btn:today' },
      { text: t('btn.week', lang), callback_data: 'btn:week' },
    ],
    [
      { text: t('btn.categories', lang), callback_data: 'btn:categories' },
    ],
  ];

  if (isOwner || isOfficer) {
    keyboard.push([
      { text: t('btn.submit', lang), callback_data: 'btn:submit' },
    ]);
  }

  if (isOwner) {
    keyboard.push([
      { text: t('btn.add_club_admin', lang), callback_data: 'own:add_adm' },
      { text: t('btn.remove_club_admin', lang), callback_data: 'own:rm_adm' },
    ]);
    keyboard.push([
      { text: t('btn.register_club', lang), callback_data: 'own:cre_clb' },
    ]);
  }

  return { inline_keyboard: keyboard };
}

/**
 * Builds pagination keyboard [◀️ Prev] [Page X/Y] [Next ▶️] with optional Back / Main Menu.
 */
export function buildPaginationKeyboard({
  currentPage,
  totalPages,
  prefix,
  backCallback = null,
  showMainMenu = false,
  lang = 'en',
}) {
  const keyboard = [];

  if (totalPages > 1) {
    const pageRow = [];
    if (currentPage > 1) {
      pageRow.push({ text: t('common.prev', lang), callback_data: `${prefix}:${currentPage - 1}` });
    } else {
      pageRow.push({ text: '⏹️', callback_data: 'noop' });
    }

    pageRow.push({ text: t('common.page_info', lang, { current: currentPage, total: totalPages }), callback_data: 'noop' });

    if (currentPage < totalPages) {
      pageRow.push({ text: t('common.next', lang), callback_data: `${prefix}:${currentPage + 1}` });
    } else {
      pageRow.push({ text: '⏹️', callback_data: 'noop' });
    }

    keyboard.push(pageRow);
  }

  const navRow = [];
  if (backCallback) {
    const label = backCallback === 'btn:categories' ? t('common.categories', lang) : t('common.back', lang);
    navRow.push({ text: label, callback_data: backCallback });
  }
  if (showMainMenu) {
    navRow.push({ text: t('common.main_menu', lang), callback_data: 'btn:main_menu' });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  return keyboard.length > 0 ? { inline_keyboard: keyboard } : null;
}

/**
 * Builds 2-column grid of categories with Back to Main Menu button.
 */
export function buildCategoriesKeyboard(categories, lang = 'en') {
  const keyboard = [];
  let row = [];

  for (const cat of categories) {
    const emoji = getCategoryEmoji(cat.name);
    row.push({ text: `${emoji} ${cat.name}`, callback_data: `cat:sel:${cat.id}` });
    if (row.length === 2) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    keyboard.push(row);
  }

  keyboard.push([
    { text: t('common.main_menu', lang), callback_data: 'btn:main_menu' },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Builds submission preview confirmation keyboard with edit buttons.
 */
export function buildSubmissionConfirmKeyboard(lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: t('submit.confirm_button', lang), callback_data: 'sub:c' },
      ],
      [
        { text: t('submit.btn_edit_title', lang), callback_data: 'sub:e:title' },
        { text: t('submit.btn_edit_club', lang), callback_data: 'sub:e:club' },
        { text: t('submit.btn_edit_category', lang), callback_data: 'sub:e:cat' },
      ],
      [
        { text: t('submit.btn_edit_datetime', lang), callback_data: 'sub:e:dt' },
        { text: t('submit.btn_edit_location', lang), callback_data: 'sub:e:loc' },
      ],
      [
        { text: t('submit.btn_cancel', lang), callback_data: 'sub:x' },
      ],
    ],
  };
}

/**
 * Builds club picker during submission.
 */
export function buildClubPickerKeyboard(clubs, includeOther = true, lang = 'en') {
  const keyboard = [];
  for (const club of clubs) {
    keyboard.push([
      { text: `🏛️ ${club.name}`, callback_data: `sub:clb:${club.id}` },
    ]);
  }
  if (includeOther) {
    keyboard.push([
      { text: t('submit.other_custom_club', lang), callback_data: 'sub:clb:oth' },
    ]);
  }
  keyboard.push([
    { text: t('submit.btn_cancel', lang), callback_data: 'sub:x' },
  ]);
  return { inline_keyboard: keyboard };
}

/**
 * Builds category picker during submission.
 */
export function buildSubmissionCategoryKeyboard(categories, lang = 'en') {
  const keyboard = [];
  let row = [];

  for (const cat of categories) {
    const emoji = getCategoryEmoji(cat.name);
    row.push({ text: `${emoji} ${cat.name}`, callback_data: `sub:cat:${cat.id}` });
    if (row.length === 2) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    keyboard.push(row);
  }

  keyboard.push([
    { text: t('submit.other_custom_category', lang), callback_data: 'sub:cat:oth' },
  ]);
  keyboard.push([
    { text: t('submit.btn_cancel', lang), callback_data: 'sub:x' },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Builds approval keyboard shown on the Admin Group card.
 */
export function buildAdminApprovalKeyboard(eventId, lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: t('admin.approve_btn', lang), callback_data: `adm:app:${eventId}` },
        { text: t('admin.reject_btn', lang), callback_data: `adm:rej:${eventId}` },
      ],
      [
        { text: t('admin.edit_btn', lang), callback_data: `adm:edt:${eventId}` },
      ],
    ],
  };
}

/**
 * Builds field selection keyboard for in-place admin edits.
 */
export function buildAdminEditFieldKeyboard(eventId, lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: t('admin.edit_field_title_btn', lang), callback_data: `adm:ef:t:${eventId}` },
        { text: t('admin.edit_field_date_btn', lang), callback_data: `adm:ef:d:${eventId}` },
      ],
      [
        { text: t('admin.edit_field_loc_btn', lang), callback_data: `adm:ef:l:${eventId}` },
        { text: t('admin.edit_field_cat_btn', lang), callback_data: `adm:ef:c:${eventId}` },
      ],
      [
        { text: t('admin.edit_field_club_btn', lang), callback_data: `adm:ef:cl:${eventId}` },
        { text: t('admin.edit_field_done_btn', lang), callback_data: `adm:ef:dn:${eventId}` },
      ],
    ],
  };
}

/**
 * Builds club selection keyboard for owner to add or remove officers.
 */
export function buildOwnerClubPickerKeyboard(clubs, action = 'add', lang = 'en') {
  const keyboard = [];
  const prefix = action === 'add' ? 'own:ca' : 'own:cr';

  for (const club of clubs) {
    const count = club.officersCount || 0;
    const countLabel = action === 'add' ? '' : ` (${count} reps)`;
    keyboard.push([
      { text: `🏛️ ${club.name}${countLabel}`, callback_data: `${prefix}:${club.id}` },
    ]);
  }

  keyboard.push([
    { text: t('common.cancel', lang), callback_data: 'own:x' },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Builds list of officers with one-tap removal buttons.
 */
export function buildOwnerOfficersListKeyboard(clubId, officers, lang = 'en') {
  const keyboard = [];
  for (const off of officers) {
    keyboard.push([
      { text: `🗑️ Remove ID: ${off}`, callback_data: `own:rmo:${clubId}:${off}` },
    ]);
  }
  keyboard.push([
    { text: t('common.cancel', lang), callback_data: 'own:x' },
  ]);
  return { inline_keyboard: keyboard };
}

/**
 * Builds genre selection keyboard for registering a new club.
 */
export function buildClubGenreKeyboard(lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: '💻 Technology', callback_data: 'own:g:Technology' },
        { text: '🎓 Academic', callback_data: 'own:g:Academic' },
      ],
      [
        { text: '⚽ Sports', callback_data: 'own:g:Sports' },
        { text: '🎭 Arts & Culture', callback_data: 'own:g:Arts & Culture' },
      ],
      [
        { text: '🤝 Social & Community', callback_data: 'own:g:Social & Community' },
        { text: '📌 General', callback_data: 'own:g:General' },
      ],
      [
        { text: t('common.cancel', lang), callback_data: 'own:x' },
      ],
    ],
  };
}

/**
 * Retry button keyboard when channel broadcast fails.
 */
export function buildRetryBroadcastKeyboard(eventId, lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: t('admin.retry_broadcast_btn', lang), callback_data: `adm:retry:${eventId}` },
      ],
    ],
  };
}
