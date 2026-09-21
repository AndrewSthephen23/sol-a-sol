# Identidad (`identity`)

Autenticación y cuentas: registro, inicio de sesión, segundo factor, tokens por dispositivo y bitácora de seguridad.

- **Feature flag:** `FEATURE_IDENTITY`
- **Capas:** `domain`, `application`, `ports`, `infrastructure`, `http` (ver [ADR-0001](../../../../docs/adr/0001-monolito-modular.md))
- **Puertos:** `PasswordHasher` (adaptador argon2id en `infrastructure/`)
- **Ficha completa:** [`docs/modules/identity.md`](../../../../docs/modules/identity.md)
