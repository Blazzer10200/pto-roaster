CREATE TABLE `pto_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`part` integer NOT NULL,
	`document` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pto_backup_part` ON `pto_backups` (`day`,`part`);--> statement-breakpoint
CREATE TABLE `pto_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`document` text
);
--> statement-breakpoint
CREATE TABLE `pto_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pto_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`document` text NOT NULL,
	`write_id` text NOT NULL,
	`updated_at` text NOT NULL
);
