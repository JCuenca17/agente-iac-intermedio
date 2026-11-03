import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluarIntencion } from "../src/experimento/intencion.js";

// Planes de referencia reducidos (planned_values y configuration) de las soluciones de
// prueba-minima/casos. Necesita OPA instalado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plan = any;
const plan = (caso: string): Plan => JSON.parse(readFileSync(new URL(`./fixtures/planes/${caso}.json`, import.meta.url), "utf8"));
const CASOS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12"];

const sinTipo = (p: Plan, tipo: string): Plan => {
  for (const seccion of [p.planned_values, p.configuration]) {
    seccion.root_module.resources = seccion.root_module.resources.filter((r: { type: string }) => r.type !== tipo);
  }
  return p;
};
const valores = (p: Plan, direccion: string) => p.planned_values.root_module.resources.find((r: { address: string }) => r.address === direccion).values;

describe("M4: listas de verificación de los casos", () => {
  it.each(CASOS)("la solución de referencia de %s cumple el 100 %%", (caso) => {
    const r = evaluarIntencion(caso, plan(caso));
    expect(r.faltantes).toEqual([]);
    expect(r.proporcion).toBe(1);
  });

  it("C01 sin versionado pierde solo ese requisito", () => {
    const r = evaluarIntencion("C01", sinTipo(plan("C01"), "aws_s3_bucket_versioning"));
    expect(r.faltantes).toEqual(["versionado"]);
    expect(r.proporcion).toBe(0.75);
  });

  it("C02 sin recuperación ante borrado lo detecta", () => {
    const p = plan("C02");
    valores(p, "aws_dynamodb_table.pedidos").point_in_time_recovery[0].enabled = false;
    expect(evaluarIntencion("C02", p).faltantes).toEqual(["recuperacion"]);
  });

  it("C03 con una cola sin cifrar lo detecta", () => {
    const p = plan("C03");
    valores(p, "aws_sqs_queue.fallidos").sqs_managed_sse_enabled = false;
    expect(evaluarIntencion("C03", p).faltantes).toEqual(["cifrado"]);
  });

  it("C04 con permiso de escritura lo detecta", () => {
    const p = plan("C04");
    const doc = p.configuration.root_module.resources.find((r: { address: string }) => r.address === "data.aws_iam_policy_document.solo_lectura");
    doc.expressions.statement[1].actions.constant_value.push("s3:PutObject");
    expect(evaluarIntencion("C04", p).faltantes).toEqual(["sin_escritura"]);
  });

  it("C07 sin el disparador desde la cola lo detecta", () => {
    expect(evaluarIntencion("C07", sinTipo(plan("C07"), "aws_lambda_event_source_mapping")).faltantes).toEqual(["disparador"]);
  });

  it("C11 con SSH abierto a internet lo detecta", () => {
    const p = plan("C11");
    valores(p, "aws_security_group.web").ingress.push({ from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] });
    expect(evaluarIntencion("C11", p).faltantes).toEqual(["sin_puertos_abiertos"]);
  });

  it("C12 con otra retención de logs lo detecta", () => {
    const p = plan("C12");
    valores(p, "aws_cloudwatch_log_group.funcion").retention_in_days = 7;
    expect(evaluarIntencion("C12", p).faltantes).toEqual(["logs"]);
  });

  it("un plan vacío no cumple nada", () => {
    const vacio = { planned_values: { root_module: { resources: [] } }, configuration: { root_module: { resources: [] } } };
    expect(evaluarIntencion("C10", vacio).proporcion).toBe(0);
  });
});

describe("entradaDesplegada", () => {
  it("usa los valores del estado y la configuración del plan", async () => {
    const { entradaDesplegada } = await import("../src/experimento/intencion.js");
    const estado = { values: { root_module: { resources: [{ address: "aws_sqs_queue.a" }] } } };
    const planPosterior = { configuration: { root_module: { resources: [{ address: "aws_sqs_queue.a", expressions: {} }] } } };
    expect(entradaDesplegada(estado, planPosterior)).toEqual({
      planned_values: { root_module: estado.values.root_module },
      configuration: planPosterior.configuration,
    });
  });

  it("sin estado devuelve una entrada vacía (nada desplegado, nada cumplido)", async () => {
    const { entradaDesplegada } = await import("../src/experimento/intencion.js");
    expect(evaluarIntencion("C01", entradaDesplegada(undefined, undefined)).proporcion).toBe(0);
  });
});
