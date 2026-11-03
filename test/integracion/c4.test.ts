import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Artefacto } from "../../src/artefacto/tipos.js";
import { cargarEsquemaProveedor } from "../../src/proveedor/esquema.js";
import { traducir } from "../../src/traductor/opentofu.js";
import { prepararDirectorio, validarConOpenTofu } from "../../src/validador/c4-opentofu.js";

const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const esquema = cargarEsquemaProveedor();
const opciones = {
  endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
  region: process.env.AWS_REGION ?? "us-east-1",
  versionProveedor: versiones.proveedor_aws,
};
const c03: Artefacto = JSON.parse(readFileSync(new URL("../fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const dirs: string[] = [];
const nuevoDir = () => {
  const d = mkdtempSync(join(tmpdir(), "c4-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("C4 contra el emulador", () => {
  it("valida y planifica el artefacto de C03 sin errores", async () => {
    const dir = nuevoDir();
    prepararDirectorio(dir, traducir(c03, esquema, opciones));
    const r = await validarConOpenTofu(dir, c03);
    expect(r.errores).toEqual([]);
    expect(r.resumen).toEqual({ crear: 2, cambiar: 0, destruir: 0 });
    expect(r.plan).toHaveProperty("planned_values");
  });

  it("ubica en el artefacto un valor fuera de rango (lo detecta validate, antes del plan)", async () => {
    const a = structuredClone(c03);
    a.recursos[1].atributos.delay_seconds = 99999;
    const dir = nuevoDir();
    prepararDirectorio(dir, traducir(a, esquema, opciones));
    const r = await validarConOpenTofu(dir, a);
    expect(r.valido).toBe(false);
    expect(r.errores[0]).toMatchObject({ capa: "C4", ruta: "/recursos/1/atributos/delay_seconds", regla: "tofu-validate" });
  });
});
