import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const ledger = sqliteTable('ledger', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
  document: text('document').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
  writeId: text('write_id').notNull(),
});

export const ledgerRevisions = sqliteTable('ledger_revisions', {
  revision: integer('revision').primaryKey(),
  document: text('document').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
  writeId: text('write_id').notNull().unique(),
});
