-- Un token personal siempre caduca (entre 1 y 365 días, 90 por defecto): un token olvidado en
-- un teléfono viejo tiene que dejar de servir solo. Ningún endpoint creaba tokens antes de esta
-- migración, pero por si alguien insertó uno a mano se le dan los 90 días por defecto.
UPDATE "personal_access_tokens"
SET "expires_at" = "created_at" + INTERVAL '90 days'
WHERE "expires_at" IS NULL;

-- AlterTable
ALTER TABLE "personal_access_tokens" ALTER COLUMN "expires_at" SET NOT NULL;
