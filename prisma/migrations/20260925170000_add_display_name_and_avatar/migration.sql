-- Day 7: display names and profile pictures.
--
-- All four columns are nullable, so this is purely additive: existing rows keep
-- working and NULL displayName means "show the phone number".
--
-- The picture lives in Postgres rather than on disk because the container
-- filesystem is not durable - a rebuilt app container would lose uploaded files.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "avatarBytes" BYTEA,
ADD COLUMN     "avatarMime" TEXT,
ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3);
