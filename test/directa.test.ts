import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { construirSistemaDirecto, ejecutarDirecta, extraerCodigo } from "../src/linea-base/directa.js";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import { Registro } from "../src/trazas/registro.js";
import { ProveedorFalso } from "./ayudas/proveedor-falso.js";

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

describe("línea base: B0 y B1 (revisión de código)", () => {
  const otro = 'resource "aws_sns_topic" "avisos" {\n  name = "avisos"\n}';
  const comunes = (dir: string) => ({
    endpoint: "http://localhost:4566",
    region: "us-east-1",
    versionProveedor: "6.71.0",
    dirTrabajo: dir,
    registro: new Registro(),
    maxIteraciones: 3,
    limiteGastoUsd: 5,
  });
  const nuevoDir = () => {
    const d = mkdtempSync(join(tmpdir(), "b1-"));
    dirs.push(d);
    return d;
  };
  const errorC4 = { capa: "C4" as const, ruta: "aws_sqs_queue.trabajos", regla: "tofu-validate", mensaje: "argumento inválido" };

  it("junta todos los bloques de código de la respuesta", () => {
    const texto = "Primero:\n```hcl\n" + codigo + "\n```\nY luego:\n```hcl\n" + otro + "\n```\n";
    expect(extraerCodigo(texto)).toBe(codigo + "\n\n" + otro + "\n");
  });

  it("B0 no escribe ni despliega código con un provisioner", async () => {
    const malo = 'resource "aws_sqs_queue" "q" {\n  provisioner "local-exec" {\n    command = "id"\n  }\n}';
    const dir = nuevoDir();
    const r = await ejecutarDirecta("una cola", { ...comunes(dir), proveedor: new ProveedorFalso(["```hcl\n" + malo + "\n```"]), conRetroalimentacion: false });
    expect(r).toMatchObject({ listo: false, motivo: "construccion-no-permitida", iteraciones: 1 });
    expect(existsSync(join(dir, "iter-1", "main.tf"))).toBe(false);
  });

  it("B0 deja en la traza el código rechazado y el motivo, para poder auditarlo", async () => {
    const malo = 'terraform {\n  required_version = ">= 1.0"\n}\n\n' + codigo;
    const opciones = comunes(nuevoDir());
    await ejecutarDirecta("una cola", { ...opciones, proveedor: new ProveedorFalso(["```hcl\n" + malo + "\n```"]), conRetroalimentacion: false });
    const evento = opciones.registro.eventos.find((e) => e.evento === "construccion-rechazada");
    expect(evento).toMatchObject({ iteracion: 1, codigo: malo + "\n" });
    expect(evento?.errores).toEqual([expect.objectContaining({ ruta: "/main.tf:1", regla: "construccion-no-permitida" })]);
  });

  it("B1 también deja en la traza cada código rechazado", async () => {
    const malo = 'resource "null_resource" "x" {}';
    const opciones = comunes(nuevoDir());
    const proveedor = new ProveedorFalso(["```hcl\n" + malo + "\n```", "```hcl\n" + codigo + "\n```"]);
    await ejecutarDirecta("una cola", { ...opciones, proveedor, conRetroalimentacion: true, validar: async () => ({ valido: true, errores: [] }) });
    const eventos = opciones.registro.eventos.filter((e) => e.evento === "construccion-rechazada");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ iteracion: 1, codigo: malo + "\n" });
  });

  it("no anota rechazos cuando el código es aceptable", async () => {
    const opciones = comunes(nuevoDir());
    await ejecutarDirecta("una cola", { ...opciones, proveedor: new ProveedorFalso(["```hcl\n" + codigo + "\n```"]), conRetroalimentacion: false });
    expect(opciones.registro.eventos.some((e) => e.evento === "construccion-rechazada")).toBe(false);
  });

  it("B1 devuelve los errores de OpenTofu al modelo y acepta la corrección", async () => {
    const proveedor = new ProveedorFalso(["```hcl\n" + codigo + "\n```"]);
    let n = 0;
    const validar = async () => (++n === 1 ? { valido: false, errores: [errorC4] } : { valido: true, errores: [] });
    const r = await ejecutarDirecta("una cola", { ...comunes(nuevoDir()), proveedor, conRetroalimentacion: true, validar });
    expect(r).toMatchObject({ listo: true, motivo: "valido", iteraciones: 2, llamadas: 2 });
    const ultimo = proveedor.recibidos[1].at(-1)!;
    expect(ultimo.rol).toBe("usuario");
    expect(ultimo.texto).toContain("aws_sqs_queue.trabajos (tofu-validate): argumento inválido");
  });

  it("B1 devuelve como error un provisioner, sin ejecutar OpenTofu", async () => {
    const malo = 'resource "null_resource" "x" {}';
    const proveedor = new ProveedorFalso(["```hcl\n" + malo + "\n```", "```hcl\n" + codigo + "\n```"]);
    let llamadasValidar = 0;
    const validar = async () => (llamadasValidar++, { valido: true, errores: [] });
    const r = await ejecutarDirecta("una cola", { ...comunes(nuevoDir()), proveedor, conRetroalimentacion: true, validar });
    expect(r).toMatchObject({ listo: true, iteraciones: 2 });
    expect(llamadasValidar).toBe(1);
    expect(r.erroresPorIteracion[0][0].regla).toBe("construccion-no-permitida");
  });

  it("B1 se detiene por límite de gasto", async () => {
    const proveedor = new ProveedorFalso(["```hcl\n" + codigo + "\n```"], 3);
    const validar = async () => ({ valido: false, errores: [errorC4] });
    const r = await ejecutarDirecta("una cola", { ...comunes(nuevoDir()), proveedor, conRetroalimentacion: true, validar });
    expect(r).toMatchObject({ listo: false, motivo: "limite-gasto", iteraciones: 2, llamadas: 2 });
  });
});
