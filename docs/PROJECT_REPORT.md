# Comprehensive Technical Project Report: AASTU Events Hub Serverless Port

**Project**: Addis Ababa Science and Technology University (AASTU) Events Hub  
**Target Platform**: Telegram Serverless V8 Isolate (`@tgcloud`)  
**Source Platform**: Django 5.x + PostgreSQL/SQLite + python-telegram-bot  
**Language**: Plain JavaScript (ES Modules, Node 18+)  

---

## 1. Executive Summary

This report documents the architectural port of the **AASTU Events Hub** Telegram bot from a monolithic Django/Python background service to a native **Telegram Serverless** application running in V8 isolates. The goal of complete behavioral parity was achieved without creating background dependencies, VPS maintenance requirements, or third-party package runtime overhead.

All core operational capabilities have been ported:
1. **Public Event Discovery**: Fast querying by `/today`, `/week`, and `/events <category>` with edit-in-place pagination and category emoji branding.
2. **Multi-Step Submission Wizard**: 10 distinct conversational states supporting both forwarded announcements (capturing raw media untouched) and direct manual entries.
3. **Representative Gating & Officer Management**: Strict verification ensuring only authorized representatives can submit events, while the owner can register clubs and assign/remove representatives.
4. **Moderation Pipeline & Atomic Publication**: Interactive cards in the Admin Group with atomic `UPDATE` queries preventing double-approval race conditions.
5. **Direct Publication for Admins**: Submissions by admins and owner bypass the queue with immediate channel broadcast, a direct publish notice in the preview, and an audit log in the Admin Group.
6. **Robust Channel Broadcast Engine**: High-fidelity caption splitting adhering to Telegram's 1,024-character media and 4,096-character text limits without text loss.

---

## 2. Platform Architecture & Constraints

Telegram Serverless (`@tgcloud`) executes update handlers inside isolated V8 runtime environments. Key platform characteristics and design decisions include:

- **Zero NPM Runtime Dependencies**: The `tgcloud/` directory contains no `package.json` or external packages. All database, bot API, and HTTP interactions use the native `'sdk'` and `'sdk/db'` imports.
- **Stateless Execution with Persistent Sessions**: Because runtime memory is ephemeral, the multi-step conversation wizard is backed by a SQLite `sessions` table with a 1-hour inactivity timeout.
- **No Foreign Keys**: In accordance with platform specifications, `.references()` and table-level `foreignKey()` constraints were eliminated; relationship integrity is enforced in service modules.
- **Decoupled Deployment and Migration**: Pushing code (`npx tgcloud push`) deploys handlers and libraries without modifying database schema. Schema updates are applied explicitly via `npx tgcloud migrate`.
- **Callback Data Compression**: To respect Telegram's strict 64-byte `callback_data` ceiling, all button callbacks use compact abbreviations (e.g. `sub:clb:<id>`, `adm:app:<id>`).

---

## 3. Database Schema

Defined in `tgcloud/schema.js` using the `@tgcloud` SQLite DDL DSL:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│              clubs              │       │          club_officers          │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id: integer PK autoIncrement    │◄──────│ id: integer PK autoIncrement    │
│ name: text UNIQUE NOT NULL      │       │ club_id: integer NOT NULL (idx) │
│ category_type: text             │       │ telegram_id: integer NOT NULL   │
│ contact_info: text              │       │ created_at: integer NOT NULL    │
│ created_at, updated_at: integer │       └─────────────────────────────────┘
└─────────────────────────────────┘
                 ▲
                 │ (logical link)
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│             events              │       │           categories            │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id: integer PK autoIncrement    │       │ id: integer PK autoIncrement    │
│ club_id: integer (nullable)     │       │ name: text UNIQUE NOT NULL      │
│ custom_club: text (max 50)      │       │ description: text               │
│ category_id: integer (nullable) ├──────►│ created_at: integer NOT NULL    │
│ custom_category: text (max 50)  │       └─────────────────────────────────┘
│ title: text NOT NULL            │
│ start_datetime: integer (idx)   │       ┌─────────────────────────────────┐
│ end_datetime: integer           │       │             admins              │
│ location: text NOT NULL         │       ├─────────────────────────────────┤
│ raw_content: json               │       │ id: integer PK autoIncrement    │
│ status: text (pending/approved/ │       │ telegram_id: integer UNIQUE (idx│
│         rejected/cancelled)     │       │ name: text                      │
│ recurring: boolean              │       │ permission_level: text          │
│ recurrence_pattern: text        │       │ is_active: boolean              │
│ channel_message_id: integer     │       │ created_at: integer NOT NULL    │
│ submitted_at: integer NOT NULL  │       └─────────────────────────────────┘
│ approved_at: integer            │
│ approved_by: text               │       ┌─────────────────────────────────┐
└─────────────────────────────────┘       │            sessions             │
                                          ├─────────────────────────────────┤
                                          │ user_id: integer PK             │
                                          │ state: text NOT NULL            │
                                          │ data: json                      │
                                          │ updated_at: integer NOT NULL    │
                                          └─────────────────────────────────┘
```

---

## 4. Roles and Permissions Matrix

All mutations route through `lib/services/` (`events.js`, `clubs.js`, `officers.js`, `admins.js`), ensuring permissions cannot be bypassed by incoming handlers.

| Role | Discovery (`/today`, `/week`, `/events`) | Submission (`/submit`, "📝 Submit Post") | Moderation (`Approve`, `Reject`, `Edit`) | Officer Mgmt (`Add/Remove Rep`) | Club Mgmt (`Register Club`) |
|---|---|---|---|---|---|
| **Public Student** | ✅ View approved events only | ❌ Access Restricted | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Club Representative** | ✅ View approved events only | ✅ Submit for verified clubs; routes to Admin Group queue | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Admin / Moderator** | ✅ Full access | ✅ Direct publish (bypasses approval queue) | ✅ Approve, reject, edit pending queue | ❌ Forbidden | ❌ Forbidden |
| **Bot Owner** | ✅ Full access | ✅ Direct publish for any club or custom club | ✅ Full moderation | ✅ Add / remove verified club officers | ✅ Register new clubs |

---

## 5. Time and Localization Architecture

### Hand-Rolled Addis Ababa Time (`lib/time.js`)
- Ethiopia observes East Africa Time (EAT), a fixed **`+03:00`** offset with no Daylight Saving Time.
- The time module avoids dependencies on `Intl` or external libraries by shifting unix timestamps by $+10,800$ seconds and extracting UTC calendar components (`d.getUTCFullYear()`, `d.getUTCHours()`, etc.).
- Input parsing strictly validates Gregorian 24-hour time format `DD/MM/YYYY HH:MM`, ensuring leap years and month day counts are validated.
- All preview cards present explicit AM/PM confirmations (e.g. `Saturday, September 05, 2026 at 02:30 PM (14:30 Addis Ababa time)`) to eliminate 12-hour/24-hour confusion.
- Midnight boundaries are calculated with second-level precision: events at `00:00:00` are included in today, while `23:59:59` of the prior day is excluded.

### Internationalization (`lib/i18n.js` + `lib/locales/en.js`)
- Every user-facing UI string, button label, and error prompt is routed through `t(key, lang, params)`.
- If an unknown key is queried, a descriptive runtime exception is thrown.
- Submitted user content (event titles, original captions, locations) is kept untouched and never translated.

---

## 6. Telegram Limits & Broadcast Resilience

### Caption and Message Splitting Rules:
1. **Forwarded Media with Caption $\le$ 1,024 Characters**: Broadcasted as a single photo/video message with original caption untouched.
2. **Forwarded Media with Caption $>$ 1,024 Characters**: Sent as media with minimal/no caption, followed immediately by the full untouched text as a reply to the media message. Both message IDs are persisted.
3. **Manual Submissions**: Formatted into an official announcement block.
4. **Text-Only Messages $>$ 4,096 Characters**: Split into 4,096-character chunks connected via reply threads.

### Broadcast Failure Handling:
If Telegram rejects a broadcast (e.g. bot permissions missing in channel):
1. The submitter is informed that the event was approved but broadcast is pending administrator intervention.
2. The Admin Group receives an alert card with an interactive `[🔄 Retry Channel Broadcast]` button.
3. Once permissions are restored, admins can tap Retry to publish without re-approving.

---

## 7. Scheduling & Cloud Limits Findings

Per project instructions, `docs/tgcloud-sdk.md` was thoroughly analyzed:
- **Scheduling / Cron**: The SDK reference has **no mention** of cron expressions, recurring background timers, or scheduled triggers.
- **Execution Timeouts**: No isolate execution limits, CPU caps, or memory limits are documented.
- **Upload Caps**: Bot API limits are explicitly noted (50 MB per file, 10 MB for photos, 20 MB download cap).
- **Architecture Impact**: Automated background digests, reminder alarms, and event expiry jobs were intentionally excluded from this port. No external scheduler workarounds were introduced.

---

## 8. Test Suite Verification

A comprehensive test suite of **41 automated tests** across 5 test suites was created in `tests/`:

1. `tests/time.test.js`: Validates +03:00 shifts, leap year handling, invalid inputs, AM/PM formatting, and exact midnight boundaries.
2. `tests/formatters.test.js`: Validates markdown escaping, category emojis, event cards, week groupings, untouched forwarded posts, and manual post formatting.
3. `tests/broadcast.test.js`: Validates 900, 1024, 1025, and 4100-character limits and chunk splitting.
4. `tests/auth_rules.test.js`: Validates role and capability checks for owners, active/inactive admins, club officers, and public students.
5. `tests/state_machine.test.js`: Validates payload extraction (photos, channel forwards), representative forward identification, 50-character custom limits, and preview rendering.

**Result**: All 41 tests passed (100% pass rate).
