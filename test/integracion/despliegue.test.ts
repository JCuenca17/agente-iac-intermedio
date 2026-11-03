import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Artefacto } from "../../src/artefacto/tipos.js";
import { desplegar, destruir } from "../../src/despliegue/despliegue.js";
import { cargarEsquemaProveedor } from "../../src/proveedor/esquema.js";
import { traducir } from "../../src/traductor/opentofu.js";
import { prepararDirectorio, validarConOpenTofu } from "../../src/validador/c4-opentofu.js";

const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const c03: Artefacto = JSON.parse(readFileSync(new URL("../fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
// Nombres propios para no chocar con otros recursos del emulador.
c03.recursos[0].atributos.name = "integ-despliegue-fallidos";
c03.recursos[1].atributos.name = "integ-despliegue-trabajos";

const dir = mkdtempSync(join(tmpdir(), "despliegue-"));
afterAll(async () => {
  await destruir(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe("despliegue en el emulador", () => {
  it("aplica el plan de C4, comprueba que no quedan cambios y destruye", async () => {
    const esquema = cargarEsquemaProveedor();
    prepararDirectorio(
      dir,
      traducir(c03, esquema, {
        endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
        region: process.env.AWS_REGION ?? "us-east-1",
        versionProveedor: versiones.proveedor_aws,
      }),
    );
    expect((await validarConOpenTofu(dir, c03)).valido).toBe(true);

    const r = await desplegar(dir);
    expect(r.errores).toEqual([]);
    expect(r).toMatchObject({ aplicado: true, sinCambios: true, cambiosPendientes: [] });
    expect(await destruir(dir)).toBe(true);
  });
});
