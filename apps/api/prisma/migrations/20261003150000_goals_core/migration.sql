-- CreateEnum
CREATE TYPE "goal_contribution_kind" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_contributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "kind" "goal_contribution_kind" NOT NULL DEFAULT 'CONTRIBUTION',
    "date" DATE,
    "amount" DECIMAL(18,2),
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "savings_goals_id_user_id_key" ON "savings_goals"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_contributions_transaction_id_key" ON "goal_contributions"("transaction_id");

-- CreateIndex
CREATE INDEX "goal_contributions_goal_id_idx" ON "goal_contributions"("goal_id");

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "savings_goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;




-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- Nombre único por cuenta sin distinguir mayúsculas, contando las archivadas (decidido el
-- 2026-10-03), como el alias de un método de pago. Empieza por `user_id`: sirve también para
-- buscar las metas de una cuenta.
CREATE UNIQUE INDEX "savings_goals_unique_name"
    ON "savings_goals" ("user_id", lower("name"));

ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_name_not_blank"
    CHECK (btrim("name") <> '');

-- Una meta de cero no es una meta.
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_target_amount_positive"
    CHECK ("target_amount" > 0);

-- Fechas libres y el inicio puede ser pasado, pero el fin va después del inicio (decisión 6 de
-- H6, 2026-10-03).
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_end_after_start"
    CHECK ("end_date" > "start_date");

-- Un aporte manual lleva su fecha y su monto; uno enlazado, ninguno de los dos (son los de la
-- transacción hoy) y es siempre un aporte: un retiro no se enlaza (decidido el 2026-10-03). Los
-- `IS NOT NULL` explícitos hacen falta para que un manual a medias no pase.
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_manual_or_linked"
    CHECK (
        ("transaction_id" IS NULL
            AND "date" IS NOT NULL
            AND "amount" IS NOT NULL)
        OR ("transaction_id" IS NOT NULL
            AND "date" IS NULL
            AND "amount" IS NULL
            AND "kind" = 'CONTRIBUTION')
    );

-- El monto es siempre positivo; el tipo dice si suma o resta (decisión 2 de H6, 2026-10-03).
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_amount_positive"
    CHECK ("amount" > 0);
