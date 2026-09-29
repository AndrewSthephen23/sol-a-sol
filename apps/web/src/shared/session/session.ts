/**
 * Sesión del navegador: el token de acceso vive **solo en memoria** (decisión 3 de H3).
 *
 * Nunca en `localStorage`, que es lo primero que se lleva un XSS. Al recargar la página se
 * pierde y se recupera con `/auth/refresh`, cuya cookie `HttpOnly` JavaScript no puede leer;
 * mientras tanto el estado es `unknown`, y ese es el parpadeo que se aceptó.
 */

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/** Lo mínimo de `LockManager` que se usa; en el navegador es `navigator.locks`. */
export interface SessionLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Lo mínimo de `BroadcastChannel` que se usa: avisar a las demás pestañas. */
export interface SessionChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface SessionDeps {
  fetch: typeof globalThis.fetch;
  locks?: SessionLocks;
  channel?: SessionChannel;
}

const AUTH_PATH = '/api/v1/auth/';
const REFRESH_PATH = `${AUTH_PATH}refresh`;
const LOGOUT_PATH = `${AUTH_PATH}logout`;
const REFRESH_LOCK = 'sol-a-sol:refresh';
const LOGGED_OUT = 'logged-out';

export class Session {
  #accessToken: string | null = null;
  #status: SessionStatus = 'unknown';
  #refreshing: Promise<boolean> | null = null;
  readonly #listeners = new Set<() => void>();

  constructor(private readonly deps: SessionDeps) {
    deps.channel?.addEventListener('message', (event) => {
      if (event.data === LOGGED_OUT) this.#end();
    });
  }

  get status(): SessionStatus {
    return this.#status;
  }

  /** Para `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  };

  readonly getStatus = (): SessionStatus => this.#status;

  /** Tras un login correcto. */
  signIn(accessToken: string): void {
    this.#accessToken = accessToken;
    this.#setStatus('authenticated');
  }

  /** Al cargar la página: si la cookie de refresco sigue valiendo, la sesión continúa. */
  async restore(): Promise<void> {
    if (this.#status === 'unknown') await this.refresh();
  }

  /**
   * Pide un token de acceso nuevo. Devuelve si lo consiguió.
   *
   * La API rota el refresco y, si llega uno ya canjeado, cierra **todas** las sesiones de la
   * cuenta: dos renovaciones a la vez serían indistinguibles de un robo. Por eso dentro de la
   * pestaña las peticiones que chocan con un 401 comparten una sola renovación, y entre pestañas
   * se hacen de a una con un lock: la segunda sale ya con la cookie que dejó la primera.
   */
  refresh(): Promise<boolean> {
    this.#refreshing ??= this.#withLock(() => this.#requestRefresh()).finally(() => {
      this.#refreshing = null;
    });

    return this.#refreshing;
  }

  /**
   * El `fetch` del cliente de la API: agrega el token y, si la API responde 401, renueva la
   * sesión **una vez** y reintenta **una vez**. Si la renovación falla o el reintento vuelve a
   * dar 401, la sesión termina y quien la observe manda a `/login`.
   *
   * Las rutas de `/auth` quedan fuera: un 401 del login es una contraseña equivocada, no una
   * sesión vencida.
   */
  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.startsWith(AUTH_PATH)) return this.deps.fetch(request);

    const retry = request.clone();
    const response = await this.#send(request);
    if (response.status !== 401) return response;

    if (!(await this.refresh())) return response;

    const retried = await this.#send(retry);
    if (retried.status === 401) this.#end();

    return retried;
  };

  /** Cierra la sesión aquí y en las demás pestañas. Nunca falla: quien sale quiere irse. */
  async logout(): Promise<void> {
    try {
      await this.deps.fetch(LOGOUT_PATH, { method: 'POST' });
    } catch {
      // Sin red la cookie queda viva en el navegador, pero el token en memoria se borra igual.
    }
    this.#end();
    this.deps.channel?.postMessage(LOGGED_OUT);
  }

  #send(request: Request): Promise<Response> {
    if (this.#accessToken !== null) {
      request.headers.set('Authorization', `Bearer ${this.#accessToken}`);
    }

    return this.deps.fetch(request);
  }

  async #requestRefresh(): Promise<boolean> {
    try {
      const response = await this.deps.fetch(REFRESH_PATH, { method: 'POST' });
      if (response.ok) {
        const { accessToken } = (await response.json()) as { accessToken: string };
        this.signIn(accessToken);

        return true;
      }
    } catch {
      // Sin red no hay forma de saber si la sesión sigue: se trata como terminada.
    }
    this.#end();

    return false;
  }

  #withLock<T>(task: () => Promise<T>): Promise<T> {
    return this.deps.locks ? this.deps.locks.request(REFRESH_LOCK, task) : task();
  }

  #end(): void {
    this.#accessToken = null;
    this.#setStatus('anonymous');
  }

  #setStatus(status: SessionStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}
