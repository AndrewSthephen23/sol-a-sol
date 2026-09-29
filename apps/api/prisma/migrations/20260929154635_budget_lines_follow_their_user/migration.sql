-- Una partida cuelga ahora también directo de su usuario, como una transacción. Colgando solo del
-- presupuesto, borrar una cuenta fallaba: la cascada borraba las categorías antes de llegar a las
-- partidas (un nivel más abajo, vía `budgets`), y la clave `budget_lines -> categories` se revisaba
-- con las partidas todavía ahí. Se agrega en una migración nueva: la anterior ya está aplicada.
-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
