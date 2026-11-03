import { describe, expect, it } from "vitest";
import type { FilaResultado } from "../src/experimento/ejecutor.js";
import { paginaResultados } from "../src/experimento/pagina-resultados.js";
import { resumir } from "../src/experimento/resumen.js";

function fila(caso: string, nivel: string, configuracion: string, m1: boolean, extra: Partial<FilaResultado> = {}): FilaResultado {
  return {
    caso, nivel, configuracion: configuracion as FilaResultado["configuracion"], repeticion: 1, listo: m1, motivo: m1 ? "valido" : "iteraciones-agotadas",
    m1, aplicado: m1, sinCambios: m1, erroresDespliegue: [], erroresPorCapa: {}, reglasDetectadas: [], m3: 0, violaciones: [],
    m4: m1 ? 1 : 0.5, faltantes: [], iteraciones: 1, llamadas: 1, consultasEsquema: 0,
    uso: { entrada: 1000, salida: 500, cacheEscritura: 0, cacheLectura: 0 }, costoUsd: 0.002, duracionMs: 2000, cosmeticosIgnorados: 0, ...extra,
  };
}

const filas = [
  fila("C01", "N1", "T", true, { erroresPorCapa: { C2: 2 } }),
  fila("C01", "N1", "B0", false, { erroresPorCapa: { C4: 1 } }),
  fila("C09", "N3", "T", true),
  fila("C09", "N3", "B0", false),
];

describe("página de resultados del experimento", () => {
  const html = paginaResultados(resumir(filas), { titulo: "Experimento <prueba>" });

  it("es un documento autocontenido, sin scripts ni hojas de estilo externas", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
  });

  it("tiene modo claro y oscuro", () => {
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('[data-theme="dark"]');
  });

  it("dibuja un gráfico por métrica, cada uno con su tabla de datos", () => {
    for (const titulo of ["M1: despliegue exitoso", "M1 por nivel", "M4: cumplimiento", "Costo medio por corrida", "M2: errores detectados antes del despliegue"]) {
      expect(html).toContain(titulo);
    }
    expect((html.match(/<svg /g) ?? []).length).toBe(5);
    expect((html.match(/<table/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("muestra M1 con su intervalo de Wilson y los valores escritos", () => {
    // T acierta 2 de 2: 100 %; B0, 0 de 2.
    expect(html).toContain("100.0 %");
    expect(html).toContain("0.0 %");
    expect(html).toMatch(/IC 95 %/);
  });

  it("incluye las comparaciones con el valor p ajustado con Holm", () => {
    expect(html).toContain("T vs B0");
    expect(html).toContain("Holm");
  });

  it("escapa el texto", () => {
    expect(html).toContain("Experimento &lt;prueba&gt;");
    expect(html).not.toContain("<prueba>");
  });

  it("cada barra tiene un texto emergente con su valor", () => {
    expect(html).toMatch(/<title>T: 100\.0 %/);
  });
});
