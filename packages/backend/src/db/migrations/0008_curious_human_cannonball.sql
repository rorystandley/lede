CREATE TABLE "filtered_articles" (
	"user_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filtered_articles_rule_id_article_id_pk" PRIMARY KEY("rule_id","article_id")
);
--> statement-breakpoint
ALTER TABLE "filtered_articles" ADD CONSTRAINT "filtered_articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filtered_articles" ADD CONSTRAINT "filtered_articles_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filtered_articles" ADD CONSTRAINT "filtered_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_filtered_articles_user_article" ON "filtered_articles" USING btree ("user_id","article_id");