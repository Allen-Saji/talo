CREATE TYPE "public"."lesson_state" AS ENUM('candidate', 'redacted', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('preference', 'attempt', 'lesson');--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"sourceCaseId" text NOT NULL,
	"sourceJobId" text NOT NULL,
	"authorId" text NOT NULL,
	"code" text NOT NULL,
	"productVersion" text NOT NULL,
	"state" "lesson_state" DEFAULT 'candidate' NOT NULL,
	"memoryJobId" text,
	"reviewerId" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_observations" (
	"digest" text PRIMARY KEY NOT NULL,
	"observation" jsonb NOT NULL,
	"observedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD COLUMN "kind" "memory_kind" DEFAULT 'preference' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_sourceCaseId_support_cases_id_fk" FOREIGN KEY ("sourceCaseId") REFERENCES "public"."support_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_sourceJobId_memory_jobs_id_fk" FOREIGN KEY ("sourceJobId") REFERENCES "public"."memory_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_memoryJobId_memory_jobs_id_fk" FOREIGN KEY ("memoryJobId") REFERENCES "public"."memory_jobs"("id") ON DELETE no action ON UPDATE no action;