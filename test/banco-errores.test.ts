import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Artefacto } from "../src/artefacto/tipos.js";
import { evaluarBanco, generarBanco, TIPOS_ERROR } from "../src/experimento/banco-errores.js";

const leer = (n: string): Artefacto => JSON.parse(readFileSync(new URL(`./fixtures/artefactos/${n}.json`, import.meta.url), "utf8"));
const bases = { c01: leer("c01-valido"), c03: leer("c03-valido"), c07: leer("c07-valido") };

describe("banco de errores insertados: generarBanco", () => {
  const banco = generarBanco(bases);

  it("tiene al menos 5 casos por tipo de error, cada uno con la capa que debería detectarlo", () => {
    for (const tipo of TIPOS_ERROR) {
      const casos = banco.filter((c) => c.tipo === tipo);
      expect(casos.length, tipo).toBeGreaterThanOrEqual(5);
      for (const c of casos) expect(["C1", "C2", "C3", "C4"]).toContain(c.capaEsperada);
    }
  });

  it("cada caso es distinto de su artefacto base y tiene un identificador único", () => {
    for (const c of banco) expect(JSON.stringify(c.artefacto), c.id).not.toBe(JSON.stringify(bases[c.base]));
    expect(new Set(banco.map((c) => c.id)).size).toBe(banco.length);
  });

  it("no modifica los artefactos base", () => {
    expect(bases).toEqual({ c01: leer("c01-valido"), c03: leer("c03-valido"), c07: leer("c07-valido") });
  });
});

describe("banco de errores insertados: evaluarBanco", () => {
  const casos = generarBanco(bases).filter((c) => c.id === "estructura-1" || c.id === "violacion-politica-1" || c.id === "fuera-de-rango-1");

  it("registra la capa que detectó cada error y si coincide con la esperada", async () => {
    // Validador falso: detecta el error de estructura en C1, el de política en C2 (equivocada)
    // y no detecta el fuera de rango.
    const respuestas: Record<string, { valido: boolean; capaFallida?: "C1" | "C2"; errores: { capa: "C1" | "C2"; ruta: string; regla: string; mensaje: string }[] }> = {
      "estructura-1": { valido: false, capaFallida: "C1", errores: [{ capa: "C1", ruta: "/recursos/0", regla: "required", mensaje: "x" }] },
      "violacion-politica-1": { valido: false, capaFallida: "C2", errores: [{ capa: "C2", ruta: "/r", regla: "otra", mensaje: "x" }] },
      "fuera-de-rango-1": { valido: true, errores: [] },
    };
    const r = await evaluarBanco(casos, async (caso) => respuestas[caso.id]);

    expect(r.resultados).toEqual([
      { id: "estructura-1", tipo: "estructura", capaEsperada: "C1", capaDetecta: "C1", reglas: ["required"], enCapaEsperada: true },
      { id: "violacion-politica-1", tipo: "violacion-politica", capaEsperada: "C3", capaDetecta: "C2", reglas: ["otra"], enCapaEsperada: false },
      { id: "fuera-de-rango-1", tipo: "fuera-de-rango", capaEsperada: "C4", capaDetecta: null, reglas: [], enCapaEsperada: false },
    ]);
  });

  it("resume por tipo: casos, detectados, en la capa esperada y conteo por capa", async () => {
    const r = await evaluarBanco(casos, async (caso) =>
      caso.id === "fuera-de-rango-1" ? { valido: true, errores: [] } : { valido: false, capaFallida: "C1" as const, errores: [] },
    );
    expect(r.porTipo["estructura"]).toEqual({ casos: 1, detectados: 1, enCapaEsperada: 1, porCapa: { C1: 1 } });
    expect(r.porTipo["violacion-politica"]).toEqual({ casos: 1, detectados: 1, enCapaEsperada: 0, porCapa: { C1: 1 } });
    expect(r.porTipo["fuera-de-rango"]).toEqual({ casos: 1, detectados: 0, enCapaEsperada: 0, porCapa: {} });
    expect(r.total).toEqual({ casos: 3, detectados: 2, enCapaEsperada: 1 });
  });
});
