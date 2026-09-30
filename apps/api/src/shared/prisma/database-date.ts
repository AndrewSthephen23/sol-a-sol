import { LocalDate } from '@sol-a-sol/domain';

/**
 * Una columna `DATE` llega y sale como la medianoche **UTC** de ese día. Se arma y se lee en UTC
 * para que la zona del servidor no la corra un día.
 */
export function toDatabaseDate(date: LocalDate): Date {
  return new Date(`${date.toString()}T00:00:00.000Z`);
}

export function fromDatabaseDate(date: Date): LocalDate {
  return LocalDate.parse(date.toISOString().slice(0, 10));
}
