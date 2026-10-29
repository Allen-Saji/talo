CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"origins" text[] NOT NULL,
	"documentation" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_tenantId_unique" UNIQUE("tenantId")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;