import type { TransactionType } from '@sol-a-sol/domain';

/**
 * Categorías iniciales de cada cuenta, decididas con el autor el 2026-09-24. Trae **solo lo que
 * el autor nombró**: el resto lo crea cada usuario, y una lista corta se ordena mejor que una
 * larga llena de categorías que nadie usa. La misma lista está en `docs/modules/catalog.md`.
 *
 * Las subcategorías toman el color de su madre y llevan su propio ícono. Los íconos son nombres
 * de Lucide, la librería que usa shadcn/ui en la web.
 */
export interface DefaultSubcategory {
  name: string;
  icon: string;
}

export interface DefaultCategory {
  name: string;
  color: string;
  icon: string;
  children?: readonly DefaultSubcategory[];
}

export const DEFAULT_CATEGORIES: Readonly<Record<TransactionType, readonly DefaultCategory[]>> = {
  INCOME: [
    { name: 'Sueldo o Salario', color: '#2E7D32', icon: 'briefcase' },
    { name: 'Depósitos', color: '#43A047', icon: 'landmark' },
  ],
  FIXED_EXPENSE: [
    {
      name: 'Vivienda',
      color: '#6D4C41',
      icon: 'house',
      children: [
        { name: 'Alquiler', icon: 'key' },
        { name: 'Luz', icon: 'lightbulb' },
        { name: 'Agua', icon: 'droplet' },
        { name: 'Internet', icon: 'wifi' },
        { name: 'Comunicaciones', icon: 'phone' },
      ],
    },
    {
      name: 'Suscripciones',
      color: '#5E35B1',
      icon: 'repeat',
      children: [
        { name: 'Netflix', icon: 'tv' },
        { name: 'Spotify', icon: 'music' },
      ],
    },
  ],
  VARIABLE_EXPENSE: [
    {
      name: 'Comida',
      color: '#F4511E',
      icon: 'utensils',
      children: [
        { name: 'Supermercado', icon: 'shopping-cart' },
        { name: 'Restaurantes', icon: 'utensils-crossed' },
        { name: 'Delivery', icon: 'bike' },
      ],
    },
    {
      name: 'Transporte',
      color: '#1E88E5',
      icon: 'car',
      children: [
        { name: 'Taxi', icon: 'car-taxi-front' },
        { name: 'Combustible', icon: 'fuel' },
      ],
    },
    { name: 'Entretenimiento', color: '#8E24AA', icon: 'clapperboard' },
    { name: 'Deportes', color: '#00897B', icon: 'dumbbell' },
    { name: 'Facturas', color: '#546E7A', icon: 'receipt' },
    { name: 'Higiene', color: '#26A69A', icon: 'sparkles' },
    { name: 'Mascotas', color: '#A1887F', icon: 'paw-print' },
    { name: 'Ropa', color: '#EC407A', icon: 'shirt' },
    { name: 'Regalos', color: '#D81B60', icon: 'gift' },
    { name: 'Salud', color: '#E53935', icon: 'heart-pulse' },
  ],
  SAVING: [
    { name: 'Fondo de emergencia', color: '#FB8C00', icon: 'shield' },
    { name: 'Cuenta de ahorro', color: '#FFB300', icon: 'piggy-bank' },
    { name: 'Depósito a plazo', color: '#F9A825', icon: 'lock' },
    { name: 'CTS', color: '#FDD835', icon: 'wallet' },
  ],
  INVESTMENT: [
    { name: 'Acciones', color: '#3949AB', icon: 'trending-up' },
    { name: 'ETFs', color: '#039BE5', icon: 'chart-pie' },
  ],
  DEBT: [
    { name: 'Préstamo', color: '#C62828', icon: 'hand-coins' },
    { name: 'Tarjeta de crédito', color: '#AD1457', icon: 'credit-card' },
  ],
};
