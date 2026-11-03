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
