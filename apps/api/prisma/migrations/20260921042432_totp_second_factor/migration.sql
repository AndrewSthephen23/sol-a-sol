-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_last_counter" BIGINT;
