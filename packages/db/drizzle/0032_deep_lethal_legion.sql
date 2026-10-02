CREATE TABLE "timetable_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timetable_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_slug_history_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "timetable_slug_history" ADD CONSTRAINT "timetable_slug_history_timetable_id_timetables_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE cascade ON UPDATE no action;