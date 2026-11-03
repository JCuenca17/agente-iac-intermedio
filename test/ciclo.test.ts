import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ejecutarCiclo, type OpcionesCiclo, type Validador } from "../src/ciclo/ciclo.js";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";
import { Registro } from "../src/trazas/registro.js";
import type { ErrorValidacion } from "../src/validador/tipos.js";

// Pruebas del ciclo con un validador falso: no usan OpenTofu, OPA, el emulador ni un modelo.
const esquema: EsquemaProveedor = JSON.parse(readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"));
const c03 = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const entregar = (a: unknown) => JSON.stringify({ accion: "entregar", artefacto: a });
const error: ErrorValidacion = { capa: "C2", ruta: "/recursos/0/atributos/x", regla: "atributo-inexistente", mensaje: "x no existe" };

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Falla las primeras `n` veces y luego aprueba. */
function validadorQueFalla(n: number): Validador & { llamadas: number } {
  const v = (async () => {
    v.llamadas++;
    return v.llamadas <= n ? { valido: false, capaFallida: "C2" as const, errores: [error] } : { valido: true, errores: [] };
  }) as unknown as Validador & { llamadas: number };
  v.llamadas = 0;
  return v;
}

function opciones(respuestas: string[], extra: Partial<OpcionesCiclo> = {}): OpcionesCiclo {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-"));
  dirs.push(dir);
  return {
    proveedor: new ProveedorGrabado(respuestas),
    esquema,
    endpoint: "http://localhost:4566",
    region: "us-east-1",
    versionProveedor: "6.71.0",
    dirTrabajo: dir,
    registro: new Registro(),
    maxIteraciones: 3,
    conValidador: true,
    conRetroalimentacion: true,
    conRag: true,
    limiteGastoUsd: 5,
    validar: validadorQueFalla(0),
    ...extra,
  };
}

describe("ciclo de generación, validación y retroalimentación", () => {
  it("termina en la primera iteración si el artefacto pasa", async () => {
    const r = await ejecutarCiclo("una cola", opciones([entregar(c03)]));
    expect(r).toMatchObject({ listo: true, motivo: "valido", iteraciones: 1, llamadas: 1 });
    expect(r.dirFinal).toMatch(/iter-1$/);
  });

  it("devuelve los errores al modelo y acepta la corrección", async () => {
    const o = opciones([entregar(c03), entregar(c03)], { validar: validadorQueFalla(1) });
    const r = await ejecutarCiclo("una cola", o);
    expect(r).toMatchObject({ listo: true, iteraciones: 2 });
    expect(r.erroresPorIteracion).toEqual([[error], []]);
  });

  it("se detiene al agotar las iteraciones", async () => {
    const o = opciones([entregar(c03), entregar(c03), entregar(c03)], { validar: validadorQueFalla(99) });
    const r = await ejecutarCiclo("una cola", o);
    expect(r).toMatchObject({ listo: false, motivo: "iteraciones-agotadas", iteraciones: 3 });
  });

  it("A2, sin retroalimentación: un solo intento", async () => {
    const o = opciones([entregar(c03)], { validar: validadorQueFalla(1), conRetroalimentacion: false });
    const r = await ejecutarCiclo("una cola", o);
    expect(r).toMatchObject({ listo: false, motivo: "sin-retroalimentacion", iteraciones: 1 });
  });

  it("A1, sin validador: traduce sin validar", async () => {
    const validar = validadorQueFalla(99);
    const r = await ejecutarCiclo("una cola", opciones([entregar(c03)], { conValidador: false, validar }));
    expect(r).toMatchObject({ listo: true, motivo: "sin-validacion", iteraciones: 1 });
    expect(validar.llamadas).toBe(0);
    expect(r.traduccion?.codigo.resource.aws_sqs_queue).toBeDefined();
  });

  it("trata una respuesta que no es JSON como error C0 y la retroalimenta", async () => {
    const o = opciones(["no es json", entregar(c03)]);
    const r = await ejecutarCiclo("una cola", o);
    expect(r).toMatchObject({ listo: true, iteraciones: 2 });
    expect(r.erroresPorIteracion[0][0]).toMatchObject({ capa: "C0", regla: "formato-respuesta" });
  });

  it("anota en el registro el inicio, las llamadas, las validaciones y el fin", async () => {
    const o = opciones([entregar(c03), entregar(c03)], { validar: validadorQueFalla(1) });
    await ejecutarCiclo("una cola", o);
    const eventos = o.registro.eventos.map((e) => e.evento);
    expect(eventos[0]).toBe("ciclo-inicio");
    expect(eventos.filter((e) => e === "llamada")).toHaveLength(2);
    expect(eventos.at(-1)).toBe("ciclo-fin");
  });
});
