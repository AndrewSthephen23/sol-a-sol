-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "from_payment_method_id" UUID NOT NULL,
    "to_payment_method_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency" NOT NULL,
    "received_amount" DECIMAL(18,2) NOT NULL,
    "received_currency" "currency" NOT NULL,
    "description" TEXT NOT NULL,
    "source" "transaction_source" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfers_user_id_date_idx" ON "transfers"("user_id", "date");

-- CreateIndex
CREATE INDEX "transfers_from_payment_method_id_idx" ON "transfers"("from_payment_method_id");

-- CreateIndex
CREATE INDEX "transfers_to_payment_method_id_idx" ON "transfers"("to_payment_method_id");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_payment_method_id_user_id_fkey" FOREIGN KEY ("from_payment_method_id", "user_id") REFERENCES "payment_methods"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_payment_method_id_user_id_fkey" FOREIGN KEY ("to_payment_method_id", "user_id") REFERENCES "payment_methods"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí. El dominio lo exige primero
-- (TRANSFER_*); esto es la red por si alguien se lo salta.

-- Los dos montos siempre son positivos.
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amounts_positive"
    CHECK ("amount" > 0 AND "received_amount" > 0);

-- La plata va de una cuenta a otra, nunca a la misma.
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_accounts"
    CHECK ("from_payment_method_id" <> "to_payment_method_id");

-- En la misma moneda llega lo mismo que salió: solo un cambio de moneda puede dar dos montos.
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_same_currency_same_amount"
    CHECK ("currency" <> "received_currency" OR "amount" = "received_amount");
