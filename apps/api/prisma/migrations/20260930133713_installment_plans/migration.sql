-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credit_card_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "count" SMALLINT NOT NULL,
    "total_amount" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_transaction_id_key" ON "installment_plans"("transaction_id");

-- CreateIndex
CREATE INDEX "installment_plans_credit_card_id_idx" ON "installment_plans"("credit_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_id_user_id_key" ON "credit_cards"("id", "user_id");

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_credit_card_id_user_id_fkey" FOREIGN KEY ("credit_card_id", "user_id") REFERENCES "credit_cards"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- De 2 a 36 cuotas (decidido el 2026-09-29): una sola cuota es una compra normal.
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_count_range"
    CHECK ("count" BETWEEN 2 AND 36);

-- El total del banco, si lo hay, es un monto positivo. Que no baje del precio de la compra lo
-- decide el dominio, que ve la compra como está hoy.
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_total_amount_positive"
    CHECK ("total_amount" > 0);
