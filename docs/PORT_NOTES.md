# Python to Telegram Serverless (JavaScript) Port Notes

This document provides a comprehensive technical mapping between the original Django/Python codebase (`legacy-python`) and the Telegram Serverless JavaScript runtime (`tgcloud`), detailing architecture changes, behavior mappings, and platform constraints.

---

## 1. Architectural & Technology Mapping

| Layer / Capability | Legacy Python Architecture | Serverless JS Architecture (`tgcloud`) | Rationale / Notes |
|---|---|---|---|
| **Runtime Environment** | Python 3.12, Django 5.x, `python-telegram-bot` long-polling process | Telegram Serverless V8 isolate (`@tgcloud`) | Eliminates long-running VPS/server processes; runs directly on Telegram's edge. |
| **Module System** | Python modules (`import bot...`) | Native ES Modules (`import ... from './module.js'`) | Mandatory `.js` extension in all relative imports per `@tgcloud` runtime. |
| **External Dependencies** | `pip` packages: `django`, `djangorestframework`, `python-telegram-bot`, `httpx` | **Zero NPM packages** in `tgcloud/`. Only `'sdk'`, `'sdk/db'`, and project modules | Runtime isolates don't load `node_modules`. Dev dependencies exist locally only for CLI & tests. |
| **Database** | PostgreSQL / SQLite with Django ORM migrations | Serverless SQLite with `@tgcloud` DDL schema descriptors (`sdk/db`) | Cloud SQLite managed by `@tgcloud`. Deploying code (`push`) and migrating schema (`migrate`) are decoupled. |
| **Foreign Keys** | Django ForeignKey relations with cascades | **No foreign keys** (`.references()` throws at declaration) | Foreign keys are disabled at platform level; application services enforce integrity in JS code. |
| **Officer Storage** | `Club.verified_officers` JSONField containing an array of user IDs | Normalized `club_officers` table (one row per club and officer telegram ID) | Eliminates concurrent JSON write race conditions and enables fast index-backed officer lookups. |
| **Timestamps** | Django `DateTimeField` with timezone awareness | Unix-second integer timestamps (`integer('...', { mode: 'number' })`) | Fast integer range comparisons; avoids ISO string parsing overhead in database queries. |
| **Timezone Logic** | `zoneinfo.ZoneInfo("Africa/Addis_Ababa")` | Hand-rolled fixed `+03:00` offset (`lib/time.js`) | Pure arithmetic without relying on `Intl` or timezone libraries. Ethiopia does not observe DST. |
| **State Machine** | PTB `ConversationHandler` with in-memory `user_data` | Persistent `sessions` table in SQLite with 1-hour expiration | In-memory state is lost between serverless isolate invocations; SQLite table guarantees persistence. |
| **Configuration** | `.env` file loaded via `python-dotenv` | `tgcloud/lib/config.js` constants with placeholders | Serverless runtime has no filesystem or environment variables (`process.env`) at execution time. |
| **Internationalization** | Hardcoded strings in python files | `lib/i18n.js` + `lib/locales/en.js` module dictionary | Every user-facing string routes through `t(key, lang, params)`. English fallback with strict unknown-key errors. |
| **Testing** | `unittest` / `django.test.TestCase` with mocks | Native `node --test` suite (`tests/*.test.js`) outside `tgcloud/` | Pure logic separated from SDK; runs blazingly fast without serverless runtime dependencies. |

---

## 2. Behavioral Parity & Key Improvements

### 2.1 State Machine & Session Isolation
- **Legacy Python**: PTB's `ConversationHandler` used in-memory process dictionaries (`context.user_data`), vulnerable to bot process restarts or server crashes.
- **Serverless JS**: Stored in the `sessions` table (`user_id`, `state`, `data`, `updated_at`). Sessions expire after **1 hour** of inactivity. When a session expires, the user is cleanly prompted that their session has timed out. `/cancel` works globally from any state to reset the session.

### 2.2 Atomic Approval & Race-Condition Safety
- **Legacy Python**: An admin clicking "Approve" fetched the event and updated it in separate steps, allowing duplicate approves on rapid double-taps.
- **Serverless JS**: `approveEvent` and `rejectEvent` execute atomic SQL updates:
  ```sql
  UPDATE events SET status = 'approved', approved_at = :now, approved_by = :adminId WHERE id = :id AND status = 'pending';
  ```
  If `rowsAffected === 0`, the service checks whether the event was already approved or rejected, throwing an `ALREADY_APPROVED` error and showing an alert instead of broadcasting a duplicate channel post.

### 2.3 Channel Broadcast & Telegram Length Limits
- **Forwarded Submissions**: Published with the original caption **completely untouched**. No extra headers, categories, or organizer lines are added to forwarded channel posts.
- **Manual Submissions**: Formatted into a complete announcement card containing Title, Organizer, Category, Date/Time, Location, Recurrence, and typed Description.
- **Strict Telegram Limits**:
  - **Media Captions**: Capped at 1,024 characters. If caption > 1,024 characters:
    - For forwarded submissions: sends media with no/minimal caption and the full original text as a reply message.
    - For manual submissions: sends media with the title header and full announcement as a reply message.
    - Both `channel_message_id` and `channel_extra_message_id` are stored to support future in-place edits.
  - **Text Messages**: Capped at 4,096 characters. Messages exceeding 4,096 characters are split into a main post and reply thread.
- **Broadcast Failure Resilience**: If Telegram rejects a channel broadcast (e.g. Bot was removed as channel admin), the bot:
  1. Alerts the submitter via DM.
  2. Sends an alert to the Admin Group with a `[🔄 Retry Channel Broadcast]` inline button.
  3. Never leaves an approved event silently unposted.

### 2.4 Officer Management
- Replaced the JSON array with `club_officers` table.
- When an owner adds an officer, they can forward a message from the user or type their numeric ID.
- If the forwarded message hides the sender (via Telegram's forward privacy or a channel forward), the bot clearly explains the issue and requests their numeric ID.
- When removing an officer, the owner sees an inline list of all current officers with one-tap removal buttons.

---

## 3. Platform Findings: Scheduling, Cron, and Execution Limits

Per the explicit instructions in Part B, `docs/tgcloud-sdk.md` and `AGENTS.md` were thoroughly inspected for scheduling, cron, timer, and execution-limit capabilities.

### Exactly what `docs/tgcloud-sdk.md` says:
1. **Query Limits**: Mentions `.limit()` only in the context of SQL queries (e.g. `.limit(10).offset(20)`).
2. **File Upload Limits**: Lists standard Telegram Bot API file limits:
   - 50 MB per file for documents/general files.
   - 10 MB per file for photos.
   - 20 MB cap on `getFileContent` downloads.
3. **Log Warning**: Contains a sample log string: `console.warn('rate limited');`.

### Exactly what `docs/tgcloud-sdk.md` DOES NOT say:
1. **No Cron or Scheduled Triggers**: There is no syntax, handler, or configuration block for cron jobs, periodic schedules, or recurring triggers.
2. **No Timers / Background Alarms**: There are no platform APIs to schedule delayed execution or background timers.
3. **No Execution Limits / Timeouts Documented**: The documentation does not specify a maximum isolate runtime timeout or memory cap.

### Engineering Consequence:
Features that depended on Celery, Redis, or background schedulers in Python (such as automatic event expiry, reminder notifications, and weekly digest broadcasts) are **intentionally omitted from this port**. Per project instructions, no fragile external workarounds were built.

---

## 4. Omitted Features Summary (Out of Scope for Port)
- **Subscriptions & Reminders**: Requires scheduled background jobs.
- **Weekly Digest Broadcast**: Requires scheduled cron triggers.
- **Amharic Language Toggle**: Reserved for a future localization milestone.
- **Program Types & Deadlines Expansion**: Deferred; existing event model preserved with high fidelity.
- **Mini App Frontend**: Endpoints and static serving are supported by the platform, but deferred until the web UI is developed.
