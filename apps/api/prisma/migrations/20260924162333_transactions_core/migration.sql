-- CreateEnum
CREATE TYPE "transaction_source" AS ENUM ('MANUAL', 'IOS_SHORTCUT', 'ANDROID_AUTOMATION', 'IMPORT');

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "transaction_type" NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency" NOT NULL,
    "description" TEXT NOT NULL,
    "payment_method_id" UUID,
    "merchant" TEXT,
    "source" "transaction_source" NOT NULL,
    "capture_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_payment_method_id_idx" ON "transactions"("payment_method_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_id_user_id_key" ON "payment_methods"("id", "user_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_user_id_type_fkey" FOREIGN KEY ("category_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_user_id_fkey" FOREIGN KEY ("payment_method_id", "user_id") REFERENCES "payment_methods"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- El monto de una transacción siempre es positivo: el signo lo da el tipo. El dominio lo exige
-- primero (TRANSACTION_AMOUNT_NOT_POSITIVE); esto es la red por si alguien se lo salta.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive"
    CHECK ("amount" > 0);
