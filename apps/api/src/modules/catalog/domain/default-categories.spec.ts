import { createCategoryRequestSchema } from '@sol-a-sol/contracts';
import { assertCategoryColor, categoryNameKey, TRANSACTION_TYPES } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CATEGORIES } from './default-categories.js';

const parents = TRANSACTION_TYPES.flatMap((type) =>
  DEFAULT_CATEGORIES[type].map((category) => ({ type, ...category })),
);

describe('default categories', () => {
  it('has the list agreed with the author', () => {
    expect(
      Object.fromEntries(
        TRANSACTION_TYPES.map((type) => [
          type,
          DEFAULT_CATEGORIES[type].map((category) =>
            category.children === undefined
              ? category.name
              : `${category.name} (${category.children.map((child) => child.name).join(', ')})`,
          ),
        ]),
      ),
    ).toEqual({
      INCOME: ['Sueldo o Salario', 'Depósitos'],
      FIXED_EXPENSE: [
        'Vivienda (Alquiler, Luz, Agua, Internet, Comunicaciones)',
        'Suscripciones (Netflix, Spotify)',
      ],
      VARIABLE_EXPENSE: [
        'Comida (Supermercado, Restaurantes, Delivery)',
        'Transporte (Taxi, Combustible)',
        'Entretenimiento',
        'Deportes',
        'Facturas',
        'Higiene',
        'Mascotas',
        'Ropa',
        'Regalos',
        'Salud',
      ],
      SAVING: ['Fondo de emergencia', 'Cuenta de ahorro', 'Depósito a plazo', 'CTS'],
      INVESTMENT: ['Acciones', 'ETFs'],
      DEBT: ['Préstamo', 'Tarjeta de crédito'],
    });
  });

  // Pasan por las mismas reglas que una categoría creada a mano: si no, la semilla fallaría al
  // registrarse alguien, justo cuando nadie está mirando.
  it('would be accepted by the API, name, color and icon', () => {
    for (const { type, name, color, icon, children = [] } of parents) {
      expect(createCategoryRequestSchema.safeParse({ name, type, color, icon }).success).toBe(true);
      expect(() => {
        assertCategoryColor(color);
      }).not.toThrow();
      for (const child of children) {
        expect(createCategoryRequestSchema.safeParse(child).success).toBe(true);
      }
    }
  });

  it('never repeats a name between siblings of the same type', () => {
    for (const type of TRANSACTION_TYPES) {
      const names = DEFAULT_CATEGORIES[type].map((category) => categoryNameKey(category.name));
      expect(new Set(names).size).toBe(names.length);
    }
    for (const { children = [] } of parents) {
      const names = children.map((child) => categoryNameKey(child.name));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
