-- La clave foránea que `transactions.capture_id` espera desde H3, en su propia migración para no
-- editar `transactions_core`. Sin cascada: una transacción sobrevive a su captura. Una captura da
-- a lo más una transacción.

-- CreateIndex
CREATE UNIQUE INDEX "transactions_capture_id_key" ON "transactions"("capture_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_capture_id_user_id_fkey" FOREIGN KEY ("capture_id", "user_id") REFERENCES "captures"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
