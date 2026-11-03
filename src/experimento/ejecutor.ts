import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ejecutarCiclo, type OpcionesCiclo, type ResultadoCiclo } from "../ciclo/ciclo.js";
import { desplegar, destruir, type ResultadoDespliegue } from "../despliegue/despliegue.js";
import { ejecutarDirecta, type OpcionesDirecta, type ResultadoDirecta } from "../linea-base/directa.js";
import type { ProveedorModelo, UsoTokens } from "../modelo/tipos.js";
import type { EsquemaProveedor } from "../proveedor/esquema.js";
import { enRaiz } from "../rutas.js";
import { Registro } from "../trazas/registro.js";
import type { ErrorValidacion } from "../validador/tipos.js";
import { medirIaCEval, politicaTarea, type MedicionIaCEval } from "./iaceval.js";
import { entradaDesplegada, evaluarIntencion, type ResultadoIntencion } from "./intencion.js";
import { violacionesDesplegado, type Violacion } from "./politicas-desplegado.js";

/** Configuraciones del experimento (fase2/01_diseno_experimental.md, sección 3). */
export const CONFIGURACIONES = ["T", "B0", "B1", "A1", "A2", "A3"] as const;
export type Configuracion = (typeof CONFIGURACIONES)[number];

export interface Caso {
  id: string;
  nivel: string;
  requerimiento: string;
  /** "propio": casos C01-C12; "iaceval": tareas IEnnn de IaC-Eval. */
  fuente: "propio" | "iaceval";
}

/** Lee un caso de experimento/casos/<id>/ o una tarea de experimento/iaceval/<id>/. */
export function cargarCaso(id: string): Caso {
  if (id.startsWith("IE")) {
    const dir = enRaiz("experimento", "iaceval", id);
    const tarea = JSON.parse(readFileSync(join(dir, "tarea.json"), "utf8")) as { dificultad: number };
    return { id, nivel: `D${tarea.dificultad}`, requerimiento: readFileSync(join(dir, "requerimiento.md"), "utf8").trim(), fuente: "iaceval" };
  }
  const dir = enRaiz("experimento", "casos", id);
  const requerimiento = readFileSync(join(dir, "requerimiento.md"), "utf8").trim();
  const nivel = readFileSync(join(dir, "intencion.rego"), "utf8").match(/^nivel := "([A-Z0-9]+)"/m)?.[1] ?? "?";
  return { id, nivel, requerimiento, fuente: "propio" };
}

/** Una fila de resultados: una corrida de un caso con una configuración. */
export interface FilaResultado {
  caso: string;
  nivel: string;
  configuracion: Configuracion;
  repeticion: number;
  /** Fecha y hora de inicio de la corrida (ISO 8601). */
  fecha?: string;
  /** Identificadores exactos de los modelos que respondieron en la corrida. */
  modelos?: string[];
  /** El ciclo terminó con código listo para desplegar. */
  listo: boolean;
  motivo: string;
  /** M1: apply sin errores y plan posterior sin cambios reales. */
  m1: boolean;
  aplicado: boolean;
  sinCambios: boolean;
  erroresDespliegue: ErrorValidacion[];
  /** M2: errores detectados antes del despliegue, por capa (todas las iteraciones). */
  erroresPorCapa: Record<string, number>;
  reglasDetectadas: string[];
  /** M3: violaciones de política en lo desplegado. */
  m3: number;
  violaciones: Violacion[];
  /** M4: proporción de la lista de verificación cumplida en lo desplegado (0 si no se desplegó). */
  m4: number;
  faltantes: string[];
  /** M5 y M6. */
  iteraciones: number;
  llamadas: number;
  consultasEsquema: number;
  uso: UsoTokens;
  costoUsd: number;
  duracionMs: number;
  cosmeticosIgnorados: number;
  /** Solo en tareas de IaC-Eval: métricas de S12 con el protocolo de IaC-Eval (sobre el plan). */
  iaceval?: MedicionIaCEval;
  error?: string;
}

export interface Dependencias {
  ejecutarCiclo: (requerimiento: string, o: OpcionesCiclo) => Promise<ResultadoCiclo>;
  ejecutarDirecta: (requerimiento: string, o: OpcionesDirecta) => Promise<ResultadoDirecta>;
  desplegar: (dir: string) => Promise<ResultadoDespliegue>;
  destruir: (dir: string) => Promise<boolean>;
  evaluarIntencion: (caso: string, entrada: unknown) => ResultadoIntencion;
  violaciones: (estado: unknown) => Violacion[];
  /** Deja el emulador limpio cuando una destrucción falla. */
  reiniciarEmulador: () => Promise<void>;
  medirIaCEval: (dir: string, politica: string) => Promise<MedicionIaCEval>;
  politicaTarea: (id: string) => string;
}

export const DEPENDENCIAS_REALES: Omit<Dependencias, "reiniciarEmulador"> = {
  ejecutarCiclo,
  ejecutarDirecta,
  desplegar,
  destruir,
  evaluarIntencion,
  violaciones: violacionesDesplegado,
  medirIaCEval,
  politicaTarea,
};

export interface OpcionesExperimento {
  casos: string[];
  configuraciones: Configuracion[];
  repeticiones: number;
  /** Carpeta de resultados: resultados.jsonl y una subcarpeta por corrida. */
  salida: string;
  /** Crea un proveedor nuevo para cada corrida. */
  crearProveedor: (caso: string, configuracion: Configuracion, repeticion: number) => ProveedorModelo;
  esquema: EsquemaProveedor;
  endpoint: string;
  region: string;
  versionProveedor: string;
  maxIteraciones: number;
  limiteGastoCorridaUsd: number;
  /** El experimento se detiene antes de una corrida si el gasto acumulado lo supera. */
  limiteGastoTotalUsd: number;
  dependencias: Dependencias;
  /** Para pruebas: reemplaza la lectura de casos desde experimento/. */
  cargarCaso?: (id: string) => Caso;
  alAvanzar?: (fila: FilaResultado, hechas: number, total: number) => void;
}

export interface ResumenEjecucion {
  hechas: number;
  omitidas: number;
  costoTotalUsd: number;
  detenidoPorGasto: boolean;
}

const clave = (c: string, k: string, r: number) => `${c}|${k}|${r}`;

/**
 * Lee resultados.jsonl. Ignora una última línea cortada (el proceso pudo morir a mitad de
 * escribirla). Las corridas que terminaron con error no cuentan como hechas: al reanudar se
 * vuelven a intentar. El gasto de todas las filas, también las de error, se suma.
 */
export function leerResultados(archivo: string): { filas: FilaResultado[]; hechas: Set<string>; gastoUsd: number } {
  const filas: FilaResultado[] = [];
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, "utf8").split("\n")) {
      if (!linea.trim()) continue;
      try {
        filas.push(JSON.parse(linea) as FilaResultado);
      } catch {
        // Línea incompleta de una corrida interrumpida: esa corrida se repite.
      }
    }
  }
  const hechas = new Set(filas.filter((f) => f.motivo !== "error").map((f) => clave(f.caso, f.configuracion, f.repeticion)));
  return { filas, hechas, gastoUsd: filas.reduce((s, f) => s + (f.costoUsd ?? 0), 0) };
}

/** Error de una corrida que conserva lo que ya se gastó antes de fallar. */
class ErrorCorrida extends Error {
  constructor(
    mensaje: string,
    readonly gasto: { costoUsd: number; llamadas: number; uso: FilaResultado["uso"] },
  ) {
    super(mensaje);
  }
}

/** Modelos (identificador exacto, o el configurado) de las llamadas anotadas en el registro. */
function modelosRegistrados(registro: Registro): string[] {
  const modelos = registro.eventos.filter((e) => e.evento === "llamada").map((e) => String(e.modeloExacto ?? e.modelo ?? ""));
  return [...new Set(modelos.filter(Boolean))].sort();
}

/** Suma las llamadas al modelo anotadas en el registro de la corrida. */
function gastoRegistrado(registro: Registro): ErrorCorrida["gasto"] {
  const uso = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
  let costoUsd = 0;
  let llamadas = 0;
  for (const e of registro.eventos.filter((x) => x.evento === "llamada")) {
    llamadas++;
    costoUsd += Number(e.costoUsd ?? 0);
    const u = e.uso as Partial<typeof uso> | undefined;
    uso.entrada += u?.entrada ?? 0;
    uso.salida += u?.salida ?? 0;
    uso.cacheEscritura += u?.cacheEscritura ?? 0;
    uso.cacheLectura += u?.cacheLectura ?? 0;
  }
  return { costoUsd, llamadas, uso };
}

function contarPorCapa(errores: ErrorValidacion[][]): { porCapa: Record<string, number>; reglas: string[] } {
  const porCapa: Record<string, number> = {};
  const reglas = new Set<string>();
  for (const e of errores.flat()) {
    porCapa[e.capa] = (porCapa[e.capa] ?? 0) + 1;
    reglas.add(e.regla);
  }
  return { porCapa, reglas: [...reglas].sort() };
}

/** Ejecuta una corrida: genera, despliega, mide y destruye. */
async function ejecutarCorrida(caso: Caso, configuracion: Configuracion, repeticion: number, o: OpcionesExperimento): Promise<FilaResultado> {
  const dir = join(o.salida, "corridas", caso.id, configuracion, `rep-${repeticion}`);
  // Si se repite una corrida (reanudación tras un error), se parte de una carpeta limpia
  // para no reutilizar un estado o un plan anterior.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const registro = new Registro(join(dir, "trazas.jsonl"));
  try {
    return await medirCorrida(caso, configuracion, repeticion, o, dir, registro);
  } catch (e) {
    registro.anotar("corrida-error", { error: (e as Error).message });
    throw new ErrorCorrida((e as Error).message, gastoRegistrado(registro));
  }
}

async function medirCorrida(
  caso: Caso,
  configuracion: Configuracion,
  repeticion: number,
  o: OpcionesExperimento,
  dir: string,
  registro: Registro,
): Promise<FilaResultado> {
  const d = o.dependencias;
  const fecha = new Date().toISOString();
  registro.anotar("corrida-inicio", { caso: caso.id, configuracion, repeticion, fecha });
  const inicio = Date.now();
  const proveedor = o.crearProveedor(caso.id, configuracion, repeticion);
  const comun = {
    proveedor,
    endpoint: o.endpoint,
    region: o.region,
    versionProveedor: o.versionProveedor,
    dirTrabajo: join(dir, "trabajo"),
    registro,
    maxIteraciones: o.maxIteraciones,
    limiteGastoUsd: o.limiteGastoCorridaUsd,
  };

  const resultado =
    configuracion === "B0" || configuracion === "B1"
      ? await d.ejecutarDirecta(caso.requerimiento, { ...comun, conRetroalimentacion: configuracion === "B1" })
      : await d.ejecutarCiclo(caso.requerimiento, {
          ...comun,
          esquema: o.esquema,
          conValidador: configuracion !== "A1",
          conRetroalimentacion: configuracion !== "A2",
          conRag: configuracion !== "A3",
        });

  const { porCapa, reglas } = contarPorCapa(resultado.erroresPorIteracion);
  const fila: FilaResultado = {
    caso: caso.id,
    nivel: caso.nivel,
    configuracion,
    repeticion,
    listo: resultado.listo,
    motivo: resultado.motivo,
    m1: false,
    aplicado: false,
    sinCambios: false,
    erroresDespliegue: [],
    erroresPorCapa: porCapa,
    reglasDetectadas: reglas,
    m3: 0,
    violaciones: [],
    m4: 0,
    faltantes: [],
    iteraciones: resultado.iteraciones,
    llamadas: resultado.llamadas,
    consultasEsquema: "consultasEsquema" in resultado ? resultado.consultasEsquema : 0,
    uso: resultado.uso,
    costoUsd: resultado.costoUsd,
    duracionMs: 0,
    cosmeticosIgnorados: 0,
  };

  if (caso.fuente === "iaceval") {
    // Si la configuración no entrega código (el ciclo no terminó), la tarea cuenta como fallida.
    fila.iaceval = { compila: false, desplegable: false, correcto: false };
    if (resultado.listo && resultado.dirFinal) {
      fila.iaceval = await registro.medir("iaceval", () => d.medirIaCEval(resultado.dirFinal!, d.politicaTarea(caso.id)));
    }
  }

  if (resultado.listo && resultado.dirFinal) {
    const desp = await registro.medir("despliegue", () => d.desplegar(resultado.dirFinal!));
    fila.aplicado = desp.aplicado;
    fila.sinCambios = desp.sinCambios;
    fila.m1 = desp.aplicado && desp.sinCambios;
    fila.erroresDespliegue = desp.errores;
    fila.cosmeticosIgnorados = desp.cosmeticosIgnorados.length;
    if (desp.aplicado && desp.estado) {
      fila.violaciones = d.violaciones(desp.estado);
      fila.m3 = fila.violaciones.length;
      if (caso.fuente === "propio") {
        const m4 = d.evaluarIntencion(caso.id, entradaDesplegada(desp.estado, desp.planPosterior));
        fila.m4 = m4.proporcion;
        fila.faltantes = m4.faltantes;
      }
    }
    registro.anotar("despliegue", { aplicado: desp.aplicado, sinCambios: desp.sinCambios, errores: desp.errores.length });
    const destruido = await d.destruir(resultado.dirFinal);
    registro.anotar("destruccion", { ok: destruido });
    if (!destruido) await d.reiniciarEmulador();
  }

  // En IaC-Eval, M4 es la corrección de su política (sobre el plan), para resumir igual.
  if (fila.iaceval) fila.m4 = fila.iaceval.correcto ? 1 : 0;
  fila.duracionMs = Date.now() - inicio;
  fila.fecha = fecha;
  fila.modelos = modelosRegistrados(registro);
  registro.anotar("corrida-fin", { m1: fila.m1, m3: fila.m3, m4: fila.m4, costoUsd: fila.costoUsd });
  return fila;
}

/**
 * Ejecuta el experimento. Escribe una fila por corrida en resultados.jsonl y, si se vuelve a
 * ejecutar con la misma salida, salta las corridas ya hechas. Si una corrida lanza un error
 * (por ejemplo, el modelo no responde), se registra con el error y lo que alcanzó a gastar,
 * y se sigue con la siguiente; al reanudar, esa corrida se vuelve a intentar.
 */
export async function ejecutarExperimento(o: OpcionesExperimento): Promise<ResumenEjecucion> {
  mkdirSync(o.salida, { recursive: true });
  const archivo = join(o.salida, "resultados.jsonl");
  const previos = leerResultados(archivo);
  const hechas = previos.hechas;
  let costoTotalUsd = previos.gastoUsd;
  const total = o.casos.length * o.configuraciones.length * o.repeticiones;
  let hechasAhora = 0;
  let omitidas = 0;

  // Todos los casos se leen antes de empezar: un caso mal escrito se detecta al inicio.
  const casos = new Map(o.casos.map((id) => [id, (o.cargarCaso ?? cargarCaso)(id)]));
  // Al reanudar, una corrida interrumpida pudo dejar recursos en el emulador.
  if (previos.filas.length) await reiniciarSinAbortar(o);

  for (let repeticion = 1; repeticion <= o.repeticiones; repeticion++) {
    for (const id of o.casos) {
      const caso = casos.get(id)!;
      for (const configuracion of o.configuraciones) {
        if (hechas.has(clave(id, configuracion, repeticion))) {
          omitidas++;
          continue;
        }
        if (costoTotalUsd >= o.limiteGastoTotalUsd) {
          return { hechas: hechasAhora, omitidas, costoTotalUsd, detenidoPorGasto: true };
        }
        let fila: FilaResultado;
        try {
          fila = await ejecutarCorrida(caso, configuracion, repeticion, o);
        } catch (e) {
          await reiniciarSinAbortar(o);
          const gasto = e instanceof ErrorCorrida ? e.gasto : { costoUsd: 0, llamadas: 0, uso: { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 } };
          fila = {
            caso: id, nivel: caso.nivel, configuracion, repeticion, listo: false, motivo: "error", m1: false, aplicado: false,
            sinCambios: false, erroresDespliegue: [], erroresPorCapa: {}, reglasDetectadas: [], m3: 0, violaciones: [], m4: 0,
            faltantes: [], iteraciones: 0, llamadas: gasto.llamadas, consultasEsquema: 0, uso: gasto.uso,
            costoUsd: gasto.costoUsd, duracionMs: 0, cosmeticosIgnorados: 0, error: (e as Error).message,
          };
        }
        appendFileSync(archivo, JSON.stringify(fila) + "\n");
        costoTotalUsd += fila.costoUsd;
        hechasAhora++;
        o.alAvanzar?.(fila, hechasAhora + omitidas, total);
      }
    }
  }
  return { hechas: hechasAhora, omitidas, costoTotalUsd, detenidoPorGasto: false };
}

/** Reinicia el emulador; si falla, lo informa y sigue (la corrida siguiente lo notará). */
async function reiniciarSinAbortar(o: OpcionesExperimento): Promise<void> {
  try {
    await o.dependencias.reiniciarEmulador();
  } catch (e) {
    console.error(`No se pudo reiniciar el emulador: ${(e as Error).message}`);
  }
}
