-- AlterTable
ALTER TABLE "captures" ADD COLUMN     "discarded_from" "capture_status";

-- Lo que sigue no se puede escribir en schema.prisma: vive solo aquí.

-- Las descartadas que ya existan (el módulo estuvo apagado, así que no debería haber) vuelven
-- como pendientes: no se sabe si eran duplicadas.
UPDATE "captures" SET "discarded_from" = 'PENDING' WHERE "status" = 'DISCARDED';

-- De dónde se descartó: está si y solo si la captura está descartada, y solo puede ser una por
-- revisar o una duplicada. «Deshacer» la devuelve como estaba (decidido el 2026-10-04).
ALTER TABLE "captures" ADD CONSTRAINT "captures_discarded_has_origin"
    CHECK (("status" = 'DISCARDED') = ("discarded_from" IS NOT NULL));

ALTER TABLE "captures" ADD CONSTRAINT "captures_discarded_from_inbox"
    CHECK ("discarded_from" IN ('PENDING', 'DUPLICATE'));
