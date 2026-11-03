/** Intervalo de confianza de Wilson para una proporción (95 % por defecto). */
export function wilson(exitos: number, n: number, z = 1.959963984540054): { p: number; inferior: number; superior: number } {
  if (n === 0) return { p: 0, inferior: 0, superior: 0 };
  const p = exitos / n;
  const z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margen = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { p, inferior: Math.max(0, centro - margen), superior: Math.min(1, centro + margen) };
}

function combinaciones(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Prueba de McNemar exacta (binomial, dos colas) para resultados pareados de sí/no.
 * b: pares donde A acierta y B falla; c: pares donde A falla y B acierta.
 */
export function mcnemarExacta(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let cola = 0;
  for (let i = 0; i <= k; i++) cola += combinaciones(n, i) * Math.pow(0.5, n);
  return Math.min(1, 2 * cola);
}

/**
 * Prueba de Wilcoxon de rangos con signo (dos colas), exacta: la distribución del
 * estadístico se calcula por conteo, con rangos promedio para los empates. Las
 * diferencias iguales a cero se descartan.
 */
export function wilcoxon(diferencias: number[]): { n: number; w: number; p: number } {
  const d = diferencias.filter((x) => x !== 0);
  const n = d.length;
  if (n === 0) return { n: 0, w: 0, p: 1 };

  // Rangos de |d| con promedio en los empates; se duplican para trabajar con enteros.
  const orden = d.map((x, i) => ({ a: Math.abs(x), i })).sort((x, y) => x.a - y.a);
  const rango2 = new Array<number>(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && orden[j + 1].a === orden[i].a) j++;
    const promedio2 = i + 1 + (j + 1); // 2 × rango promedio
    for (let k = i; k <= j; k++) rango2[orden[k].i] = promedio2;
    i = j + 1;
  }
  const w2 = d.reduce((s, x, i) => (x > 0 ? s + rango2[i] : s), 0);

  // Distribución exacta de la suma de rangos positivos bajo H0 (cada signo con prob. 1/2).
  const total2 = rango2.reduce((s, r) => s + r, 0);
  let dist = new Array<number>(total2 + 1).fill(0);
  dist[0] = 1;
  for (const r of rango2) {
    const nueva = dist.slice();
    for (let s = 0; s + r <= total2; s++) if (dist[s]) nueva[s + r] += dist[s];
    dist = nueva;
  }
  const casos = Math.pow(2, n);
  let menorIgual = 0;
  let mayorIgual = 0;
  for (let s = 0; s <= total2; s++) {
    if (s <= w2) menorIgual += dist[s];
    if (s >= w2) mayorIgual += dist[s];
  }
  const p = Math.min(1, (2 * Math.min(menorIgual, mayorIgual)) / casos);
  return { n, w: w2 / 2, p };
}

/**
 * Corrección de Holm (1979) para comparaciones múltiples: ajusta una familia de valores p
 * controlando la tasa de error de tipo I de la familia. Devuelve los ajustados en el
 * mismo orden de entrada.
 */
export function holm(ps: number[]): number[] {
  const orden = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const k = ps.length;
  const ajustados = new Array<number>(k);
  let maximo = 0;
  orden.forEach(({ p, i }, j) => {
    maximo = Math.max(maximo, Math.min(1, (k - j) * p));
    ajustados[i] = maximo;
  });
  return ajustados;
}

export const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
