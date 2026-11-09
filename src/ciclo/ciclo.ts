import { join } from "node:path";
import { generarArtefacto } from "../agente/agente.js";
import { mensajeRequerimiento, mensajeRetroalimentacion } from "../agente/prompt.js";
import type { Artefacto } from "../artefacto/tipos.js";
import type { MensajeModelo, ProveedorModelo, UsoTokens } from "../modelo/tipos.js";
import type { EsquemaProveedor } from "../proveedor/esquema.js";
import { traducir, type ResultadoTraduccion } from "../traductor/opentofu.js";
import { Registro } from "../trazas/registro.js";
import { validarEstructura } from "../validador/c1-estructura.js";
import { validarSemantica } from "../validador/c2-semantica.js";
import { validarPoliticas } from "../validador/c3-politicas.js";
import { revisarTfJson } from "../validador/seguridad-codigo.js";
import { prepararDirectorio, validarConOpenTofu, type ResultadoC4, type ResumenPlan } from "../validador/c4-opentofu.js";
import type { Capa, ErrorValidacion } from "../validador/tipos.js";

export interface ContextoValidacion {
  esquema: EsquemaProveedor;
  endpoint: string;
  region: string;
  versionProveedor: string;
  registro: Registro;
  iteracion: number;
}

export interface ResultadoValidacionCompleta {
  valido: boolean;
  /** Primera capa que falló (las siguientes no se ejecutan). */
  capaFallida?: Capa;
  errores: ErrorValidacion[];
  traduccion?: ResultadoTraduccion;
  c4?: ResultadoC4;
}

export type Validador = (artefacto: unknown, dir: string, ctx: ContextoValidacion) => Promise<ResultadoValidacionCompleta>;

/**
 * Valida por capas, de la más barata a la más costosa, y se detiene en la primera que
 * falla: C1 estructura, C2 semántica, C3 políticas, traducción y C4 (validate + plan).
 */
export const validarPorCapas: Validador = async (artefacto, dir, ctx) => {
  const anotar = (capa: Capa, errores: ErrorValidacion[]) =>
    ctx.registro.anotar("validacion", {
      iteracion: ctx.iteracion,
      capa,
      valido: errores.length === 0,
      errores: errores.length,
      reglas: [...new Set(errores.map((e) => e.regla))],
    });

  const c1 = await ctx.registro.medir("C1", () => validarEstructura(artefacto), { iteracion: ctx.iteracion });
  anotar("C1", c1.errores);
  if (!c1.valido) return { valido: false, capaFallida: "C1", errores: c1.errores };

  const a = artefacto as Artefacto;
  const c2 = await ctx.registro.medir("C2", () => validarSemantica(a, ctx.esquema), { iteracion: ctx.iteracion });
  anotar("C2", c2.errores);
  if (!c2.valido) return { valido: false, capaFallida: "C2", errores: c2.errores };

  const c3 = await ctx.registro.medir("C3", () => validarPoliticas(a), { iteracion: ctx.iteracion });
  anotar("C3", c3.errores);
  if (!c3.valido) return { valido: false, capaFallida: "C3", errores: c3.errores };

  // La traducción no debería fallar con un artefacto que pasó C1-C3; si falla, el error
  // se devuelve al modelo como cualquier otro en lugar de abortar la corrida.
  let traduccion: ResultadoTraduccion;
  try {
    traduccion = traducir(a, ctx.esquema, ctx);
  } catch (e) {
    const errores: ErrorValidacion[] = [{ capa: "C4", ruta: "/", regla: "traduccion-fallida", mensaje: (e as Error).message }];
    anotar("C4", errores);
    return { valido: false, capaFallida: "C4", errores };
  }
  const prohibidas = revisarTfJson(traduccion.codigo as Parameters<typeof revisarTfJson>[0]);
  if (prohibidas.length) {
    ctx.registro.anotar("construccion-rechazada", { iteracion: ctx.iteracion, errores: prohibidas });
    anotar("C4", prohibidas);
    return { valido: false, capaFallida: "C4", errores: prohibidas, traduccion };
  }
  prepararDirectorio(dir, traduccion);
  const c4 = await ctx.registro.medir("C4", () => validarConOpenTofu(dir, a), { iteracion: ctx.iteracion });
  anotar("C4", c4.errores);
  if (!c4.valido) return { valido: false, capaFallida: "C4", errores: c4.errores, traduccion, c4 };

  return { valido: true, errores: [], traduccion, c4 };
};

export interface OpcionesCiclo {
  proveedor: ProveedorModelo;
  esquema: EsquemaProveedor;
  endpoint: string;
  region: string;
  versionProveedor: string;
  /** Carpeta de la corrida; cada iteración usa una subcarpeta iter-N. */
  dirTrabajo: string;
  registro: Registro;
  maxIteraciones: number;
  /** Ablaciones: A1 sin validador, A2 sin retroalimentación, A3 sin RAG. */
  conValidador: boolean;
  conRetroalimentacion: boolean;
  conRag: boolean;
  /** Se detiene si el costo estimado acumulado supera este valor (USD). */
  limiteGastoUsd: number;
  /** Para pruebas: reemplaza la validación por capas. */
  validar?: Validador;
}

export type MotivoFin =
  | "valido"
  | "sin-validacion"
  | "iteraciones-agotadas"
  | "sin-retroalimentacion"
  | "limite-gasto"
  | "traduccion-fallida"
  | "construccion-no-permitida";

export interface ResultadoCiclo {
  /** true si el artefacto pasó todas las capas (o, sin validador, si se pudo traducir). */
  listo: boolean;
  motivo: MotivoFin;
  iteraciones: number;
  artefacto?: Artefacto;
  traduccion?: ResultadoTraduccion;
  plan?: unknown;
  resumenPlan?: ResumenPlan;
  /** Carpeta con el main.tf.json aceptado, lista para el despliegue. */
  dirFinal?: string;
  /** Errores de cada iteración (vacío en la que pasó). */
  erroresPorIteracion: ErrorValidacion[][];
  uso: UsoTokens;
  costoUsd: number;
  llamadas: number;
  consultasEsquema: number;
}

/**
 * Ciclo de generación, validación y retroalimentación. Termina cuando el artefacto pasa
 * todas las capas, cuando se agotan las iteraciones o cuando se alcanza el límite de gasto.
 */
export async function ejecutarCiclo(requerimiento: string, o: OpcionesCiclo): Promise<ResultadoCiclo> {
  const validar = o.validar ?? validarPorCapas;
  const uso: UsoTokens = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
  let costoUsd = 0;
  let llamadas = 0;
  let consultasEsquema = 0;
  const erroresPorIteracion: ErrorValidacion[][] = [];

  let mensaje = mensajeRequerimiento(requerimiento);
  let previos: MensajeModelo[] = [];
  const base = () => ({ uso, costoUsd, llamadas, consultasEsquema, erroresPorIteracion });

  o.registro.anotar("ciclo-inicio", {
    proveedor: o.proveedor.nombre,
    maxIteraciones: o.maxIteraciones,
    conValidador: o.conValidador,
    conRetroalimentacion: o.conRetroalimentacion,
    conRag: o.conRag,
  });

  for (let iteracion = 1; iteracion <= o.maxIteraciones; iteracion++) {
    const gen = await o.registro.medir("generacion", () =>
      generarArtefacto(mensaje, previos, {
        proveedor: o.proveedor,
        esquema: o.esquema,
        conRag: o.conRag,
        versionProveedor: o.versionProveedor,
        presupuestoUsd: o.limiteGastoUsd - costoUsd,
      }),
      { iteracion },
    );
    for (const ll of gen.llamadas) {
      llamadas++;
      costoUsd += ll.costoUsd;
      uso.entrada += ll.uso.entrada;
      uso.salida += ll.uso.salida;
      uso.cacheEscritura += ll.uso.cacheEscritura;
      uso.cacheLectura += ll.uso.cacheLectura;
      o.registro.anotar("llamada", { iteracion, modelo: ll.modelo, modeloExacto: ll.modeloExacto, uso: ll.uso, costoUsd: ll.costoUsd, duracionMs: ll.duracionMs, motivoParada: ll.motivoParada });
    }
    consultasEsquema += gen.consultas.length;
    for (const tipos of gen.consultas) o.registro.anotar("consulta-esquema", { iteracion, tipos });

    const dir = join(o.dirTrabajo, `iter-${iteracion}`);
    let errores: ErrorValidacion[];

    if (gen.artefacto === null) {
      errores = [{ capa: "C0", ruta: "/", regla: "formato-respuesta", mensaje: gen.errorFormato ?? "respuesta no válida" }];
      o.registro.anotar("validacion", { iteracion, capa: "C0", valido: false, errores: 1, reglas: ["formato-respuesta"] });
    } else if (!o.conValidador) {
      // A1: se traduce y se entrega sin validar nada antes del despliegue.
      try {
        const traduccion = traducir(gen.artefacto as Artefacto, o.esquema, o);
        // Aun sin validador, nada que ejecute comandos o salga del emulador llega a OpenTofu.
        const prohibidas = revisarTfJson(traduccion.codigo as Parameters<typeof revisarTfJson>[0]);
        if (prohibidas.length) {
          o.registro.anotar("construccion-rechazada", { iteracion, errores: prohibidas });
          erroresPorIteracion.push(prohibidas);
          o.registro.anotar("ciclo-fin", { motivo: "construccion-no-permitida", iteraciones: iteracion, costoUsd });
          return { ...base(), listo: false, motivo: "construccion-no-permitida", iteraciones: iteracion };
        }
        prepararDirectorio(dir, traduccion);
        erroresPorIteracion.push([]);
        o.registro.anotar("ciclo-fin", { motivo: "sin-validacion", iteraciones: iteracion, costoUsd });
        return { ...base(), listo: true, motivo: "sin-validacion", iteraciones: iteracion, artefacto: gen.artefacto as Artefacto, traduccion, dirFinal: dir };
      } catch (e) {
        erroresPorIteracion.push([{ capa: "C0", ruta: "/", regla: "traduccion-fallida", mensaje: (e as Error).message }]);
        o.registro.anotar("ciclo-fin", { motivo: "traduccion-fallida", iteraciones: iteracion, costoUsd });
        return { ...base(), listo: false, motivo: "traduccion-fallida", iteraciones: iteracion };
      }
    } else {
      const v = await validar(gen.artefacto, dir, { esquema: o.esquema, endpoint: o.endpoint, region: o.region, versionProveedor: o.versionProveedor, registro: o.registro, iteracion });
      errores = v.errores;
      if (v.valido) {
        erroresPorIteracion.push([]);
        o.registro.anotar("ciclo-fin", { motivo: "valido", iteraciones: iteracion, costoUsd });
        return {
          ...base(),
          listo: true,
          motivo: "valido",
          iteraciones: iteracion,
          artefacto: gen.artefacto as Artefacto,
          traduccion: v.traduccion,
          plan: v.c4?.plan,
          resumenPlan: v.c4?.resumen,
          dirFinal: dir,
        };
      }
    }

    erroresPorIteracion.push(errores);
    if (costoUsd > o.limiteGastoUsd) {
      o.registro.anotar("ciclo-fin", { motivo: "limite-gasto", iteraciones: iteracion, costoUsd });
      return { ...base(), listo: false, motivo: "limite-gasto", iteraciones: iteracion };
    }
    if (!o.conRetroalimentacion) {
      o.registro.anotar("ciclo-fin", { motivo: "sin-retroalimentacion", iteraciones: iteracion, costoUsd });
      return { ...base(), listo: false, motivo: "sin-retroalimentacion", iteraciones: iteracion };
    }
    mensaje = mensajeRetroalimentacion(errores);
    previos = gen.mensajes;
  }

  o.registro.anotar("ciclo-fin", { motivo: "iteraciones-agotadas", iteraciones: o.maxIteraciones, costoUsd });
  return { ...base(), listo: false, motivo: "iteraciones-agotadas", iteraciones: o.maxIteraciones };
}
