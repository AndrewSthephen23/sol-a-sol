/**
 * Una tira de dígitos juntos, o en grupos de 3 o más separados por un espacio o un guion
 * (`4111 1111 1111 1111`, `3782 822463 11111`). Los grupos cortos no se juntan, para no pegarle
 * al número el monto o la fecha que vienen detrás.
 */
const DIGIT_RUN = /(?<!\d)(?:\d{3,}(?:[ -]\d{3,})+|\d+)(?!\d)/gu;
/** Desde 13 dígitos: las tarjetas tienen de 13 a 19, y tapar de más (una cuenta, un CCI) no daña. */
const MIN_CARD_DIGITS = 13;
const MASK = '••••';

export interface MaskedText {
  text: string;
  /** Si se tapó algún número. */
  masked: boolean;
  /** Los últimos 4 de los números tapados, si todos coinciden. */
  last4: string | null;
}

/**
 * Tapa los números que parecen de tarjeta completos y deja solo sus últimos 4 (`••••1111`).
 * Nunca se guarda un número de tarjeta (CLAUDE.md, regla 6), ni siquiera en el texto crudo.
 */
export function maskCardNumbers(text: string): MaskedText {
  const endings = new Set<string>();

  const masked = text.replaceAll(DIGIT_RUN, (run) => {
    const digits = run.replaceAll(/\D/gu, '');
    if (digits.length < MIN_CARD_DIGITS) {
      return run;
    }
    const last4 = digits.slice(-4);
    endings.add(last4);
    return `${MASK}${last4}`;
  });

  const [only] = endings;
  return {
    text: masked,
    masked: endings.size > 0,
    last4: endings.size === 1 && only !== undefined ? only : null,
  };
}
