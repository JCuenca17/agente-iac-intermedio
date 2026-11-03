import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { erroresDePlan, erroresDeValidate, resumenDePlan } from "../src/validador/c4-opentofu.js";
import type { Artefacto } from "../src/artefacto/tipos.js";

// Salidas reales de OpenTofu 1.13.1 con el proveedor AWS 6.71.0 (validate -json y plan -json).
const c03: Artefacto = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));

const salidaValidate = JSON.stringify({
  format_version: "1.0",
  valid: false,
  error_count: 1,
  warning_count: 0,
  diagnostics: [
    {
      severity: "error",
      summary: "Extraneous JSON object property",
      detail: 'No argument or block type is named "atributo_falso".',
      snippet: { context: "resource.aws_sqs_queue.cola_fallidos", code: '        "atributo_falso": 1' },
    },
  ],
});

const lineasPlan = [
  '{"@level":"info","@message":"OpenTofu 1.13.1","type":"version"}',
  '{"@level":"error","@message":"Error: expected delay_seconds to be in the range (0 - 900), got 99999","diagnostic":{"severity":"error","summary":"expected delay_seconds to be in the range (0 - 900), got 99999","detail":"","address":"aws_sqs_queue.cola_trabajos","snippet":{"context":"resource.aws_sqs_queue.cola_trabajos","code":"        \\"delay_seconds\\": 99999"}},"type":"diagnostic"}',
  '{"@level":"warn","diagnostic":{"severity":"warning","summary":"algo menor"},"type":"diagnostic"}',
].join("\n");

describe("C4: errores de OpenTofu", () => {
  it("traduce un error de validate a capa, ruta en el artefacto, regla y mensaje", () => {
    expect(erroresDeValidate(salidaValidate, c03)).toEqual([
      {
        capa: "C4",
        ruta: "/recursos/0/atributos/atributo_falso",
        regla: "tofu-validate",
        mensaje: 'Extraneous JSON object property: No argument or block type is named "atributo_falso".',
      },
    ]);
  });

  it("no reporta nada cuando validate es correcto", () => {
    expect(erroresDeValidate(JSON.stringify({ valid: true, diagnostics: [] }), c03)).toEqual([]);
  });

  it("traduce los errores del plan e ignora las advertencias", () => {
    expect(erroresDePlan(lineasPlan, c03)).toEqual([
      {
        capa: "C4",
        ruta: "/recursos/1/atributos/delay_seconds",
        regla: "tofu-plan",
        mensaje: "expected delay_seconds to be in the range (0 - 900), got 99999",
      },
    ]);
  });

  it("usa la raíz del artefacto cuando el error no apunta a un recurso", () => {
    const linea = '{"@level":"error","diagnostic":{"severity":"error","summary":"Failed to load plugin"},"type":"diagnostic"}';
    expect(erroresDePlan(linea, c03)[0].ruta).toBe("/");
  });

  it("sirve también sin artefacto (generación directa), con la dirección de OpenTofu", () => {
    expect(erroresDePlan(lineasPlan)[0].ruta).toBe("aws_sqs_queue.cola_trabajos");
  });

  it("normaliza el contexto de un archivo .tf (generación directa) a la dirección de OpenTofu", () => {
    const salida = JSON.stringify({
      diagnostics: [{ severity: "error", summary: "Unsupported argument", snippet: { context: 'resource "aws_sqs_queue" "trabajos"', code: "  x = 1" } }],
    });
    expect(erroresDeValidate(salida)[0].ruta).toBe("aws_sqs_queue.trabajos");
  });

  it("lee el resumen de cambios del plan", () => {
    const linea = '{"@level":"info","type":"change_summary","changes":{"add":2,"change":0,"import":0,"remove":0,"operation":"plan"}}';
    expect(resumenDePlan(linea)).toEqual({ crear: 2, cambiar: 0, destruir: 0 });
  });
});
