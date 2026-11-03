import type { MensajeModelo, ProveedorModelo, RespuestaModelo } from "../modelo/tipos.js";
import { consultarEsquema } from "../proveedor/consulta.js";
import type { EsquemaProveedor } from "../proveedor/esquema.js";
import { construirSistema } from "./prompt.js";

export type Interpretacion =
  | { tipo: "artefacto"; artefacto: unknown }
  | { tipo: "consulta"; tipos: string[] }
  | { tipo: "invalida"; error: string };

/** Extrae el objeto JSON de la respuesta del modelo y reconoce la acción. */
export function interpretarRespuesta(texto: string): Interpretacion {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return { tipo: "invalida", error: "la respuesta no contiene un objeto JSON" };
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(texto.slice(inicio, fin + 1));
  } catch (e) {
    return { tipo: "invalida", error: `el JSON de la respuesta no es válido: ${(e as Error).message}` };
  }
  if (datos.accion === "entregar") {
    if (!datos.artefacto || typeof datos.artefacto !== "object") {
      return { tipo: "invalida", error: 'la acción "entregar" no trae el campo "artefacto"' };
    }
    return { tipo: "artefacto", artefacto: datos.artefacto };
  }
  if (datos.accion === "consultar_esquema") {
    if (!Array.isArray(datos.tipos)) return { tipo: "invalida", error: 'la acción "consultar_esquema" necesita el campo "tipos" con una lista de tipos de recurso' };
    return { tipo: "consulta", tipos: datos.tipos.map(String).slice(0, 10) };
  }
  return { tipo: "invalida", error: `acción desconocida: ${JSON.stringify(datos.accion)}` };
}

export interface OpcionesAgente {
  proveedor: ProveedorModelo;
  esquema: EsquemaProveedor;
  /** Con RAG, el agente puede consultar el esquema del proveedor. */
  conRag: boolean;
  /** Consultas permitidas antes de exigir la entrega. */
  maxConsultas?: number;
  versionProveedor?: string;
  /** Gasto que queda en la corrida (USD); al alcanzarlo no se hacen más consultas. */
  presupuestoUsd?: number;
}

/**
 * Problema de la respuesta que no depende de su contenido: vacía (el proveedor no devolvió
 * texto) o cortada por el límite de tokens de salida. Se informa tal cual en C0.
 */
export function problemaRespuesta(r: { texto: string; motivoParada: string }): string | undefined {
  if (r.motivoParada === "max_tokens") return "la respuesta se cortó por el límite de tokens de salida; entrega una respuesta más compacta";
  if (!r.texto.trim()) return `la respuesta llegó vacía (motivo de parada: ${r.motivoParada || "desconocido"})`;
  return undefined;
}

export interface ResultadoAgente {
  /** El artefacto entregado (sin validar todavía) o null si la respuesta no fue válida. */
  artefacto: unknown | null;
  errorFormato?: string;
  /** Conversación completa, para continuarla en la siguiente iteración del ciclo. */
  mensajes: MensajeModelo[];
  llamadas: RespuestaModelo[];
  consultas: string[][];
}

/**
 * Pide al modelo el artefacto intermedio. Atiende las consultas al esquema (RAG) hasta
 * recibir una entrega. `previos` permite continuar la conversación con retroalimentación.
 */
export async function generarArtefacto(
  mensaje: string,
  previos: MensajeModelo[],
  opciones: OpcionesAgente,
): Promise<ResultadoAgente> {
  const sistema = construirSistema({
    conRag: opciones.conRag,
    versionProveedor: opciones.versionProveedor ?? opciones.esquema.version,
  });
  const maxConsultas = opciones.maxConsultas ?? 2;
  const mensajes: MensajeModelo[] = [...previos, { rol: "usuario", texto: mensaje }];
  const llamadas: RespuestaModelo[] = [];
  const consultas: string[][] = [];

  // Como mucho: las consultas permitidas, una respuesta más tras negarlas y la entrega.
  for (let vuelta = 0; vuelta < maxConsultas + 2; vuelta++) {
    const respuesta = await opciones.proveedor.completar(sistema, mensajes);
    llamadas.push(respuesta);
    // La API no acepta turnos vacíos: si la respuesta vino vacía se deja constancia en el turno.
    mensajes.push({ rol: "asistente", texto: respuesta.texto.trim() ? respuesta.texto : "(respuesta vacía)" });

    const problema = problemaRespuesta(respuesta);
    if (problema) return { artefacto: null, errorFormato: problema, mensajes, llamadas, consultas };
    const r = interpretarRespuesta(respuesta.texto);
    if (r.tipo === "artefacto") return { artefacto: r.artefacto, mensajes, llamadas, consultas };
    if (r.tipo === "invalida") return { artefacto: null, errorFormato: r.error, mensajes, llamadas, consultas };

    const gastado = llamadas.reduce((s, l) => s + l.costoUsd, 0);
    if (opciones.presupuestoUsd !== undefined && gastado > opciones.presupuestoUsd) {
      return { artefacto: null, errorFormato: "se alcanzó el límite de gasto de la corrida", mensajes, llamadas, consultas };
    }
    if (!opciones.conRag) {
      mensajes.push({ rol: "usuario", texto: "La consulta al esquema no está disponible. Entrega el artefacto." });
    } else if (consultas.length >= maxConsultas) {
      mensajes.push({ rol: "usuario", texto: "Ya no quedan consultas disponibles. Entrega el artefacto." });
    } else {
      consultas.push(r.tipos);
      const texto = r.tipos.map((t) => consultarEsquema(opciones.esquema, t).texto).join("\n\n");
      mensajes.push({ rol: "usuario", texto: `Esquema vigente del proveedor:\n\n${texto}` });
    }
  }
  return { artefacto: null, errorFormato: "el modelo no entregó el artefacto", mensajes, llamadas, consultas };
}
