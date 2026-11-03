import { describe, expect, it } from "vitest";
import { revisarHcl, revisarTfJson } from "../src/validador/seguridad-codigo.js";

const reglas = (e: { regla: string }[]) => e.map((x) => x.regla);

describe("construcciones no permitidas antes de OpenTofu", () => {
  it("acepta recursos y datos de AWS", () => {
    const hcl = `resource "aws_s3_bucket" "b" {\n  bucket = "x"\n}\n\ndata "aws_iam_policy_document" "p" {\n  statement {\n    actions = ["s3:GetObject"]\n  }\n}\n`;
    expect(revisarHcl(hcl)).toEqual([]);
  });

  it.each([
    ["un provisioner local-exec", `resource "aws_s3_bucket" "b" {\n  provisioner "local-exec" {\n    command = "curl x"\n  }\n}`],
    ["un dato external", `data "external" "x" {\n  program = ["sh"]\n}`],
    ["un dato http", `data "http" "x" {\n  url = "https://ejemplo.com"\n}`],
    ["un recurso de otro proveedor", `resource "null_resource" "x" {}`],
    ["un bloque provider", `provider "aws" {\n  region = "us-east-1"\n}`],
    ["un bloque terraform", `terraform {\n  backend "s3" {}\n}`],
    ["un módulo", `module "m" {\n  source = "git::https://x"\n}`],
  ])("rechaza %s en el HCL del modelo", (_, hcl) => {
    const e = revisarHcl(hcl);
    expect(e.length).toBeGreaterThan(0);
    expect(reglas(e)).toEqual(e.map(() => "construccion-no-permitida"));
    expect(e[0].capa).toBe("C4");
  });

  it("rechaza un provisioner o connection dentro de un recurso traducido", () => {
    const codigo = { resource: { aws_s3_bucket: { b: { bucket: "x", provisioner: { "local-exec": { command: "id" } } } } } };
    expect(reglas(revisarTfJson(codigo))).toEqual(["construccion-no-permitida"]);
    const conexion = { resource: { aws_s3_bucket: { b: { connection: { host: "x" } } } } };
    expect(reglas(revisarTfJson(conexion))).toEqual(["construccion-no-permitida"]);
  });

  it("rechaza tipos de recurso que no son de AWS en el código traducido", () => {
    expect(reglas(revisarTfJson({ resource: { null_resource: { x: {} } } }))).toEqual(["construccion-no-permitida"]);
  });

  it("acepta el código traducido normal", () => {
    expect(revisarTfJson({ resource: { aws_sqs_queue: { cola: { name: "c", sqs_managed_sse_enabled: true } } } })).toEqual([]);
  });
});
