/**
 * Entero uniforme en [0, max) con el generador criptográfico del navegador
 * (o de Node). Usa rechazo para evitar el sesgo de módulo.
 */
export function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max debe ser > 0');
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** Fisher–Yates con aleatoriedad criptográfica: todas las permutaciones son equiprobables. */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
