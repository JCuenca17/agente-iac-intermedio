import { describe, expect, it } from "vitest";
import type { FilaResultado } from "../src/experimento/ejecutor.js";
import { comparar, informeMarkdown, resumir } from "../src/experimento/resumen.js";

function fila(caso: string, nivel: string, configuracion: string, repeticion: number, m1: boolean, extra: Partial<FilaResultado> = {}): FilaResultado {
  return {
    caso, nivel, configuracion: configuracion as FilaResultado["configuracion"], repeticion, listo: m1, motivo: m1 ? "valido" : "iteraciones-agotadas",
    m1, aplicado: m1, sinCambios: m1, erroresDespliegue: [], erroresPorCapa: {}, reglasDetectadas: [], m3: 0, violaciones: [],
    m4: m1 ? 1 : 0, faltantes: [], iteraciones: 1, llamadas: 1, consultasEsquema: 0,
    uso: { entrada: 1000, salida: 500, cacheEscritura: 0, cacheLectura: 0 }, costoUsd: 0.01, duracionMs: 2000, cosmeticosIgnorados: 0, ...extra,
  };
}

// T acierta en los 4 pares; B0 acierta en 1.
const filas: FilaResultado[] = [
  fila("C01", "N1", "T", 1, true, { erroresPorCapa: { C2: 3 }, reglasDetectadas: ["atributo-deprecado"], iteraciones: 2, costoUsd: 0.02 }),
  fila("C01", "N1", "B0", 1, true, { m3: 2 }),
  fila("C09", "N3", "T", 1, true, { erroresPorCapa: { C3: 1 }, reglasDetectadas: ["sqs-cifrado"] }),
  fila("C09", "N3", "B0", 1, false),
  fila("C10", "N3", "T", 1, true),
  fila("C10", "N3", "B0", 1, false),
  fila("C11", "N3", "T", 1, true),
  fila("C11", "N3", "B0", 1, false, { motivo: "error" }),
];

describe("resumen del experimento", () => {
  const r = resumir(filas);

  it("pone la configuración base primero y calcula M1 con su intervalo", () => {
    expect(r.porConfiguracion.map((c) => c.configuracion)).toEqual(["T", "B0"]);
    const t = r.porConfiguracion[0];
    expect(t.m1.exitos).toBe(4);
    expect(t.m1.p).toBe(1);
    expect(t.m1.superior).toBe(1);
    expect(r.porConfiguracion[1].m1.p).toBe(0.25);
  });

  it("suma los errores por capa (M2) y cuenta las corridas con error", () => {
    expect(r.porConfiguracion[0].erroresPorCapa).toEqual({ C2: 3, C3: 1 });
    expect(r.porConfiguracion[1].errores).toBe(1);
    expect(r.reglasMasFrecuentes).toEqual([
      { regla: "atributo-deprecado", corridas: 1 },
      { regla: "sqs-cifrado", corridas: 1 },
    ]);
  });

  it("separa M1 por nivel", () => {
    expect(r.porNivel.find((x) => x.configuracion === "B0" && x.nivel === "N3")).toMatchObject({ n: 3, m1: 0 });
  });

  it("compara por pares con McNemar y Wilcoxon", () => {
    const c = comparar(filas, "T", "B0");
    expect(c).toMatchObject({ pares: 4, b: 3, c: 0, diferenciaM1pp: 75 });
    expect(c.pM1).toBe(0.25); // 2 × 0.5^3
    expect(c.diferenciaM4).toBe(0.75);
  });

  it("el informe en Markdown incluye las tablas", () => {
    const md = informeMarkdown(r);
    expect(md).toContain("| T | 4 | 100.0 % [");
    expect(md).toContain("| T vs B0 | 4 | 3 | 0 | 75.0 | 0.250 |");
    expect(md).toContain("## M1 por nivel de dificultad");
  });
});
