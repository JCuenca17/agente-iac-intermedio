import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { traducir } from "../src/traductor/opentofu.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";
import type { Artefacto } from "../src/artefacto/tipos.js";

const esquema: EsquemaProveedor = JSON.parse(
  readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"),
);
const c03: Artefacto = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const opciones = { endpoint: "http://localhost:4566", region: "us-east-1", versionProveedor: "6.71.0" };

describe("traductor a OpenTofu (main.tf.json)", () => {
  const { codigo } = traducir(c03, esquema, opciones);

  it("fija el proveedor AWS en la versión indicada", () => {
    expect(codigo.terraform.required_providers.aws).toEqual({ source: "hashicorp/aws", version: "6.71.0" });
  });

  it("apunta todos los servicios al emulador y no usa credenciales reales", () => {
    const aws = codigo.provider.aws;
    expect(aws.region).toBe("us-east-1");
    expect(aws.access_key).toBe("test");
    expect(aws.skip_credentials_validation).toBe(true);
    expect(aws.endpoints.sqs).toBe("http://localhost:4566");
    expect(aws.endpoints.s3).toBe("http://localhost:4566");
  });

  it("etiqueta todos los recursos con el proyecto", () => {
    expect(codigo.provider.aws.default_tags.tags.proyecto).toBe("agente-iac-intermedio");
  });

  it("crea un recurso por cada recurso del artefacto, con su id como nombre", () => {
    expect(Object.keys(codigo.resource.aws_sqs_queue).sort()).toEqual(["cola_fallidos", "cola_trabajos"]);
    expect(codigo.resource.aws_sqs_queue.cola_fallidos).toEqual({ name: "c03-trabajos-fallidos", sqs_managed_sse_enabled: true });
  });

  it("convierte ${ref:id.atributo} en la referencia de OpenTofu", () => {
    const a = structuredClone(c03);
    a.recursos[1].atributos.name = "${ref:cola_fallidos.name}-principal";
    const r = traducir(a, esquema, opciones).codigo.resource.aws_sqs_queue.cola_trabajos;
    expect(r.name).toBe("${aws_sqs_queue.cola_fallidos.name}-principal");
  });

  it("serializa como texto JSON los atributos de texto que el artefacto trae como objeto", () => {
    const politica = codigo.resource.aws_sqs_queue.cola_trabajos.redrive_policy;
    expect(typeof politica).toBe("string");
    expect(JSON.parse(politica)).toEqual({ deadLetterTargetArn: "${aws_sqs_queue.cola_fallidos.arn}", maxReceiveCount: 3 });
  });

  it("escapa las directivas de plantilla %{ para que OpenTofu no las interprete", () => {
    const a = structuredClone(c03);
    a.recursos[0].atributos.name = "cola-%{x}";
    expect(traducir(a, esquema, opciones).codigo.resource.aws_sqs_queue.cola_fallidos.name).toBe("cola-%%{x}");
  });

  it("traduce depende_de a depends_on", () => {
    const a = structuredClone(c03);
    a.recursos[1].depende_de = ["cola_fallidos"];
    expect(traducir(a, esquema, opciones).codigo.resource.aws_sqs_queue.cola_trabajos.depends_on).toEqual(["aws_sqs_queue.cola_fallidos"]);
  });

  it("agrega el paquete mínimo a las funciones Lambda que no traen código", () => {
    const a = structuredClone(c03);
    a.recursos.push({
      id: "procesador",
      tipo: "aws_lambda_function",
      proposito: "x",
      atributos: { function_name: "p", role: "${ref:cola_fallidos.arn}", runtime: "python3.12", handler: "index.handler" },
    });
    const r = traducir(a, esquema, opciones);
    const funcion = r.codigo.resource.aws_lambda_function.procesador;
    expect(funcion.filename).toBe("lambda_minima.zip");
    expect(funcion.source_code_hash).toBe('${filebase64sha256("lambda_minima.zip")}');
    expect(r.archivosAuxiliares).toEqual(["lambda_minima.zip"]);
  });

  it("no agrega archivos auxiliares si no hay funciones", () => {
    expect(traducir(c03, esquema, opciones).archivosAuxiliares).toEqual([]);
  });

  it("produce el mismo resultado con la misma entrada", () => {
    expect(JSON.stringify(traducir(c03, esquema, opciones).codigo)).toBe(JSON.stringify(codigo));
  });
});
