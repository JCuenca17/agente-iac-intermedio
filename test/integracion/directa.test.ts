import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ejecutarDirecta } from "../../src/linea-base/directa.js";
import { ProveedorGrabado } from "../../src/modelo/grabado.js";
import { Registro } from "../../src/trazas/registro.js";

// B1 con respuestas grabadas y OpenTofu real contra el emulador. No usa ningún modelo.
const versiones = JSON.parse(readFileSync(new URL("../../versiones.json", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "b1-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const conError = '```hcl\nresource "aws_sqs_queue" "trabajos" {\n  name                   = "integ-b1-trabajos"\n  sqs_managed_encryption = true\n}\n```';
const corregido = '```hcl\nresource "aws_sqs_queue" "trabajos" {\n  name                    = "integ-b1-trabajos"\n  sqs_managed_sse_enabled = true\n}\n```';

describe("B1 contra el emulador", () => {
  it("retroalimenta el error de tofu validate y acepta la corrección", async () => {
    const r = await ejecutarDirecta("Una cola de trabajos cifrada", {
      proveedor: new ProveedorGrabado([conError, corregido]),
      endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:4566",
      region: process.env.AWS_REGION ?? "us-east-1",
      versionProveedor: versiones.proveedor_aws,
      dirTrabajo: dir,
      registro: new Registro(),
      conRetroalimentacion: true,
      maxIteraciones: 3,
      limiteGastoUsd: 5,
    });
    expect(r).toMatchObject({ listo: true, motivo: "valido", iteraciones: 2 });
    expect(r.erroresPorIteracion[0][0]).toMatchObject({ capa: "C4", regla: "tofu-validate", ruta: "aws_sqs_queue.trabajos" });
    expect(r.resumenPlan).toEqual({ crear: 1, cambiar: 0, destruir: 0 });
  });
});
