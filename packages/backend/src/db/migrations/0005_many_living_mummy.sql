DELETE FROM "refresh_tokens";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "token_digest" varchar(64) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_refresh_tokens_token_digest" ON "refresh_tokens" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" USING btree ("expires_at");
