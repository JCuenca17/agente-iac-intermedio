import { readFileSync } from "node:fs";
import { enRaiz } from "../rutas.js";
import type { UsoTokens } from "./tipos.js";

const precios = JSON.parse(readFileSync(enRaiz("precios.json"), "utf8")) as {
  modelos: Record<string, { entrada: number; salida: number }>;
  multiplicadores_cache: { escritura: number; lectura: number };
};

/** true si precios.json tiene el precio del modelo. */
export const tienePrecio = (modelo: string): boolean => modelo in precios.modelos;

/** Costo estimado en USD a precio de lista. Si el modelo no está en precios.json, lanza un error. */
export function estimarCosto(modelo: string, uso: UsoTokens): number {
  const p = precios.modelos[modelo];
  if (!p) throw new Error(`No hay precio para el modelo "${modelo}" en precios.json`);
  const m = precios.multiplicadores_cache;
  const porToken = (precioMillon: number) => precioMillon / 1_000_000;
  return (
    uso.entrada * porToken(p.entrada) +
    uso.cacheEscritura * porToken(p.entrada) * m.escritura +
    uso.cacheLectura * porToken(p.entrada) * m.lectura +
    uso.salida * porToken(p.salida)
  );
}
