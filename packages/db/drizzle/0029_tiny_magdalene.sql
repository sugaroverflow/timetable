CREATE TABLE "heart_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timetable_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "heart_events" ADD CONSTRAINT "heart_events_timetable_id_timetables_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_events" ADD CONSTRAINT "heart_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_events" ADD CONSTRAINT "heart_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "heart_events_timetable_idx" ON "heart_events" USING btree ("timetable_id","created_at");--> statement-breakpoint
CREATE INDEX "heart_events_topic_idx" ON "heart_events" USING btree ("topic_id");--> statement-breakpoint
INSERT INTO "heart_events" ("timetable_id", "topic_id", "user_id", "kind", "action", "created_at")
SELECT t."timetable_id", h."topic_id", h."user_id", 'heart', 'add', h."created_at"
FROM "hearts" h JOIN "topics" t ON t."id" = h."topic_id";--> statement-breakpoint
INSERT INTO "heart_events" ("timetable_id", "topic_id", "user_id", "kind", "action", "created_at")
SELECT t."timetable_id", hh."topic_id", hh."user_id", 'host_heart', 'add', hh."created_at"
FROM "host_hearts" hh JOIN "topics" t ON t."id" = hh."topic_id";