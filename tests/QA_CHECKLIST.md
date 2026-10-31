# Manual QA Checklist: AASTU Events Hub Serverless Bot

This checklist guides manual end-to-end verification of all bot behaviors, role gates, and flows.

---

## 1. Setup & Discovery Diagnostics
- [ ] Send `/whoami` in a private chat with the bot.
  - Verify bot returns your numeric Telegram ID and handle.
- [ ] Send `/chatid` in your private chat, Admin Group, and Public Channel.
  - Verify chat ID formats (e.g. private: `123456789`, supergroups/channels: `-100...`).
- [ ] Fill in `tgcloud/lib/config.js` with your `OWNER_ID`, `ADMIN_GROUP_ID`, and `CHANNEL_ID`.
- [ ] Push code (`npx tgcloud push`) and apply schema migrations (`npx tgcloud migrate`).
- [ ] Run `/setup` as owner:
  - Verify Telegram menu commands appear in the bot chat menu.
- [ ] Run `/seed` as owner:
  - Verify categories, clubs, and sample events are inserted.
  - Run `/seed` a second time; verify no errors or duplicate entries occur.

---

## 2. Public Student User Experience
- [ ] Send `/start`:
  - Verify welcome greeting to "Addis Ababa Science and Technology University (AASTU) Events Hub".
  - Verify [☀️ Today's Events], [🗓️ This Week], and [🏷️ Browse by Category] buttons appear.
  - Verify [📝 Submit Post], [➕ Add Club Admin], and [🏛️ Register New Club] DO NOT appear for non-representatives.
- [ ] Tap [☀️ Today's Events] or run `/today`:
  - Verify approved events for today appear with category emojis, 12-hour AM/PM times, venue, and club.
  - Verify pagination (`◀️ Prev`, `Next ▶️`, `1 / N`) if > 3 events.
  - Verify `🏠 Main Menu` returns to the main menu.
- [ ] Tap [🗓️ This Week] or run `/week`:
  - Verify events grouped by day headers (e.g. `📅 Saturday, Sep 05 (1)`).
- [ ] Tap [🏷️ Browse by Category] or run `/events`:
  - Verify 2-column grid of categories.
  - Tap a category (e.g. `🎓 Academic`): verify events for that category display with pagination and `🔙 Categories`.
- [ ] Send a forwarded message or random text while idle:
  - Verify polite menu hint greeting appears, and NO submission wizard is started.
- [ ] Send `/submit`:
  - Verify "⚠️ Access Restricted" message explaining only verified officers can submit.

---

## 3. Club Representative Submission Flow
- [ ] As Owner, register the representative: `/add_club_admin` -> select club -> forward representative message or type ID.
- [ ] From Representative account, run `/start`:
  - Verify [📝 Submit Post] button is now visible.
- [ ] Tap [📝 Submit Post] or run `/submit`:
  - Verify prompt: "Forward an announcement post... or send photo/text directly".
- [ ] **Forward an announcement photo** from a club channel:
  - Verify media is captured and Step 1 asks for Title.
- [ ] Type Title:
  - If officer represents only 1 club: verify club is auto-selected and wizard skips directly to Category.
  - If officer represents > 1 club: verify verified club picker appears.
- [ ] Category Step:
  - Select a preset category, or choose `➕ Other` and enter custom category name (<= 50 chars).
  - Verify > 50 characters is rejected with clear error.
- [ ] Date & Time Step:
  - Enter invalid format (e.g. `2026-09-15`): verify rejected.
  - Enter `DD/MM/YYYY HH:MM` (e.g. `15/09/2026 14:30`): verify accepted.
- [ ] Venue / Location Step:
  - Enter venue string (e.g. `ICT 508`).
- [ ] Preview Screen (`STATE_CONFIRM`):
  - Verify preview displays Title, Host Club, Category, Date/Time with explicit AM/PM confirmation (`02:30 PM (14:30 Addis Ababa time)`), Venue, Media status, and original text snippet.
  - Tap `✏️ Title`, update title, verify returns directly to Preview Screen.
  - Tap `📅 Date & Time`, update date/time, verify returns directly to Preview Screen.
  - Tap `❌ Cancel Submission`: verify session cancelled cleanly.
- [ ] Repeat and tap `✅ Confirm & Submit`:
  - Verify representative receives confirmation: "🎉 Event Submitted Successfully! ... submitted to admin approval queue."
  - Verify Admin Group receives review card with photo, structured fields, and [✅ Approve], [❌ Reject], [✏️ Edit Fields] buttons.

---

## 4. Admin Group Approval & Moderation
- [ ] Tap [✅ Approve]:
  - Verify card in Admin Group edits in place to `✅ APPROVED by <AdminName> (Channel Post #<id>)`.
  - Verify event is immediately broadcasted to the Public Channel.
  - Verify Submitter receives DM: "🎉 Great News! Your Event is Approved!".
  - Double-tap [✅ Approve]: verify no duplicate broadcast occurs and alert says already processed.
- [ ] Submit another event and tap [❌ Reject]:
  - Verify card edits in place to `❌ REJECTED by <AdminName>`.
  - Verify submitter receives update DM that event was not approved.
- [ ] Submit an event and tap [✏️ Edit Fields]:
  - Verify field selection menu appears (`Edit Title`, `Edit Date/Time`, `Edit Location`, `Edit Category`, `Edit Club`, `Done`).
  - Choose `Edit Title`, type new title: verify updated successfully.
  - Tap `Done`: verify review card reflects new title.

---

## 5. Direct Publish (Owner & Admins)
- [ ] From Owner or Admin account, tap [📝 Submit Post] or `/submit`:
  - Verify preview displays: `⚡ This will be published immediately to the channel (you are an admin/owner).`
- [ ] Tap `✅ Confirm & Submit`:
  - Verify message confirms: `⚡ Event Published Directly!`.
  - Verify event appears immediately in Public Channel.
  - Verify Admin Group receives a one-line info log: `📢 Event *Title* posted directly by Owner/Admin.` without approval buttons.

---

## 6. Long Captions & Splitting Broadcast Test
- [ ] Submit an announcement with 900-character caption:
  - Verify published as a single media post with caption.
- [ ] Submit an announcement with 1024-character caption:
  - Verify published as a single media post with caption.
- [ ] Submit a forwarded post with 1025+ character caption:
  - Verify photo/media sent with empty/short caption and full original text sent as a reply message.
  - Verify both message IDs are stored.
- [ ] If bot token lacks channel admin permission during approval:
  - Verify submitter is informed of broadcast issue.
  - Verify Admin Group receives alert with `🔄 Retry Channel Broadcast` button.
  - Grant bot admin permission in channel and tap Retry: verify channel broadcast succeeds.

---

## 7. Owner Club & Officer Management
- [ ] Run `/add_club` or tap [🏛️ Register New Club]:
  - Enter name (e.g. `AASTU Coding Society`).
  - Select genre (e.g. `Technology`).
  - Verify club created with ID.
- [ ] Run `/add_club_admin` or tap [➕ Add Club Admin]:
  - Select club.
  - Forward a message from a candidate representative.
  - Verify candidate registered as verified officer.
- [ ] Run `/remove_club_admin` or tap [➖ Remove Club Admin]:
  - Select club.
  - Tap representative to remove: verify removed.
- [ ] Run `/officers`:
  - Verify all clubs and verified officer lists are printed.
