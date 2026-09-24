-- Decidido con el autor el 2026-09-24 (tarea 02 de H3): dos categorías hermanas no pueden
-- llamarse igual **sin distinguir mayúsculas ni acentos**: "Café" = "cafe". La ñ no es un acento
-- y se conserva ("Año" y "Ano" son distintas).
--
-- La misma tabla de acentos vive en `categoryNameKey` (@sol-a-sol/domain); una prueba de
-- integración comprueba que las dos coincidan.
--
-- `translate` va antes que `lower` y con las mayúsculas incluidas (y la Ñ) para no depender del
-- locale de la base: con el locale C, `lower('É')` devuelve 'É'. `translate` y `lower` son
-- inmutables, así que pueden ir en un índice sin extensiones.

DROP INDEX "categories_unique_sibling_name";

CREATE UNIQUE INDEX "categories_unique_sibling_name"
    ON "categories" (
        "user_id",
        "type",
        "parent_id",
        lower(translate(
            btrim("name"),
            'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑáéíóúàèìòùäëïöü',
            'AEIOUAEIOUAEIOUñaeiouaeiouaeiou'
        ))
    ) NULLS NOT DISTINCT;

-- El color va como #RRGGBB, el formato que entienden los gráficos y la web. El dominio lo exige
-- primero (INVALID_CATEGORY_COLOR); esto es la red por si alguien se lo salta.
ALTER TABLE "categories" ADD CONSTRAINT "categories_color_format"
    CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
