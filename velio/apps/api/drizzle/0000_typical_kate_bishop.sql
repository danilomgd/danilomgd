CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" varchar(40) NOT NULL,
	"street" text NOT NULL,
	"number" varchar(20) NOT NULL,
	"complement" text,
	"neighborhood" varchar(120) NOT NULL,
	"city" varchar(120) NOT NULL,
	"state" varchar(2) NOT NULL,
	"postal_code" varchar(9) NOT NULL,
	"lat" text NOT NULL,
	"lng" text NOT NULL,
	"instructions" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"push_token" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"app" varchar(20) DEFAULT 'customer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" text NOT NULL,
	"app" varchar(20) DEFAULT 'customer' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" varchar(80),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"password_hash" text,
	"name" varchar(120),
	"avatar_url" text,
	"roles" jsonb DEFAULT '["customer"]'::jsonb NOT NULL,
	"locale" varchar(10) DEFAULT 'pt-BR' NOT NULL,
	"timezone" varchar(60) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"consents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(80) NOT NULL,
	"subtitle" varchar(160),
	"image_url" text,
	"deep_link" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_sections" (
	"id" varchar(60) PRIMARY KEY NOT NULL,
	"kind" varchar(30) NOT NULL,
	"title" varchar(60),
	"subtitle" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"city" varchar(120) NOT NULL,
	"state" varchar(2) NOT NULL,
	"min_lat" double precision NOT NULL,
	"min_lng" double precision NOT NULL,
	"max_lat" double precision NOT NULL,
	"max_lng" double precision NOT NULL,
	"neighborhoods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" text,
	"slug" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"icon" varchar(40) DEFAULT 'wrench' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_price_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"region_id" text,
	"base_price_cents" integer,
	"price_min_cents" integer,
	"price_max_cents" integer,
	"hourly_rate_cents" integer,
	"surge_multiplier_bps" integer DEFAULT 10000 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"short_description" varchar(160),
	"description" text,
	"workflow_kind" varchar(20) NOT NULL,
	"pricing_model" varchar(10) NOT NULL,
	"base_price_cents" integer,
	"price_min_cents" integer,
	"price_max_cents" integer,
	"hourly_rate_cents" integer,
	"estimated_duration_minutes" integer,
	"allows_immediate" boolean DEFAULT true NOT NULL,
	"allows_scheduling" boolean DEFAULT true NOT NULL,
	"requires_address" boolean DEFAULT true NOT NULL,
	"requires_vehicle" boolean DEFAULT false NOT NULL,
	"requires_equipment" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(30) DEFAULT 'AIR_CONDITIONER' NOT NULL,
	"brand" varchar(40) NOT NULL,
	"model" varchar(60),
	"btus" integer,
	"room" varchar(40) NOT NULL,
	"address_id" text,
	"last_maintenance_at" timestamp with time zone,
	"maintenance_interval_months" integer DEFAULT 6 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand" varchar(40) NOT NULL,
	"model" varchar(60) NOT NULL,
	"plate" varchar(8) NOT NULL,
	"year" integer NOT NULL,
	"color" varchar(30),
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"kind" varchar(30) NOT NULL,
	"file_url" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"rejected_reason" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"order_id" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" real,
	"heading_deg" real,
	"speed_mps" real,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_service_areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"region_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"category_id" text NOT NULL,
	"level" real DEFAULT 0.5 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_stats" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"rating_avg" real,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"cancelled_count" integer DEFAULT 0 NOT NULL,
	"offers_received" integer DEFAULT 0 NOT NULL,
	"offers_accepted" integer DEFAULT 0 NOT NULL,
	"avg_response_seconds" real,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_time_off" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"legal_name" varchar(120),
	"document_hash" text,
	"document_masked" varchar(20),
	"bio" text,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"availability" varchar(20) DEFAULT 'OFFLINE' NOT NULL,
	"base_lat" double precision,
	"base_lng" double precision,
	"base_city" varchar(120),
	"base_state" varchar(2),
	"service_radius_km" real DEFAULT 15 NOT NULL,
	"last_lat" double precision,
	"last_lng" double precision,
	"last_location_at" timestamp with time zone,
	"rating_avg" real,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"acceptance_rate" real,
	"cancellation_rate" real,
	"avg_response_seconds" real,
	"last_order_completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reminder_24h_sent_at" timestamp with time zone,
	"reminder_1h_sent_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custody_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"item_code" varchar(40) NOT NULL,
	"step" varchar(30) NOT NULL,
	"from_party" varchar(30) NOT NULL,
	"to_party" varchar(30) NOT NULL,
	"by_user_id" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"photo_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kind" varchar(20) NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" varchar(60) NOT NULL,
	"action" varchar(60),
	"from_status" varchar(30),
	"to_status" varchar(30),
	"actor_type" varchar(20) NOT NULL,
	"actor_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"seq" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"child_order_id" text,
	"due_at" timestamp with time zone,
	"depends_on_seq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"kind" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'SENT' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"notes" text,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"provider_id" text,
	"parent_order_id" text,
	"service_id" text NOT NULL,
	"category_id" text NOT NULL,
	"region_id" text,
	"workflow_kind" varchar(20) NOT NULL,
	"workflow_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) NOT NULL,
	"scheduled_for" timestamp with time zone,
	"window_minutes" integer,
	"eta_at" timestamp with time zone,
	"address_summary" text,
	"lat" double precision,
	"lng" double precision,
	"address_instructions" text,
	"destination_summary" text,
	"destination_lat" double precision,
	"destination_lng" double precision,
	"price_cents" integer,
	"additional_approved_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer,
	"platform_fee_cents" integer,
	"provider_payout_cents" integer,
	"start_pin" varchar(4),
	"custody_code" varchar(24),
	"notes" text,
	"cancel_reason" text,
	"cancelled_by" varchar(20),
	"cancellation_fee_cents" integer,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"matching_started_at" timestamp with time zone,
	"dispatch_wave" integer DEFAULT 0 NOT NULL,
	"flags" jsonb DEFAULT '{"requiresStartPin":false,"requiresBeforeAfterPhotos":false,"requiresCustody":false,"requiresVehicleHandover":false,"allowsAdditionalQuote":true}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"service_id" text NOT NULL,
	"address_id" text,
	"vehicle_id" text,
	"equipment_id" text,
	"destination_address_id" text,
	"schedule_mode" varchar(10) NOT NULL,
	"scheduled_for" timestamp with time zone,
	"window_minutes" integer,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coupon_code" varchar(20),
	"payment_method_id" text,
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_handovers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"step" varchar(20) NOT NULL,
	"odometer_km" integer NOT NULL,
	"fuel_level_pct" integer,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_confirmed" text,
	"by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(20) NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"score" real NOT NULL,
	"distance_km" real NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" varchar(12) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dispatch_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"wave" integer NOT NULL,
	"radius_km" real NOT NULL,
	"candidates_count" integer DEFAULT 0 NOT NULL,
	"eligible_count" integer DEFAULT 0 NOT NULL,
	"offered_count" integer DEFAULT 0 NOT NULL,
	"outcome" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matching_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" text,
	"weights" jsonb NOT NULL,
	"waves" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" text,
	"region_id" text,
	"percent_bps" integer NOT NULL,
	"fixed_cents" integer DEFAULT 0 NOT NULL,
	"min_cents" integer DEFAULT 0 NOT NULL,
	"max_cents" integer,
	"pass_payment_fee_to_provider" boolean DEFAULT false NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"code" varchar(20) PRIMARY KEY NOT NULL,
	"kind" varchar(10) NOT NULL,
	"value" integer NOT NULL,
	"min_order_cents" integer,
	"max_discount_cents" integer,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"usage_limit" integer,
	"per_user_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"category_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"journal_id" text NOT NULL,
	"direction" varchar(6) NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" varchar(30) NOT NULL,
	"order_id" text,
	"intent_id" text,
	"payout_id" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"quote_id" text,
	"subscription_id" text,
	"kind" varchar(20) NOT NULL,
	"method_kind" varchar(10) NOT NULL,
	"payment_method_id" text,
	"amount_cents" integer NOT NULL,
	"captured_cents" integer DEFAULT 0 NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"wallet_applied_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) NOT NULL,
	"gateway" varchar(20) NOT NULL,
	"gateway_ref" text,
	"pix_qr_code" text,
	"pix_copy_paste" text,
	"pix_expires_at" timestamp with time zone,
	"failure_code" varchar(40),
	"failure_message" text,
	"idempotency_key" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(10) NOT NULL,
	"gateway" varchar(20) NOT NULL,
	"gateway_token" text,
	"brand" varchar(20),
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"holder_name" varchar(80),
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" varchar(20) DEFAULT 'SCHEDULED' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gateway_ref" text,
	"paid_at" timestamp with time zone,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"gateway_ref" text,
	"requested_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_type" varchar(10) NOT NULL,
	"owner_id" text NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"held_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gateway" varchar(20) NOT NULL,
	"external_id" text NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"service_id" text NOT NULL,
	"interval_months" integer NOT NULL,
	"visits_per_cycle" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"order_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"address_id" text NOT NULL,
	"payment_method_id" text NOT NULL,
	"equipment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'ACTIVE' NOT NULL,
	"preferred_weekday" integer,
	"preferred_period" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_visit_due_at" timestamp with time zone,
	"next_charge_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"last_read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text,
	"kind" varchar(30) NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"sender_user_id" text,
	"body" text,
	"media_url" text,
	"system_kind" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(40) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_risk_signals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"late_cancellations_90d" integer DEFAULT 0 NOT NULL,
	"disputes_opened_90d" integer DEFAULT 0 NOT NULL,
	"disputes_rejected_90d" integer DEFAULT 0 NOT NULL,
	"chargebacks" integer DEFAULT 0 NOT NULL,
	"completed_orders" integer DEFAULT 0 NOT NULL,
	"risk_score_bps" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"opened_by_user_id" text NOT NULL,
	"reason" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"resolution" jsonb,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text,
	"kind" varchar(30) NOT NULL,
	"severity" varchar(10) DEFAULT 'MEDIUM' NOT NULL,
	"title" varchar(160) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'OPEN' NOT NULL,
	"assignee_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"target_type" varchar(10) NOT NULL,
	"target_id" text NOT NULL,
	"rating" integer NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"conversation_id" text NOT NULL,
	"subject" varchar(120) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"priority" varchar(10) DEFAULT 'NORMAL' NOT NULL,
	"assignee_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"user_id" text,
	"provider_id" text,
	"order_id" text,
	"session_id" varchar(64),
	"app" varchar(10) DEFAULT 'api' NOT NULL,
	"app_version" varchar(20),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_role" varchar(20),
	"action" varchar(80) NOT NULL,
	"target_type" varchar(40),
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concierge_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"input_type" varchar(10) NOT NULL,
	"raw_text" text,
	"audio_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript" text,
	"plan" jsonb,
	"planner_name" varchar(40),
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operator_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" varchar(60) NOT NULL,
	"aggregate_type" varchar(40) NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(60) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"status" varchar(12) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"dedupe_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_uq" ON "devices" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_token_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "service_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "service_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "price_rules_service_idx" ON "service_price_rules" USING btree ("service_id","region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_uq" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "equipments_user_idx" ON "equipments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vehicles_user_idx" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "provider_documents_provider_idx" ON "provider_documents" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "provider_locations_provider_idx" ON "provider_locations" USING btree ("provider_id","recorded_at");--> statement-breakpoint
CREATE INDEX "provider_locations_order_idx" ON "provider_locations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "provider_schedules_provider_idx" ON "provider_schedules" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_areas_uq" ON "provider_service_areas" USING btree ("provider_id","region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_skills_uq" ON "provider_skills" USING btree ("provider_id","category_id");--> statement-breakpoint
CREATE INDEX "provider_skills_category_idx" ON "provider_skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "provider_time_off_idx" ON "provider_time_off" USING btree ("provider_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_user_uq" ON "providers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_document_uq" ON "providers" USING btree ("document_hash");--> statement-breakpoint
CREATE INDEX "providers_availability_idx" ON "providers" USING btree ("availability","status");--> statement-breakpoint
CREATE INDEX "providers_location_idx" ON "providers" USING btree ("last_lat","last_lng");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_order_uq" ON "bookings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "bookings_provider_idx" ON "bookings" USING btree ("provider_id","starts_at");--> statement-breakpoint
CREATE INDEX "custody_order_idx" ON "custody_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "media_evidence_order_idx" ON "media_evidence" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_seq_uq" ON "order_events" USING btree ("order_id","seq");--> statement-breakpoint
CREATE INDEX "order_tasks_order_idx" ON "order_tasks" USING btree ("order_id","seq");--> statement-breakpoint
CREATE INDEX "quotes_order_idx" ON "quotes" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "service_orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_provider_idx" ON "service_orders" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "service_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_parent_idx" ON "service_orders" USING btree ("parent_order_id");--> statement-breakpoint
CREATE INDEX "orders_scheduled_idx" ON "service_orders" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "requests_customer_idx" ON "service_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_idempotency_uq" ON "service_requests" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "vehicle_handovers_order_idx" ON "vehicle_handovers" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definitions_uq" ON "workflow_definitions" USING btree ("kind","version");--> statement-breakpoint
CREATE INDEX "dispatch_offers_order_idx" ON "dispatch_offers" USING btree ("order_id","response");--> statement-breakpoint
CREATE INDEX "dispatch_offers_provider_idx" ON "dispatch_offers" USING btree ("provider_id","response");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_offers_uq" ON "dispatch_offers" USING btree ("order_id","provider_id","round_id");--> statement-breakpoint
CREATE INDEX "dispatch_rounds_order_idx" ON "dispatch_rounds" USING btree ("order_id","wave");--> statement-breakpoint
CREATE UNIQUE INDEX "matching_configs_category_uq" ON "matching_configs" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "commission_rules_scope_idx" ON "commission_rules" USING btree ("category_id","region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_order_uq" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("code","user_id");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "payment_intents_order_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_user_idx" ON "payment_intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_gateway_ref_uq" ON "payment_intents" USING btree ("gateway","gateway_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_idem_uq" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_methods_user_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payouts_provider_idx" ON "payouts" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "refunds_intent_idx" ON "refunds" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_accounts_owner_uq" ON "wallet_accounts" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_uq" ON "webhook_events" USING btree ("gateway","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_uq" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subscription_visits_sub_idx" ON "subscription_visits" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_visits_order_uq" ON "subscription_visits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_due_idx" ON "subscriptions" USING btree ("next_visit_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_uq" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_order_kind_uq" ON "conversations" USING btree ("order_id","kind");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_order_uq" ON "disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "incidents_order_idx" ON "incidents" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_target_uq" ON "reviews" USING btree ("order_id","target_type");--> statement-breakpoint
CREATE INDEX "reviews_target_idx" ON "reviews" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_user_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "support_tickets" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "analytics_name_idx" ON "analytics_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_user_idx" ON "analytics_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "concierge_order_uq" ON "concierge_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "domain_events_pending_idx" ON "domain_events" USING btree ("dispatched_at","created_at");--> statement-breakpoint
CREATE INDEX "domain_events_aggregate_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_due_idx" ON "scheduled_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_jobs_dedupe_uq" ON "scheduled_jobs" USING btree ("dedupe_key");