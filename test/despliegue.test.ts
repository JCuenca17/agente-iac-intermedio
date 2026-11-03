import { describe, expect, it } from "vitest";
import { clasificarCambios } from "../src/despliegue/despliegue.js";

// Fragmentos con la forma de `tofu show -json` sobre el plan posterior al apply.
const cambio = (direccion: string, antes: Record<string, unknown>, despues: Record<string, unknown>, acciones = ["update"]) => ({
  address: direccion,
  change: { actions: acciones, before: antes, after: despues },
});

describe("clasificarCambios del plan posterior al apply", () => {
  it("sin cambios no reporta nada", () => {
    const r = clasificarCambios({ resource_changes: [cambio("aws_sqs_queue.a", { x: 1 }, { x: 1 }, ["no-op"])] });
    expect(r).toEqual({ reales: [], cosmeticos: [] });
  });

  it("trata como cosmético el ID de grupo con la cuenta delante", () => {
    const r = clasificarCambios({
      resource_changes: [
        cambio(
          "aws_vpc_security_group_ingress_rule.bd",
          { referenced_security_group_id: "000000000000/sg-123", from_port: 5432 },
          { referenced_security_group_id: "sg-123", from_port: 5432 },
        ),
      ],
    });
    expect(r.reales).toEqual([]);
    expect(r.cosmeticos).toEqual([{ direccion: "aws_vpc_security_group_ingress_rule.bd", atributos: ["referenced_security_group_id"] }]);
  });

  it("un ID de grupo distinto sí es un cambio real", () => {
    const r = clasificarCambios({
      resource_changes: [
        cambio("aws_vpc_security_group_ingress_rule.bd", { referenced_security_group_id: "000000000000/sg-123" }, { referenced_security_group_id: "sg-999" }),
      ],
    });
    expect(r.reales).toEqual([{ direccion: "aws_vpc_security_group_ingress_rule.bd", atributos: ["referenced_security_group_id"] }]);
  });

  it("si hay un cambio cosmético y otro real en el mismo recurso, cuenta como real", () => {
    const r = clasificarCambios({
      resource_changes: [
        cambio("aws_vpc_security_group_ingress_rule.bd", { referenced_security_group_id: "000000000000/sg-1", to_port: 1 }, { referenced_security_group_id: "sg-1", to_port: 2 }),
      ],
    });
    expect(r.reales[0].atributos).toEqual(["to_port"]);
  });

  it("crear o destruir siempre es un cambio real", () => {
    const r = clasificarCambios({ resource_changes: [cambio("aws_s3_bucket.b", {}, { bucket: "b" }, ["create"])] });
    expect(r.reales).toEqual([{ direccion: "aws_s3_bucket.b", atributos: ["(create)"] }]);
  });

  it("ignora los valores que solo conoce el proveedor después del apply", () => {
    const r = clasificarCambios({
      resource_changes: [
        { address: "aws_sqs_queue.a", change: { actions: ["update"], before: { tags_all: { a: "1" } }, after: { tags_all: { a: "1" } }, after_unknown: {} } },
      ],
    });
    expect(r.reales).toEqual([{ direccion: "aws_sqs_queue.a", atributos: ["(update)"] }]);
  });
});

describe("diferencias de Floci en P2 (ADR-019)", () => {
  const cambio = (type: string, before: Record<string, unknown>, after: Record<string, unknown>) => ({
    resource_changes: [{ address: `${type}.x`, type, change: { actions: ["update"], before, after } }],
  });

  it("la política de autoescalado informada como desactivada y con cooldown es cosmética", () => {
    const r = clasificarCambios(cambio("aws_autoscaling_policy", { enabled: false, cooldown: 300, name: "cpu" }, { enabled: true, cooldown: null, name: "cpu" }));
    expect(r).toEqual({ reales: [], cosmeticos: [{ direccion: "aws_autoscaling_policy.x", atributos: ["enabled", "cooldown"] }] });
  });

  it("los parámetros que el emulador no guardó son cosméticos", () => {
    const r = clasificarCambios(cambio("aws_db_parameter_group", { parameter: [] }, { parameter: [{ name: "log_min_duration_statement", value: "1000", apply_method: "immediate" }] }));
    expect(r.reales).toEqual([]);
    expect(r.cosmeticos).toEqual([{ direccion: "aws_db_parameter_group.x", atributos: ["parameter"] }]);
  });

  it("otras diferencias en esos recursos siguen siendo reales", () => {
    expect(clasificarCambios(cambio("aws_autoscaling_policy", { enabled: true }, { enabled: false })).reales).toHaveLength(1);
    expect(clasificarCambios(cambio("aws_autoscaling_policy", { cooldown: 60 }, { cooldown: 120 })).reales).toHaveLength(1);
    expect(clasificarCambios(cambio("aws_db_parameter_group", { parameter: [{ name: "a", value: "1" }] }, { parameter: [{ name: "a", value: "2" }] })).reales).toHaveLength(1);
    expect(clasificarCambios(cambio("aws_lambda_function", { enabled: false }, { enabled: true })).reales).toHaveLength(1);
  });
});
