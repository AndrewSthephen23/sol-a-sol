-- CreateEnum
CREATE TYPE "payment_due_rule" AS ENUM ('DAYS_AFTER_STATEMENT', 'DAY_OF_MONTH');

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "kind" "payment_method_kind" NOT NULL DEFAULT 'CREDIT_CARD',
    "credit_limit" DECIMAL(18,2) NOT NULL,
    "credit_limit_currency" "currency" NOT NULL,
    "statement_day" SMALLINT NOT NULL,
    "payment_due_rule" "payment_due_rule" NOT NULL,
    "due_days_after_statement" SMALLINT,
    "due_day_of_month" SMALLINT,
    "opening_balance_pen" DECIMAL(18,2),
    "opening_balance_usd" DECIMAL(18,2),
    "opening_balance_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_payment_method_id_key" ON "credit_cards"("payment_method_id");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_id_user_id_kind_key" ON "payment_methods"("id", "user_id", "kind");

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_payment_method_id_user_id_kind_fkey" FOREIGN KEY ("payment_method_id", "user_id", "kind") REFERENCES "payment_methods"("id", "user_id", "kind") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- `kind` existe solo para la clave foránea compuesta: fijarlo hace que la base exija que la
-- tarjeta cuelgue de un método de pago `CREDIT_CARD`.
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_kind_is_credit_card"
    CHECK ("kind" = 'CREDIT_CARD');

-- La línea es cero o más; un negativo no es una línea de crédito.
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_credit_limit_not_negative"
    CHECK ("credit_limit" >= 0);

-- Un día del mes. Si el mes no lo tiene, el corte cae el último día (lo resuelve el dominio).
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_statement_day_range"
    CHECK ("statement_day" BETWEEN 1 AND 31);

-- Cada regla de pago lleva su dato y no el de la otra (decisión 5 de H5, 2026-09-29). El
-- `IS NOT NULL` explícito hace falta: con el dato vacío, `BETWEEN` da NULL y el CHECK lo dejaría pasar.
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_payment_due_rule_fields"
    CHECK (
        ("payment_due_rule" = 'DAYS_AFTER_STATEMENT'
            AND "due_days_after_statement" IS NOT NULL
            AND "due_days_after_statement" BETWEEN 1 AND 60
            AND "due_day_of_month" IS NULL)
        OR ("payment_due_rule" = 'DAY_OF_MONTH'
            AND "due_day_of_month" IS NOT NULL
            AND "due_day_of_month" BETWEEN 1 AND 31
            AND "due_days_after_statement" IS NULL)
    );

-- El saldo inicial es cero o más, uno por moneda (decisión 2 de H5, 2026-09-29), y va con su
-- fecha: una fecha sin saldo, o un saldo sin fecha, no dice desde cuándo contar.
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_opening_balance_not_negative"
    CHECK ("opening_balance_pen" >= 0 AND "opening_balance_usd" >= 0);
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_opening_balance_has_date"
    CHECK (
        ("opening_balance_date" IS NULL)
            = ("opening_balance_pen" IS NULL AND "opening_balance_usd" IS NULL)
    );
