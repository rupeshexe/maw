-- CreateTable
CREATE TABLE "Principal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalSubjectId" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "defaultAsset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "available" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "rulesJson" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rulesJson" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "supplierGroup" TEXT NOT NULL DEFAULT 'approved',
    "status" TEXT NOT NULL DEFAULT 'active',
    "externalReference" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressOrReference" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_verification',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "initiatedByPrincipalId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "purpose" TEXT,
    "category" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "subscriptionId" TEXT,
    "escrowId" TEXT,
    "azureContextJson" JSONB,
    "failureReason" TEXT,
    "providerTransactionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "matchedRulesJson" JSONB NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requiredApproverRole" TEXT NOT NULL DEFAULT 'MAW.Approver',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decisionReason" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "status" TEXT NOT NULL,
    "txHashOrReference" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "settlementMetadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "asset" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "category" TEXT,
    "purpose" TEXT,
    "cadence" TEXT NOT NULL,
    "nextExecutionAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "maxExecutions" INTEGER,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastResultJson" JSONB,
    "policyContextJson" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payerWalletId" TEXT NOT NULL,
    "beneficiaryDestinationId" TEXT NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL,
    "asset" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'created',
    "releaseConditionJson" JSONB NOT NULL,
    "externalReference" TEXT,
    "counterpartyAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "externalComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorPrincipalId" TEXT,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "fromAsset" TEXT NOT NULL,
    "toAsset" TEXT NOT NULL,
    "sourceAmount" DECIMAL(38,8) NOT NULL,
    "targetAmount" DECIMAL(38,8) NOT NULL,
    "feeAmount" DECIMAL(38,8) NOT NULL,
    "rate" DECIMAL(38,12) NOT NULL,
    "provider" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AzureBillingRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "azureSubscriptionId" TEXT NOT NULL,
    "resourceId" TEXT,
    "costCategory" TEXT NOT NULL,
    "invoiceReference" TEXT NOT NULL,
    "chargeAmount" DECIMAL(38,8) NOT NULL,
    "chargeCurrency" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AzureBillingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Principal_tenantId_idx" ON "Principal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Principal_tenantId_externalSubjectId_key" ON "Principal"("tenantId", "externalSubjectId");

-- CreateIndex
CREATE INDEX "Wallet_tenantId_idx" ON "Wallet"("tenantId");

-- CreateIndex
CREATE INDEX "Wallet_principalId_idx" ON "Wallet"("principalId");

-- CreateIndex
CREATE INDEX "WalletBalance_tenantId_idx" ON "WalletBalance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletBalance_walletId_asset_key" ON "WalletBalance"("walletId", "asset");

-- CreateIndex
CREATE INDEX "SpendingPolicy_tenantId_idx" ON "SpendingPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyVersion_tenantId_idx" ON "PolicyVersion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policyId_version_key" ON "PolicyVersion"("policyId", "version");

-- CreateIndex
CREATE INDEX "PolicyAssignment_tenantId_idx" ON "PolicyAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyAssignment_walletId_idx" ON "PolicyAssignment"("walletId");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Destination_tenantId_idx" ON "Destination"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_tenantId_network_addressOrReference_key" ON "Destination"("tenantId", "network", "addressOrReference");

-- CreateIndex
CREATE INDEX "PaymentIntent_tenantId_status_idx" ON "PaymentIntent"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_walletId_createdAt_idx" ON "PaymentIntent"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_tenantId_walletId_idempotencyKey_key" ON "PaymentIntent"("tenantId", "walletId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PolicyDecision_tenantId_idx" ON "PolicyDecision"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyDecision_paymentIntentId_idx" ON "PolicyDecision"("paymentIntentId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_status_idx" ON "ApprovalRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApprovalEvent_approvalId_idx" ON "ApprovalEvent"("approvalId");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_idx" ON "Transaction"("tenantId");

-- CreateIndex
CREATE INDEX "Transaction_paymentIntentId_idx" ON "Transaction"("paymentIntentId");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_idx" ON "Receipt"("tenantId");

-- CreateIndex
CREATE INDEX "Receipt_transactionId_idx" ON "Receipt"("transactionId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_nextExecutionAt_idx" ON "Subscription"("tenantId", "status", "nextExecutionAt");

-- CreateIndex
CREATE INDEX "Escrow_tenantId_state_idx" ON "Escrow"("tenantId", "state");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "ConversionQuote_tenantId_status_idx" ON "ConversionQuote"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AzureBillingRecord_tenantId_status_idx" ON "AzureBillingRecord"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AzureBillingRecord_tenantId_invoiceReference_key" ON "AzureBillingRecord"("tenantId", "invoiceReference");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBalance" ADD CONSTRAINT "WalletBalance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingPolicy" ADD CONSTRAINT "SpendingPolicy_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SpendingPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SpendingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_initiatedByPrincipalId_fkey" FOREIGN KEY ("initiatedByPrincipalId") REFERENCES "Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_payerWalletId_fkey" FOREIGN KEY ("payerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_beneficiaryDestinationId_fkey" FOREIGN KEY ("beneficiaryDestinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AzureBillingRecord" ADD CONSTRAINT "AzureBillingRecord_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

