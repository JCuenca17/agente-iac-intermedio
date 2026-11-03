import { describe, expect, it } from "vitest";
import { holm, mcnemarExacta, media, mediana, wilcoxon, wilson } from "../src/experimento/estadistica.js";

// Valores de referencia: fórmula de Wilson, binomial exacta y, para Wilcoxon con empates,
// enumeración de las 2^n asignaciones de signo (scipy en modo exacto ignora los empates).
describe("estadística", () => {
  it("intervalo de Wilson para 8 de 10", () => {
    const r = wilson(8, 10);
    expect(r.p).toBe(0.8);
    expect(r.inferior).toBeCloseTo(0.4902, 4);
    expect(r.superior).toBeCloseTo(0.9433, 4);
  });

  it("intervalo de Wilson en los extremos", () => {
    expect(wilson(0, 36).inferior).toBe(0);
    expect(wilson(36, 36).superior).toBe(1);
    expect(wilson(0, 0)).toEqual({ p: 0, inferior: 0, superior: 0 });
  });

  it("McNemar exacta", () => {
    expect(mcnemarExacta(9, 1)).toBeCloseTo(0.021484375, 9); // 2 × P(X ≤ 1), X ~ Bin(10, 0.5)
    expect(mcnemarExacta(5, 5)).toBe(1);
    expect(mcnemarExacta(0, 0)).toBe(1);
  });

  it("Wilcoxon exacta sin empates", () => {
    // diferencias 1..8 todas positivas: W = 36, p = 2/256
    expect(wilcoxon([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ n: 8, w: 36, p: 2 / 256 });
  });

  it("Wilcoxon descarta ceros y maneja empates", () => {
    const r = wilcoxon([0, 0, 1, 1, -1, 2, 2, 3]);
    expect(r.n).toBe(6);
    expect(r.w).toBe(19); // rangos de |d|: 1,1,1 → 2; 2,2 → 4.5; 3 → 6; positivos: 2+2+4.5+4.5+6 = 19
    expect(r.p).toBeCloseTo(0.125, 3);
  });

  it("media y mediana", () => {
    expect(media([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(media([])).toBe(0);
  });
});

describe("corrección de Holm", () => {
  it("coincide con un ejemplo resuelto a mano", () => {
    // p = 0.01, 0.04, 0.03 con k = 3: 0.01×3 = 0.03; 0.03×2 = 0.06; 0.04×1 = 0.04 → máx. acumulado 0.06.
    const r = holm([0.01, 0.04, 0.03]);
    expect(r[0]).toBeCloseTo(0.03, 12);
    expect(r[1]).toBeCloseTo(0.06, 12);
    expect(r[2]).toBeCloseTo(0.06, 12);
  });

  it("no pasa de 1", () => {
    expect(holm([0.6, 0.7])).toEqual([1, 1]);
  });
});
