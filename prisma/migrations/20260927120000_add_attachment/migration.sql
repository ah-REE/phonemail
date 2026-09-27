-- Attachments: the bytes of a file attached to a delivered message. Purely additive.
--
-- Stored in Postgres, not on disk: the container filesystem is not durable, so a
-- file written there would not survive a rebuild, and the requirement was "no
-- filesystem storage".
--
-- ONE ROW PER (Email row, file). A group broadcast is fanned out into one Email row
-- per recipient (see lib/inbound.ts), so its attachment is stored once per row
-- rather than shared through a join table. Documented trade-off: duplicated bytes
-- for a group message, in exchange for an attachment that is owned by exactly the
-- row it belongs to - so the download check IS the row's party check, and deleting
-- a message takes its bytes with it through the cascade.

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_emailId_idx" ON "Attachment"("emailId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
