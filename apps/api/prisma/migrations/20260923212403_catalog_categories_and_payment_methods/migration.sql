-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('INCOME', 'FIXED_EXPENSE', 'VARIABLE_EXPENSE', 'SAVING', 'INVESTMENT', 'DEBT');

-- CreateEnum
CREATE TYPE "payment_method_kind" AS ENUM ('ACCOUNT', 'WALLET', 'CREDIT_CARD', 'CASH');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('PEN', 'USD');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "payment_method_kind" NOT NULL,
    "alias" TEXT NOT NULL,
    "institution" TEXT,
    "last4" TEXT,
    "currency" "currency",
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_type_key" ON "categories"("id", "user_id", "type");

-- CreateIndex
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_user_id_type_fkey" FOREIGN KEY ("parent_id", "user_id", "type") REFERENCES "categories"("id", "user_id", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- Nombre único entre hermanas del mismo tipo, sin distinguir mayúsculas ("Comida" = "comida").
-- NULLS NOT DISTINCT hace que dos categorías de primer nivel (parent_id nulo) también choquen:
-- sin él, PostgreSQL trata cada nulo como distinto y permitiría dos "Comida" en la raíz.
-- Cuenta también las archivadas: para volver a usar un nombre se restaura la archivada.
CREATE UNIQUE INDEX "categories_unique_sibling_name"
    ON "categories" ("user_id", "type", "parent_id", lower("name")) NULLS NOT DISTINCT;

-- Una categoría no puede ser su propia madre.
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_name_not_blank"
    CHECK (btrim("name") <> '');

-- Solo los últimos 4 dígitos: nunca el número completo de una tarjeta.
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_last4_format"
    CHECK ("last4" ~ '^[0-9]{4}$');

ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_alias_not_blank"
    CHECK (btrim("alias") <> '');
