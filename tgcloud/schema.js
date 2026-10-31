import { table, integer, text, boolean, json, index } from 'sdk/db';

export const categories = table('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description').default(''),
  createdAt: integer('created_at').notNull(),
});

export const clubs = table('clubs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  categoryType: text('category_type').default(''),
  contactInfo: text('contact_info').default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const clubOfficers = table('club_officers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clubId: integer('club_id').notNull(),
  telegramId: integer('telegram_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  clubIdx: index('idx_club_officers_club').on(t.clubId),
  telegramIdx: index('idx_club_officers_telegram').on(t.telegramId),
}));

export const events = table('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clubId: integer('club_id'),
  customClub: text('custom_club').default(''),
  categoryId: integer('category_id'),
  customCategory: text('custom_category').default(''),
  title: text('title').notNull(),
  startDatetime: integer('start_datetime').notNull(),
  endDatetime: integer('end_datetime'),
  location: text('location').notNull().default(''),
  rawContent: json('raw_content'),
  status: text('status').notNull().default('pending'),
  recurring: boolean('recurring').default(false),
  recurrencePattern: text('recurrence_pattern'),
  channelMessageId: integer('channel_message_id'),
  submittedAt: integer('submitted_at').notNull(),
  approvedAt: integer('approved_at'),
  approvedBy: text('approved_by'),
}, (t) => ({
  statusStartIdx: index('idx_events_status_start').on(t.status, t.startDatetime),
}));

export const admins = table('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull().unique(),
  name: text('name').default(''),
  permissionLevel: text('permission_level').notNull().default('moderator'),
  isActive: boolean('is_active').default(true),
  createdAt: integer('created_at').notNull(),
});

export const sessions = table('sessions', {
  userId: integer('user_id').primaryKey(),
  state: text('state').notNull(),
  data: json('data'),
  updatedAt: integer('updated_at').notNull(),
});
