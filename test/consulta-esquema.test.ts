import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consultarEsquema } from "../src/proveedor/consulta.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";

const esquema: EsquemaProveedor = JSON.parse(
  readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"),
);

describe("consultarEsquema (herramienta del RAG)", () => {
  it("devuelve los campos asignables de un tipo, sin los de solo lectura", () => {
    const r = consultarEsquema(esquema, "aws_sqs_queue");
    expect(r.existe).toBe(true);
    expect(r.texto).toMatch(/sqs_managed_sse_enabled/);
    expect(r.texto).toMatch(/redrive_policy/);
    expect(r.texto).not.toMatch(/^\s*arn\b/m);
    expect(r.texto).not.toMatch(/^\s*url\b/m);
  });

  it("marca los obligatorios y avisa de los deprecados sin listarlos como opción", () => {
    const r = consultarEsquema(esquema, "aws_lambda_function");
    expect(r.texto).toMatch(/function_name .*obligatorio/);
    expect(r.texto).toMatch(/role .*obligatorio/);
    const s3 = consultarEsquema(esquema, "aws_s3_bucket");
    expect(s3.texto).toMatch(/Deprecados \(no usar\):.*versioning/s);
    expect(s3.texto).not.toMatch(/^\s*versioning \{/m);
  });

  it("describe los bloques anidados", () => {
    const r = consultarEsquema(esquema, "aws_dynamodb_table");
    expect(r.texto).toMatch(/attribute \{.*lista/);
    expect(r.texto).toMatch(/^\s{4}name .*obligatorio/m);
  });

  it("avisa cuando el tipo está deprecado", () => {
    const r = consultarEsquema(esquema, "aws_media_store_container");
    expect(r.texto).toMatch(/DEPRECADO/);
  });

  it("sugiere tipos parecidos cuando el tipo no existe", () => {
    const r = consultarEsquema(esquema, "aws_sqs_cola");
    expect(r.existe).toBe(false);
    expect(r.texto).toMatch(/aws_sqs_queue/);
  });

  it("es compacto", () => {
    expect(consultarEsquema(esquema, "aws_lambda_function").texto.length).toBeLessThan(4000);
  });
});
