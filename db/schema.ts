import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Atomic account/workspace state; audit and encrypted daily snapshots stay separate.
export const ptoState=sqliteTable('pto_state',{
  id:integer('id').primaryKey(),revision:integer('revision').notNull(),
  document:text('document').notNull(),writeId:text('write_id').notNull(),updatedAt:text('updated_at').notNull(),
});
export const ptoEvents=sqliteTable('pto_events',{
  id:integer('id').primaryKey({autoIncrement:true}),at:text('at').notNull(),userId:text('user_id').notNull(),action:text('action').notNull(),document:text('document'),
});
export const ptoLimits=sqliteTable('pto_limits',{
  key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull(),
});
export const ptoBackups=sqliteTable('pto_backups',{
  id:integer('id').primaryKey({autoIncrement:true}),day:text('day').notNull(),part:integer('part').notNull(),document:text('document').notNull(),
},table=>[uniqueIndex('pto_backup_part').on(table.day,table.part)]);
