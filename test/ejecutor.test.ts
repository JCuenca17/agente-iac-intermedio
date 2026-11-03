import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cargarCaso, ejecutarExperimento, type Dependencias, type FilaResultado, type OpcionesExperimento } from "../src/experimento/ejecutor.js";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";

// El ejecutor se prueba con dependencias falsas: no usa modelo, OpenTofu, OPA ni emulador.
const esquema: EsquemaProveedor = JSON.parse(readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"));
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const usoCero = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
const error = { capa: "C2" as const, ruta: "/r", regla: "atributo-deprecado", mensaje: "x" };

function falsas(opc: { destruye?: boolean; costo?: number } = {}): Dependencias & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    ejecutarCiclo: async (_req, o) => {
      llamadas.push(`ciclo:${o.conValidador ? "V" : "-"}${o.conRetroalimentacion ? "R" : "-"}${o.conRag ? "G" : "-"}`);
      return {
        listo: true, motivo: "valido", iteraciones: 2, dirFinal: "dir", erroresPorIteracion: [[error], []],
        uso: { ...usoCero, entrada: 100 }, costoUsd: opc.costo ?? 0.01, llamadas: 2, consultasEsquema: 1,
      };
    },
    ejecutarDirecta: async (_req, o) => {
      llamadas.push(`directa:${o.conRetroalimentacion ? "R" : "-"}`);
      return { listo: true, motivo: "sin-validacion", iteraciones: 1, dirFinal: "dir", erroresPorIteracion: [[]], uso: usoCero, costoUsd: opc.costo ?? 0.01, llamadas: 1 };
    },
    desplegar: async () => ({ aplicado: true, sinCambios: true, errores: [], cambiosPendientes: [], cosmeticosIgnorados: [], estado: {}, planPosterior: {} }),
    destruir: async () => opc.destruye ?? true,
    evaluarIntencion: (caso) => ({ caso, requisitos: { a: "", b: "" }, cumplidos: ["a"], faltantes: ["b"], proporcion: 0.5 }),
    violaciones: () => [{ regla: "s3-cifrado", recurso: "aws_s3_bucket.x" }],
    reiniciarEmulador: async () => {
      llamadas.push("reinicio");
    },
    medirIaCEval: async () => ({ compila: true, desplegable: true, correcto: false }),
    politicaTarea: () => "package terraform.validation",
  };
}

function opciones(dependencias: Dependencias, extra: Partial<OpcionesExperimento> = {}): OpcionesExperimento {
  const salida = mkdtempSync(join(tmpdir(), "experimento-"));
  dirs.push(salida);
  return {
    casos: ["C01", "C03"],
    configuraciones: ["T", "B0"],
    repeticiones: 1,
    salida,
    crearProveedor: () => new ProveedorGrabado([]),
    esquema,
    endpoint: "http://localhost:4566",
    region: "us-east-1",
    versionProveedor: "6.71.0",
    maxIteraciones: 3,
    limiteGastoCorridaUsd: 5,
    limiteGastoTotalUsd: 10,
    dependencias,
    ...extra,
  };
}
const filas = (o: OpcionesExperimento): FilaResultado[] =>
  readFileSync(join(o.salida, "resultados.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

describe("ejecutor del experimento", () => {
  it("lee el requerimiento y el nivel de un caso", () => {
    const c = cargarCaso("C10");
    expect(c.nivel).toBe("N3");
    expect(c.requerimiento).toMatch(/DynamoDB/);
  });

  it("ejecuta cada caso con cada configuración y guarda una fila con las métricas", async () => {
    const o = opciones(falsas());
    const r = await ejecutarExperimento(o);
    expect(r).toMatchObject({ hechas: 4, omitidas: 0, detenidoPorGasto: false });
    const t = filas(o).find((f) => f.caso === "C01" && f.configuracion === "T")!;
    expect(t).toMatchObject({
      nivel: "N1", m1: true, m3: 1, m4: 0.5, faltantes: ["b"], iteraciones: 2, llamadas: 2, consultasEsquema: 1,
      erroresPorCapa: { C2: 1 }, reglasDetectadas: ["atributo-deprecado"],
    });
  });

  it("activa las ablaciones y las líneas base según la configuración", async () => {
    const d = falsas();
    await ejecutarExperimento(opciones(d, { casos: ["C01"], configuraciones: ["T", "A1", "A2", "A3", "B0", "B1"] }));
    expect(d.llamadas).toEqual(["ciclo:VRG", "ciclo:-RG", "ciclo:V-G", "ciclo:VR-", "directa:-", "directa:R"]);
  });

  it("al reanudar no repite las corridas hechas", async () => {
    const d = falsas();
    const o = opciones(d);
    await ejecutarExperimento(o);
    const r = await ejecutarExperimento({ ...o, repeticiones: 2 });
    expect(r).toMatchObject({ hechas: 4, omitidas: 4 });
    expect(filas(o)).toHaveLength(8);
  });

  it("se detiene antes de pasar el límite de gasto total", async () => {
    const r = await ejecutarExperimento(opciones(falsas({ costo: 4 }), { limiteGastoTotalUsd: 10 }));
    expect(r).toMatchObject({ hechas: 3, detenidoPorGasto: true });
  });

  it("reinicia el emulador si la destrucción falla", async () => {
    const d = falsas({ destruye: false });
    await ejecutarExperimento(opciones(d, { casos: ["C01"], configuraciones: ["T"] }));
    expect(d.llamadas).toContain("reinicio");
  });

  it("en tareas de IaC-Eval mide compilabilidad, desplegabilidad y corrección antes de desplegar", async () => {
    const d = falsas();
    d.medirIaCEval = async () => ({ compila: true, desplegable: true, correcto: true });
    const o = opciones(d, {
      casos: ["IE264"],
      configuraciones: ["T", "B0"],
      cargarCaso: (id) => ({ id, nivel: "D1", requerimiento: "Create an S3 bucket", fuente: "iaceval" }),
    });
    await ejecutarExperimento(o);
    const f = filas(o);
    expect(f[0]).toMatchObject({ caso: "IE264", nivel: "D1", iaceval: { compila: true, desplegable: true, correcto: true }, m4: 1, faltantes: [] });
  });

  it("registra el error de una corrida y sigue con la siguiente", async () => {
    const d = falsas();
    d.ejecutarCiclo = async () => {
      throw new Error("el modelo no respondió");
    };
    const o = opciones(d);
    await ejecutarExperimento(o);
    const f = filas(o);
    expect(f).toHaveLength(4);
    expect(f.find((x) => x.configuracion === "T")).toMatchObject({ motivo: "error", m1: false, error: "el modelo no respondió" });
    expect(f.find((x) => x.configuracion === "B0")).toMatchObject({ m1: true });
  });
});

describe("ejecutor: M1, errores y reanudación (revisión de código)", () => {
  it("M1 exige aplicar sin errores y que el plan posterior no tenga cambios", async () => {
    const d = falsas();
    d.desplegar = async () => ({ aplicado: true, sinCambios: false, errores: [], cambiosPendientes: [], cosmeticosIgnorados: [], estado: {}, planPosterior: {} });
    const o = opciones(d, { casos: ["C01"], configuraciones: ["T"] });
    await ejecutarExperimento(o);
    expect(filas(o)[0]).toMatchObject({ m1: false, aplicado: true, sinCambios: false });
  });

  it("una corrida con error conserva lo que gastó y se reintenta al reanudar", async () => {
    const d = falsas();
    const original = d.ejecutarCiclo;
    let falla = true;
    d.ejecutarCiclo = async (req, opc) => {
      if (falla) {
        opc.registro.anotar("llamada", { costoUsd: 0.3, uso: { entrada: 5, salida: 7, cacheEscritura: 0, cacheLectura: 0 } });
        throw new Error("el emulador no respondió");
      }
      return original(req, opc);
    };
    const o = opciones(d, { casos: ["C01"], configuraciones: ["T"] });
    const r1 = await ejecutarExperimento(o);
    expect(filas(o)[0]).toMatchObject({ motivo: "error", costoUsd: 0.3, llamadas: 1, uso: { entrada: 5, salida: 7 } });
    expect(r1.costoTotalUsd).toBeCloseTo(0.3, 10);

    falla = false;
    const r2 = await ejecutarExperimento(o);
    expect(r2).toMatchObject({ hechas: 1, omitidas: 0 });
    expect(r2.costoTotalUsd).toBeCloseTo(0.31, 10);
    expect(filas(o).map((f) => f.motivo)).toEqual(["error", "valido"]);
    expect(d.llamadas).toContain("reinicio");
  });

  it("reanuda aunque la última línea de resultados.jsonl haya quedado cortada", async () => {
    const o = opciones(falsas(), { casos: ["C01"], configuraciones: ["T", "B0"] });
    await ejecutarExperimento({ ...o, configuraciones: ["T"] });
    appendFileSync(join(o.salida, "resultados.jsonl"), '{"caso":"C01","configuracion":"B0"');
    const r = await ejecutarExperimento(o);
    expect(r).toMatchObject({ hechas: 1, omitidas: 1 });
  });

  it("un caso que no existe se detecta antes de la primera corrida", async () => {
    const d = falsas();
    const o = opciones(d, {
      casos: ["C01", "C99"],
      cargarCaso: (id) => {
        if (id === "C99") throw new Error("no existe C99");
        return { id, nivel: "N1", requerimiento: "x", fuente: "propio" };
      },
    });
    await expect(ejecutarExperimento(o)).rejects.toThrow("no existe C99");
    expect(d.llamadas.filter((x) => x.startsWith("ciclo"))).toEqual([]);
  });
});

describe("ejecutor: modelo exacto y fecha de cada corrida", () => {
  it("cada fila guarda los modelos que respondieron y la fecha", async () => {
    const d = falsas();
    const original = d.ejecutarCiclo;
    d.ejecutarCiclo = async (req, opc) => {
      opc.registro.anotar("llamada", { modelo: "claude-haiku-5-5", modeloExacto: "claude-haiku-5-5-20261015", costoUsd: 0 });
      return original(req, opc);
    };
    const o = opciones(d, { casos: ["C01"], configuraciones: ["T"] });
    await ejecutarExperimento(o);
    const f = filas(o)[0];
    expect(f.modelos).toEqual(["claude-haiku-5-5-20261015"]);
    expect(f.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
