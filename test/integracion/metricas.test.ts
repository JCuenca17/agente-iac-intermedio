import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Artefacto } from "../../src/artefacto/tipos.js";
import { desplegar, destruir } from "../../src/despliegue/despliegue.js";
import { entradaDesplegada, evaluarIntencion } from "../../src/experimento/intencion.js";
import { violacionesDesplegado } from "../../src/experimento/politicas-desplegado.js";
import { cargarEsquemaProveedor } from "../../src/proveedor/esquema.js";
import { traducir } from "../../src/traductor/opentofu.js";
import { prepararDirectorio, validarConOpenTofu } from "../../src/validador/c4-opentofu.js";

const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const c01: Artefacto = JSON.parse(readFileSync(new URL("../fixtures/artefactos/c01-valido.json", import.meta.url), "utf8"));
c01.recursos[0].atributos.bucket = "integ-metricas-respaldos";
const dir = mkdtempSync(join(tmpdir(), "metricas-"));
afterAll(async () => {
  await destruir(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe("M3 y M4 sobre un estado real del emulador", () => {
  it("el artefacto de C01 desplegado no tiene violaciones y cumple toda la lista de C01", async () => {
    prepararDirectorio(
      dir,
      traducir(c01, cargarEsquemaProveedor(), {
        endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
        region: process.env.AWS_REGION ?? "us-east-1",
        versionProveedor: versiones.proveedor_aws,
      }),
    );
    expect((await validarConOpenTofu(dir, c01)).valido).toBe(true);
    const d = await desplegar(dir);
    expect(d).toMatchObject({ aplicado: true, sinCambios: true });

    expect(violacionesDesplegado(d.estado)).toEqual([]);
    const m4 = evaluarIntencion("C01", entradaDesplegada(d.estado, d.planPosterior));
    expect(m4.faltantes).toEqual([]);
    expect(m4.proporcion).toBe(1);
  });
});
