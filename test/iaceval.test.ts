import { describe, expect, it } from "vitest";
import { evaluarRegoIaCEval } from "../src/experimento/iaceval.js";

// Políticas con la forma de IaC-Eval (sintaxis antigua, package terraform.validation).
const politicaV0 = `package terraform.validation

default has_bucket = false
default bucket_named = false

has_bucket {
    r := input.configuration.root_module.resources[_]
    r.type == "aws_s3_bucket"
}

bucket_named {
    r := input.planned_values.root_module.resources[_]
    r.type == "aws_s3_bucket"
    r.values.bucket == "datos"
}
`;

const plan = (nombre: string) => ({
  configuration: { root_module: { resources: [{ type: "aws_s3_bucket", name: "b", expressions: {} }] } },
  planned_values: { root_module: { resources: [{ type: "aws_s3_bucket", name: "b", values: { bucket: nombre } }] } },
});

describe("evaluación de la intención de IaC-Eval", () => {
  it("es correcta si ninguna regla da false", () => {
    expect(evaluarRegoIaCEval(politicaV0, plan("datos"))).toEqual({ correcto: true, error: "" });
  });

  it("falla si alguna regla da false", () => {
    expect(evaluarRegoIaCEval(politicaV0, plan("otro")).correcto).toBe(false);
  });

  it("lee también políticas con import rego.v1", () => {
    const v1 = `package terraform.validation\n\nimport rego.v1\n\ndefault ok := false\n\nok if {\n\tsome r in input.planned_values.root_module.resources\n\tr.type == "aws_s3_bucket"\n}\n`;
    expect(evaluarRegoIaCEval(v1, plan("x")).correcto).toBe(true);
  });

  it("una política sin ninguna regla verdadera no cuenta como correcta", () => {
    // Reglas sin default que no se activan: no aparecen en data y no hay ningún false.
    const sinDefault = `package terraform.validation

has_queue {
    r := input.configuration.root_module.resources[_]
    r.type == "aws_sqs_queue"
}
`;
    const r = evaluarRegoIaCEval(sinDefault, plan("x"));
    expect(r.correcto).toBe(false);
    expect(r.error).toMatch(/ninguna regla verdadera/);
  });

  it("una política inválida cuenta como incorrecta, con el error", () => {
    const r = evaluarRegoIaCEval("package x\n\nesto no es rego {", plan("x"));
    expect(r.correcto).toBe(false);
    expect(r.error).not.toBe("");
  });
});
