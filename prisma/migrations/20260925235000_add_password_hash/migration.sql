-- Phase 0: the added password-login path.
--
-- Nullable and purely additive: NULL means "no password set yet", which is every
-- existing account and every account that signs up with OTP alone. OTP login is
-- unaffected and remains the primary path.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;
