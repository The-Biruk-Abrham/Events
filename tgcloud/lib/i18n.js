// lib/i18n.js
// Internationalization module for AASTU Events Hub
// Uses JS modules without filesystem access. Supports parameter interpolation and functional templates.

import en from './locales/en.js';

const locales = {
  en,
};

/**
 * Retrieves the preferred language for a user.
 * Currently defaults to 'en' as requested.
 */
export function getUserLang(telegramId) {
  // Can be extended with per-user preference in future phases
  return 'en';
}

/**
 * Translates a given key with optional parameters and fallback to English.
 * Throws a clear error for unknown keys.
 * Does NOT translate user-submitted content.
 */
export function t(key, lang = 'en', params = {}) {
  const currentDict = locales[lang] || locales.en;
  let entry = currentDict[key];

  // Fallback to English if not found in target locale
  if (entry === undefined && lang !== 'en') {
    entry = locales.en[key];
  }

  if (entry === undefined) {
    throw new Error(`[i18n] Unknown translation key: "${key}" (lang: ${lang})`);
  }

  if (typeof entry === 'function') {
    return entry(params);
  }

  if (typeof entry === 'string') {
    if (!params || Object.keys(params).length === 0) {
      return entry;
    }
    // Interpolate {paramName}
    return entry.replace(/\{(\w+)\}/g, (match, paramName) => {
      if (params[paramName] !== undefined && params[paramName] !== null) {
        return String(params[paramName]);
      }
      return match;
    });
  }

  return String(entry);
}
