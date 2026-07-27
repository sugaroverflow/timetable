CREATE TABLE "topic_seen" (
	"topic_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timetable_memberships" ADD COLUMN "queue_round_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_seen" ADD CONSTRAINT "topic_seen_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_seen" ADD CONSTRAINT "topic_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_seen_topic_user_uq" ON "topic_seen" USING btree ("topic_id","user_id");--> statement-breakpoint
CREATE INDEX "topic_seen_user_idx" ON "topic_seen" USING btree ("user_id");