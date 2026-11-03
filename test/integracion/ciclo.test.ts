import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ejecutarCiclo } from "../../src/ciclo/ciclo.js";
import { ProveedorGrabado } from "../../src/modelo/grabado.js";
import { cargarEsquemaProveedor } from "../../src/proveedor/esquema.js";
import { Registro } from "../../src/trazas/registro.js";

// Ciclo real (C1-C4 y emulador) con respuestas grabadas: no usa ningún modelo ni cuesta nada.
const leer = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/artefactos/${n}.json`, import.meta.url), "utf8"));
const entregar = (a: unknown) => JSON.stringify({ accion: "entregar", artefacto: a });
const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "ciclo-integ-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ciclo completo contra el emulador", () => {
  it("detecta la forma deprecada del bucket, la retroalimenta y acepta la corrección", async () => {
    const registro = new Registro();
    const r = await ejecutarCiclo("Bucket privado para respaldos, con versionado y cifrado.", {
      proveedor: new ProveedorGrabado([entregar(leer("c01-deprecado")), entregar(leer("c01-valido"))]),
      esquema: cargarEsquemaProveedor(),
      endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
      region: process.env.AWS_REGION ?? "us-east-1",
      versionProveedor: versiones.proveedor_aws,
      dirTrabajo: dir,
      registro,
      maxIteraciones: 3,
      conValidador: true,
      conRetroalimentacion: true,
      conRag: true,
      limiteGastoUsd: 5,
    });

    expect(r).toMatchObject({ listo: true, motivo: "valido", iteraciones: 2 });
    const reglas = r.erroresPorIteracion[0].map((e) => e.regla);
    expect(reglas).toContain("atributo-deprecado");
    expect(r.erroresPorIteracion[0].every((e) => e.capa === "C2")).toBe(true);
    expect(r.plan).toHaveProperty("planned_values");
    const capas = registro.eventos.filter((e) => e.evento === "validacion").map((e) => `${e.iteracion}:${e.capa}`);
    expect(capas).toEqual(["1:C1", "1:C2", "2:C1", "2:C2", "2:C3", "2:C4"]);
  });
});
