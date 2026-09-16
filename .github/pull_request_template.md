## Qué

<!-- Qué cambia, en una o dos frases. Enlaza el issue: Closes #NN -->

## Por qué

<!-- Decisiones tomadas y alternativas descartadas. Si es estructural, enlaza el ADR. -->

## Cómo se probó

<!-- Comandos ejecutados y su resultado; escenarios Gherkin en verde; pruebas manuales. -->

## Capturas

<!-- Si toca la interfaz: escritorio y móvil. Si no aplica, borra esta sección. -->

## Atributo de calidad (ISO/IEC 25010)

<!-- Qué atributo mejora o protege este cambio: adecuación funcional, seguridad, fiabilidad,
     mantenibilidad, usabilidad, eficiencia o portabilidad. -->

## Definition of Done (ver [CONTRIBUTING.md](../CONTRIBUTING.md))

- [ ] Cumple los criterios de aceptación del issue (escenarios Gherkin en verde)
- [ ] Pruebas unitarias y de integración; umbrales de cobertura cumplidos
- [ ] Sin errores de lint, tipos ni quality gate
- [ ] Sin vulnerabilidades críticas o altas nuevas
- [ ] Endpoints documentados en OpenAPI; cliente web regenerado
- [ ] Autorización por usuario verificada con una prueba (`userId`, anti-IDOR)
- [ ] Funciona en viewport móvil
- [ ] Documentación actualizada (ficha del módulo, README, ADR si aplica)
- [ ] Changeset agregado
- [ ] Verificado con `docker compose` (desde H8: desplegado en staging)
