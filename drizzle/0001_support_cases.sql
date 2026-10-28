CREATE TYPE "public"."entitlement_state" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TABLE "support_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"invoiceId" text NOT NULL,
	"entitlement" "entitlement_state" NOT NULL,
	"attempts" text[] NOT NULL,
	"preference" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_tenantId_userId_memberships_tenantId_userId_fk" FOREIGN KEY ("tenantId","userId") REFERENCES "public"."memberships"("tenantId","userId") ON DELETE no action ON UPDATE no action;