import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarSemantica } from "../src/validador/c2-semantica.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";

const esquema: EsquemaProveedor = JSON.parse(
  readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"),
);
const valido = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const copia = () => structuredClone(valido);
const reglas = (a: unknown) => validarSemantica(a as never, esquema).errores.map((e) => e.regla);

describe("C2: validación semántica contra el esquema del proveedor", () => {
  it("acepta un artefacto coherente", () => {
    const r = validarSemantica(valido, esquema);
    expect(r.errores).toEqual([]);
    expect(r.valido).toBe(true);
  });

  it("detecta identificadores repetidos", () => {
    const a = copia();
    a.recursos[1].id = "cola_fallidos";
    expect(reglas(a)).toContain("id-duplicado");
  });

  it("detecta un tipo de recurso que no existe en el proveedor", () => {
    const a = copia();
    a.recursos[0].tipo = "aws_sqs_cola";
    const r = validarSemantica(a, esquema);
    const e = r.errores.find((x) => x.regla === "tipo-inexistente");
    expect(e?.ruta).toBe("/recursos/0/tipo");
    expect(e?.mensaje).toMatch(/aws_sqs_queue/); // sugiere el nombre parecido
  });

  it("detecta un tipo de recurso deprecado", () => {
    const a = copia();
    a.recursos.push({ id: "videos", tipo: "aws_media_store_container", proposito: "x", atributos: { name: "v" } });
    expect(reglas(a)).toContain("tipo-deprecado");
  });

  it("detecta un atributo inventado y sugiere el correcto", () => {
    const a = copia();
    a.recursos[0].atributos.sqs_managed_encryption = true;
    const e = validarSemantica(a, esquema).errores.find((x) => x.regla === "atributo-inexistente");
    expect(e?.ruta).toBe("/recursos/0/atributos/sqs_managed_encryption");
    expect(e?.mensaje).toMatch(/sqs_managed_sse_enabled/);
  });

  it("detecta bloques deprecados, como el versionado dentro de aws_s3_bucket", () => {
    const a = copia();
    a.recursos.push({
      id: "respaldos",
      tipo: "aws_s3_bucket",
      proposito: "x",
      atributos: { bucket: "r", versioning: { enabled: true } },
    });
    const e = validarSemantica(a, esquema).errores.find((x) => x.regla === "atributo-deprecado");
    expect(e?.ruta).toBe("/recursos/2/atributos/versioning");
  });

  it("detecta que se asigna un atributo de solo lectura", () => {
    const a = copia();
    a.recursos[0].atributos.arn = "arn:aws:sqs:us-east-1:000000000000:x";
    expect(reglas(a)).toContain("atributo-solo-lectura");
  });

  it("detecta atributos obligatorios faltantes", () => {
    const a = copia();
    a.recursos.push({ id: "funcion", tipo: "aws_lambda_function", proposito: "x", atributos: { function_name: "f" } });
    const e = validarSemantica(a, esquema).errores.find((x) => x.regla === "atributo-requerido-faltante");
    expect(e?.mensaje).toMatch(/role/);
  });

  it("revisa los bloques anidados", () => {
    const a = copia();
    a.recursos.push({
      id: "tabla",
      tipo: "aws_dynamodb_table",
      proposito: "x",
      atributos: { name: "t", hash_key: "id", attribute: [{ name: "id", tipo: "S" }] },
    });
    const errores = validarSemantica(a, esquema).errores;
    expect(errores.some((e) => e.ruta === "/recursos/2/atributos/attribute/0/tipo" && e.regla === "atributo-inexistente")).toBe(true);
    expect(errores.some((e) => e.ruta === "/recursos/2/atributos/attribute/0" && e.regla === "atributo-requerido-faltante")).toBe(true);
  });

  it("detecta referencias a recursos que no existen", () => {
    const a = copia();
    a.recursos[1].atributos.redrive_policy.deadLetterTargetArn = "${ref:cola_muertos.arn}";
    const e = validarSemantica(a, esquema).errores.find((x) => x.regla === "referencia-rota");
    expect(e?.ruta).toBe("/recursos/1/atributos/redrive_policy/deadLetterTargetArn");
  });

  it("detecta referencias a atributos que el recurso no tiene", () => {
    const a = copia();
    a.recursos[1].atributos.redrive_policy.deadLetterTargetArn = "${ref:cola_fallidos.arn_cola}";
    expect(reglas(a)).toContain("atributo-referenciado-inexistente");
  });

  it("rechaza interpolaciones escritas a mano en sintaxis de OpenTofu", () => {
    const a = copia();
    a.recursos[1].atributos.redrive_policy.deadLetterTargetArn = "${aws_sqs_queue.cola_fallidos.arn}";
    expect(reglas(a)).toContain("interpolacion-no-permitida");
  });

  it("detecta relaciones y dependencias que apuntan a recursos inexistentes", () => {
    const a = copia();
    a.relaciones.push({ origen: "cola_trabajos", destino: "funcion_fantasma", tipo: "invoca" });
    a.recursos[0].depende_de = ["otro_fantasma"];
    const r = reglas(a);
    expect(r).toContain("relacion-rota");
    expect(r).toContain("dependencia-rota");
  });

  it("detecta dependencias circulares", () => {
    const a = copia();
    a.recursos[0].depende_de = ["cola_trabajos"]; // cola_trabajos ya referencia a cola_fallidos
    const e = validarSemantica(a, esquema).errores.find((x) => x.regla === "dependencia-circular");
    expect(e?.mensaje).toMatch(/cola_fallidos/);
    expect(e?.mensaje).toMatch(/cola_trabajos/);
  });
});
