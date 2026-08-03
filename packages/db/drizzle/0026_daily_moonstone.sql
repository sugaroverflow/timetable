ALTER TABLE "slot_comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD COLUMN "hidden_by_user_id" text;--> statement-breakpoint
ALTER TABLE "slot_comments" ADD CONSTRAINT "slot_comments_hidden_by_user_id_user_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;