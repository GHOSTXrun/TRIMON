CREATE TABLE `arena` (
	`market` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`write_token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`market` text NOT NULL,
	`t` integer NOT NULL,
	`values_json` text NOT NULL,
	`price` real NOT NULL,
	PRIMARY KEY(`market`, `t`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`market` text NOT NULL,
	`t` integer NOT NULL,
	`agent` text NOT NULL,
	`action` text NOT NULL,
	`price` real NOT NULL,
	`amount` real NOT NULL,
	`cost` real NOT NULL,
	`reason` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`catchup` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trades_market_time` ON `trades` (`market`,`t`);