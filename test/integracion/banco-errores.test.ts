import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Artefacto } from "../../src/artefacto/tipos.js";
import { validarPorCapas } from "../../src/ciclo/ciclo.js";
import { evaluarBanco, generarBanco } from "../../src/experimento/banco-errores.js";
import { cargarEsquemaProveedor } from "../../src/proveedor/esquema.js";
import { Registro } from "../../src/trazas/registro.js";

// Validador real (C1-C4) y emulador; no usa ningún modelo.
const leer = (n: string): Artefacto => JSON.parse(readFileSync(new URL(`../fixtures/artefactos/${n}.json`, import.meta.url), "utf8"));
const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const raiz = mkdtempSync(join(tmpdir(), "banco-"));
afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("banco de errores con el validador real", () => {
  it("cada error lo detecta la capa esperada: estructura en C1, deprecado en C2, política en C3 y fuera de rango en C4", async () => {
    const elegidos = ["estructura-1", "atributo-deprecado-2", "violacion-politica-1", "fuera-de-rango-1"];
    const casos = generarBanco({ c01: leer("c01-valido"), c03: leer("c03-valido"), c07: leer("c07-valido") }).filter((c) => elegidos.includes(c.id));
    const esquema = cargarEsquemaProveedor();
    const r = await evaluarBanco(casos, (caso) =>
      validarPorCapas(caso.artefacto, join(raiz, caso.id), {
        esquema,
        endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
        region: process.env.AWS_REGION ?? "us-east-1",
        versionProveedor: versiones.proveedor_aws,
        registro: new Registro(),
        iteracion: 1,
      }),
    );
    expect(r.resultados.map((x) => [x.id, x.capaDetecta])).toEqual([
      ["estructura-1", "C1"],
      ["atributo-deprecado-2", "C2"],
      ["violacion-politica-1", "C3"],
      ["fuera-de-rango-1", "C4"],
    ]);
  });
});
