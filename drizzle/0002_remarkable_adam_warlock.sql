ALTER TABLE "memory_jobs" ADD COLUMN "caseId" text;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "providerAccountId" text;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "expiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "attemptCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "leaseToken" text;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "leaseUntil" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "lastError" text;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD CONSTRAINT "memory_jobs_caseId_support_cases_id_fk" FOREIGN KEY ("caseId") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_jobs_dispatch" ON "memory_jobs" USING btree ("state","nextAttemptAt");