import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { violacionesDesplegado } from "../src/experimento/politicas-desplegado.js";

// Estados reales de las soluciones de referencia desplegadas en Floci 2.4.0 (ver
// test/fixtures/desplegados). Necesita OPA instalado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Estado = any;
const ruta = (caso: string) => new URL(`./fixtures/desplegados/${caso}.json`, import.meta.url);
const estado = (caso: string): Estado => {
  const e = JSON.parse(readFileSync(ruta(caso), "utf8"));
  return { values: { root_module: e.planned_values.root_module } };
};
const CASOS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "P1", "P2"].filter((c) => existsSync(ruta(c)));
const recursos = (e: Estado) => e.values.root_module.resources;
const valores = (e: Estado, direccion: string) => recursos(e).find((r: { address: string }) => r.address === direccion).values;
const agregar = (e: Estado, address: string, values: Record<string, unknown>) => {
  const [type, name] = address.split(".");
  recursos(e).push({ address, mode: "managed", type, name, values });
  return e;
};
const politica = (...declaraciones: Record<string, unknown>[]) => JSON.stringify({ Version: "2012-10-17", Statement: declaraciones });

describe("M3 sobre estados reales", () => {
  it.each(CASOS)("la solución de referencia de %s no tiene violaciones", (caso) => {
    expect(violacionesDesplegado(estado(caso))).toEqual([]);
  });

  it("un bucket sin bloqueo ni cifrado tiene dos violaciones", () => {
    const e = estado("C01");
    e.values.root_module.resources = recursos(e).filter(
      (r: { type: string }) => !["aws_s3_bucket_public_access_block", "aws_s3_bucket_server_side_encryption_configuration"].includes(r.type),
    );
    expect(violacionesDesplegado(e)).toEqual([
      { regla: "s3-acceso-publico", recurso: "aws_s3_bucket.respaldos" },
      { regla: "s3-cifrado", recurso: "aws_s3_bucket.respaldos" },
    ]);
  });

  it("una cola sin SSE y con kms_master_key_id vacío no está cifrada", () => {
    const e = estado("C03");
    expect(valores(e, "aws_sqs_queue.fallidos").kms_master_key_id).toBe("");
    valores(e, "aws_sqs_queue.fallidos").sqs_managed_sse_enabled = false;
    expect(violacionesDesplegado(e)).toEqual([{ regla: "sqs-cifrado", recurso: "aws_sqs_queue.fallidos" }]);
  });

  it("una cola con clave KMS está cifrada", () => {
    const e = estado("C03");
    Object.assign(valores(e, "aws_sqs_queue.fallidos"), { sqs_managed_sse_enabled: false, kms_master_key_id: "alias/cola" });
    expect(violacionesDesplegado(e)).toEqual([]);
  });

  it("detecta un comodín en una política en línea del rol y no cuenta los Deny", () => {
    const enLinea = estado("C04");
    valores(enLinea, "aws_iam_role.lector").inline_policy = [{ name: "x", policy: politica({ Effect: "Allow", Action: "s3:*", Resource: "*" }) }];
    expect(violacionesDesplegado(enLinea)).toEqual([{ regla: "iam-sin-comodin", recurso: "aws_iam_role.lector" }]);

    const negada = estado("C04");
    valores(negada, "aws_iam_policy.solo_lectura").policy = politica(
      { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
      { Effect: "Deny", Action: "*", Resource: "*" },
    );
    expect(violacionesDesplegado(negada)).toEqual([]);
  });

  it("detecta SSH abierto, protocolo -1 y reglas sueltas abiertas a internet", () => {
    const ssh = estado("C11");
    valores(ssh, "aws_security_group.web").ingress.push({ from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"], ipv6_cidr_blocks: [] });
    expect(violacionesDesplegado(ssh)).toEqual([{ regla: "sg-abierto", recurso: "aws_security_group.web" }]);

    const todos = estado("C11");
    valores(todos, "aws_security_group.web").ingress.push({ from_port: 443, to_port: 443, protocol: "-1", cidr_blocks: [], ipv6_cidr_blocks: ["::/0"] });
    expect(violacionesDesplegado(todos)).toEqual([{ regla: "sg-abierto", recurso: "aws_security_group.web" }]);

    const suelta = agregar(estado("C11"), "aws_vpc_security_group_ingress_rule.todo", { from_port: 0, to_port: 65535, ip_protocol: "tcp", cidr_ipv4: "0.0.0.0/0", cidr_ipv6: "" });
    expect(violacionesDesplegado(suelta)).toEqual([{ regla: "sg-abierto", recurso: "aws_vpc_security_group_ingress_rule.todo" }]);
  });

  it("detecta una base de datos sin cifrar y pública, y acepta una cifrada y privada", () => {
    const mala = agregar(estado("C02"), "aws_db_instance.bd", { storage_encrypted: false, publicly_accessible: true });
    expect(violacionesDesplegado(mala)).toEqual([
      { regla: "rds-cifrado", recurso: "aws_db_instance.bd" },
      { regla: "rds-publica", recurso: "aws_db_instance.bd" },
    ]);
    const buena = agregar(estado("C02"), "aws_db_instance.bd", { storage_encrypted: true, publicly_accessible: false });
    expect(violacionesDesplegado(buena)).toEqual([]);
  });

  it("detecta logs sin retención y tablas sin recuperación", () => {
    const e = estado("C12");
    valores(e, "aws_cloudwatch_log_group.funcion").retention_in_days = 0;
    expect(violacionesDesplegado(e)).toEqual([{ regla: "logs-retencion", recurso: "aws_cloudwatch_log_group.funcion" }]);
    const t = estado("C02");
    const tabla = recursos(t).find((r: { type: string }) => r.type === "aws_dynamodb_table");
    tabla.values.point_in_time_recovery[0].enabled = false;
    expect(violacionesDesplegado(t)).toEqual([{ regla: "dynamodb-recuperacion", recurso: tabla.address }]);
  });

  it("la referencia real de R1 no sigue las reglas de seguridad del proyecto: 2 tablas sin recuperación", () => {
    // El proyecto se escribió sin estas reglas; el modelo sí las recibe en su prompt. La política
    // por defecto de su endpoint de VPC ("*") no es una política IAM y no cuenta.
    expect(violacionesDesplegado(estado("R1"))).toEqual([
      { recurso: "aws_dynamodb_table.dynamo_db_table_foodstore_foods", regla: "dynamodb-recuperacion" },
      { recurso: "aws_dynamodb_table.dynamo_db_table_petstore_pets", regla: "dynamodb-recuperacion" },
    ]);
  });

  it("la referencia real de R2 tiene 1 violación: tabla sin recuperación", () => {
    // El "kms:*" para la cuenta raíz en la política de la clave es la política por defecto de AWS
    // y no es una política IAM, así que no cuenta; un comodín en el rol sí contaría.
    expect(violacionesDesplegado(estado("R2"))).toEqual([{ recurso: "aws_dynamodb_table.vault_storage", regla: "dynamodb-recuperacion" }]);
    const conComodin = estado("R2");
    valores(conComodin, "aws_iam_role_policy.vault_instance_s3_policy").policy = politica({ Effect: "Allow", Action: "s3:*", Resource: "*" });
    expect(violacionesDesplegado(conComodin)).toContainEqual({ regla: "iam-sin-comodin", recurso: "aws_iam_role_policy.vault_instance_s3_policy" });
  });

  it("sin estado no hay violaciones", () => {
    expect(violacionesDesplegado(undefined)).toEqual([]);
  });
});
