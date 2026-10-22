CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY,
	"type" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"path" text,
	"referrer" text,
	"country" text,
	"city" text,
	"device" text,
	"browser" text,
	"os" text,
	"mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_events_created_at_idx" ON "usage_events" ("created_at");--> statement-breakpoint
CREATE INDEX "usage_events_session_idx" ON "usage_events" ("session_id");