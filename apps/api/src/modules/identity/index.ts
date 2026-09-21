// API pública del módulo identity.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { IdentityModule } from './identity.module.js';
export { PASSWORD_HASHER, type PasswordHasher } from './ports/password-hasher.js';
