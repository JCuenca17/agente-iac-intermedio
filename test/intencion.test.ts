import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entradaDesplegada, evaluarIntencion } from "../src/experimento/intencion.js";

// Entradas de M4 tomadas de despliegues reales en Floci 2.4.0: el estado después del apply
// (planned_values) y la configuración del plan posterior, tal como las arma
// entradaDesplegada para cada corrida del experimento. Necesita OPA instalado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entrada = any;
const ruta = (caso: string) => new URL(`./fixtures/desplegados/${caso}.json`, import.meta.url);
const entrada = (caso: string): Entrada => JSON.parse(readFileSync(ruta(caso), "utf8"));
const CASOS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "P1", "P2", "R1", "R2"].filter((c) => existsSync(ruta(c)));

const recursos = (e: Entrada) => e.planned_values.root_module.resources;
const sinTipo = (e: Entrada, tipo: string): Entrada => {
  for (const seccion of [e.planned_values, e.configuration]) {
    seccion.root_module.resources = seccion.root_module.resources.filter((r: { type: string }) => r.type !== tipo);
  }
  return e;
};
const valores = (e: Entrada, direccion: string) => recursos(e).find((r: { address: string }) => r.address === direccion).values;
const agregar = (e: Entrada, address: string, values: Record<string, unknown>) => {
  const [type, name] = address.split(".");
  recursos(e).push({ address, mode: "managed", type, name, values });
  return e;
};
const politica = (...declaraciones: Record<string, unknown>[]) => JSON.stringify({ Version: "2012-10-17", Statement: declaraciones });
const faltan = (caso: string, e: Entrada) => evaluarIntencion(caso, e).faltantes;

describe("M4 sobre estados reales: las soluciones de referencia", () => {
  it.each(CASOS)("la solución de referencia de %s cumple el 100 %%", (caso) => {
    const r = evaluarIntencion(caso, entrada(caso));
    expect(r.faltantes).toEqual([]);
    expect(r.proporcion).toBe(1);
  });

  it("un despliegue vacío no cumple nada", () => {
    expect(evaluarIntencion("C10", entradaDesplegada(undefined, undefined)).proporcion).toBe(0);
  });
});

describe("M4: cada requisito falla cuando corresponde", () => {
  it("C01 sin versionado pierde solo ese requisito", () => {
    const r = evaluarIntencion("C01", sinTipo(entrada("C01"), "aws_s3_bucket_versioning"));
    expect(r.faltantes).toEqual(["versionado"]);
    expect(r.proporcion).toBe(0.75);
  });

  it("C01 sin el recurso de cifrado no cuenta el cifrado por defecto que el estado informa en el bucket", () => {
    const e = sinTipo(entrada("C01"), "aws_s3_bucket_server_side_encryption_configuration");
    expect(valores(e, "aws_s3_bucket.respaldos").server_side_encryption_configuration.length).toBeGreaterThan(0);
    expect(faltan("C01", e)).toEqual(["cifrado"]);
  });

  it("C02 sin clave de ordenamiento (texto vacío en el estado) lo detecta", () => {
    const e = entrada("C02");
    const tabla = recursos(e).find((r: { type: string }) => r.type === "aws_dynamodb_table").values;
    tabla.range_key = "";
    expect(faltan("C02", e)).toEqual(["claves"]);
  });

  it("C03 con una cola sin cifrar lo detecta aunque el estado traiga kms_master_key_id vacío", () => {
    const e = entrada("C03");
    const cola = valores(e, "aws_sqs_queue.fallidos");
    expect(cola.kms_master_key_id).toBe("");
    cola.sqs_managed_sse_enabled = false;
    expect(faltan("C03", e)).toEqual(["cifrado"]);
  });

  it("C04 detecta escritura en una política en línea del rol", () => {
    const e = entrada("C04");
    valores(e, "aws_iam_role.lector").inline_policy = [{ name: "extra", policy: politica({ Effect: "Allow", Action: "s3:PutObject", Resource: "*" }) }];
    expect(faltan("C04", e)).toEqual(["sin_escritura"]);
  });

  it("C04 detecta comodines parciales y no cuenta lo que se niega con Deny", () => {
    const parcial = entrada("C04");
    valores(parcial, "aws_iam_policy.solo_lectura").policy = politica({ Effect: "Allow", Action: ["s3:GetObject", "s3:Put*"], Resource: "*" });
    expect(faltan("C04", parcial)).toEqual(["sin_escritura"]);

    const negada = entrada("C04");
    valores(negada, "aws_iam_policy.solo_lectura").policy = politica(
      { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
      { Effect: "Deny", Action: "s3:*", Resource: "*" },
    );
    expect(faltan("C04", negada)).toEqual([]);
  });

  it("C05 sin el servicio de S3 en la política de la cola lo detecta", () => {
    const e = entrada("C05");
    const p = recursos(e).find((r: { type: string }) => r.type === "aws_sqs_queue_policy").values;
    p.policy = p.policy.replaceAll("s3.amazonaws.com", "lambda.amazonaws.com");
    expect(faltan("C05", e)).toEqual(["politica_cola"]);
  });

  it("C06 con una sola política de cola lo detecta", () => {
    const e = entrada("C06");
    e.planned_values.root_module.resources = recursos(e).filter((r: { address: string }) => r.address !== "aws_sqs_queue_policy.inventario");
    expect(faltan("C06", e)).toEqual(["politicas_colas"]);
  });

  it("C08 acepta una API REST (v1) solo si el método GET está en /saludo", () => {
    const base = () => {
      const e = sinTipo(sinTipo(entrada("C08"), "aws_apigatewayv2_route"), "aws_apigatewayv2_api");
      agregar(e, "aws_api_gateway_rest_api.api", { name: "api" });
      return e;
    };
    const bien = base();
    agregar(bien, "aws_api_gateway_resource.saludo", { id: "r1", path_part: "saludo" });
    agregar(bien, "aws_api_gateway_method.get", { http_method: "GET", resource_id: "r1" });
    expect(faltan("C08", bien)).not.toContain("ruta");

    const otraRuta = base();
    agregar(otraRuta, "aws_api_gateway_resource.otra", { id: "r2", path_part: "otra" });
    agregar(otraRuta, "aws_api_gateway_method.get", { http_method: "GET", resource_id: "r2" });
    expect(faltan("C08", otraRuta)).toContain("ruta");
  });

  it("C11 detecta puertos abiertos por protocolo -1, por IPv6 o por una regla suelta", () => {
    const todos = entrada("C11");
    valores(todos, "aws_security_group.web").ingress.push({ from_port: 80, to_port: 80, protocol: "-1", cidr_blocks: ["0.0.0.0/0"], ipv6_cidr_blocks: [], security_groups: [] });
    // Con protocolo -1 se abren todos los puertos a internet, también el 5432 de la base.
    expect(faltan("C11", todos)).toEqual(["sg_bd", "sin_puertos_abiertos"]);

    const ipv6 = entrada("C11");
    valores(ipv6, "aws_security_group.web").ingress.push({ from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: [], ipv6_cidr_blocks: ["::/0"], security_groups: [] });
    expect(faltan("C11", ipv6)).toEqual(["sin_puertos_abiertos"]);

    const suelta = agregar(entrada("C11"), "aws_vpc_security_group_ingress_rule.ssh", { from_port: 22, to_port: 22, ip_protocol: "tcp", cidr_ipv4: "0.0.0.0/0", cidr_ipv6: "" });
    expect(faltan("C11", suelta)).toEqual(["sin_puertos_abiertos"]);
  });

  it("C11 no acepta el 5432 limitado a un grupo si otra regla lo abre a IPs", () => {
    const e = entrada("C11");
    valores(e, "aws_security_group.base_datos").ingress.push({ from_port: 5432, to_port: 5432, protocol: "tcp", cidr_blocks: ["10.0.0.0/8"], ipv6_cidr_blocks: [], security_groups: [] });
    expect(faltan("C11", e)).toEqual(["sg_bd"]);
  });

  it("C12 con una regla sin programación (texto vacío) lo detecta", () => {
    const e = entrada("C12");
    valores(e, "aws_cloudwatch_event_rule.diario").schedule_expression = "";
    expect(faltan("C12", e)).toEqual(["programacion"]);
  });

  it("C12 con el programador de EventBridge exige un rol que pueda invocar la función", () => {
    const sinPermiso = sinTipo(sinTipo(entrada("C12"), "aws_cloudwatch_event_rule"), "aws_lambda_permission");
    agregar(sinPermiso, "aws_scheduler_schedule.diario", { schedule_expression: "cron(0 8 * * ? *)" });
    expect(faltan("C12", sinPermiso)).toContain("permiso_eventos");
    expect(faltan("C12", sinPermiso)).not.toContain("programacion");
  });

  it("P1 detecta una tabla sin recuperación y dos funciones con el mismo rol", () => {
    const tabla = entrada("P1");
    valores(tabla, "aws_dynamodb_table.carrito").point_in_time_recovery[0].enabled = false;
    expect(faltan("P1", tabla)).toEqual(["tablas"]);

    const roles = entrada("P1");
    valores(roles, 'aws_lambda_function.funcion["carrito"]').role = valores(roles, 'aws_lambda_function.funcion["catalogo"]').role;
    expect(faltan("P1", roles)).toEqual(["roles_propios"]);
  });

  it("P2 detecta el 8080 abierto también a IPs y una alarma que no es de la base", () => {
    const abierto = entrada("P2");
    valores(abierto, "aws_security_group.web").ingress.push({ from_port: 8080, to_port: 8080, protocol: "tcp", cidr_blocks: ["10.0.0.0/16"], ipv6_cidr_blocks: [], security_groups: [] });
    expect(faltan("P2", abierto)).toEqual(["web_desde_balanceador"]);

    const alarma = entrada("P2");
    valores(alarma, "aws_cloudwatch_metric_alarm.cpu_base_datos").namespace = "AWS/EC2";
    expect(faltan("P2", alarma)).toEqual(["alarma"]);
  });

  it("P2 acepta la ruta a internet como recurso aws_route", () => {
    const e = entrada("P2");
    for (const t of ["aws_route_table.publica", "aws_route_table.privada"]) valores(e, t).route = [];
    expect(faltan("P2", e)).toEqual(["internet"]);
    agregar(e, "aws_route.internet", { destination_cidr_block: "0.0.0.0/0" });
    expect(faltan("P2", e)).toEqual([]);
  });

  it("R1 detecta un PUT sin autorización y servicios con IP pública", () => {
    const sinAuth = entrada("R1");
    const api = recursos(sinAuth).find((r: { type: string }) => r.type === "aws_apigatewayv2_api").values;
    const cuerpo = JSON.parse(api.body);
    delete cuerpo.paths["/petstore/pets/{petId}"].put.security;
    delete cuerpo.paths["/foodstore/foods/{foodId}"].put.security;
    api.body = JSON.stringify(cuerpo);
    expect(faltan("R1", sinAuth)).toEqual(["solo_lectura_anonima"]);

    const publica = entrada("R1");
    valores(publica, "aws_ecs_service.service_petstore_pets").network_configuration[0].assign_public_ip = true;
    expect(faltan("R1", publica)).toEqual(["privados"]);
  });

  it("R1 acepta las rutas escritas como recursos aws_apigatewayv2_route", () => {
    const e = entrada("R1");
    const api = recursos(e).find((r: { type: string }) => r.type === "aws_apigatewayv2_api").values;
    api.body = "";
    for (const [m, p, auth] of [["GET", "/foodstore/foods/{foodId}", "NONE"], ["PUT", "/foodstore/foods/{foodId}", "JWT"], ["GET", "/petstore/pets/{petId}", "NONE"], ["PUT", "/petstore/pets/{petId}", "JWT"]]) {
      agregar(e, `aws_apigatewayv2_route.${m}${p.length}`, { route_key: `${m} ${p}`, authorization_type: auth });
    }
    agregar(e, "aws_apigatewayv2_authorizer.cognito", { authorizer_type: "JWT" });
    expect(faltan("R1", e)).toEqual([]);
  });

  it("P1 con el bloqueo público incompleto lo detecta", () => {
    const e = entrada("P1");
    valores(e, "aws_s3_bucket_public_access_block.imagen").ignore_public_acls = false;
    expect(faltan("P1", e)).toEqual(["imagenes"]);
  });
});
