CREATE TYPE "public"."slot_status" AS ENUM('empty', 'proposed', 'confirmed');--> statement-breakpoint
CREATE TABLE "availability_patterns" (
	"timetable_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_patterns_timetable_id_user_id_pk" PRIMARY KEY("timetable_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "green_count" integer;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "yellow_count" integer;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "red_count" integer;--> statement-breakpoint
ALTER TABLE "timeslots" ADD COLUMN "status" "slot_status" DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE "timeslots" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "timeslots" ADD COLUMN "url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "timeslots" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "timeslots" ADD COLUMN "cell_key" text;--> statement-breakpoint
ALTER TABLE "availability_patterns" ADD CONSTRAINT "availability_patterns_timetable_id_timetables_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_patterns" ADD CONSTRAINT "availability_patterns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD CONSTRAINT "slot_comments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeslots" ADD CONSTRAINT "timeslots_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeslots" ADD CONSTRAINT "timeslots_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;