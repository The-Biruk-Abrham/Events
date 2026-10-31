# Addis Ababa Science and Technology University (AASTU) Events Hub — Serverless Bot

A high-performance Telegram bot running on Telegram's Serverless V8 Isolate platform (`@tgcloud`), serving as the central hub for campus events, club announcements, and workshops at **Addis Ababa Science and Technology University (AASTU)**.

---

## 🚀 Setup from Zero (Step-by-Step)

Follow these exact steps to deploy and configure this bot from scratch:

### 1. Create Bot in BotFather
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a friendly display name (e.g. `AASTU Events Hub`) and a unique username ending in `bot` (e.g. `aastu_events_hub_bot`).
4. Save your Bot Token securely.

### 2. Enable Serverless on Telegram
1. In [@BotFather](https://t.me/BotFather), configure serverless runtime for your bot:
   - Send `/mybots` > select your bot > **Bot Settings** > **Serverless** (or configure WebApp/Serverless according to your platform options).

### 3. Log In with the CLI
Inside this project folder (`aastu-events-serverless`), run:
```powershell
npx tgcloud login
```
Follow the interactive prompt to link your local repository with your Telegram bot.

### 4. Configure IDs in `tgcloud/lib/config.js`
Open `tgcloud/lib/config.js` in your editor. You need three Telegram IDs:

1. **`OWNER_ID`**: Your personal Telegram user ID.
   - Start a DM with your bot and send `/whoami` to see your numeric ID.
2. **`ADMIN_GROUP_ID`**: The numeric Chat ID of the moderation group.
   - Add the bot to your Admin Group and send `/chatid` in that group (typically a negative number, e.g. `-1001234567890`).
3. **`CHANNEL_ID`**: The username or Chat ID of your broadcast channel.
   - Add the bot to your public channel as an **Administrator** with **Post Messages** and **Edit Messages** permissions.
   - Set to your channel username (e.g. `'@aastu_events'`) or channel ID.

Save `tgcloud/lib/config.js`.

### 5. Deploy Code to Telegram Cloud
Deploy your modules to Telegram's cloud platform:
```powershell
npx tgcloud push
```
`push` uploads all modules under `tgcloud/` (`schema.js`, `lib/`, `handlers/`) and updates the webhook.

### 6. Apply Schema Migrations
Deploying code does not touch the database. Apply the tables and indexes defined in `tgcloud/schema.js` by running:
```powershell
npx tgcloud migrate
```
The CLI will interactively display the new tables (`categories`, `clubs`, `club_officers`, `events`, `admins`, `sessions`) and indexes, then apply them to your cloud SQLite database.

### 7. Configure Bot Commands Menu
In Telegram, open your private chat with the bot as Owner and send:
```
/setup
```
The bot calls `api.setMyCommands` to register the official command menu (`/start`, `/today`, `/week`, `/events`, `/submit`, `/cancel`, `/whoami`, `/chatid`, `/help`).

### 8. Seed Development Data
As the bot Owner, send:
```
/seed
```
This populates standard categories (Academic, Sports, Career/Workshop, etc.), sample clubs (Software Development Club, Robotics & AI Society, Athletics Guild), and sample approved and pending events.
> 💡 Safe to run twice: `/seed` is fully idempotent.

---

## 🧪 Local Testing

All core logic (Addis Ababa +03:00 time calculations, formatting, caption splitting, permission matrices, and state machine transitions) is written in pure, SDK-free modules and tested using Node's native test runner:

```powershell
npm test
```

To test handlers locally with sample JSON5 payloads:
```powershell
npx tgcloud run handlers/message tests/payloads/message_start.json5
npx tgcloud run handlers/message tests/payloads/message_today.json5
npx tgcloud run handlers/callback_query tests/payloads/callback_today.json5
```

---

## 🏛️ Project Layout

```
aastu-events-serverless/
├── tgcloud/                    # Deployed to Telegram Serverless Isolate
│   ├── schema.js               # Database tables & indexes (Drizzle-like SQLite DSL)
│   ├── handlers/               # Flat update handlers
│   │   ├── message.js          # Telegram 'message' update entrypoint
│   │   └── callback_query.js   # Telegram 'callback_query' update entrypoint
│   └── lib/                    # Shared modules
│       ├── config.js           # Constants & placeholders
│       ├── time.js             # Hand-rolled +03:00 Addis Ababa time logic
│       ├── i18n.js             # String translation engine
│       ├── locales/en.js       # English string dictionary
│       ├── auth_rules.js       # Pure permission checking functions
│       ├── auth.js             # DB-backed authorization service
│       ├── formatters.js       # Event card, channel post & admin card formatting
│       ├── keyboards.js        # Compact inline keyboard builders (<64 bytes)
│       ├── broadcast.js        # Channel broadcast & caption limit splitting
│       ├── state_machine.js    # Conversational submission state transitions
│       ├── session.js          # DB-backed user session persistence (1h TTL)
│       ├── seed.js             # Idempotent seed data generator
│       ├── router.js           # Central message and callback router
│       └── services/           # DB mutation services enforcing permissions
│           ├── events.js       # Event creation, queries, atomic approval/rejection
│           ├── clubs.js        # Club queries and owner creation
│           ├── officers.js     # Club officer management (add/remove)
│           └── admins.js       # Admin management
├── tests/                      # Local tests (NEVER deployed to cloud)
│   ├── time.test.js            # Time calculations & midnight boundaries
│   ├── formatters.test.js      # Card & channel post formatting
│   ├── broadcast.test.js       # 900, 1024, 1025, 4100 char limit tests
│   ├── auth_rules.test.js      # Role & capability matrix tests
│   ├── state_machine.test.js   # Submission flow & validation tests
│   ├── QA_CHECKLIST.md         # Comprehensive manual QA checklist
│   └── payloads/               # JSON5 sample updates for `tgcloud run`
├── docs/
│   ├── PORT_NOTES.md           # Python-to-JS migration mapping & differences
│   ├── PROJECT_REPORT.md       # Comprehensive technical report
│   └── tgcloud-sdk.md          # Platform SDK reference
└── package.json
```

---

## 🔒 Platform Rules & Design Constraints
1. **No Filesystem / No Env Variables at Runtime**: Everything deployed lives in `tgcloud/`. Configuration constants are defined in `tgcloud/lib/config.js`.
2. **No External NPM Packages in `tgcloud/`**: Handlers only import from `'sdk'`, `'sdk/db'`, or local relative `.js` files.
3. **No Foreign Keys**: Schema uses logical relations; application services enforce integrity and cascade operations.
4. **Compact Callbacks**: All `callback_data` strings are strictly kept below Telegram's 64-byte limit.
5. **Atomic Moderation**: State transitions (`approveEvent`, `rejectEvent`) use atomic `WHERE status='pending'` updates to prevent double-tap race conditions.
