/**
 * Puerto para avisar que algo **ya pasó** (un usuario se registró, se creó una transacción), sin
 * saber quién escucha. Es la forma en que un módulo le habla a otro sin importar su interior
 * (ADR-0004): `identity` publica, `catalog` escucha, y ninguno conoce al otro.
 *
 * `publish` espera a que terminen quienes escuchan, para que lo que hacen se vea en cuanto
 * responde la petición (las categorías existen apenas termina el registro). Si un oyente falla
 * se registra y **no se propaga**: el hecho ya ocurrió y quien escucha no puede deshacerlo.
 */
export interface EventPublisher {
  publish(name: string, payload: object): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EventPublisher');
