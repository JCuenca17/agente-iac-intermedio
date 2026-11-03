/** Tipos del artefacto intermedio. Reflejan esquema/artefacto.schema.json. */

export type TipoRelacion =
  | "invoca"
  | "lee_de"
  | "escribe_en"
  | "notifica_a"
  | "publica_en"
  | "suscribe_a"
  | "asume_rol"
  | "otorga_permiso"
  | "contiene"
  | "enruta_a"
  | "protege";

export interface Recurso {
  id: string;
  tipo: string;
  proposito: string;
  requisito?: string;
  atributos: Record<string, unknown>;
  depende_de?: string[];
}

export interface Relacion {
  origen: string;
  destino: string;
  tipo: TipoRelacion;
  descripcion?: string;
}

export interface Artefacto {
  version: "1.0";
  resumen: string;
  recursos: Recurso[];
  relaciones: Relacion[];
  supuestos?: string[];
}

/** Referencia a otro recurso dentro de un texto: ${ref:id_recurso.atributo} */
export const PATRON_REFERENCIA = /\$\{ref:([a-z][a-z0-9_]*)\.([a-z0-9_]+)\}/g;

export interface Referencia {
  id: string;
  atributo: string;
  /** Ruta JSON Pointer del texto donde aparece. */
  ruta: string;
}

/** Recorre un valor y devuelve todas las referencias ${ref:...} que contiene. */
export function buscarReferencias(valor: unknown, ruta: string): Referencia[] {
  if (typeof valor === "string") {
    return [...valor.matchAll(PATRON_REFERENCIA)].map((m) => ({ id: m[1], atributo: m[2], ruta }));
  }
  if (Array.isArray(valor)) return valor.flatMap((v, i) => buscarReferencias(v, `${ruta}/${i}`));
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => buscarReferencias(v, `${ruta}/${escaparPuntero(k)}`));
  }
  return [];
}

/** Escapa un segmento según JSON Pointer (RFC 6901). */
export function escaparPuntero(segmento: string): string {
  return segmento.replaceAll("~", "~0").replaceAll("/", "~1");
}
