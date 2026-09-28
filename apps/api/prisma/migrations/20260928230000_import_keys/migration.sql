-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "import_key" TEXT;

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "import_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_import_key_key" ON "transactions"("user_id", "import_key");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_user_id_import_key_key" ON "transfers"("user_id", "import_key");

