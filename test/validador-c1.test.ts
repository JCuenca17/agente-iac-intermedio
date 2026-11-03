import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarEstructura } from "../src/validador/c1-estructura.js";

const valido = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const copia = () => structuredClone(valido);

describe("C1: validación de estructura con JSON Schema", () => {
  it("acepta un artefacto bien formado", () => {
    const r = validarEstructura(valido);
    expect(r.valido).toBe(true);
    expect(r.errores).toEqual([]);
  });

  it("rechaza un artefacto sin recursos e indica la ruta", () => {
    const a = copia();
    delete a.recursos;
    const r = validarEstructura(a);
    expect(r.valido).toBe(false);
    expect(r.errores[0]).toMatchObject({ capa: "C1", ruta: "/", regla: "required" });
    expect(r.errores[0].mensaje).toMatch(/recursos/);
  });

  it("rechaza un identificador que no está en snake_case", () => {
    const a = copia();
    a.recursos[0].id = "Cola-Fallidos";
    const r = validarEstructura(a);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => e.ruta === "/recursos/0/id" && e.regla === "pattern")).toBe(true);
  });

  it("rechaza un tipo que no es del proveedor AWS", () => {
    const a = copia();
    a.recursos[1].tipo = "google_pubsub_topic";
    const r = validarEstructura(a);
    expect(r.errores.some((e) => e.ruta === "/recursos/1/tipo")).toBe(true);
  });

  it("rechaza propiedades que el esquema no define", () => {
    const a = copia();
    a.codigo_terraform = "resource ...";
    const r = validarEstructura(a);
    expect(r.errores.some((e) => e.regla === "additionalProperties" && /codigo_terraform/.test(e.mensaje))).toBe(true);
  });

  it("rechaza un tipo de relación desconocido", () => {
    const a = copia();
    a.relaciones[0].tipo = "habla_con";
    const r = validarEstructura(a);
    expect(r.errores.some((e) => e.ruta === "/relaciones/0/tipo" && e.regla === "enum")).toBe(true);
  });

  it("reporta todos los errores de una vez, no solo el primero", () => {
    const a = copia();
    a.recursos[0].id = "MAL";
    a.relaciones[0].tipo = "habla_con";
    const r = validarEstructura(a);
    expect(r.errores.length).toBeGreaterThanOrEqual(2);
  });

  it("rechaza algo que ni siquiera es un objeto", () => {
    expect(validarEstructura("hola").valido).toBe(false);
    expect(validarEstructura(null).valido).toBe(false);
  });
});
