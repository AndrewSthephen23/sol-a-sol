-- CreateEnum
CREATE TYPE "capture_source" AS ENUM ('IOS_SHORTCUT', 'ANDROID_AUTOMATION');

-- CreateEnum
CREATE TYPE "capture_status" AS ENUM ('PENDING', 'CONFIRMED', 'DISCARDED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "captures" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "capture_source" NOT NULL,
    "raw_payload" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "business_date" DATE NOT NULL,
    "type" "transaction_type" NOT NULL DEFAULT 'VARIABLE_EXPENSE',
    "amount" DECIMAL(18,2),
    "currency" "currency",
    "merchant" TEXT,
    "card_last4" TEXT,
    "description" TEXT,
    "category_id" UUID,
    "payment_method_id" UUID,
    "transaction_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "capture_status" NOT NULL DEFAULT 'PENDING',
    "discarded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorization_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "pattern_key" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "captures_transaction_id_key" ON "captures"("transaction_id");

-- CreateIndex
CREATE INDEX "captures_user_id_status_business_date_idx" ON "captures"("user_id", "status", "business_date");

-- CreateIndex
CREATE INDEX "captures_category_id_idx" ON "captures"("category_id");

-- CreateIndex
CREATE INDEX "captures_payment_method_id_idx" ON "captures"("payment_method_id");

-- CreateIndex
CREATE UNIQUE INDEX "captures_user_id_idempotency_key_key" ON "captures"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "captures_id_user_id_key" ON "captures"("id", "user_id");

-- CreateIndex
CREATE INDEX "categorization_rules_category_id_idx" ON "categorization_rules"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorization_rules_user_id_pattern_key_key" ON "categorization_rules"("user_id", "pattern_key");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_category_id_user_id_type_fkey" FOREIGN KEY ("category_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_payment_method_id_user_id_fkey" FOREIGN KEY ("payment_method_id", "user_id") REFERENCES "payment_methods"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;




-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- Prisma deja las listas sin `NOT NULL`; sin avisos es la lista vacía, no la ausencia de lista.
ALTER TABLE "captures" ADD CONSTRAINT "captures_warnings_not_null"
    CHECK ("warnings" IS NOT NULL);

-- Un monto de captura, como el de una transacción, es positivo: el signo lo da el tipo. Puede
-- llegar sin moneda (decisión 3 de H7, 2026-10-03): la de un método bimoneda o no reconocido se
-- elige en la bandeja, así que no se exigen juntos.
ALTER TABLE "captures" ADD CONSTRAINT "captures_amount_positive"
    CHECK ("amount" > 0);

-- Solo los últimos 4 dígitos, como `payment_methods.last4`: nunca un número de tarjeta.
ALTER TABLE "captures" ADD CONSTRAINT "captures_card_last4_format"
    CHECK ("card_last4" ~ '^[0-9]{4}$');

ALTER TABLE "captures" ADD CONSTRAINT "captures_idempotency_key_not_blank"
    CHECK (btrim("idempotency_key") <> '');

-- Confirmada si y solo si salió su transacción.
ALTER TABLE "captures" ADD CONSTRAINT "captures_confirmed_has_transaction"
    CHECK (("status" = 'CONFIRMED') = ("transaction_id" IS NOT NULL));

-- Descartada si y solo si tiene fecha de descarte: con ella se borra a los 90 días (decisión 11).
ALTER TABLE "captures" ADD CONSTRAINT "captures_discarded_has_date"
    CHECK (("status" = 'DISCARDED') = ("discarded_at" IS NOT NULL));

-- El pedido crudo se guarda siempre (es un objeto JSON, nunca un `null` de JSON) y se borra al
-- confirmar (decisión 14): de una confirmada queda solo lo interpretado. El `IS NOT NULL` hace
-- falta: con el pedido nulo, `jsonb_typeof` da nulo y el `CHECK` lo dejaría pasar.
ALTER TABLE "captures" ADD CONSTRAINT "captures_raw_payload_until_confirmed"
    CHECK (
        ("status" = 'CONFIRMED' AND "raw_payload" IS NULL)
        OR ("status" <> 'CONFIRMED'
            AND "raw_payload" IS NOT NULL
            AND jsonb_typeof("raw_payload") = 'object')
    );

ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_pattern_not_blank"
    CHECK (btrim("pattern") <> '' AND btrim("pattern_key") <> '');

-- Cero o más; gana la mayor (decidido el 2026-10-03).
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_priority_not_negative"
    CHECK ("priority" >= 0);
