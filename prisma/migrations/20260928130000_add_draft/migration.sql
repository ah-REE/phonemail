-- ROUND 22: one server-side draft per user. The composer's write-through store,
-- so an abandoned message survives the tab, the device, and an offline spell; the
-- browser's own copy is a cache, not the source of truth.
--
-- The UNIQUE index IS the "one active draft" rule, so two tabs saving at once
-- cannot leave two drafts behind.
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "to" TEXT NOT NULL DEFAULT '',
    "cc" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Draft_userId_key" ON "Draft"("userId");

ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
