import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { violacionesDesplegado } from "../src/experimento/politicas-desplegado.js";

// Los planes de referencia tienen la misma forma de recursos que el estado; se envuelven
// como estado ({ values: { root_module } }). Necesita OPA instalado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const estado = (caso: string): any => {
  const p = JSON.parse(readFileSync(new URL(`./fixtures/planes/${caso}.json`, import.meta.url), "utf8"));
  return { values: { root_module: p.planned_values.root_module } };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recurso = (e: any, direccion: string) => e.values.root_module.resources.find((r: { address: string }) => r.address === direccion);

describe("M3: políticas sobre lo desplegado", () => {
  it("un bucket privado y cifrado no tiene violaciones", () => {
    // En el plan, "bucket" de estos recursos es desconocido (referencia); en el estado tiene el nombre.
    const e = estado("C01");
    recurso(e, "aws_s3_bucket_public_access_block.respaldos").values.bucket = "c01-respaldos";
    recurso(e, "aws_s3_bucket_server_side_encryption_configuration.respaldos").values.bucket = "c01-respaldos";
    expect(violacionesDesplegado(e)).toEqual([]);
  });

  it("un bucket sin bloqueo ni cifrado tiene dos violaciones", () => {
    expect(violacionesDesplegado(estado("C05"))).toEqual([
      { regla: "s3-acceso-publico", recurso: "aws_s3_bucket.cargas" },
      { regla: "s3-cifrado", recurso: "aws_s3_bucket.cargas" },
    ]);
  });

  it("detecta una cola sin cifrar", () => {
    const e = estado("C03");
    recurso(e, "aws_sqs_queue.fallidos").values.sqs_managed_sse_enabled = false;
    expect(violacionesDesplegado(e)).toEqual([{ regla: "sqs-cifrado", recurso: "aws_sqs_queue.fallidos" }]);
  });

  it("detecta SSH abierto a internet", () => {
    const e = estado("C11");
    recurso(e, "aws_security_group.web").values.ingress.push({ from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] });
    expect(violacionesDesplegado(e)).toEqual([{ regla: "sg-abierto", recurso: "aws_security_group.web" }]);
  });

  it("detecta una política IAM con comodín", () => {
    const e = estado("C04");
    recurso(e, "aws_iam_policy.solo_lectura").values.policy = JSON.stringify({ Statement: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }] });
    expect(violacionesDesplegado(e)).toEqual([{ regla: "iam-sin-comodin", recurso: "aws_iam_policy.solo_lectura" }]);
  });

  it("detecta logs sin retención y tablas sin recuperación", () => {
    const e = estado("C12");
    recurso(e, "aws_cloudwatch_log_group.funcion").values.retention_in_days = 0;
    expect(violacionesDesplegado(e)).toEqual([{ regla: "logs-retencion", recurso: "aws_cloudwatch_log_group.funcion" }]);
    const t = estado("C02");
    recurso(t, "aws_dynamodb_table.pedidos").values.point_in_time_recovery[0].enabled = false;
    expect(violacionesDesplegado(t)).toEqual([{ regla: "dynamodb-recuperacion", recurso: "aws_dynamodb_table.pedidos" }]);
  });

  it("sin estado no hay violaciones", () => {
    expect(violacionesDesplegado(undefined)).toEqual([]);
  });
});
