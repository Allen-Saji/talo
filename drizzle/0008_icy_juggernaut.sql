CREATE TABLE "application_credentials" (
	"appId" text PRIMARY KEY NOT NULL,
	"keyHash" text NOT NULL,
	"version" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"appId" text NOT NULL,
	"customerId" text NOT NULL,
	"verified" boolean NOT NULL,
	"messages" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_memory" (
	"appId" text NOT NULL,
	"customerId" text NOT NULL,
	"messages" jsonb NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_memory_appId_customerId_pk" PRIMARY KEY("appId","customerId")
);
--> statement-breakpoint
ALTER TABLE "application_credentials" ADD CONSTRAINT "application_credentials_appId_applications_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_appId_applications_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory" ADD CONSTRAINT "customer_memory_appId_applications_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_inbox" ON "conversations" USING btree ("appId","updatedAt");