import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarPoliticas } from "../src/validador/c3-politicas.js";

// Necesita OPA instalado (npm run doctor lo revisa). No usa el emulador ni ningún modelo.
const valido = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const copia = () => structuredClone(valido);

describe("C3: políticas OPA sobre el artefacto", () => {
  it("acepta un artefacto que cumple las políticas", () => {
    const r = validarPoliticas(valido);
    expect(r.errores).toEqual([]);
    expect(r.valido).toBe(true);
  });

  it("reporta una cola sin cifrar con capa, ruta, regla y mensaje", () => {
    const a = copia();
    delete a.recursos[0].atributos.sqs_managed_sse_enabled;
    const r = validarPoliticas(a);
    expect(r.valido).toBe(false);
    expect(r.errores).toEqual([
      {
        capa: "C3",
        ruta: "/recursos/0/atributos",
        regla: "sqs-cifrado",
        mensaje: expect.stringMatching(/cola_fallidos/),
      },
    ]);
  });

  it("devuelve los errores en un orden estable", () => {
    const a = copia();
    delete a.recursos[0].atributos.sqs_managed_sse_enabled;
    delete a.recursos[1].atributos.sqs_managed_sse_enabled;
    const rutas = validarPoliticas(a).errores.map((e) => e.ruta);
    expect(rutas).toEqual(["/recursos/0/atributos", "/recursos/1/atributos"]);
  });
});
