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

// T acierta en los 4 pares; B0 acierta en 1 y en C11 terminó con error de infraestructura.
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
    // El intento con error no entra en n: B0 tiene 3 corridas con resultado y acierta en 1.
    expect(r.porConfiguracion[1]).toMatchObject({ n: 3, errores: 1 });
    expect(r.porConfiguracion[1].m1.p).toBeCloseTo(1 / 3, 10);
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
    expect(r.porNivel.find((x) => x.configuracion === "B0" && x.nivel === "N3")).toMatchObject({ n: 2, m1: 0 });
  });

  it("compara por pares con McNemar y Wilcoxon", () => {
    const c = comparar(filas, "T", "B0");
    // Sin el par de C11, donde B0 terminó con error.
    expect(c).toMatchObject({ pares: 3, b: 2, c: 0 });
    expect(c.diferenciaM1pp).toBeCloseTo(66.667, 2);
    expect(c.pM1).toBe(0.5); // 2 × 0.5^2
    expect(c.diferenciaM4).toBeCloseTo(2 / 3, 10);
  });

  it("resume IaC-Eval con las métricas de S12", () => {
    const ie = [
      fila("IE001", "D1", "T", 1, true, { iaceval: { compila: true, desplegable: true, correcto: true } }),
      fila("IE002", "D2", "T", 1, false, { iaceval: { compila: true, desplegable: false, correcto: false } }),
      fila("IE001", "D1", "B0", 1, true, { iaceval: { compila: false, desplegable: false, correcto: false } }),
    ];
    const r2 = resumir(ie);
    expect(r2.iaceval.find((x) => x.configuracion === "T")).toMatchObject({ n: 2, compilabilidad: 1, desplegabilidad: 0.5 });
    expect(r2.iaceval.find((x) => x.configuracion === "T")!.correccion.p).toBe(0.5);
    expect(informeMarkdown(r2)).toContain("## IaC-Eval: métricas de S12");
    expect(resumir(filas).iaceval).toEqual([]);
  });

  it("el informe en Markdown incluye las tablas", () => {
    const md = informeMarkdown(r);
    expect(md).toContain("| T | 4 | 100.0 % [");
    expect(md).toContain("| T vs B0 | 3 | 2 | 0 | 66.7 | 0.500 (0.500) |");
    expect(md).toContain("Intentos con error de infraestructura: 1");
    expect(md).toContain("## M1 por nivel de dificultad");
  });
});

describe("resumen: errores de infraestructura, M4 e IaC-Eval, Holm", () => {
  it("si una corrida se repitió tras un error vale el último resultado, y el costo del error se suma", () => {
    const fs = [
      fila("C01", "N1", "T", 1, false, { motivo: "error", costoUsd: 0.5 }),
      fila("C01", "N1", "T", 1, true, { costoUsd: 0.25 }),
    ];
    const c = resumir(fs).porConfiguracion[0];
    expect(c).toMatchObject({ n: 1, errores: 1, costoTotalUsd: 0.75, costoMedioUsd: 0.25 });
    expect(c.m1.exitos).toBe(1);
  });

  it("M4 por configuración se promedia solo en los casos propios", () => {
    const fs = [
      fila("C01", "N1", "T", 1, true, { m4: 0.5 }),
      fila("IE001", "D1", "T", 1, true, { m4: 1, iaceval: { compila: true, desplegable: true, correcto: true } }),
    ];
    expect(resumir(fs).porConfiguracion[0].m4Media).toBe(0.5);
  });

  it("ajusta los valores p de las comparaciones con Holm", () => {
    const r2 = resumir([...filas, fila("C01", "N1", "B1", 1, true), fila("C09", "N3", "B1", 1, true)]);
    const b0 = r2.comparaciones.find((c) => c.contra === "B0")!;
    const b1 = r2.comparaciones.find((c) => c.contra === "B1")!;
    // Dos comparaciones: el menor p se multiplica por 2 y el mayor por 1 (sin bajar del anterior).
    expect(b0.pM1).toBe(0.5);
    expect(b1.pM1).toBe(1);
    expect(b0.pM1Holm).toBe(1);
    expect(b1.pM1Holm).toBe(1);
  });
});
