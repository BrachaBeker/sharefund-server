-- CreateEnum
CREATE TYPE "Role" AS ENUM ('manager', 'member');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'withdraw');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('meeting', 'equipment', 'general', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "category" "TransactionCategory" NOT NULL DEFAULT 'general',
    "note" TEXT NOT NULL DEFAULT '',
    "fund_balance_after" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "to_all" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "message_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_idx" ON "group_memberships"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_user_id_group_id_key" ON "group_memberships"("user_id", "group_id");

-- CreateIndex
CREATE INDEX "transactions_group_id_created_at_idx" ON "transactions"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "messages_group_id_created_at_idx" ON "messages"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "message_recipients_user_id_idx" ON "message_recipients"("user_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
