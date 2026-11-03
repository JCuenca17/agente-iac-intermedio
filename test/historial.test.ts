import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { leerHistorial, lineaConsumo, nombreSesionValido, registrarCorrida, resumirHistorial, textoHistorial, type EntradaHistorial } from "../src/historial/historial.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const archivoNuevo = () => {
  const d = mkdtempSync(join(tmpdir(), "historial-"));
  dirs.push(d);
  return join(d, "sub", "historial.jsonl");
};

const corrida = (sesion: string, extra: Partial<EntradaHistorial> = {}): EntradaHistorial => ({
  sesion,
  fecha: "2026-11-03T15:00:00.000Z",
  requerimiento: "Una cola cifrada",
  rondas: 1,
  llamadas: 1,
  uso: { entrada: 2, salida: 2166, cacheEscritura: 827, cacheLectura: 2534 },
  costoUsd: 0.0012,
  resultado: "desplegado",
  carpeta: "corridas/2026-11-03T15-00-00",
  ...extra,
});

describe("historial de consumo: registrar y leer", () => {
  it("agrega cada corrida al archivo y la lee de vuelta, en orden", () => {
    const archivo = archivoNuevo();
    registrarCorrida(archivo, corrida("tienda"));
    registrarCorrida(archivo, corrida("vault", { costoUsd: 0.5 }));
    expect(leerHistorial(archivo).map((e) => [e.sesion, e.costoUsd])).toEqual([
      ["tienda", 0.0012],
      ["vault", 0.5],
    ]);
  });

  it("sin archivo devuelve un historial vacío", () => {
    expect(leerHistorial(archivoNuevo())).toEqual([]);
  });

  it("ignora una última línea cortada", () => {
    const archivo = archivoNuevo();
    registrarCorrida(archivo, corrida("tienda"));
    appendFileSync(archivo, '{"sesion":"tienda","fecha":');
    expect(leerHistorial(archivo)).toHaveLength(1);
  });

  it("acepta nombres de sesión simples y rechaza los que no sirven como nombre", () => {
    for (const n of ["tienda", "vault-on-aws", "proyecto_2"]) expect(nombreSesionValido(n), n).toBe(true);
    for (const n of ["", "con espacio", "../fuera", "a".repeat(50)]) expect(nombreSesionValido(n), n).toBe(false);
  });
});

describe("historial de consumo: resumen por sesión", () => {
  const h = [
    corrida("tienda", { fecha: "2026-11-03T10:00:00.000Z", uso: { entrada: 100, salida: 2000, cacheEscritura: 800, cacheLectura: 0 }, costoUsd: 0.002 }),
    corrida("vault", { fecha: "2026-11-03T11:00:00.000Z", uso: { entrada: 50, salida: 5000, cacheEscritura: 0, cacheLectura: 3000 }, costoUsd: 0.003 }),
    corrida("tienda", { fecha: "2026-11-03T12:00:00.000Z", uso: { entrada: 20, salida: 1000, cacheEscritura: 0, cacheLectura: 900 }, costoUsd: 0.001, resultado: "rechazado" }),
  ];

  it("suma por sesión: corridas, entrada total con la parte en caché, salida y costo", () => {
    const r = resumirHistorial(h);
    // tienda: entrada 100+800 y 20+900 = 1820 (caché 800+900 = 1700); salida 3000; costo 0.003.
    expect(r.sesiones).toEqual([
      { sesion: "tienda", corridas: 2, entrada: 1820, enCache: 1700, salida: 3000, costoUsd: 0.003, ultima: "2026-11-03T12:00:00.000Z" },
      { sesion: "vault", corridas: 1, entrada: 3050, enCache: 3000, salida: 5000, costoUsd: 0.003, ultima: "2026-11-03T11:00:00.000Z" },
    ]);
    expect(r.total).toEqual({ corridas: 3, entrada: 4870, enCache: 4700, salida: 8000, costoUsd: 0.006 });
  });

  it("con una sesión, el detalle lista sus corridas en orden", () => {
    const r = resumirHistorial(h, "tienda");
    expect(r.detalle?.map((d) => [d.fecha, d.entrada, d.salida, d.resultado])).toEqual([
      ["2026-11-03T10:00:00.000Z", 900, 2000, "desplegado"],
      ["2026-11-03T12:00:00.000Z", 920, 1000, "rechazado"],
    ]);
  });

  it("el texto muestra los totales por sesión y el detalle pedido", () => {
    const general = textoHistorial(resumirHistorial(h));
    expect(general).toContain("tienda");
    expect(general).toContain("1 820");
    expect(general).toMatch(/Total.*4 870.*8 000/);
    const detalle = textoHistorial(resumirHistorial(h, "tienda"));
    expect(detalle).toContain("Una cola cifrada");
    expect(detalle).toContain("rechazado");
    expect(textoHistorial(resumirHistorial(h, "otra"))).toContain('No hay corridas en la sesión "otra"');
  });

  it("resume el consumo de una interacción en una línea", () => {
    expect(lineaConsumo({ entrada: 2, salida: 2166, cacheEscritura: 827, cacheLectura: 2534 }, 0.001211915, 1)).toBe(
      "Tokens: entrada 3 363 (3 361 en caché) · salida 2 166 · 1 llamada(s) · costo estimado US$ 0.0012",
    );
  });
});
