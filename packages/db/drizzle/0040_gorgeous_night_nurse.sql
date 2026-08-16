CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "slot_sessions_topic_idx" ON "slot_sessions" USING btree ("topic_id");