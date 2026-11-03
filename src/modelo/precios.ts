import { readFileSync } from "node:fs";
import { enRaiz } from "../rutas.js";
import type { UsoTokens } from "./tipos.js";

const precios = JSON.parse(readFileSync(enRaiz("precios.json"), "utf8")) as {
  modelos: Record<string, { entrada: number; salida: number }>;
  multiplicadores_cache: { escritura: number; lectura: number };
};

/**
 * Precio por millón de tokens de un modelo que no está en precios.json (por ejemplo, uno de
 * OpenRouter o NVIDIA), tomado de LLM_PRECIO_ENTRADA_MTOK y LLM_PRECIO_SALIDA_MTOK.
 * Un modelo gratuito se declara con 0.
 */
function precioDelEntorno(): { entrada: number; salida: number } | undefined {
  const leer = (nombre: string) => {
    const crudo = process.env[nombre]?.trim();
    const n = Number(crudo);
    return crudo && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const entrada = leer("LLM_PRECIO_ENTRADA_MTOK");
  const salida = leer("LLM_PRECIO_SALIDA_MTOK");
  return entrada === undefined || salida === undefined ? undefined : { entrada, salida };
}

/** true si hay precio para el modelo: en precios.json o, si no está ahí, en el entorno. */
export const tienePrecio = (modelo: string): boolean => modelo in precios.modelos || precioDelEntorno() !== undefined;

/**
 * Costo estimado en USD a precio de lista. Con precios de precios.json (Anthropic), la caché
 * se estima con sus multiplicadores. Con precios del entorno, la caché leída se cobra como
 * entrada normal: cada proveedor la descuenta distinto, así que la estimación es conservadora.
 * Si no hay precio, lanza un error.
 */
export function estimarCosto(modelo: string, uso: UsoTokens): number {
  const porToken = (precioMillon: number) => precioMillon / 1_000_000;
  const p = precios.modelos[modelo];
  if (p) {
    const m = precios.multiplicadores_cache;
    return (
      uso.entrada * porToken(p.entrada) +
      uso.cacheEscritura * porToken(p.entrada) * m.escritura +
      uso.cacheLectura * porToken(p.entrada) * m.lectura +
      uso.salida * porToken(p.salida)
    );
  }
  const e = precioDelEntorno();
  if (!e) {
    throw new Error(`No hay precio para el modelo "${modelo}" en precios.json; agrégalo o define LLM_PRECIO_ENTRADA_MTOK y LLM_PRECIO_SALIDA_MTOK`);
  }
  return (uso.entrada + uso.cacheEscritura + uso.cacheLectura) * porToken(e.entrada) + uso.salida * porToken(e.salida);
}
