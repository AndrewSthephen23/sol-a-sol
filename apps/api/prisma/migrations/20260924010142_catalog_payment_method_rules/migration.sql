-- Reglas de los métodos de pago decididas con el autor el 2026-09-23 (tarea 03 de H3).
-- Prisma no sabe expresar nada de esto salvo el DROP INDEX: vive solo aquí. El dominio aplica
-- las mismas reglas; estas restricciones son la red por si alguien se lo salta.

-- Alias único por usuario, sin distinguir mayúsculas ("Visa BCP" = "visa bcp") y contando los
-- archivados: para volver a usar un alias se restaura el archivado.
CREATE UNIQUE INDEX "payment_methods_unique_alias"
    ON "payment_methods" ("user_id", lower("alias"));

-- El índice único empieza por user_id, así que este ya no hace falta.
-- DropIndex
DROP INDEX "payment_methods_user_id_idx";

-- Últimos 4 dígitos: obligatorios en una tarjeta de crédito (sus notificaciones la nombran por
-- ellos), opcionales en una cuenta, inexistentes en una billetera o en el efectivo.
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_last4_by_kind"
    CHECK (CASE "kind"
        WHEN 'CREDIT_CARD' THEN "last4" IS NOT NULL
        WHEN 'ACCOUNT' THEN TRUE
        ELSE "last4" IS NULL
    END);

-- Una cuenta o una billetera guarda una sola moneda. Una tarjeta bimoneda y el efectivo pueden
-- dejarla nula (= aceptan las dos).
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_currency_by_kind"
    CHECK ("kind" NOT IN ('ACCOUNT', 'WALLET') OR "currency" IS NOT NULL);

-- El efectivo no tiene banco.
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_institution_by_kind"
    CHECK ("kind" <> 'CASH' OR "institution" IS NULL);
