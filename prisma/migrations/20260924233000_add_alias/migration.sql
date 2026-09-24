-- Day 6 aliases: a human-readable local part that reaches the same account as
-- the phone number.
--
-- localPart is UNIQUE on purpose. An alias that collided with another alias -
-- or with an existing User.phoneNumber - would make <localPart>@phonemail.com
-- resolve ambiguously, so the API refuses to create one (the guarantee is
-- enforced at creation time, not just by this index).

-- CreateTable
CREATE TABLE "Alias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alias_localPart_key" ON "Alias"("localPart");

-- CreateIndex
CREATE INDEX "Alias_userId_createdAt_idx" ON "Alias"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Alias" ADD CONSTRAINT "Alias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
