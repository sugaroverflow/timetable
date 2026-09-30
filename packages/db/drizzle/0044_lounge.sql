CREATE TABLE "lounge_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timetable_id" uuid NOT NULL,
	"parent_id" uuid,
	"root_id" uuid,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lounge_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lounge_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "digest_sends" ADD COLUMN "lounge_shown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "timetable_memberships" ADD COLUMN "lounge_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lounge_comments" ADD CONSTRAINT "lounge_comments_timetable_id_timetables_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_comments" ADD CONSTRAINT "lounge_comments_parent_id_lounge_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lounge_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_comments" ADD CONSTRAINT "lounge_comments_root_id_lounge_comments_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."lounge_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_comments" ADD CONSTRAINT "lounge_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_comments" ADD CONSTRAINT "lounge_comments_hidden_by_user_id_user_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_mentions" ADD CONSTRAINT "lounge_mentions_comment_id_lounge_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."lounge_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_mentions" ADD CONSTRAINT "lounge_mentions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_reactions" ADD CONSTRAINT "lounge_reactions_comment_id_lounge_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."lounge_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lounge_reactions" ADD CONSTRAINT "lounge_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lounge_comments_timetable_activity_idx" ON "lounge_comments" USING btree ("timetable_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "lounge_comments_root_idx" ON "lounge_comments" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "lounge_comments_parent_idx" ON "lounge_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "lounge_comments_author_idx" ON "lounge_comments" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lounge_mentions_comment_user_uq" ON "lounge_mentions" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "lounge_mentions_user_idx" ON "lounge_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lounge_reactions_comment_user_emoji_uq" ON "lounge_reactions" USING btree ("comment_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "lounge_reactions_user_idx" ON "lounge_reactions" USING btree ("user_id");