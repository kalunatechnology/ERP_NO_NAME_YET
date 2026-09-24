-- CreateEnum
CREATE TYPE "iam_role_code" AS ENUM ('ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN', 'ROLE-DIRECTOR', 'ROLE-OM', 'ROLE-PM', 'ROLE-SUPERVISOR', 'ROLE-CRM-LEAD', 'ROLE-SALES', 'ROLE-FINANCE', 'ROLE-STAFF');

-- CreateTable
CREATE TABLE "core_tenant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "core_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_company" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "business_category" TEXT,
    "tax_number" TEXT NOT NULL,
    "base_currency_id" TEXT,
    "fiscal_year_start" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "core_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marbot_request" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marbot_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marbot_tenant_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_tenant_id" TEXT NOT NULL,
    "chatbot_url" TEXT NOT NULL,
    "chatbot_api_key" TEXT,
    "chatbot_tenant_id" TEXT,
    "active_key_id" TEXT,
    "inbound_context_secret" TEXT,
    "outbound_tool_secret" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'NOT_PROVISIONED',
    "last_synced_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "provisioning_operation_id" TEXT,
    "contract_version" INTEGER NOT NULL DEFAULT 2,
    "runtime_context_version" INTEGER NOT NULL DEFAULT 2,
    "datasource_source_key" TEXT,
    "datasource_status" TEXT,
    "last_contract_sync_at" TIMESTAMP(3),
    "role_map_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "marbot_tenant_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_organization" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "parent_id" TEXT,
    "organization_code" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "organization_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "core_organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_business_document" (
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "document_date" TIMESTAMP(3),
    "posting_date" TIMESTAMP(3),
    "version" INTEGER,
    "created_by" TEXT,
    "approved_by" TEXT,
    "posted_by" TEXT,
    "reversal_of_id" TEXT,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "core_business_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_link" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "source_document_id" TEXT,
    "target_document_id" TEXT,
    "link_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3),

    CONSTRAINT "core_document_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_workflow_instance" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "workflow_code" TEXT NOT NULL,
    "current_state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "core_workflow_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_workflow_approval" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "workflow_instance_id" TEXT,
    "approver_user_id" TEXT,
    "approval_level" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "core_workflow_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_audit_event" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "document_id" TEXT,
    "user_id" TEXT,
    "entity_name" TEXT NOT NULL,
    "entity_id" TEXT,
    "event_type" TEXT NOT NULL,
    "before_data" JSONB NOT NULL,
    "after_data" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3),

    CONSTRAINT "core_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_notification" (
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "source_document_id" TEXT,
    "alert_event_id" TEXT,
    "notification_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "created_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "core_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_notification_recipient" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "notification_id" TEXT,
    "recipient_user_id" TEXT,
    "recipient_role_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "delivery_status" TEXT NOT NULL,

    CONSTRAINT "core_notification_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_quick_action" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "action_code" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "route_path" TEXT NOT NULL,
    "required_permission_id" TEXT,
    "default_payload" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "core_quick_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_file" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT,
    "checksum" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "core_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_attachment" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "file_id" TEXT,
    "attachment_type" TEXT NOT NULL,
    "sort_order" INTEGER,
    "visible_to_customer" BOOLEAN NOT NULL,

    CONSTRAINT "core_document_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_template" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "template_code" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "output_format" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "core_document_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_template_version" (
    "id" TEXT NOT NULL,
    "template_id" TEXT,
    "version_number" INTEGER,
    "header_markup" TEXT NOT NULL,
    "body_markup" TEXT NOT NULL,
    "footer_markup" TEXT NOT NULL,
    "style_json" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "core_document_template_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_template_field" (
    "id" TEXT NOT NULL,
    "template_version_id" TEXT,
    "field_code" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "format_pattern" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "sort_order" INTEGER,

    CONSTRAINT "core_document_template_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_generated_document" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "business_document_id" TEXT,
    "template_version_id" TEXT,
    "file_id" TEXT,
    "generation_number" INTEGER,
    "generation_status" TEXT NOT NULL,
    "generated_by" TEXT,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "core_generated_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_document_signature" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "generated_document_id" TEXT,
    "signer_user_id" TEXT,
    "signer_party_id" TEXT,
    "signature_type" TEXT NOT NULL,
    "signature_status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "verification_reference" TEXT NOT NULL,

    CONSTRAINT "core_document_signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_user_recent_item" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "last_accessed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_user_recent_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_app_notification" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL,

    CONSTRAINT "core_app_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_activity_feed" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,

    CONSTRAINT "core_activity_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_team_contact" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_pinned" BOOLEAN NOT NULL,
    "custom_status" TEXT NOT NULL,

    CONSTRAINT "core_team_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user" (
    "is_superuser" BOOLEAN NOT NULL,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "is_staff" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "date_joined" TIMESTAMP(3) NOT NULL,
    "active_role_id" TEXT,

    CONSTRAINT "iam_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "role_code" "iam_role_code" NOT NULL,
    "role_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "custom_code" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "iam_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_idempotency_key" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "request_path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROCESSING',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_permission" (
    "id" TEXT NOT NULL,
    "permission_code" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "resource_name" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,

    CONSTRAINT "iam_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_role" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "role_id" TEXT,
    "company_id" TEXT,
    "organization_id" TEXT,

    CONSTRAINT "iam_user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_company_membership" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_user_company_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_company_module_access" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allow_read" BOOLEAN NOT NULL DEFAULT false,
    "allow_write" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "effective_from" TIMESTAMP(3),
    "effective_until" TIMESTAMP(3),
    "enabled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_company_module_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_module_access" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "allow_read" BOOLEAN NOT NULL DEFAULT false,
    "allow_write" BOOLEAN NOT NULL DEFAULT false,
    "granted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_user_module_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role_permission" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "role_id" TEXT,
    "permission_id" TEXT,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "iam_role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role_hierarchy" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "parent_role_id" TEXT,
    "child_role_id" TEXT,
    "inheritance_mode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "iam_role_hierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_data_scope_policy" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "policy_code" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "condition_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "iam_data_scope_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role_data_scope" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "role_id" TEXT,
    "policy_id" TEXT,
    "access_level" TEXT NOT NULL,
    "can_export" BOOLEAN NOT NULL,
    "can_share" BOOLEAN NOT NULL,

    CONSTRAINT "iam_role_data_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_field_permission" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "role_id" TEXT,
    "module_code" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL,
    "can_edit" BOOLEAN NOT NULL,
    "masking_type" TEXT NOT NULL,

    CONSTRAINT "iam_field_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_information_share_rule" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "source_module_code" TEXT NOT NULL,
    "target_module_code" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "field_set_code" TEXT NOT NULL,
    "share_direction" TEXT NOT NULL,
    "filter_json" JSONB NOT NULL,
    "access_level" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "iam_information_share_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_approval_limit" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "role_id" TEXT,
    "user_id" TEXT,
    "currency_id" TEXT,
    "approval_type" TEXT NOT NULL,
    "minimum_amount" DECIMAL(65,30),
    "maximum_amount" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "iam_approval_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_project_access" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "project_id" TEXT,
    "project_role" TEXT NOT NULL,
    "access_level" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),

    CONSTRAINT "iam_user_project_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_party" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "party_code" TEXT NOT NULL,
    "party_type" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tax_number" TEXT NOT NULL,
    "default_currency_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_party_role" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "role_type" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "master_party_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_contact" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "primary_contact" BOOLEAN NOT NULL,

    CONSTRAINT "master_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_address" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "address_type" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "primary_address" BOOLEAN NOT NULL,

    CONSTRAINT "master_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_customer_profile" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "customer_code" TEXT NOT NULL,
    "credit_limit" DECIMAL(65,30),
    "credit_hold" BOOLEAN NOT NULL,
    "payment_term_id" TEXT,
    "price_list_id" TEXT,
    "receivable_account_id" TEXT,
    "risk_category" TEXT NOT NULL,

    CONSTRAINT "master_customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_supplier_profile" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "party_id" TEXT,
    "supplier_code" TEXT NOT NULL,
    "payment_term_id" TEXT,
    "lead_time_days" INTEGER,
    "minimum_order_value" DECIMAL(65,30),
    "payable_account_id" TEXT,
    "approved_supplier" BOOLEAN NOT NULL,

    CONSTRAINT "master_supplier_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product_category" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "parent_id" TEXT,
    "category_code" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_uom" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "uom_code" TEXT NOT NULL,
    "uom_name" TEXT NOT NULL,
    "dimension_type" TEXT NOT NULL,
    "base_uom" BOOLEAN NOT NULL,

    CONSTRAINT "master_uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "category_id" TEXT,
    "base_uom_id" TEXT,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "costing_method" TEXT NOT NULL,
    "stock_item" BOOLEAN NOT NULL,
    "purchase_item" BOOLEAN NOT NULL,
    "sales_item" BOOLEAN NOT NULL,
    "manufactured_item" BOOLEAN NOT NULL,
    "lot_controlled" BOOLEAN NOT NULL,
    "serial_controlled" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_currency" (
    "id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimal_places" INTEGER,

    CONSTRAINT "master_currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_exchange_rate" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "from_currency_id" TEXT,
    "to_currency_id" TEXT,
    "rate_date" TIMESTAMP(3),
    "exchange_rate" DECIMAL(65,30),
    "rate_source" TEXT NOT NULL,

    CONSTRAINT "master_exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_payment_term" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "term_code" TEXT NOT NULL,
    "term_name" TEXT NOT NULL,
    "due_days" INTEGER,
    "early_discount_percent" DECIMAL(65,30),
    "early_discount_days" INTEGER,

    CONSTRAINT "master_payment_term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_tax_code" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "tax_code" TEXT NOT NULL,
    "tax_name" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "tax_rate" DECIMAL(65,30),
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "input_account_id" TEXT,
    "output_account_id" TEXT,

    CONSTRAINT "master_tax_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_cost_center" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "parent_id" TEXT,
    "cost_center_code" TEXT NOT NULL,
    "cost_center_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_cost_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_department" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "parent_id" TEXT,
    "department_code" TEXT NOT NULL,
    "department_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_employee" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "party_id" TEXT,
    "department_id" TEXT,
    "employee_number" TEXT NOT NULL,
    "employment_status" TEXT NOT NULL,
    "standard_hourly_rate" DECIMAL(65,30),

    CONSTRAINT "master_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_warehouse" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "warehouse_code" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "warehouse_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "master_warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_warehouse_location" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "parent_id" TEXT,
    "location_code" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "quality_hold" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "master_warehouse_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_work_center" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "work_center_code" TEXT NOT NULL,
    "work_center_name" TEXT NOT NULL,
    "hourly_rate" DECIMAL(65,30),
    "capacity_per_day" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "master_work_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_machine" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "work_center_id" TEXT,
    "asset_id" TEXT,
    "machine_code" TEXT NOT NULL,
    "machine_name" TEXT NOT NULL,
    "hourly_rate" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "master_machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "party_id" TEXT,
    "owner_user_id" TEXT,
    "lead_source" TEXT NOT NULL,
    "lead_status" TEXT NOT NULL,
    "estimated_value" DECIMAL(65,30),
    "expected_close_date" TIMESTAMP(3),

    CONSTRAINT "crm_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunity" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "document_id" TEXT,
    "customer_party_id" TEXT,
    "lead_id" TEXT,
    "owner_user_id" TEXT,
    "pipeline_stage" TEXT NOT NULL,
    "stage_id" TEXT,
    "opportunity_name" TEXT NOT NULL,
    "lost_reason" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "probability_percent" DECIMAL(65,30),
    "expected_amount" DECIMAL(65,30),
    "expected_margin" DECIMAL(65,30),
    "expected_close_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunity_product" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "product_id" TEXT,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "estimated_unit_price" DECIMAL(65,30),
    "estimated_cost" DECIMAL(65,30),

    CONSTRAINT "crm_opportunity_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activity" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "party_id" TEXT,
    "assigned_user_id" TEXT,
    "activity_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_pipeline" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "pipeline_code" TEXT NOT NULL,
    "pipeline_name" TEXT NOT NULL,
    "default_pipeline" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_pipeline_stage" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "stage_code" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "position_order" INTEGER,
    "default_probability_percent" DECIMAL(65,30),
    "closed_won" BOOLEAN NOT NULL,
    "closed_lost" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunity_stage_history" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "from_stage_id" TEXT,
    "to_stage_id" TEXT,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3),
    "change_reason" TEXT NOT NULL,

    CONSTRAINT "crm_opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_executive_approval" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "document_id" TEXT,
    "opportunity_id" TEXT,
    "quotation_id" TEXT,
    "contract_id" TEXT,
    "project_id" TEXT,
    "requested_by" TEXT,
    "approver_user_id" TEXT,
    "approval_type" TEXT NOT NULL,
    "requested_amount" DECIMAL(65,30),
    "decision" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "crm_executive_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_credit_status_snapshot" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "customer_party_id" TEXT,
    "company_id" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "credit_limit" DECIMAL(65,30),
    "outstanding_receivable" DECIMAL(65,30),
    "overdue_amount" DECIMAL(65,30),
    "available_credit" DECIMAL(65,30),
    "risk_category" TEXT NOT NULL,
    "credit_status" TEXT NOT NULL,

    CONSTRAINT "crm_credit_status_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_channel_account" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "channel_type" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "credential_reference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "crm_channel_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_conversation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "channel_account_id" TEXT,
    "customer_party_id" TEXT,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "service_case_id" TEXT,
    "assigned_user_id" TEXT,
    "external_conversation_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_conversation_participant" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "party_id" TEXT,
    "contact_id" TEXT,
    "user_id" TEXT,
    "participant_type" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),

    CONSTRAINT "crm_conversation_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_message" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "sender_user_id" TEXT,
    "sender_party_id" TEXT,
    "external_message_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_message_attachment" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "file_id" TEXT,
    "attachment_type" TEXT NOT NULL,

    CONSTRAINT "crm_message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_message_delivery_status" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "delivery_status" TEXT NOT NULL,
    "status_at" TIMESTAMP(3),
    "failure_code" TEXT NOT NULL,
    "failure_message" TEXT NOT NULL,

    CONSTRAINT "crm_message_delivery_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_feedback" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "customer_party_id" TEXT,
    "contact_id" TEXT,
    "project_id" TEXT,
    "sales_order_id" TEXT,
    "delivery_id" TEXT,
    "service_case_id" TEXT,
    "feedback_type" TEXT NOT NULL,
    "rating_value" INTEGER,
    "nps_score" DECIMAL(65,30),
    "feedback_text" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "survey_code" TEXT NOT NULL,
    "survey_name" TEXT NOT NULL,
    "survey_type" TEXT NOT NULL,
    "active_from" TIMESTAMP(3),
    "active_to" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_question" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "survey_id" TEXT,
    "question_text" TEXT NOT NULL,
    "answer_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "position_order" INTEGER,
    "option_json" JSONB NOT NULL,

    CONSTRAINT "crm_survey_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_response" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "survey_id" TEXT,
    "customer_party_id" TEXT,
    "contact_id" TEXT,
    "project_id" TEXT,
    "sales_order_id" TEXT,
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "response_status" TEXT NOT NULL,

    CONSTRAINT "crm_survey_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_survey_answer" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "response_id" TEXT,
    "question_id" TEXT,
    "numeric_answer" DECIMAL(65,30),
    "text_answer" TEXT NOT NULL,
    "option_answer" JSONB NOT NULL,

    CONSTRAINT "crm_survey_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_customer_inquiry" (
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "document_id" TEXT,
    "customer_party_id" TEXT,
    "contact_id" TEXT,
    "owner_user_id" TEXT,
    "opportunity_id" TEXT,
    "inquiry_number" TEXT NOT NULL,
    "source_channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "expected_delivery_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "qualified_at" TIMESTAMP(3),
    "quoted_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_customer_inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_inquiry_requirement" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "product_id" TEXT,
    "uom_id" TEXT,
    "requirement_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification_json" JSONB NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "target_unit_price" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "crm_inquiry_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_cost_estimate" (
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "inquiry_id" TEXT,
    "opportunity_id" TEXT,
    "estimate_number" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "direct_cost" DECIMAL(65,30) NOT NULL,
    "overhead_cost" DECIMAL(65,30) NOT NULL,
    "contingency_amount" DECIMAL(65,30) NOT NULL,
    "total_cost" DECIMAL(65,30) NOT NULL,
    "markup_percent" DECIMAL(65,30) NOT NULL,
    "offered_amount" DECIMAL(65,30) NOT NULL,
    "margin_amount" DECIMAL(65,30) NOT NULL,
    "margin_percent" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3),
    "calculated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_cost_estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_cost_estimate_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "estimate_id" TEXT NOT NULL,
    "requirement_id" TEXT,
    "product_id" TEXT,
    "cost_element" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "calculation_source" TEXT NOT NULL,

    CONSTRAINT "crm_cost_estimate_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quotation_version" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "estimate_id" TEXT,
    "version_number" INTEGER NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax_amount" DECIMAL(65,30) NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "estimated_cost" DECIMAL(65,30) NOT NULL,
    "margin_percent" DECIMAL(65,30) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_quotation_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quotation_delivery" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "version_id" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failure_reason" TEXT NOT NULL,

    CONSTRAINT "crm_quotation_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_workflow_event" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "inquiry_id" TEXT,
    "opportunity_id" TEXT,
    "event_type" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_id" TEXT,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_workflow_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_customer_feedback" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "customer_id" TEXT,
    "project_id" TEXT,
    "lead_id" TEXT,
    "opportunity_id" TEXT,
    "rating" INTEGER NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "aspect_quality" INTEGER NOT NULL,
    "aspect_timeline" INTEGER NOT NULL,
    "aspect_communication" INTEGER NOT NULL,
    "comments" TEXT NOT NULL,
    "submitted_by_name" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_customer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "opportunity_id" TEXT,
    "customer_party_id" TEXT,
    "currency_id" TEXT,
    "payment_term_id" TEXT,
    "valid_until" TIMESTAMP(3),
    "subtotal" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "total_amount" DECIMAL(65,30),
    "estimated_total_cost" DECIMAL(65,30),
    "estimated_margin" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotation_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "quotation_id" TEXT,
    "product_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "unit_price" DECIMAL(65,30),
    "discount_amount" DECIMAL(65,30),
    "tax_code_id" TEXT,
    "line_total" DECIMAL(65,30),

    CONSTRAINT "sales_quotation_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotation_cost" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "quotation_line_id" TEXT,
    "cost_element" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30),
    "calculation_source" TEXT NOT NULL,

    CONSTRAINT "sales_quotation_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_contract" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "customer_party_id" TEXT,
    "contract_number" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "contract_type" TEXT NOT NULL,
    "billing_frequency" TEXT NOT NULL,
    "order_frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_contract_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "contract_id" TEXT,
    "product_id" TEXT,
    "contracted_quantity" DECIMAL(65,30),
    "unit_price" DECIMAL(65,30),
    "tax_code_id" TEXT,
    "recurrence_rule" TEXT NOT NULL,

    CONSTRAINT "sales_contract_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "quotation_id" TEXT,
    "contract_id" TEXT,
    "customer_party_id" TEXT,
    "currency_id" TEXT,
    "payment_term_id" TEXT,
    "order_date" TIMESTAMP(3),
    "requested_delivery_date" TIMESTAMP(3),
    "subtotal" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "total_amount" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT,
    "product_id" TEXT,
    "ordered_quantity" DECIMAL(65,30),
    "delivered_quantity" DECIMAL(65,30),
    "invoiced_quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "unit_price" DECIMAL(65,30),
    "tax_code_id" TEXT,
    "project_id" TEXT,
    "fulfillment_method" TEXT NOT NULL,

    CONSTRAINT "sales_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_delivery" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "sales_order_id" TEXT,
    "customer_party_id" TEXT,
    "warehouse_id" TEXT,
    "delivery_date" TIMESTAMP(3),
    "delivery_status" TEXT NOT NULL,

    CONSTRAINT "sales_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_delivery_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "sales_order_line_id" TEXT,
    "product_id" TEXT,
    "lot_id" TEXT,
    "serial_number_id" TEXT,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,

    CONSTRAINT "sales_delivery_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_demand_supply_link" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "sales_order_line_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "purchase_order_line_id" TEXT,
    "stock_reservation_id" TEXT,
    "demand_quantity" DECIMAL(65,30),
    "allocated_quantity" DECIMAL(65,30),
    "fulfilled_quantity" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_demand_supply_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_change_request" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "sales_order_id" TEXT,
    "project_id" TEXT,
    "requested_by" TEXT,
    "change_type" TEXT NOT NULL,
    "change_reason" TEXT NOT NULL,
    "value_impact" DECIMAL(65,30),
    "schedule_impact_days" INTEGER,
    "approval_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_order_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_recurring_order_rule" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "contract_id" TEXT,
    "customer_party_id" TEXT,
    "source_sales_order_id" TEXT,
    "recurrence_rule" TEXT NOT NULL,
    "next_order_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "auto_create" BOOLEAN NOT NULL,
    "approval_required" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "sales_recurring_order_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_recurring_order_run" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "recurring_order_rule_id" TEXT,
    "generated_sales_order_id" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3),
    "run_status" TEXT NOT NULL,
    "failure_reason" TEXT NOT NULL,

    CONSTRAINT "sales_recurring_order_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_project" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "customer_party_id" TEXT,
    "sales_order_id" TEXT,
    "project_manager_id" TEXT,
    "cost_center_id" TEXT,
    "project_code" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "manager_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "actual_start_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "budget_amount" DECIMAL(65,30),
    "contract_amount" DECIMAL(65,30),
    "target_margin_percent" DECIMAL(65,30),
    "progress_percent" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "lifecycle_status" TEXT NOT NULL,
    "health_status" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,

    CONSTRAINT "project_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_control_item" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "daily_task_id" TEXT,
    "item_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "target_date" TIMESTAMP(3),
    "quantity" DECIMAL(65,30),
    "description" TEXT NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_control_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_expense" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "billing_document_id" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3),
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_lifecycle_event" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "note" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_lifecycle_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_readiness_check" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "check_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3),
    "details_json" JSONB NOT NULL,

    CONSTRAINT "project_readiness_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "user_id" TEXT,
    "employee_id" TEXT,
    "project_role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "permissions_json" JSONB NOT NULL,
    "assigned_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "parent_task_id" TEXT,
    "work_center_id" TEXT,
    "production_order_id" TEXT,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "task_code" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "evidence_json" JSONB NOT NULL,
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "planned_hours" DECIMAL(65,30),
    "actual_hours" DECIMAL(65,30),
    "progress_percent" DECIMAL(65,30),
    "weight_percent" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "project_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_dependency" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "predecessor_task_id" TEXT,
    "successor_task_id" TEXT,
    "dependency_type" TEXT NOT NULL,
    "lag_minutes" INTEGER,

    CONSTRAINT "project_task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestone" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "owner_user_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "milestone_name" TEXT NOT NULL,
    "planned_date" TIMESTAMP(3),
    "actual_date" TIMESTAMP(3),
    "weight_percent" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "project_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_material_requirement" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "task_id" TEXT,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "required_quantity" DECIMAL(65,30),
    "reserved_quantity" DECIMAL(65,30),
    "issued_quantity" DECIMAL(65,30),
    "required_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_material_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budget_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "cost_element" TEXT NOT NULL,
    "account_id" TEXT,
    "cost_center_id" TEXT,
    "budget_quantity" DECIMAL(65,30),
    "budget_rate" DECIMAL(65,30),
    "budget_amount" DECIMAL(65,30),

    CONSTRAINT "project_budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_timesheet" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "task_id" TEXT,
    "employee_id" TEXT,
    "work_date" TIMESTAMP(3),
    "hours" DECIMAL(65,30),
    "overtime_hours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overtime_reason" TEXT,
    "work_started_at" TIMESTAMP(3),
    "work_ended_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "attendance_source" TEXT DEFAULT 'WEB',
    "overtime_started_at" TIMESTAMP(3),
    "overtime_ended_at" TIMESTAMP(3),
    "evidence_url" TEXT,
    "hourly_rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30),
    "approval_status" TEXT NOT NULL,

    CONSTRAINT "project_timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_change_request" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "change_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "schedule_impact_days" DECIMAL(65,30),
    "cost_impact" DECIMAL(65,30),
    "approval_status" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "analyzed_by_id" TEXT,
    "analyzed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "client_decided_at" TIMESTAMP(3),
    "client_decision_note" TEXT NOT NULL,
    "original_end_date" TIMESTAMP(3),
    "revised_end_date" TIMESTAMP(3),
    "billing_adjustment" DECIMAL(65,30) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "applied_by_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "project_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_board" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "board_name" TEXT NOT NULL,
    "board_type" TEXT NOT NULL,
    "default_board" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "project_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_board_column" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "board_id" TEXT,
    "column_name" TEXT NOT NULL,
    "mapped_task_status" TEXT NOT NULL,
    "position_order" INTEGER,
    "wip_limit" INTEGER,

    CONSTRAINT "project_board_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_board_position" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "task_id" TEXT,
    "board_column_id" TEXT,
    "position_order" DECIMAL(65,30),
    "moved_at" TIMESTAMP(3),
    "moved_by" TEXT,

    CONSTRAINT "project_task_board_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_health_rule" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "rule_code" TEXT NOT NULL,
    "health_dimension" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "warning_threshold" DECIMAL(65,30),
    "critical_threshold" DECIMAL(65,30),
    "weight_percent" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "project_health_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_health_snapshot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "schedule_score" DECIMAL(65,30),
    "cost_score" DECIMAL(65,30),
    "quality_score" DECIMAL(65,30),
    "resource_score" DECIMAL(65,30),
    "risk_score" DECIMAL(65,30),
    "overall_score" DECIMAL(65,30),
    "health_status" TEXT NOT NULL,
    "explanation_json" JSONB NOT NULL,

    CONSTRAINT "project_health_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_risk" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "owner_user_id" TEXT,
    "risk_code" TEXT NOT NULL,
    "risk_category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "probability_score" INTEGER,
    "impact_score" INTEGER,
    "risk_score" INTEGER,
    "mitigation_plan" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_issue" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "task_id" TEXT,
    "assigned_user_id" TEXT,
    "issue_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "source_department" TEXT NOT NULL,
    "root_cause" TEXT NOT NULL,
    "milestone_impact" TEXT NOT NULL,
    "alert_status" TEXT NOT NULL,
    "reported_by_id" TEXT,
    "reported_at" TIMESTAMP(3),
    "analyzed_by_id" TEXT,
    "analyzed_at" TIMESTAMP(3),

    CONSTRAINT "project_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_change_request_material" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "change_request_id" TEXT NOT NULL,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "quantity_delta" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_requirement_id" TEXT,

    CONSTRAINT "project_change_request_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_issue_action" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "equipment_reference" TEXT NOT NULL,
    "additional_labor_hours" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "project_issue_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_dispatch" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "target_department" TEXT NOT NULL,
    "dispatch_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "sent_by_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "project_dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_technical_brief" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "sales_order_id" TEXT,
    "brief_number" TEXT NOT NULL,
    "brief_title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "scope_summary" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "approval_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "project_technical_brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_technical_brief_version" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "technical_brief_id" TEXT,
    "version_number" INTEGER,
    "specification_text" TEXT NOT NULL,
    "specification_json" JSONB NOT NULL,
    "file_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_technical_brief_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_requirement" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "technical_brief_id" TEXT,
    "parent_requirement_id" TEXT,
    "requirement_code" TEXT NOT NULL,
    "requirement_type" TEXT NOT NULL,
    "requirement_text" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "verification_method" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "project_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_acceptance_criteria" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "requirement_id" TEXT,
    "criteria_text" TEXT NOT NULL,
    "expected_result" TEXT NOT NULL,
    "actual_result" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "project_acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_resource_request" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "task_id" TEXT,
    "requested_by" TEXT,
    "request_date" TIMESTAMP(3),
    "required_date" TIMESTAMP(3),
    "request_type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "approval_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "project_resource_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_resource_request_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "resource_request_id" TEXT,
    "product_id" TEXT,
    "employee_id" TEXT,
    "machine_id" TEXT,
    "work_center_id" TEXT,
    "uom_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "requested_quantity" DECIMAL(65,30),
    "requested_hours" DECIMAL(65,30),
    "specification" TEXT NOT NULL,

    CONSTRAINT "project_resource_request_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_resource_allocation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "resource_request_line_id" TEXT,
    "stock_reservation_id" TEXT,
    "employee_id" TEXT,
    "machine_id" TEXT,
    "allocation_start_at" TIMESTAMP(3),
    "allocation_end_at" TIMESTAMP(3),
    "allocated_quantity" DECIMAL(65,30),
    "allocated_hours" DECIMAL(65,30),
    "estimated_cost" DECIMAL(65,30),
    "actual_cost" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_resource_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_snapshot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "work_order_id" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "planned_progress_percent" DECIMAL(65,30),
    "actual_progress_percent" DECIMAL(65,30),
    "earned_value" DECIMAL(65,30),
    "planned_value" DECIMAL(65,30),
    "actual_cost" DECIMAL(65,30),
    "progress_status" TEXT NOT NULL,

    CONSTRAINT "project_progress_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_equipment_usage" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "task_id" TEXT,
    "machine_id" TEXT,
    "asset_id" TEXT,
    "employee_id" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "usage_hours" DECIMAL(65,30),
    "hourly_rate" DECIMAL(65,30),
    "total_cost" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_equipment_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_weight_indicator" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "opportunity_id" TEXT,
    "sales_order_id" TEXT,
    "currency_id" TEXT,
    "base_project_value" DECIMAL(65,30),
    "weight_percent" DECIMAL(65,30),
    "weighted_project_value" DECIMAL(65,30),
    "calculated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "project_weight_indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_weight_component" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_weight_indicator_id" TEXT,
    "component_code" TEXT NOT NULL,
    "component_name" TEXT NOT NULL,
    "raw_value" DECIMAL(65,30),
    "normalized_score" DECIMAL(65,30),
    "component_weight" DECIMAL(65,30),
    "weighted_score" DECIMAL(65,30),

    CONSTRAINT "project_weight_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_weekly_progress" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "target_progress" DECIMAL(65,30) NOT NULL,
    "actual_progress" DECIMAL(65,30) NOT NULL,
    "previous_progress" DECIMAL(65,30) NOT NULL,
    "progress_difference" DECIMAL(65,30) NOT NULL,
    "gap_to_target" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "issues" TEXT NOT NULL,
    "achievements" TEXT NOT NULL,
    "next_week_plan" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_weekly_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_financial_snapshot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "planned_budget" DECIMAL(65,30) NOT NULL,
    "actual_cost" DECIMAL(65,30) NOT NULL,
    "expected_revenue" DECIMAL(65,30) NOT NULL,
    "invoiced_revenue" DECIMAL(65,30) NOT NULL,
    "realized_revenue" DECIMAL(65,30) NOT NULL,
    "expected_gross_profit" DECIMAL(65,30) NOT NULL,
    "actual_gross_profit" DECIMAL(65,30) NOT NULL,
    "expected_margin_percent" DECIMAL(65,30) NOT NULL,
    "actual_margin_percent" DECIMAL(65,30) NOT NULL,
    "budget_variance" DECIMAL(65,30) NOT NULL,
    "revenue_variance" DECIMAL(65,30) NOT NULL,
    "cost_variance" DECIMAL(65,30) NOT NULL,
    "budget_utilization_percent" DECIMAL(65,30) NOT NULL,
    "revenue_achievement_percent" DECIMAL(65,30) NOT NULL,
    "financial_health_status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_financial_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_main_task" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "cost_owner_division_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "weight" DECIMAL(65,30) NOT NULL,
    "progress" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "is_progress_overridden" BOOLEAN NOT NULL,
    "override_reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_main_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_assignment" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "main_task_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_task_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_weekly_task" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "main_task_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "week_number" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "target_description" TEXT NOT NULL,
    "progress" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "is_progress_overridden" BOOLEAN NOT NULL,
    "override_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_weekly_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_daily_task" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "weekly_task_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "planned_date" TIMESTAMP(3),
    "time_slot" TEXT NOT NULL,
    "output_result" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "progress" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "is_blocked" BOOLEAN NOT NULL,
    "block_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_daily_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_transfer_request" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "daily_task_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_task_transfer_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_activity_log" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "task_level" TEXT NOT NULL,
    "task_id" TEXT,
    "task_title" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_task_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_evm_record" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "week_number" INTEGER NOT NULL,
    "planned_value" DECIMAL(65,30) NOT NULL,
    "earned_value" DECIMAL(65,30) NOT NULL,
    "actual_cost" DECIMAL(65,30) NOT NULL,
    "cost_variance" DECIMAL(65,30) NOT NULL,
    "schedule_variance" DECIMAL(65,30) NOT NULL,
    "cost_performance_index" DECIMAL(65,30) NOT NULL,
    "schedule_performance_index" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_evm_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_purchase_requisition" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "project_id" TEXT,
    "requested_by" TEXT,
    "request_date" TIMESTAMP(3),
    "required_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "proc_purchase_requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_purchase_requisition_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "requisition_id" TEXT,
    "product_id" TEXT,
    "requested_quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "warehouse_id" TEXT,
    "project_material_requirement_id" TEXT,

    CONSTRAINT "proc_purchase_requisition_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_rfq" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "requisition_id" TEXT,
    "issue_date" TIMESTAMP(3),
    "closing_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "proc_rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_supplier_quotation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "rfq_id" TEXT,
    "supplier_party_id" TEXT,
    "currency_id" TEXT,
    "quotation_date" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "total_amount" DECIMAL(65,30),
    "evaluation_status" TEXT NOT NULL,

    CONSTRAINT "proc_supplier_quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_purchase_order" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "supplier_quotation_id" TEXT,
    "supplier_party_id" TEXT,
    "currency_id" TEXT,
    "payment_term_id" TEXT,
    "order_date" TIMESTAMP(3),
    "expected_receipt_date" TIMESTAMP(3),
    "subtotal" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "total_amount" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "proc_purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_purchase_order_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "requisition_line_id" TEXT,
    "product_id" TEXT,
    "ordered_quantity" DECIMAL(65,30),
    "received_quantity" DECIMAL(65,30),
    "invoiced_quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "unit_price" DECIMAL(65,30),
    "tax_code_id" TEXT,
    "project_id" TEXT,

    CONSTRAINT "proc_purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_goods_receipt" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "purchase_order_id" TEXT,
    "supplier_party_id" TEXT,
    "warehouse_id" TEXT,
    "receipt_date" TIMESTAMP(3),
    "inspection_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "proc_goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_goods_receipt_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT,
    "purchase_order_line_id" TEXT,
    "product_id" TEXT,
    "lot_id" TEXT,
    "serial_number_id" TEXT,
    "received_quantity" DECIMAL(65,30),
    "accepted_quantity" DECIMAL(65,30),
    "rejected_quantity" DECIMAL(65,30),
    "uom_id" TEXT,

    CONSTRAINT "proc_goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proc_three_way_match" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "goods_receipt_id" TEXT,
    "supplier_invoice_id" TEXT,
    "quantity_variance" DECIMAL(65,30),
    "price_variance" DECIMAL(65,30),
    "tax_variance" DECIMAL(65,30),
    "match_status" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "proc_three_way_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_lot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "lot_number" TEXT NOT NULL,
    "manufacture_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "quality_status" TEXT NOT NULL,

    CONSTRAINT "inv_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_serial_number" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "serial_number" TEXT NOT NULL,
    "current_location_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "inv_serial_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_move" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "move_type" TEXT NOT NULL,
    "source_location_id" TEXT,
    "destination_location_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "inv_stock_move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_move_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "stock_move_id" TEXT,
    "product_id" TEXT,
    "lot_id" TEXT,
    "serial_number_id" TEXT,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "unit_cost" DECIMAL(65,30),
    "total_value" DECIMAL(65,30),

    CONSTRAINT "inv_stock_move_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_reservation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "warehouse_location_id" TEXT,
    "project_id" TEXT,
    "sales_order_line_id" TEXT,
    "production_order_id" TEXT,
    "reserved_quantity" DECIMAL(65,30),
    "required_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "inv_stock_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_ledger_entry" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "product_id" TEXT,
    "warehouse_location_id" TEXT,
    "lot_id" TEXT,
    "serial_number_id" TEXT,
    "source_document_id" TEXT,
    "source_line_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "posting_at" TIMESTAMP(3),
    "quantity_delta" DECIMAL(65,30),
    "value_delta" DECIMAL(65,30),
    "unit_cost" DECIMAL(65,30),
    "balance_quantity" DECIMAL(65,30),
    "balance_value" DECIMAL(65,30),
    "reversal_of_id" TEXT,

    CONSTRAINT "inv_stock_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_balance" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "product_id" TEXT,
    "warehouse_location_id" TEXT,
    "lot_id" TEXT,
    "serial_number_id" TEXT,
    "on_hand_quantity" DECIMAL(65,30),
    "reserved_quantity" DECIMAL(65,30),
    "available_quantity" DECIMAL(65,30),
    "inventory_value" DECIMAL(65,30),
    "last_ledger_entry_id" TEXT,

    CONSTRAINT "inv_stock_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_valuation_layer" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "receipt_ledger_entry_id" TEXT,
    "original_quantity" DECIMAL(65,30),
    "remaining_quantity" DECIMAL(65,30),
    "unit_cost" DECIMAL(65,30),
    "remaining_value" DECIMAL(65,30),
    "received_at" TIMESTAMP(3),

    CONSTRAINT "inv_valuation_layer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_count" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "warehouse_id" TEXT,
    "count_date" TIMESTAMP(3),
    "count_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "inv_stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_count_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "stock_count_id" TEXT,
    "product_id" TEXT,
    "location_id" TEXT,
    "lot_id" TEXT,
    "system_quantity" DECIMAL(65,30),
    "counted_quantity" DECIMAL(65,30),
    "variance_quantity" DECIMAL(65,30),
    "variance_value" DECIMAL(65,30),

    CONSTRAINT "inv_stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bom" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "product_id" TEXT,
    "bom_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "mfg_bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bom_version" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "bom_id" TEXT,
    "version_number" INTEGER,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "output_quantity" DECIMAL(65,30),
    "output_uom_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "mfg_bom_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bom_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "bom_version_id" TEXT,
    "component_product_id" TEXT,
    "operation_id" TEXT,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "scrap_percent" DECIMAL(65,30),
    "issue_method" TEXT NOT NULL,

    CONSTRAINT "mfg_bom_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_routing" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "routing_code" TEXT NOT NULL,
    "routing_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "mfg_routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_routing_operation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "routing_id" TEXT,
    "work_center_id" TEXT,
    "sequence_number" INTEGER,
    "operation_name" TEXT NOT NULL,
    "setup_minutes" DECIMAL(65,30),
    "run_minutes_per_unit" DECIMAL(65,30),

    CONSTRAINT "mfg_routing_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_order" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "product_id" TEXT,
    "bom_version_id" TEXT,
    "routing_id" TEXT,
    "project_id" TEXT,
    "sales_order_line_id" TEXT,
    "warehouse_id" TEXT,
    "planned_quantity" DECIMAL(65,30),
    "completed_quantity" DECIMAL(65,30),
    "scrapped_quantity" DECIMAL(65,30),
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "material_status" TEXT NOT NULL,
    "quality_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "mfg_production_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_material" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "production_order_id" TEXT,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "required_quantity" DECIMAL(65,30),
    "reserved_quantity" DECIMAL(65,30),
    "issued_quantity" DECIMAL(65,30),
    "returned_quantity" DECIMAL(65,30),
    "actual_cost" DECIMAL(65,30),

    CONSTRAINT "mfg_production_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_work_order" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "production_order_id" TEXT,
    "routing_operation_id" TEXT,
    "work_center_id" TEXT,
    "machine_id" TEXT,
    "sequence_number" INTEGER,
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "planned_quantity" DECIMAL(65,30),
    "completed_quantity" DECIMAL(65,30),
    "rejected_quantity" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "mfg_work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_labor_log" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "employee_id" TEXT,
    "project_id" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "duration_hours" DECIMAL(65,30),
    "hourly_rate" DECIMAL(65,30),
    "labor_cost" DECIMAL(65,30),

    CONSTRAINT "mfg_labor_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_machine_log" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "machine_id" TEXT,
    "project_id" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "run_hours" DECIMAL(65,30),
    "setup_hours" DECIMAL(65,30),
    "downtime_hours" DECIMAL(65,30),
    "hourly_rate" DECIMAL(65,30),
    "machine_cost" DECIMAL(65,30),

    CONSTRAINT "mfg_machine_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_output" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "production_order_id" TEXT,
    "product_id" TEXT,
    "lot_id" TEXT,
    "output_quantity" DECIMAL(65,30),
    "unit_cost" DECIMAL(65,30),
    "total_cost" DECIMAL(65,30),
    "destination_location_id" TEXT,
    "produced_at" TIMESTAMP(3),

    CONSTRAINT "mfg_production_output_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_scrap" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "production_order_id" TEXT,
    "work_order_id" TEXT,
    "product_id" TEXT,
    "scrap_quantity" DECIMAL(65,30),
    "scrap_value" DECIMAL(65,30),
    "reason_code" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,

    CONSTRAINT "mfg_scrap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_cost_ledger_entry" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "work_order_id" TEXT,
    "product_id" TEXT,
    "cost_element" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30),
    "stock_ledger_entry_id" TEXT,
    "journal_line_id" TEXT,
    "source_document_id" TEXT,
    "posting_at" TIMESTAMP(3),
    "reversal_of_id" TEXT,

    CONSTRAINT "mfg_cost_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_quality_plan" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "product_id" TEXT,
    "plan_code" TEXT NOT NULL,
    "inspection_stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "qa_quality_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_quality_plan_point" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "quality_plan_id" TEXT,
    "sequence_number" INTEGER,
    "parameter_name" TEXT NOT NULL,
    "measurement_type" TEXT NOT NULL,
    "minimum_value" DECIMAL(65,30),
    "maximum_value" DECIMAL(65,30),
    "target_value" DECIMAL(65,30),
    "mandatory" BOOLEAN NOT NULL,

    CONSTRAINT "qa_quality_plan_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_inspection" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "quality_plan_id" TEXT,
    "product_id" TEXT,
    "lot_id" TEXT,
    "goods_receipt_id" TEXT,
    "production_order_id" TEXT,
    "work_order_id" TEXT,
    "inspector_user_id" TEXT,
    "inspection_type" TEXT NOT NULL,
    "quantity_inspected" DECIMAL(65,30),
    "quantity_accepted" DECIMAL(65,30),
    "quantity_rejected" DECIMAL(65,30),
    "inspection_at" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "qa_inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_inspection_result" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "inspection_id" TEXT,
    "plan_point_id" TEXT,
    "numeric_value" DECIMAL(65,30),
    "text_value" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "remarks" TEXT NOT NULL,

    CONSTRAINT "qa_inspection_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_nonconformance" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "inspection_id" TEXT,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "qa_nonconformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_corrective_action" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "nonconformance_id" TEXT,
    "assigned_user_id" TEXT,
    "action_description" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "verification_result" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "qa_corrective_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_fiscal_year" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "fiscal_year_name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_fiscal_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_fiscal_period" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT,
    "period_number" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_fiscal_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_account" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "parent_account_id" TEXT,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "normal_balance" TEXT NOT NULL,
    "currency_id" TEXT,
    "allow_manual_posting" BOOLEAN NOT NULL,
    "reconciliation_required" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_journal" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "journal_code" TEXT NOT NULL,
    "journal_name" TEXT NOT NULL,
    "journal_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_journal_entry" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "journal_id" TEXT,
    "fiscal_period_id" TEXT,
    "currency_id" TEXT,
    "entry_number" TEXT NOT NULL,
    "posting_date" TIMESTAMP(3),
    "exchange_rate" DECIMAL(65,30),
    "description" TEXT NOT NULL,
    "source_document_id" TEXT,
    "reversal_of_entry_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_journal_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT,
    "account_id" TEXT,
    "party_id" TEXT,
    "project_id" TEXT,
    "cost_center_id" TEXT,
    "department_id" TEXT,
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "debit_base" DECIMAL(65,30),
    "credit_base" DECIMAL(65,30),
    "transaction_currency_id" TEXT,
    "transaction_amount" DECIMAL(65,30),
    "due_date" TIMESTAMP(3),
    "source_document_line_id" TEXT,

    CONSTRAINT "fin_journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_billing_document" (
    "tax_scheme" TEXT,
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "party_id" TEXT,
    "currency_id" TEXT,
    "payment_term_id" TEXT,
    "sales_order_id" TEXT,
    "purchase_order_id" TEXT,
    "project_id" TEXT,
    "billing_type" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3),
    "posting_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "subtotal" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "total_amount" DECIMAL(65,30),
    "paid_amount" DECIMAL(65,30),
    "outstanding_amount" DECIMAL(65,30),
    "payment_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT NOT NULL,

    CONSTRAINT "fin_billing_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_billing_document_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "billing_document_id" TEXT,
    "product_id" TEXT,
    "account_id" TEXT,
    "project_id" TEXT,
    "cost_center_id" TEXT,
    "quantity" DECIMAL(65,30),
    "uom_id" TEXT,
    "unit_price" DECIMAL(65,30),
    "discount_amount" DECIMAL(65,30),
    "tax_code_id" TEXT,
    "line_total" DECIMAL(65,30),

    CONSTRAINT "fin_billing_document_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_ar_ap_schedule" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "billing_document_id" TEXT,
    "installment_number" INTEGER,
    "due_date" TIMESTAMP(3),
    "original_amount" DECIMAL(65,30),
    "paid_amount" DECIMAL(65,30),
    "outstanding_amount" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_ar_ap_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_payment" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "party_id" TEXT,
    "bank_account_id" TEXT,
    "currency_id" TEXT,
    "payment_type" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3),
    "amount" DECIMAL(65,30),
    "payment_method" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "journal_entry_id" TEXT,
    "status" TEXT NOT NULL,
    "allocation_plan" JSONB NOT NULL,
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "executed_by_id" TEXT,
    "executed_at" TIMESTAMP(3),
    "execution_reference" TEXT NOT NULL,
    "execution_note" TEXT NOT NULL,
    "failure_reason" TEXT NOT NULL,

    CONSTRAINT "fin_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_payment_allocation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "payment_id" TEXT,
    "billing_document_id" TEXT,
    "schedule_id" TEXT,
    "allocated_amount" DECIMAL(65,30),
    "discount_amount" DECIMAL(65,30),
    "write_off_amount" DECIMAL(65,30),
    "exchange_difference" DECIMAL(65,30),

    CONSTRAINT "fin_payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_bank_account" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "party_id" TEXT,
    "ledger_account_id" TEXT,
    "currency_id" TEXT,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_bank_statement" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "statement_date" TIMESTAMP(3),
    "opening_balance" DECIMAL(65,30),
    "closing_balance" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_bank_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_bank_statement_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "bank_statement_id" TEXT,
    "transaction_date" TIMESTAMP(3),
    "reference_number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit_amount" DECIMAL(65,30),
    "credit_amount" DECIMAL(65,30),
    "running_balance" DECIMAL(65,30),

    CONSTRAINT "fin_bank_statement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_bank_reconciliation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "bank_statement_line_id" TEXT,
    "payment_id" TEXT,
    "journal_line_id" TEXT,
    "matched_amount" DECIMAL(65,30),
    "match_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_bank_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_tax_transaction" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "billing_document_id" TEXT,
    "billing_document_line_id" TEXT,
    "tax_code_id" TEXT,
    "taxable_amount" DECIMAL(65,30),
    "tax_rate" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "tax_direction" TEXT NOT NULL,
    "tax_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "validation_note" TEXT NOT NULL,
    "validated_by_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "billing_code" TEXT NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "ntpn" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3),

    CONSTRAINT "fin_tax_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_budget" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "fiscal_year_id" TEXT,
    "budget_name" TEXT NOT NULL,
    "budget_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_budget_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "budget_id" TEXT,
    "account_id" TEXT,
    "project_id" TEXT,
    "cost_center_id" TEXT,
    "department_id" TEXT,
    "period_number" INTEGER,
    "budget_amount" DECIMAL(65,30),

    CONSTRAINT "fin_budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_period_closing" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "fiscal_period_id" TEXT,
    "executed_by" TEXT,
    "requested_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "closing_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_period_closing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_financial_snapshot" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "fiscal_period_id" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "revenue_amount" DECIMAL(65,30),
    "expense_amount" DECIMAL(65,30),
    "profit_loss_amount" DECIMAL(65,30),
    "operating_cashflow" DECIMAL(65,30),
    "investing_cashflow" DECIMAL(65,30),
    "financing_cashflow" DECIMAL(65,30),
    "cash_balance" DECIMAL(65,30),
    "snapshot_status" TEXT NOT NULL,

    CONSTRAINT "fin_financial_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_unit_cost_snapshot" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "product_id" TEXT,
    "cost_unit_code" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3),
    "material_cost" DECIMAL(65,30),
    "labor_cost" DECIMAL(65,30),
    "machine_cost" DECIMAL(65,30),
    "overhead_cost" DECIMAL(65,30),
    "total_cost" DECIMAL(65,30),
    "output_quantity" DECIMAL(65,30),
    "unit_cost" DECIMAL(65,30),

    CONSTRAINT "fin_unit_cost_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_recurring_payment_rule" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "party_id" TEXT,
    "bank_account_id" TEXT,
    "expense_account_id" TEXT,
    "currency_id" TEXT,
    "rule_code" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "recurrence_rule" TEXT NOT NULL,
    "next_run_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "approval_required" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_recurring_payment_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_recurring_payment_run" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "recurring_rule_id" TEXT,
    "payment_id" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "run_status" TEXT NOT NULL,
    "failure_reason" TEXT NOT NULL,

    CONSTRAINT "fin_recurring_payment_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_credit_facility" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "party_id" TEXT,
    "currency_id" TEXT,
    "facility_type" TEXT NOT NULL,
    "facility_number" TEXT NOT NULL,
    "credit_limit" DECIMAL(65,30),
    "utilized_amount" DECIMAL(65,30),
    "available_amount" DECIMAL(65,30),
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_credit_facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_project_wip_snapshot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "fiscal_period_id" TEXT,
    "snapshot_date" TIMESTAMP(3),
    "completion_percent" DECIMAL(65,30),
    "recognized_revenue" DECIMAL(65,30),
    "recognized_cost" DECIMAL(65,30),
    "wip_asset_amount" DECIMAL(65,30),
    "accrued_billing_amount" DECIMAL(65,30),
    "unbilled_amount" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_project_wip_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_project_funding" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "document_id" TEXT,
    "project_id" TEXT,
    "funding_source_party_id" TEXT,
    "currency_id" TEXT,
    "funding_type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requested_amount" DECIMAL(65,30),
    "approved_limit" DECIMAL(65,30),
    "interest_rate" DECIMAL(65,30),
    "start_date" TIMESTAMP(3),
    "maturity_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "review_note" TEXT NOT NULL,

    CONSTRAINT "fin_project_funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_project_funding_transaction" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_funding_id" TEXT,
    "payment_id" TEXT,
    "journal_entry_id" TEXT,
    "transaction_type" TEXT NOT NULL,
    "transaction_date" TIMESTAMP(3),
    "amount" DECIMAL(65,30),
    "outstanding_balance" DECIMAL(65,30),

    CONSTRAINT "fin_project_funding_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_cost_baseline" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "project_id" TEXT,
    "baseline_version" INTEGER,
    "effective_date" TIMESTAMP(3),
    "total_ideal_cost" DECIMAL(65,30),
    "approved_by" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_cost_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_cost_baseline_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "cost_baseline_id" TEXT,
    "product_id" TEXT,
    "account_id" TEXT,
    "cost_center_id" TEXT,
    "cost_element" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "unit_rate" DECIMAL(65,30),
    "ideal_amount" DECIMAL(65,30),

    CONSTRAINT "fin_cost_baseline_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_cost_variance" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "cost_baseline_line_id" TEXT,
    "fiscal_period_id" TEXT,
    "actual_amount" DECIMAL(65,30),
    "ideal_amount" DECIMAL(65,30),
    "variance_amount" DECIMAL(65,30),
    "variance_percent" DECIMAL(65,30),
    "calculated_at" TIMESTAMP(3),

    CONSTRAINT "fin_cost_variance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_overhead_rule" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "source_account_id" TEXT,
    "target_cost_center_id" TEXT,
    "rule_code" TEXT NOT NULL,
    "allocation_basis" TEXT NOT NULL,
    "rate_percent" DECIMAL(65,30),
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_overhead_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_overhead_allocation" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "overhead_rule_id" TEXT,
    "project_id" TEXT,
    "production_order_id" TEXT,
    "fiscal_period_id" TEXT,
    "journal_entry_id" TEXT,
    "basis_quantity" DECIMAL(65,30),
    "allocated_amount" DECIMAL(65,30),
    "posted_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "fin_overhead_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_project_cost_snapshot" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "budget_amount" DECIMAL(65,30),
    "committed_cost" DECIMAL(65,30),
    "actual_cost" DECIMAL(65,30),
    "overhead_cost" DECIMAL(65,30),
    "forecast_cost" DECIMAL(65,30),
    "cost_variance" DECIMAL(65,30),
    "remaining_budget" DECIMAL(65,30),

    CONSTRAINT "fin_project_cost_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_project_cost_entry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "project_id" TEXT NOT NULL,
    "division_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost_element" TEXT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "total_cost" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "validation_note" TEXT NOT NULL,
    "created_by_id" TEXT,
    "validated_by_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "journal_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_project_cost_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_billing_proposal" (
    "tax_scheme" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "project_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "trigger_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax_rate" DECIMAL(65,30) NOT NULL,
    "tax_amount" DECIMAL(65,30) NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT NOT NULL,
    "billing_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_billing_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_invoice_variance_case" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "billing_document_id" TEXT NOT NULL,
    "three_way_match_id" TEXT NOT NULL,
    "variance_type" TEXT NOT NULL,
    "total_variance" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_invoice_variance_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_customer_credit_limit" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "credit_limit" DECIMAL(65,30) NOT NULL,
    "used_credit" DECIMAL(65,30) NOT NULL,
    "payment_term_days" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_customer_credit_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_category" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "category_code" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "asset_account_id" TEXT,
    "accumulated_depreciation_account_id" TEXT,
    "depreciation_expense_account_id" TEXT,

    CONSTRAINT "asset_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_asset" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "company_id" TEXT,
    "category_id" TEXT,
    "supplier_party_id" TEXT,
    "warehouse_location_id" TEXT,
    "department_id" TEXT,
    "project_id" TEXT,
    "asset_code" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "acquisition_date" TIMESTAMP(3),
    "available_for_use_date" TIMESTAMP(3),
    "acquisition_cost" DECIMAL(65,30),
    "salvage_value" DECIMAL(65,30),
    "useful_life_months" INTEGER,
    "status" TEXT NOT NULL,

    CONSTRAINT "asset_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_book" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "asset_id" TEXT,
    "book_type" TEXT NOT NULL,
    "depreciation_method" TEXT NOT NULL,
    "cost_basis" DECIMAL(65,30),
    "salvage_value" DECIMAL(65,30),
    "useful_life_periods" INTEGER,
    "depreciation_start_date" TIMESTAMP(3),
    "accumulated_depreciation" DECIMAL(65,30),
    "net_book_value" DECIMAL(65,30),

    CONSTRAINT "asset_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "asset_book_id" TEXT,
    "fiscal_period_id" TEXT,
    "depreciation_date" TIMESTAMP(3),
    "opening_book_value" DECIMAL(65,30),
    "depreciation_amount" DECIMAL(65,30),
    "accumulated_depreciation" DECIMAL(65,30),
    "closing_book_value" DECIMAL(65,30),
    "journal_entry_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "asset_depreciation_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "asset_id" TEXT,
    "machine_id" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "maintenance_type" TEXT NOT NULL,
    "maintenance_cost" DECIMAL(65,30),
    "status" TEXT NOT NULL,

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposal" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "asset_id" TEXT,
    "disposal_date" TIMESTAMP(3),
    "disposal_proceeds" DECIMAL(65,30),
    "net_book_value" DECIMAL(65,30),
    "gain_or_loss" DECIMAL(65,30),
    "journal_entry_id" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "asset_disposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_case" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "customer_party_id" TEXT,
    "contact_id" TEXT,
    "sales_order_id" TEXT,
    "billing_document_id" TEXT,
    "product_id" TEXT,
    "serial_number_id" TEXT,
    "assigned_user_id" TEXT,
    "priority" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sla_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "service_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_case_message" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "service_case_id" TEXT,
    "sender_user_id" TEXT,
    "channel" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "service_case_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_case_approval" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "service_case_id" TEXT,
    "approver_user_id" TEXT,
    "approval_type" TEXT NOT NULL,
    "approved_amount" DECIMAL(65,30),
    "decision" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "service_case_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resolution" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "service_case_id" TEXT,
    "resolution_type" TEXT NOT NULL,
    "resolution_notes" TEXT NOT NULL,
    "credit_note_id" TEXT,
    "replacement_delivery_id" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "service_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_dashboard" (
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT,
    "dashboard_code" TEXT NOT NULL,
    "dashboard_name" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "dashboard_type" TEXT NOT NULL,
    "realtime_enabled" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "analytics_dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_dashboard_role" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT,
    "role_id" TEXT,
    "is_default" BOOLEAN NOT NULL,
    "can_customize" BOOLEAN NOT NULL,

    CONSTRAINT "analytics_dashboard_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_widget" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT,
    "widget_code" TEXT NOT NULL,
    "widget_name" TEXT NOT NULL,
    "widget_type" TEXT NOT NULL,
    "data_source_type" TEXT NOT NULL,
    "data_source_name" TEXT NOT NULL,
    "filter_json" JSONB NOT NULL,
    "layout_json" JSONB NOT NULL,
    "refresh_seconds" INTEGER,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "analytics_widget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_kpi_definition" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "kpi_code" TEXT NOT NULL,
    "kpi_name" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "measurement_unit" TEXT NOT NULL,
    "aggregation_method" TEXT NOT NULL,
    "source_entity" TEXT NOT NULL,
    "formula_expression" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "analytics_kpi_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_kpi_target" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "kpi_definition_id" TEXT,
    "company_id" TEXT,
    "organization_id" TEXT,
    "project_id" TEXT,
    "owner_user_id" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "target_value" DECIMAL(65,30),
    "warning_value" DECIMAL(65,30),
    "critical_value" DECIMAL(65,30),

    CONSTRAINT "analytics_kpi_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_kpi_result" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "kpi_definition_id" TEXT,
    "company_id" TEXT,
    "organization_id" TEXT,
    "project_id" TEXT,
    "owner_user_id" TEXT,
    "measured_at" TIMESTAMP(3),
    "actual_value" DECIMAL(65,30),
    "target_value" DECIMAL(65,30),
    "health_status" TEXT NOT NULL,
    "dimension_json" JSONB NOT NULL,

    CONSTRAINT "analytics_kpi_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_alert_rule" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "kpi_definition_id" TEXT,
    "rule_code" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold_value" DECIMAL(65,30),
    "severity" TEXT NOT NULL,
    "condition_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "analytics_alert_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_alert_event" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "alert_rule_id" TEXT,
    "company_id" TEXT,
    "project_id" TEXT,
    "source_document_id" TEXT,
    "source_entity_id" TEXT,
    "measured_value" DECIMAL(65,30),
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "analytics_alert_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_shipment" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "delivery_id" TEXT,
    "sales_order_id" TEXT,
    "customer_party_id" TEXT,
    "shipment_number" TEXT NOT NULL,
    "carrier_name" TEXT NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "planned_dispatch_at" TIMESTAMP(3),
    "actual_dispatch_at" TIMESTAMP(3),
    "estimated_arrival_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "shipment_status" TEXT NOT NULL,

    CONSTRAINT "logistics_shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_shipment_line" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "delivery_line_id" TEXT,
    "product_id" TEXT,
    "shipped_quantity" DECIMAL(65,30),
    "uom_id" TEXT,

    CONSTRAINT "logistics_shipment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_tracking_event" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "event_code" TEXT NOT NULL,
    "event_description" TEXT NOT NULL,
    "location_text" TEXT NOT NULL,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "event_at" TIMESTAMP(3),
    "source_system" TEXT NOT NULL,

    CONSTRAINT "logistics_tracking_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_proof_of_delivery" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "received_by_party_id" TEXT,
    "signature_file_id" TEXT,
    "photo_file_id" TEXT,
    "receiver_name" TEXT NOT NULL,
    "received_at" TIMESTAMP(3),
    "remarks" TEXT NOT NULL,
    "verification_status" TEXT NOT NULL,

    CONSTRAINT "logistics_proof_of_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_release" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "release_code" TEXT NOT NULL,
    "release_name" TEXT NOT NULL,
    "planned_start_date" TIMESTAMP(3),
    "planned_launch_date" TIMESTAMP(3),
    "actual_launch_date" TIMESTAMP(3),
    "release_status" TEXT NOT NULL,

    CONSTRAINT "implementation_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_phase" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "release_id" TEXT,
    "phase_code" TEXT NOT NULL,
    "phase_name" TEXT NOT NULL,
    "phase_order" INTEGER,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "actual_start_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_phase_item" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "phase_id" TEXT,
    "module_code" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "sequence_order" INTEGER,
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_phase_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_workflow" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "release_id" TEXT,
    "workflow_code" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_workflow_stage" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "workflow_id" TEXT,
    "stage_code" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "stage_order" INTEGER,
    "stage_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_workflow_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_work_item" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "release_id" TEXT,
    "phase_id" TEXT,
    "workflow_stage_id" TEXT,
    "assigned_user_id" TEXT,
    "module_code" TEXT NOT NULL,
    "work_item_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "planned_start_date" TIMESTAMP(3),
    "planned_end_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_work_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_test_cycle" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "release_id" TEXT,
    "phase_id" TEXT,
    "test_scope" TEXT NOT NULL,
    "test_type" TEXT NOT NULL,
    "planned_date" TIMESTAMP(3),
    "executed_date" TIMESTAMP(3),
    "passed_count" INTEGER,
    "failed_count" INTEGER,
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_test_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_gtm_milestone" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "release_id" TEXT,
    "milestone_type" TEXT NOT NULL,
    "milestone_name" TEXT NOT NULL,
    "planned_date" TIMESTAMP(3),
    "actual_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "implementation_gtm_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_finance_main_dashboard" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "company_id" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3),
    "profit_loss_amount" DECIMAL(65,30),
    "net_cashflow_amount" DECIMAL(65,30),
    "total_unit_hpp" DECIMAL(65,30),
    "active_alert_count" INTEGER,
    "periodic_kpi_count" INTEGER,

    CONSTRAINT "view_finance_main_dashboard_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "view_project_dashboard" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3),
    "overall_kpi_score" DECIMAL(65,30),
    "planned_progress_percent" DECIMAL(65,30),
    "actual_progress_percent" DECIMAL(65,30),
    "project_health_status" TEXT NOT NULL,
    "overdue_task_count" INTEGER,
    "unread_notification_count" INTEGER,

    CONSTRAINT "view_project_dashboard_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "view_project_timeline_cost" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3),
    "labor_hours" DECIMAL(65,30),
    "machine_hours" DECIMAL(65,30),
    "labor_cost" DECIMAL(65,30),
    "equipment_cost" DECIMAL(65,30),
    "material_cost" DECIMAL(65,30),
    "overhead_cost" DECIMAL(65,30),
    "total_actual_cost" DECIMAL(65,30),

    CONSTRAINT "view_project_timeline_cost_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "view_crm_sales_dashboard" (
    "tenant_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "company_id" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3),
    "weighted_project_value" DECIMAL(65,30),
    "win_rate_percent" DECIMAL(65,30),
    "prospect_count" INTEGER,
    "pitch_count" INTEGER,
    "closing_count" INTEGER,
    "offering_margin_percent" DECIMAL(65,30),

    CONSTRAINT "view_crm_sales_dashboard_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "workflow_tenant_config" (
    "company_id" TEXT,
    "created_by_id" TEXT,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "workflow_class_path" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "config_json" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_tenant_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transition_log" (
    "tenant_id" TEXT,
    "company_id" TEXT,
    "created_by_id" TEXT,
    "updated_at" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "tenant_code" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_transition_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_report" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "report_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "executive_summary" TEXT,
    "achievements" TEXT,
    "blockers" TEXT,
    "risks" TEXT,
    "decisions_needed" TEXT,
    "next_plan" TEXT,
    "snapshot_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "prepared_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "parent_report_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_tenant_code_key" ON "core_tenant"("code");

-- CreateIndex
CREATE INDEX "core_company_tenant_id_company_code_idx" ON "core_company"("tenant_id", "company_code");

-- CreateIndex
CREATE UNIQUE INDEX "marbot_request_nonce_key" ON "marbot_request"("nonce");

-- CreateIndex
CREATE INDEX "marbot_request_tenant_id_company_id_created_at_idx" ON "marbot_request"("tenant_id", "company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "marbot_tenant_config_tenant_id_key" ON "marbot_tenant_config"("tenant_id");

-- CreateIndex
CREATE INDEX "marbot_tenant_config_tenant_id_idx" ON "marbot_tenant_config"("tenant_id");

-- CreateIndex
CREATE INDEX "marbot_tenant_config_sync_status_idx" ON "marbot_tenant_config"("sync_status");

-- CreateIndex
CREATE INDEX "marbot_tenant_config_provisioning_operation_id_idx" ON "marbot_tenant_config"("provisioning_operation_id");

-- CreateIndex
CREATE INDEX "core_organization_tenant_id_company_id_idx" ON "core_organization"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_business_document_tenant_id_company_id_idx" ON "core_business_document"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_document_link_tenant_id_company_id_idx" ON "core_document_link"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_workflow_instance_tenant_id_company_id_idx" ON "core_workflow_instance"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_workflow_approval_tenant_id_company_id_idx" ON "core_workflow_approval"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_audit_event_tenant_id_company_id_idx" ON "core_audit_event"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_audit_event_tenant_id_company_id_entity_name_entity_id_idx" ON "core_audit_event"("tenant_id", "company_id", "entity_name", "entity_id", "event_type");

-- CreateIndex
CREATE INDEX "core_audit_event_company_id_entity_name_event_type_occurred_idx" ON "core_audit_event"("company_id", "entity_name", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "core_audit_event_company_id_entity_name_entity_id_event_typ_idx" ON "core_audit_event"("company_id", "entity_name", "entity_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "core_notification_tenant_id_company_id_idx" ON "core_notification"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_notification_recipient_tenant_id_company_id_idx" ON "core_notification_recipient"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_quick_action_action_code_key" ON "core_quick_action"("action_code");

-- CreateIndex
CREATE INDEX "core_quick_action_tenant_id_company_id_idx" ON "core_quick_action"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_file_tenant_id_company_id_idx" ON "core_file"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_document_attachment_tenant_id_company_id_idx" ON "core_document_attachment"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_document_template_template_code_key" ON "core_document_template"("template_code");

-- CreateIndex
CREATE INDEX "core_generated_document_tenant_id_company_id_idx" ON "core_generated_document"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_document_signature_tenant_id_company_id_idx" ON "core_document_signature"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_user_recent_item_tenant_id_company_id_idx" ON "core_user_recent_item"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_app_notification_tenant_id_company_id_idx" ON "core_app_notification"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_activity_feed_tenant_id_company_id_idx" ON "core_activity_feed"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_team_contact_user_id_key" ON "core_team_contact"("user_id");

-- CreateIndex
CREATE INDEX "core_team_contact_tenant_id_company_id_idx" ON "core_team_contact"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_user_username_key" ON "iam_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "iam_user_email_key" ON "iam_user"("email");

-- CreateIndex
CREATE INDEX "iam_role_tenant_id_company_id_idx" ON "iam_role"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "core_idempotency_key_tenant_id_company_id_created_at_idx" ON "core_idempotency_key"("tenant_id", "company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "core_idempotency_key_user_id_method_request_path_idempotenc_key" ON "core_idempotency_key"("user_id", "method", "request_path", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "iam_permission_permission_code_key" ON "iam_permission"("permission_code");

-- CreateIndex
CREATE INDEX "iam_user_role_tenant_id_company_id_idx" ON "iam_user_role"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_user_company_membership_user_id_key" ON "iam_user_company_membership"("user_id");

-- CreateIndex
CREATE INDEX "iam_user_company_membership_tenant_id_company_id_idx" ON "iam_user_company_membership"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_company_module_access_tenant_id_company_id_idx" ON "iam_company_module_access"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_company_module_access_company_id_module_code_key" ON "iam_company_module_access"("company_id", "module_code");

-- CreateIndex
CREATE INDEX "iam_user_module_access_tenant_id_company_id_user_id_idx" ON "iam_user_module_access"("tenant_id", "company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_user_module_access_user_id_module_code_key" ON "iam_user_module_access"("user_id", "module_code");

-- CreateIndex
CREATE INDEX "iam_role_permission_tenant_id_company_id_idx" ON "iam_role_permission"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_role_hierarchy_tenant_id_company_id_idx" ON "iam_role_hierarchy"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_data_scope_policy_policy_code_key" ON "iam_data_scope_policy"("policy_code");

-- CreateIndex
CREATE INDEX "iam_data_scope_policy_tenant_id_company_id_idx" ON "iam_data_scope_policy"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_role_data_scope_tenant_id_company_id_idx" ON "iam_role_data_scope"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_field_permission_tenant_id_company_id_idx" ON "iam_field_permission"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_information_share_rule_tenant_id_company_id_idx" ON "iam_information_share_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_approval_limit_tenant_id_company_id_idx" ON "iam_approval_limit"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "iam_user_project_access_tenant_id_company_id_idx" ON "iam_user_project_access"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_party_tenant_id_company_id_idx" ON "master_party"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_party_role_tenant_id_company_id_idx" ON "master_party_role"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_contact_tenant_id_company_id_idx" ON "master_contact"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_address_tenant_id_company_id_idx" ON "master_address"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_customer_profile_tenant_id_company_id_idx" ON "master_customer_profile"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_supplier_profile_tenant_id_company_id_idx" ON "master_supplier_profile"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_product_category_tenant_id_company_id_idx" ON "master_product_category"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_uom_tenant_id_company_id_idx" ON "master_uom"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_product_tenant_id_company_id_idx" ON "master_product"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_currency_currency_code_key" ON "master_currency"("currency_code");

-- CreateIndex
CREATE INDEX "master_exchange_rate_tenant_id_company_id_idx" ON "master_exchange_rate"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_payment_term_tenant_id_company_id_idx" ON "master_payment_term"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_tax_code_tenant_id_company_id_idx" ON "master_tax_code"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_cost_center_tenant_id_company_id_idx" ON "master_cost_center"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_department_tenant_id_company_id_idx" ON "master_department"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_employee_tenant_id_company_id_idx" ON "master_employee"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_employee_tenant_id_company_id_user_id_idx" ON "master_employee"("tenant_id", "company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_employee_company_id_user_id_key" ON "master_employee"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "master_warehouse_tenant_id_company_id_idx" ON "master_warehouse"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_warehouse_location_tenant_id_company_id_idx" ON "master_warehouse_location"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_work_center_tenant_id_company_id_idx" ON "master_work_center"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "master_machine_tenant_id_company_id_idx" ON "master_machine"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_lead_tenant_id_company_id_idx" ON "crm_lead"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_opportunity_tenant_id_company_id_idx" ON "crm_opportunity"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_opportunity_product_tenant_id_company_id_idx" ON "crm_opportunity_product"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_activity_tenant_id_company_id_idx" ON "crm_activity"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_pipeline_pipeline_code_key" ON "crm_pipeline"("pipeline_code");

-- CreateIndex
CREATE INDEX "crm_pipeline_tenant_id_company_id_idx" ON "crm_pipeline"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_pipeline_stage_tenant_id_company_id_idx" ON "crm_pipeline_stage"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_opportunity_stage_history_tenant_id_company_id_idx" ON "crm_opportunity_stage_history"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_executive_approval_tenant_id_company_id_idx" ON "crm_executive_approval"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_credit_status_snapshot_tenant_id_company_id_idx" ON "crm_credit_status_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_channel_account_tenant_id_company_id_idx" ON "crm_channel_account"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_conversation_tenant_id_company_id_idx" ON "crm_conversation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_conversation_participant_tenant_id_company_id_idx" ON "crm_conversation_participant"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_message_tenant_id_company_id_idx" ON "crm_message"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_message_attachment_tenant_id_company_id_idx" ON "crm_message_attachment"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_message_delivery_status_tenant_id_company_id_idx" ON "crm_message_delivery_status"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_feedback_tenant_id_company_id_idx" ON "crm_feedback"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_survey_survey_code_key" ON "crm_survey"("survey_code");

-- CreateIndex
CREATE INDEX "crm_survey_tenant_id_company_id_idx" ON "crm_survey"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_survey_question_tenant_id_company_id_idx" ON "crm_survey_question"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_survey_response_tenant_id_company_id_idx" ON "crm_survey_response"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_survey_answer_tenant_id_company_id_idx" ON "crm_survey_answer"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_customer_inquiry_opportunity_id_key" ON "crm_customer_inquiry"("opportunity_id");

-- CreateIndex
CREATE INDEX "crm_customer_inquiry_tenant_id_company_id_idx" ON "crm_customer_inquiry"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_inquiry_requirement_tenant_id_company_id_idx" ON "crm_inquiry_requirement"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_cost_estimate_tenant_id_company_id_idx" ON "crm_cost_estimate"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_cost_estimate_line_tenant_id_company_id_idx" ON "crm_cost_estimate_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_quotation_version_tenant_id_company_id_idx" ON "crm_quotation_version"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_quotation_delivery_tenant_id_company_id_idx" ON "crm_quotation_delivery"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_workflow_event_tenant_id_company_id_idx" ON "crm_workflow_event"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "crm_customer_feedback_tenant_id_company_id_idx" ON "crm_customer_feedback"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_quotation_tenant_id_company_id_idx" ON "sales_quotation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_quotation_line_tenant_id_company_id_idx" ON "sales_quotation_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_quotation_cost_tenant_id_company_id_idx" ON "sales_quotation_cost"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_contract_tenant_id_company_id_idx" ON "sales_contract"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_contract_line_tenant_id_company_id_idx" ON "sales_contract_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_order_tenant_id_company_id_idx" ON "sales_order"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_order_line_tenant_id_company_id_idx" ON "sales_order_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_delivery_tenant_id_company_id_idx" ON "sales_delivery"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_delivery_line_tenant_id_company_id_idx" ON "sales_delivery_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_demand_supply_link_tenant_id_company_id_idx" ON "sales_demand_supply_link"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_order_change_request_tenant_id_company_id_idx" ON "sales_order_change_request"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_recurring_order_rule_tenant_id_company_id_idx" ON "sales_recurring_order_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "sales_recurring_order_run_tenant_id_company_id_idx" ON "sales_recurring_order_run"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_project_tenant_id_company_id_idx" ON "project_project"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_control_item_tenant_id_company_id_idx" ON "project_control_item"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_control_item_daily_task_id_idx" ON "project_control_item"("daily_task_id");

-- CreateIndex
CREATE INDEX "project_expense_tenant_id_company_id_idx" ON "project_expense"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_lifecycle_event_tenant_id_company_id_idx" ON "project_lifecycle_event"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_readiness_check_tenant_id_company_id_idx" ON "project_readiness_check"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_member_tenant_id_company_id_idx" ON "project_member"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_member_active_authority_lookup_idx" ON "project_member"("company_id", "project_id", "user_id", "project_role", "status");

-- CreateIndex
CREATE INDEX "project_task_tenant_id_company_id_idx" ON "project_task"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_task_dependency_tenant_id_company_id_idx" ON "project_task_dependency"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_milestone_tenant_id_company_id_idx" ON "project_milestone"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_material_requirement_tenant_id_company_id_idx" ON "project_material_requirement"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_budget_line_tenant_id_company_id_idx" ON "project_budget_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_timesheet_tenant_id_company_id_idx" ON "project_timesheet"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_timesheet_tenant_id_company_id_employee_id_work_dat_idx" ON "project_timesheet"("tenant_id", "company_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "project_timesheet_tenant_id_company_id_project_id_employee__idx" ON "project_timesheet"("tenant_id", "company_id", "project_id", "employee_id");

-- CreateIndex
CREATE INDEX "project_timesheet_tenant_id_company_id_approval_status_idx" ON "project_timesheet"("tenant_id", "company_id", "approval_status");

-- CreateIndex
CREATE INDEX "project_change_request_tenant_id_company_id_idx" ON "project_change_request"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_board_tenant_id_company_id_idx" ON "project_board"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_board_column_tenant_id_company_id_idx" ON "project_board_column"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_task_board_position_tenant_id_company_id_idx" ON "project_task_board_position"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_health_rule_rule_code_key" ON "project_health_rule"("rule_code");

-- CreateIndex
CREATE INDEX "project_health_rule_tenant_id_company_id_idx" ON "project_health_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_health_snapshot_tenant_id_company_id_idx" ON "project_health_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_risk_tenant_id_company_id_idx" ON "project_risk"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_issue_tenant_id_company_id_idx" ON "project_issue"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_change_request_material_tenant_id_company_id_idx" ON "project_change_request_material"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_issue_action_tenant_id_company_id_idx" ON "project_issue_action"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_dispatch_tenant_id_company_id_idx" ON "project_dispatch"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_technical_brief_tenant_id_company_id_idx" ON "project_technical_brief"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_technical_brief_version_tenant_id_company_id_idx" ON "project_technical_brief_version"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_requirement_tenant_id_company_id_idx" ON "project_requirement"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_acceptance_criteria_tenant_id_company_id_idx" ON "project_acceptance_criteria"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_resource_request_tenant_id_company_id_idx" ON "project_resource_request"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_resource_request_line_tenant_id_company_id_idx" ON "project_resource_request_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_resource_allocation_tenant_id_company_id_idx" ON "project_resource_allocation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_progress_snapshot_tenant_id_company_id_idx" ON "project_progress_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_equipment_usage_tenant_id_company_id_idx" ON "project_equipment_usage"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_weight_indicator_tenant_id_company_id_idx" ON "project_weight_indicator"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_weight_component_tenant_id_company_id_idx" ON "project_weight_component"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_weekly_progress_tenant_id_company_id_idx" ON "project_weekly_progress"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_financial_snapshot_tenant_id_company_id_idx" ON "project_financial_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_main_task_tenant_id_company_id_idx" ON "project_main_task"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_main_task_company_cost_owner_division_idx" ON "project_main_task"("company_id", "cost_owner_division_id");

-- CreateIndex
CREATE INDEX "project_task_assignment_tenant_id_company_id_idx" ON "project_task_assignment"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_task_assignment_company_id_main_task_id_assignee_id_key" ON "project_task_assignment"("company_id", "main_task_id", "assignee_id");

-- CreateIndex
CREATE INDEX "project_weekly_task_tenant_id_company_id_idx" ON "project_weekly_task"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_daily_task_tenant_id_company_id_idx" ON "project_daily_task"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_task_transfer_request_tenant_id_company_id_idx" ON "project_task_transfer_request"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_task_activity_log_tenant_id_company_id_idx" ON "project_task_activity_log"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "project_evm_record_tenant_id_company_id_idx" ON "project_evm_record"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_purchase_requisition_tenant_id_company_id_idx" ON "proc_purchase_requisition"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_purchase_requisition_line_tenant_id_company_id_idx" ON "proc_purchase_requisition_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_rfq_tenant_id_company_id_idx" ON "proc_rfq"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_supplier_quotation_tenant_id_company_id_idx" ON "proc_supplier_quotation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_purchase_order_tenant_id_company_id_idx" ON "proc_purchase_order"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_purchase_order_line_tenant_id_company_id_idx" ON "proc_purchase_order_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_goods_receipt_tenant_id_company_id_idx" ON "proc_goods_receipt"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_goods_receipt_line_tenant_id_company_id_idx" ON "proc_goods_receipt_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "proc_three_way_match_tenant_id_company_id_idx" ON "proc_three_way_match"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_lot_tenant_id_company_id_idx" ON "inv_lot"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_serial_number_serial_number_key" ON "inv_serial_number"("serial_number");

-- CreateIndex
CREATE INDEX "inv_serial_number_tenant_id_company_id_idx" ON "inv_serial_number"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_move_tenant_id_company_id_idx" ON "inv_stock_move"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_move_line_tenant_id_company_id_idx" ON "inv_stock_move_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_reservation_tenant_id_company_id_idx" ON "inv_stock_reservation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_entry_tenant_id_company_id_idx" ON "inv_stock_ledger_entry"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_balance_tenant_id_company_id_idx" ON "inv_stock_balance"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_valuation_layer_tenant_id_company_id_idx" ON "inv_valuation_layer"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_count_tenant_id_company_id_idx" ON "inv_stock_count"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "inv_stock_count_line_tenant_id_company_id_idx" ON "inv_stock_count_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_bom_tenant_id_company_id_idx" ON "mfg_bom"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_bom_version_tenant_id_company_id_idx" ON "mfg_bom_version"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_bom_line_tenant_id_company_id_idx" ON "mfg_bom_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_routing_tenant_id_company_id_idx" ON "mfg_routing"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_routing_operation_tenant_id_company_id_idx" ON "mfg_routing_operation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_production_order_tenant_id_company_id_idx" ON "mfg_production_order"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_production_material_tenant_id_company_id_idx" ON "mfg_production_material"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_work_order_tenant_id_company_id_idx" ON "mfg_work_order"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_labor_log_tenant_id_company_id_idx" ON "mfg_labor_log"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_machine_log_tenant_id_company_id_idx" ON "mfg_machine_log"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_production_output_tenant_id_company_id_idx" ON "mfg_production_output"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_scrap_tenant_id_company_id_idx" ON "mfg_scrap"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "mfg_cost_ledger_entry_tenant_id_company_id_idx" ON "mfg_cost_ledger_entry"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_quality_plan_tenant_id_company_id_idx" ON "qa_quality_plan"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_quality_plan_point_tenant_id_company_id_idx" ON "qa_quality_plan_point"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_inspection_tenant_id_company_id_idx" ON "qa_inspection"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_inspection_result_tenant_id_company_id_idx" ON "qa_inspection_result"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_nonconformance_tenant_id_company_id_idx" ON "qa_nonconformance"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "qa_corrective_action_tenant_id_company_id_idx" ON "qa_corrective_action"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_fiscal_year_tenant_id_company_id_idx" ON "fin_fiscal_year"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_fiscal_period_tenant_id_company_id_idx" ON "fin_fiscal_period"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_account_tenant_id_company_id_idx" ON "fin_account"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_journal_tenant_id_company_id_idx" ON "fin_journal"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_journal_entry_tenant_id_company_id_idx" ON "fin_journal_entry"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_journal_line_tenant_id_company_id_idx" ON "fin_journal_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_billing_document_tenant_id_company_id_idx" ON "fin_billing_document"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_billing_document_line_tenant_id_company_id_idx" ON "fin_billing_document_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_ar_ap_schedule_tenant_id_company_id_idx" ON "fin_ar_ap_schedule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_payment_tenant_id_company_id_idx" ON "fin_payment"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_payment_allocation_tenant_id_company_id_idx" ON "fin_payment_allocation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_bank_account_tenant_id_company_id_idx" ON "fin_bank_account"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_bank_statement_tenant_id_company_id_idx" ON "fin_bank_statement"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_bank_statement_line_tenant_id_company_id_idx" ON "fin_bank_statement_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_bank_reconciliation_tenant_id_company_id_idx" ON "fin_bank_reconciliation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_tax_transaction_tenant_id_company_id_idx" ON "fin_tax_transaction"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_budget_tenant_id_company_id_idx" ON "fin_budget"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_budget_line_tenant_id_company_id_idx" ON "fin_budget_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_period_closing_tenant_id_company_id_idx" ON "fin_period_closing"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_financial_snapshot_tenant_id_company_id_idx" ON "fin_financial_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_unit_cost_snapshot_tenant_id_company_id_idx" ON "fin_unit_cost_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_recurring_payment_rule_rule_code_key" ON "fin_recurring_payment_rule"("rule_code");

-- CreateIndex
CREATE INDEX "fin_recurring_payment_rule_tenant_id_company_id_idx" ON "fin_recurring_payment_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_recurring_payment_run_tenant_id_company_id_idx" ON "fin_recurring_payment_run"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_credit_facility_tenant_id_company_id_idx" ON "fin_credit_facility"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_wip_snapshot_tenant_id_company_id_idx" ON "fin_project_wip_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_funding_tenant_id_company_id_idx" ON "fin_project_funding"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_funding_transaction_tenant_id_company_id_idx" ON "fin_project_funding_transaction"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_cost_baseline_tenant_id_company_id_idx" ON "fin_cost_baseline"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_cost_baseline_line_tenant_id_company_id_idx" ON "fin_cost_baseline_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_cost_variance_tenant_id_company_id_idx" ON "fin_cost_variance"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_overhead_rule_rule_code_key" ON "fin_overhead_rule"("rule_code");

-- CreateIndex
CREATE INDEX "fin_overhead_rule_tenant_id_company_id_idx" ON "fin_overhead_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_overhead_allocation_tenant_id_company_id_idx" ON "fin_overhead_allocation"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_cost_snapshot_tenant_id_company_id_idx" ON "fin_project_cost_snapshot"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_cost_entry_tenant_id_company_id_idx" ON "fin_project_cost_entry"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_project_cost_entry_division_id_idx" ON "fin_project_cost_entry"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_billing_proposal_billing_document_id_key" ON "fin_billing_proposal"("billing_document_id");

-- CreateIndex
CREATE INDEX "fin_billing_proposal_tenant_id_company_id_idx" ON "fin_billing_proposal"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_invoice_variance_case_three_way_match_id_key" ON "fin_invoice_variance_case"("three_way_match_id");

-- CreateIndex
CREATE INDEX "fin_invoice_variance_case_tenant_id_company_id_idx" ON "fin_invoice_variance_case"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "fin_customer_credit_limit_tenant_id_company_id_idx" ON "fin_customer_credit_limit"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_category_tenant_id_company_id_idx" ON "asset_category"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_asset_tenant_id_company_id_idx" ON "asset_asset"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_book_tenant_id_company_id_idx" ON "asset_book"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_depreciation_line_tenant_id_company_id_idx" ON "asset_depreciation_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_tenant_id_company_id_idx" ON "asset_maintenance"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "asset_disposal_tenant_id_company_id_idx" ON "asset_disposal"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "service_case_tenant_id_company_id_idx" ON "service_case"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "service_case_message_tenant_id_company_id_idx" ON "service_case_message"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "service_case_approval_tenant_id_company_id_idx" ON "service_case_approval"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "service_resolution_tenant_id_company_id_idx" ON "service_resolution"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_dashboard_dashboard_code_key" ON "analytics_dashboard"("dashboard_code");

-- CreateIndex
CREATE INDEX "analytics_dashboard_tenant_id_company_id_idx" ON "analytics_dashboard"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "analytics_dashboard_role_tenant_id_company_id_idx" ON "analytics_dashboard_role"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "analytics_widget_tenant_id_company_id_idx" ON "analytics_widget"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_kpi_definition_kpi_code_key" ON "analytics_kpi_definition"("kpi_code");

-- CreateIndex
CREATE INDEX "analytics_kpi_definition_tenant_id_company_id_idx" ON "analytics_kpi_definition"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "analytics_kpi_target_tenant_id_company_id_idx" ON "analytics_kpi_target"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "analytics_kpi_result_tenant_id_company_id_idx" ON "analytics_kpi_result"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_alert_rule_rule_code_key" ON "analytics_alert_rule"("rule_code");

-- CreateIndex
CREATE INDEX "analytics_alert_rule_tenant_id_company_id_idx" ON "analytics_alert_rule"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "analytics_alert_event_tenant_id_company_id_idx" ON "analytics_alert_event"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "logistics_shipment_tenant_id_company_id_idx" ON "logistics_shipment"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "logistics_shipment_line_tenant_id_company_id_idx" ON "logistics_shipment_line"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "logistics_tracking_event_tenant_id_company_id_idx" ON "logistics_tracking_event"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "logistics_proof_of_delivery_tenant_id_company_id_idx" ON "logistics_proof_of_delivery"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_release_release_code_key" ON "implementation_release"("release_code");

-- CreateIndex
CREATE INDEX "implementation_release_tenant_id_company_id_idx" ON "implementation_release"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_phase_tenant_id_company_id_idx" ON "implementation_phase"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_phase_item_tenant_id_company_id_idx" ON "implementation_phase_item"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_workflow_workflow_code_key" ON "implementation_workflow"("workflow_code");

-- CreateIndex
CREATE INDEX "implementation_workflow_tenant_id_company_id_idx" ON "implementation_workflow"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_workflow_stage_tenant_id_company_id_idx" ON "implementation_workflow_stage"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_work_item_tenant_id_company_id_idx" ON "implementation_work_item"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_test_cycle_tenant_id_company_id_idx" ON "implementation_test_cycle"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "implementation_gtm_milestone_tenant_id_company_id_idx" ON "implementation_gtm_milestone"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "view_finance_main_dashboard_tenant_id_company_id_idx" ON "view_finance_main_dashboard"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "view_project_dashboard_tenant_id_company_id_idx" ON "view_project_dashboard"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "view_project_timeline_cost_tenant_id_company_id_idx" ON "view_project_timeline_cost"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "view_crm_sales_dashboard_tenant_id_company_id_idx" ON "view_crm_sales_dashboard"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "workflow_tenant_config_tenant_id_company_id_idx" ON "workflow_tenant_config"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "workflow_transition_log_tenant_id_company_id_idx" ON "workflow_transition_log"("tenant_id", "company_id");

-- CreateIndex
CREATE INDEX "management_report_tenant_id_company_id_status_idx" ON "management_report"("tenant_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "management_report_company_id_report_number_version_number_key" ON "management_report"("company_id", "report_number", "version_number");
