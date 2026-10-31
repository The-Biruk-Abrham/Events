// lib/locales/en.js
// English strings for Addis Ababa Science and Technology University (AASTU) Events Hub

export default {
  // Common & Navigation
  'common.university_name': 'Addis Ababa Science and Technology University (AASTU)',
  'common.bot_name': 'AASTU Events Hub',
  'common.back': '🔙 Back',
  'common.categories': '🔙 Categories',
  'common.main_menu': '🏠 Main Menu',
  'common.cancel': '❌ Cancel',
  'common.cancelled': '❌ Action cancelled. Returning to main menu.',
  'common.access_denied': '⛔ Access Denied',
  'common.error_occurred': '⚠️ An unexpected error occurred. Please try again.',
  'common.not_found': 'Event or resource not found.',
  'common.prev': '◀️ Prev',
  'common.next': 'Next ▶️',
  'common.page_info': ({ current, total }) => `${current} / ${total}`,
  'common.page_footer': ({ page, total }) => `\n\n_Page ${page} of ${total}_`,

  // /whoami and /chatid commands
  'command.whoami': ({ userId, username }) => `👤 *Your Telegram Profile:*\n• User ID: \`${userId}\`${username ? `\n• Username: @${username}` : ''}`,
  'command.chatid': ({ chatId, chatType, chatTitle }) => `📍 *Current Chat Information:*\n• Chat ID: \`${chatId}\`\n• Type: \`${chatType}\`${chatTitle ? `\n• Title: *${chatTitle}*` : ''}`,
  'command.setup_success': '✅ Bot commands menu successfully configured via Telegram Bot API!',

  // Start & Help
  'start.welcome': ({ name, officerLines, ownerLines }) =>
    `👋 *Welcome to Addis Ababa Science and Technology University (AASTU) Events Hub${name ? `, ${name}` : ''}!* 🎓\n\n` +
    'Your single source of truth for all campus activities, club events, workshops, and sports at AASTU.\n\n' +
    '📌 *Available Commands:*\n' +
    '• `/today` — View events happening today\n' +
    '• `/week` — View the 7-day schedule grouped by day\n' +
    '• `/events` — Browse events by category with inline picker\n' +
    (officerLines ? `${officerLines}` : '') +
    '• `/cancel` — Cancel any active action and return here\n' +
    '• `/whoami` — Check your numeric Telegram ID\n' +
    '• `/chatid` — Check current chat ID\n' +
    '• `/help` — Show this guide and command list\n\n' +
    (ownerLines ? `${ownerLines}` : '') +
    'Tap a button below to get started immediately:',
  
  'start.officer_command_line': '• `/submit` — Submit a new club event (verified club representatives only)\n',
  'start.owner_commands':
    '👑 *Owner Commands:*\n' +
    '• `/add_club` — Register a new university club\n' +
    '• `/add_club_admin` — Add a verified club representative\n' +
    '• `/remove_club_admin` — Remove a club representative\n' +
    '• `/officers` — View all verified club representatives\n' +
    '• `/seed` — Seed development sample data\n' +
    '• `/setup` — Register bot menu commands\n\n',

  // Buttons on Start Keyboard
  'btn.today': "☀️ Today's Events",
  'btn.week': '🗓️ This Week',
  'btn.categories': '🏷️ Browse by Category',
  'btn.submit': '📝 Submit Post',
  'btn.add_club_admin': '➕ Add Club Admin',
  'btn.remove_club_admin': '➖ Remove Club Admin',
  'btn.register_club': '🏛️ Register New Club',

  // Browsing Events
  'events.today_empty': ({ todayDate }) =>
    `☀️ *Today at AASTU (${todayDate})*\n\nNo events scheduled for today.\nCheck out upcoming events with \`/week\` or browse by \`/events\`!`,
  'events.today_header': ({ todayDate, count }) =>
    `☀️ *Today at AASTU (${todayDate})*\n_${count} event${count === 1 ? '' : 's'} scheduled_\n────────────────────────────\n\n`,
  'events.week_empty':
    '🗓️ *This Week at AASTU*\n\nNo events scheduled for this week yet.\nStay tuned for new club announcements!',
  'events.week_header': ({ count }) =>
    `🗓️ *This Week at AASTU (${count} Total)*\n────────────────────────────\n`,
  'events.category_picker_prompt':
    '🏷️ *Browse Events by Category*\n\nSelect a category below to explore campus activities:',
  'events.category_empty': ({ categoryName, emoji }) =>
    `${emoji} *${categoryName} Events*\n\nNo upcoming ${categoryName} events currently scheduled.\nTry another category with \`/events\`!`,
  'events.category_header': ({ categoryName, emoji, count }) =>
    `${emoji} *${categoryName} Events*\n_${count} upcoming event${count === 1 ? '' : 's'}_\n────────────────────────────\n\n`,

  // Idle Message Hints
  'idle.officer_forward_hint':
    '💡 *You forwarded a message!*\n\n' +
    'To submit an event to Addis Ababa Science and Technology University (AASTU) Events Hub, ' +
    'please tap the *📝 Submit Post* button below or use /submit.',
  'idle.regular_user_hint':
    '👋 *Welcome to Addis Ababa Science and Technology University (AASTU) Events Hub!*\n\n' +
    'Use /today, /week, or /events to browse upcoming events on campus.',

  // Submission Wizard
  'submit.access_restricted':
    '⚠️ *Access Restricted*\n\n' +
    'Only registered club representatives can submit events to Addis Ababa Science and Technology University (AASTU) Events Hub.\n\n' +
    'If you are a club officer, please contact the admin team to register your Telegram account as a verified representative.',
  'submit.intro':
    '📝 *Event Submission Wizard*\n\n' +
    'Forward an announcement post (with photo, video, or text) from your club channel, ' +
    'or send a photo/text directly to begin.\n\n' +
    'Or simply send a message with the event description now:',
  'submit.step_title':
    '✅ *Media & Announcement Captured!*\n\n' +
    '📝 *Step 1 of 5: Event Title*\n' +
    'Please enter a short Title for this event (e.g. _Robotics Workshop 2026_):',
  'submit.step_title_edit':
    '✏️ *Edit Title*\nPlease enter the updated event title:',
  'submit.title_required': 'Please enter a valid title:',
  'submit.step_club_picker':
    '🏛️ *Step 2 of 5: Host Club / Organization*\n' +
    'Select which of your verified clubs this event is for:',
  'submit.step_club_auto_selected': ({ clubName }) =>
    `🏛️ *Host Club:* ${clubName} _(Auto-selected as you are a verified officer)_\n\n` +
    '🏷️ *Step 3 of 5: Event Category*\n' +
    'Select an event category or choose ➕ Other:',
  'submit.step_custom_club_prompt':
    '🏛️ *Step 2 of 5: Custom Host Club / Organization*\n\n' +
    'Please type the name of your club or organization (max 50 characters):',
  'submit.custom_club_too_long': ({ length, max }) =>
    `❌ *Name is too long* (${length}/${max} characters).\n` +
    `Please keep custom club names under ${max} characters:\n\nType your club name again:`,
  'submit.step_category_prompt':
    '🏷️ *Step 3 of 5: Event Category*\n' +
    'Select an event category or choose ➕ Other:',
  'submit.step_custom_category_prompt':
    '🏷️ *Step 3 of 5: Custom Event Category*\n\n' +
    'Please type your custom category name (max 50 characters):',
  'submit.custom_category_too_long': ({ length, max }) =>
    `❌ *Category name too long* (${length}/${max} characters).\n` +
    `Please keep custom category names under ${max} characters:\n\nType your category name again:`,
  'submit.step_datetime_prompt':
    '📅 *Step 4 of 5: Event Date & Time*\n\n' +
    'Enter start date and time in `DD/MM/YYYY HH:MM` (24-hour clock):\n' +
    '_Example: 15/09/2026 14:30_',
  'submit.datetime_invalid':
    '❌ *Invalid format.* Please enter date and time exactly as `DD/MM/YYYY HH:MM` (24-hour clock):\n' +
    '_Example: 15/09/2026 14:30_',
  'submit.step_location_prompt':
    '📍 *Step 5 of 5: Event Venue / Location*\n' +
    'Enter event venue or location description:\n' +
    '_Example: Auditorium Hall B / Stadium / ICT 508_',
  'submit.location_required': 'Please enter a valid venue / location:',
  'submit.preview_header': '🔍 *SUBMISSION PREVIEW*\n────────────────────────────',
  'submit.preview_direct_note': '\n⚡ *This will be published immediately to the channel (you are an admin/owner).*',
  'submit.preview_review_note': '\n_Check the details above. Tap any button below to edit a field, or Confirm to submit:_',
  'submit.confirm_button': '✅ Confirm & Submit',
  'submit.btn_edit_title': '✏️ Title',
  'submit.btn_edit_club': '🏛️ Club',
  'submit.btn_edit_category': '🏷️ Category',
  'submit.btn_edit_datetime': '📅 Date & Time',
  'submit.btn_edit_location': '📍 Location',
  'submit.btn_cancel': '❌ Cancel Submission',
  'submit.other_custom_club': '➕ Other (Type Custom Club)',
  'submit.other_custom_category': '➕ Other (Type Custom Category)',
  'submit.submitted_success': ({ title }) =>
    '🎉 *Event Submitted Successfully!*\n\n' +
    `Your event *${title}* has been submitted to the admin approval queue.\n` +
    'You will be notified once reviewed by the moderation team.',
  'submit.direct_published_success': ({ title }) =>
    '⚡ *Event Published Directly!*\n\n' +
    `Your event *${title}* has been published immediately to the public channel.`,
  'submit.admin_log_direct': ({ title, author }) =>
    `📢 Event *${title}* posted directly by ${author}.`,
  'submit.session_timeout':
    '⏳ *Submission Session Timed Out*\n\n' +
    'Your previous submission session expired after 1 hour of inactivity.\n' +
    'Use /submit to begin a new event submission.',

  // Admin Review & Approval
  'admin.new_pending_header': '🔔 *NEW EVENT PENDING APPROVAL*\n────────────────────────────',
  'admin.approve_btn': '✅ Approve',
  'admin.reject_btn': '❌ Reject',
  'admin.edit_btn': '✏️ Edit Fields',
  'admin.approved_card': ({ adminName, channelInfo, title, club, time, location }) =>
    `✅ *APPROVED by ${adminName}*${channelInfo}\n\n` +
    `📌 *Event:* ${title}\n` +
    `🏛️ *Club:* ${club}\n` +
    `📅 *Time:* ${time}\n` +
    `📍 *Venue:* ${location}`,
  'admin.rejected_card': ({ adminName, title, club }) =>
    `❌ *REJECTED by ${adminName}*\n\n` +
    `📌 *Event:* ${title}\n` +
    `🏛️ *Club:* ${club}`,
  'admin.already_processed': 'ℹ️ This submission has already been reviewed.',
  'admin.submitter_approved_dm': ({ title }) =>
    '🎉 *Great News! Your Event is Approved!* 📢\n\n' +
    `Your event *${title}* has been approved and published to the university channel.`,
  'admin.submitter_rejected_dm': ({ title }) =>
    '⚠️ *Event Submission Update*\n\n' +
    `Your submission for *${title}* was not approved by the moderation team.`,
  'admin.broadcast_failed_dm': ({ title }) =>
    `⚠️ Your event *${title}* was approved, but an issue occurred while broadcasting it to the channel. ` +
    'The admin team has been alerted to retry posting.',
  'admin.broadcast_failed_alert': ({ title, error }) =>
    `🚨 *Channel Broadcast Failed!* 🚨\n\nEvent: *${title}*\nError: \`${error}\`\nPlease check that the bot is an Administrator in the channel. Tap Retry once resolved:`,
  'admin.retry_broadcast_btn': '🔄 Retry Channel Broadcast',
  'admin.retry_success': '✅ Successfully broadcasted to the public channel!',
  'admin.retry_failed': ({ error }) => `❌ Retry failed: ${error}`,

  // Admin Edit In-Place
  'admin.edit_menu_title': '✏️ *Admin Edit Fields*\nChoose a field to update:',
  'admin.edit_field_title_btn': '✏️ Edit Title',
  'admin.edit_field_date_btn': '📅 Edit Date/Time',
  'admin.edit_field_loc_btn': '📍 Edit Location',
  'admin.edit_field_cat_btn': '🏷️ Edit Category',
  'admin.edit_field_club_btn': '🏛️ Edit Club',
  'admin.edit_field_done_btn': '🔙 Done / Back',
  'admin.edit_input_prompt': ({ fieldName }) =>
    `✏️ Enter new value for *${fieldName}* (or send /cancel):`,
  'admin.edit_updated_success': ({ fieldName }) =>
    `✅ Updated *${fieldName}* successfully!`,

  // Owner Officer & Club Management
  'owner.add_admin_step1':
    '👑 *Owner Portal — Add Club Admin*\n\n' +
    '🏛️ *Step 1:* Select the club you want to add a verified representative for:',
  'owner.add_admin_step2': ({ clubName }) =>
    `🏛️ *Selected Club:* **${clubName}**\n\n` +
    '👤 *Step 2: Add Representative*\n' +
    'Please provide the representative\'s Telegram account:\n\n' +
    '1️⃣ *Forward a message* from that person to this chat _(Recommended & Easiest)_, or\n' +
    '2️⃣ *Type their numeric Telegram ID* directly (e.g. `123456789`).\n\n' +
    '_Send /cancel anytime to exit._',
  'owner.unidentifiable_forward':
    '⚠️ This forward doesn\'t include the sender\'s account info (it may be from a channel, ' +
    'or the sender has forward privacy on). Please ask them to send you a direct message ' +
    'you can forward instead, or type their numeric Telegram ID manually.',
  'owner.officer_added_success': ({ clubName, officerId, officerDisplay, count, officersList }) =>
    '✅ *Verified Club Representative Added!*\n\n' +
    `🏛️ *Club:* ${clubName}\n` +
    `👤 *New Officer:* \`${officerId}\` (${officerDisplay})\n` +
    `👥 *All Verified Officers (${count}):* ${officersList}\n\n` +
    'This user can now submit events for this club via `/submit` or by forwarding posts to the bot.',
  'owner.remove_admin_step1':
    '👑 *Owner Portal — Remove Club Admin*\n\n' +
    '🏛️ *Step 1:* Select the club you want to remove a representative from:',
  'owner.remove_admin_no_officers': ({ clubName }) =>
    `ℹ️ *${clubName}* currently has no registered verified representatives.`,
  'owner.remove_admin_list': ({ clubName, count }) =>
    `🏛️ *Selected Club:* **${clubName}**\n\n` +
    `👥 *Current Representatives (${count}):*\n` +
    'Tap a button below to remove an officer, or forward a message / type an ID:',
  'owner.officer_removed_success': ({ clubName, officerId, count, officersList }) =>
    '✅ *Verified Club Representative Removed!*\n\n' +
    `🏛️ *Club:* ${clubName}\n` +
    `👤 *Removed Officer ID:* \`${officerId}\`\n` +
    `👥 *Remaining Officers (${count}):* ${officersList}`,
  'owner.register_club_step1':
    '👑 *Owner Portal — Register New Club*\n\n' +
    '🏛️ *Step 1 of 2: Club Name*\n' +
    'Please type the official name of the university club or organization:\n\n' +
    '_Example: AASTU IEEE Student Branch_',
  'owner.club_name_too_long': '❌ Club name is too long (max 200 characters). Please type a shorter name:',
  'owner.register_club_step2': ({ clubName }) =>
    `🏛️ *Club Name:* **${clubName}**\n\n` +
    '🏷️ *Step 2 of 2: Club Genre / Category Type*\n' +
    'Select a genre below or type a custom genre (e.g. _Robotics, Environmental, Chess_):',
  'owner.club_registered_success': ({ clubName, genre, clubId }) =>
    '🎉 *New Club Successfully Registered!*\n\n' +
    `🏛️ *Club Name:* **${clubName}**\n` +
    `🏷️ *Genre / Type:* \`${genre}\`\n` +
    `🆔 *Club ID:* \`${clubId}\`\n\n` +
    '✨ This club is now listed in the system. You can assign verified representatives to it anytime using `➕ Add Club Admin`.',
  'owner.all_officers_title': '👥 *Registered Clubs & Verified Representatives:*',
  'owner.no_clubs': '⚠️ No registered clubs found in database.',
};
