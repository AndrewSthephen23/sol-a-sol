-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "planned_amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_year_month_key" ON "budgets"("user_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_id_user_id_key" ON "budgets"("id", "user_id");

-- CreateIndex
CREATE INDEX "budget_lines_category_id_idx" ON "budget_lines"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budget_id_category_id_currency_key" ON "budget_lines"("budget_id", "category_id", "currency");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budgets"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_user_id_type_fkey" FOREIGN KEY ("category_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- Un presupuesto es de un mes del calendario. El contrato lo valida primero; esto es la red por
-- si alguien se lo salta.
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_month_range"
    CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_year_range"
    CHECK ("year" BETWEEN 2000 AND 2100);

-- Una partida planea cero o más: 0 marca «aquí no gastar nada» (decidido el 2026-09-29). Un
-- negativo no es un presupuesto.
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_planned_amount_not_negative"
    CHECK ("planned_amount" >= 0);
