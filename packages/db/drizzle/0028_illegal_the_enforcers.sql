CREATE TABLE "host_hearts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_hearts" ADD CONSTRAINT "host_hearts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_hearts" ADD CONSTRAINT "host_hearts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "host_hearts_topic_user_uq" ON "host_hearts" USING btree ("topic_id","user_id");--> statement-breakpoint
CREATE INDEX "host_hearts_user_idx" ON "host_hearts" USING btree ("user_id");