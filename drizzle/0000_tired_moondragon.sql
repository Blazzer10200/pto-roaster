CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`document` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`write_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_revisions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`write_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_revisions_write_id_unique` ON `ledger_revisions` (`write_id`);