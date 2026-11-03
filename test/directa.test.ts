import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { construirSistemaDirecto, ejecutarDirecta, extraerCodigo } from "../src/linea-base/directa.js";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import { Registro } from "../src/trazas/registro.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const codigo = 'resource "aws_sqs_queue" "trabajos" {\n  name = "trabajos"\n}';

describe("línea base: generación directa de OpenTofu", () => {
  it("el prompt pide solo recursos, con la versión del proveedor y los mismos requisitos de seguridad", () => {
    const s = construirSistemaDirecto("6.71.0");
    expect(s).toContain("6.71.0");
    expect(s).toMatch(/No escribas los bloques "terraform" ni "provider"/);
    expect(s).toMatch(/cifr/i);
    expect(s).toContain("lambda_minima.zip");
  });

  it("extrae el código de un bloque hcl o terraform, o usa el texto completo", () => {
    expect(extraerCodigo("Aquí:\n```hcl\n" + codigo + "\n```\n")).toBe(codigo + "\n");
    expect(extraerCodigo("```terraform\n" + codigo + "\n```")).toBe(codigo + "\n");
    expect(extraerCodigo(codigo)).toBe(codigo + "\n");
  });

  it("B0 escribe el código, la configuración del proveedor y el paquete Lambda, sin validar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b0-"));
    dirs.push(dir);
    const r = await ejecutarDirecta("una cola", {
      proveedor: new ProveedorGrabado(["```hcl\n" + codigo + "\n```"]),
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      versionProveedor: "6.71.0",
      dirTrabajo: dir,
      registro: new Registro(),
      conRetroalimentacion: false,
      maxIteraciones: 3,
      limiteGastoUsd: 5,
    });
    expect(r).toMatchObject({ listo: true, motivo: "sin-validacion", iteraciones: 1, llamadas: 1 });
    expect(readFileSync(join(r.dirFinal!, "main.tf"), "utf8")).toBe(codigo + "\n");
    const proveedor = JSON.parse(readFileSync(join(r.dirFinal!, "proveedor.tf.json"), "utf8"));
    expect(proveedor.provider.aws.endpoints.sqs).toBe("http://localhost:4566");
    expect(proveedor.terraform.required_providers.aws.version).toBe("6.71.0");
    expect(existsSync(join(r.dirFinal!, "lambda_minima.zip"))).toBe(true);
  });
});
