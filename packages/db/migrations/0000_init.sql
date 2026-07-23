CREATE TABLE "feature_cells" (
	"feature_id" text NOT NULL,
	"cell_x" smallint NOT NULL,
	"cell_y" smallint NOT NULL,
	CONSTRAINT "feature_cells_feature_id_cell_x_cell_y_pk" PRIMARY KEY("feature_id","cell_x","cell_y")
);
--> statement-breakpoint
CREATE TABLE "feature_tags" (
	"feature_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "feature_tags_feature_id_tag_id_pk" PRIMARY KEY("feature_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "feature_to_place" (
	"feature_id" text NOT NULL,
	"place_id" text NOT NULL,
	"relation_id" text,
	CONSTRAINT "feature_to_place_feature_id_place_id_pk" PRIMARY KEY("feature_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"record_type" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"content_url" text,
	"start_date" date,
	"end_date" date,
	"date_created" text,
	"source_id" text,
	"frequency" integer
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"geometry" geometry(Geometry, 28992)
);
--> statement-breakpoint
CREATE TABLE "relation" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_cells" ADD CONSTRAINT "feature_cells_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_tags" ADD CONSTRAINT "feature_tags_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_tags" ADD CONSTRAINT "feature_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_to_place" ADD CONSTRAINT "feature_to_place_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_to_place" ADD CONSTRAINT "feature_to_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_to_place" ADD CONSTRAINT "feature_to_place_relation_id_relation_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feature_cells_cell" ON "feature_cells" USING btree ("cell_x","cell_y");--> statement-breakpoint
CREATE INDEX "idx_feature_cells_feature" ON "feature_cells" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_feature_tags_tag" ON "feature_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_feature_to_place_place" ON "feature_to_place" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "idx_features_dates" ON "features" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_features_record_type" ON "features" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "idx_place_geometry" ON "place" USING gist ("geometry");