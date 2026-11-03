import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { UsoTokens } from "../modelo/tipos.js";

/**
 * Historial de consumo del agente: una línea por corrida, agrupada por sesión. Una sesión es
 * un proyecto que se quiere desplegar (por ejemplo, "tienda"); sin nombre, va a "general".
 */
export interface EntradaHistorial {
  sesion: string;
  /** Inicio de la corrida (ISO 8601). */
  fecha: string;
  requerimiento: string;
  /** Rondas de diseño (más de una si la persona rechazó con comentarios). */
  rondas: number;
  llamadas: number;
  uso: UsoTokens;
  costoUsd: number;
  /** desplegado, desplegado-con-problemas, rechazado, sin-desplegar o el motivo del ciclo. */
  resultado: string;
  /** Carpeta de la corrida, con sus trazas. */
  carpeta: string;
}

export const SESION_POR_DEFECTO = "general";

/** Nombre de sesión usable como nombre de archivo: letras, números, guion y guion bajo. */
export const nombreSesionValido = (nombre: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(nombre);

export function registrarCorrida(archivo: string, entrada: EntradaHistorial): void {
  mkdirSync(dirname(archivo), { recursive: true });
  appendFileSync(archivo, JSON.stringify(entrada) + "\n");
}

/** Lee el historial; ignora una última línea cortada si el proceso se interrumpió al escribir. */
export function leerHistorial(archivo: string): EntradaHistorial[] {
  if (!existsSync(archivo)) return [];
  const entradas: EntradaHistorial[] = [];
  for (const linea of readFileSync(archivo, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    try {
      entradas.push(JSON.parse(linea) as EntradaHistorial);
    } catch {
      // línea incompleta
    }
  }
  return entradas;
}

export interface TotalesConsumo {
  corridas: number;
  /** Tokens de entrada, incluida la parte escrita o leída de la caché. */
  entrada: number;
  enCache: number;
  salida: number;
  costoUsd: number;
}

export interface ResumenSesion extends TotalesConsumo {
  sesion: string;
  ultima: string;
}

export interface DetalleCorrida {
  fecha: string;
  requerimiento: string;
  entrada: number;
  enCache: number;
  salida: number;
  costoUsd: number;
  resultado: string;
  carpeta: string;
}

export interface ResumenHistorial {
  sesiones: ResumenSesion[];
  total: TotalesConsumo;
  /** Solo si se pidió una sesión: sus corridas en orden. */
  sesionPedida?: string;
  detalle?: DetalleCorrida[];
}

const enCache = (u: UsoTokens) => u.cacheEscritura + u.cacheLectura;
const entradaTotal = (u: UsoTokens) => u.entrada + enCache(u);
const redondear = (x: number) => Math.round(x * 1e6) / 1e6;

function sumar(entradas: EntradaHistorial[]): TotalesConsumo {
  return {
    corridas: entradas.length,
    entrada: entradas.reduce((s, e) => s + entradaTotal(e.uso), 0),
    enCache: entradas.reduce((s, e) => s + enCache(e.uso), 0),
    salida: entradas.reduce((s, e) => s + e.uso.salida, 0),
    costoUsd: redondear(entradas.reduce((s, e) => s + e.costoUsd, 0)),
  };
}

/** Totales por sesión (en orden alfabético) y, si se pide una, el detalle de sus corridas. */
export function resumirHistorial(entradas: EntradaHistorial[], sesion?: string): ResumenHistorial {
  const porSesion = new Map<string, EntradaHistorial[]>();
  for (const e of entradas) porSesion.set(e.sesion, [...(porSesion.get(e.sesion) ?? []), e]);
  const sesiones = [...porSesion]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nombre, es]) => ({ sesion: nombre, ...sumar(es), ultima: es.map((e) => e.fecha).sort().at(-1)! }));
  const r: ResumenHistorial = { sesiones, total: sumar(entradas) };
  if (sesion !== undefined) {
    r.sesionPedida = sesion;
    r.detalle = (porSesion.get(sesion) ?? [])
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((e) => ({
        fecha: e.fecha,
        requerimiento: e.requerimiento,
        entrada: entradaTotal(e.uso),
        enCache: enCache(e.uso),
        salida: e.uso.salida,
        costoUsd: e.costoUsd,
        resultado: e.resultado,
        carpeta: e.carpeta,
      }));
  }
  return r;
}

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const usd = (x: number) => `US$ ${x.toFixed(4)}`;

/** Una línea con el consumo de una interacción, para mostrar al terminar cada ronda o corrida. */
export function lineaConsumo(uso: UsoTokens, costoUsd: number, llamadas: number): string {
  return `Tokens: entrada ${miles(entradaTotal(uso))} (${miles(enCache(uso))} en caché) · salida ${miles(uso.salida)} · ${llamadas} llamada(s) · costo estimado ${usd(costoUsd)}`;
}

/** Texto para la terminal: tabla por sesión, o el detalle de la sesión pedida. */
export function textoHistorial(r: ResumenHistorial): string {
  if (r.sesionPedida !== undefined) {
    if (!r.detalle?.length) return `No hay corridas en la sesión "${r.sesionPedida}".`;
    const lineas = [`Sesión "${r.sesionPedida}": ${r.detalle.length} corrida(s)`, ""];
    for (const d of r.detalle) {
      lineas.push(`${d.fecha.slice(0, 16).replace("T", " ")}  ${d.resultado}`);
      lineas.push(`  ${d.requerimiento.length > 90 ? d.requerimiento.slice(0, 87) + "..." : d.requerimiento}`);
      lineas.push(`  entrada ${miles(d.entrada)} (${miles(d.enCache)} en caché) · salida ${miles(d.salida)} · ${usd(d.costoUsd)} · ${d.carpeta}`);
    }
    const s = r.sesiones.find((x) => x.sesion === r.sesionPedida)!;
    lineas.push("", `Total de la sesión: entrada ${miles(s.entrada)} · salida ${miles(s.salida)} · ${usd(s.costoUsd)}`);
    return lineas.join("\n");
  }
  if (!r.sesiones.length) return "Todavía no hay corridas en el historial.";
  const filas = r.sesiones.map((s) => [s.sesion, String(s.corridas), miles(s.entrada), miles(s.enCache), miles(s.salida), usd(s.costoUsd), s.ultima.slice(0, 10)]);
  const cabecera = ["Sesión", "Corridas", "Entrada", "En caché", "Salida", "Costo estimado", "Última"];
  const total = ["Total", String(r.total.corridas), miles(r.total.entrada), miles(r.total.enCache), miles(r.total.salida), usd(r.total.costoUsd), ""];
  const todas = [cabecera, ...filas, total];
  const anchos = cabecera.map((_, i) => Math.max(...todas.map((f) => f[i].length)));
  const formatear = (f: string[]) => f.map((c, i) => (i === 0 ? c.padEnd(anchos[i]) : c.padStart(anchos[i]))).join("  ").trimEnd();
  return [formatear(cabecera), ...filas.map(formatear), formatear(total)].join("\n");
}
