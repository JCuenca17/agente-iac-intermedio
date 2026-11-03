import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Carpeta raíz de la herramienta (donde está package.json). Funciona igual al ejecutar
 * el código fuente (src/) o el compilado (dist/src/), porque sube hasta encontrarla.
 */
function buscarRaiz(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const padre = dirname(dir);
    if (padre === dir) throw new Error("No se encontró package.json de la herramienta");
    dir = padre;
  }
  return dir;
}

export const RAIZ = buscarRaiz();

/** Ruta absoluta a un archivo o carpeta de la herramienta. */
export const enRaiz = (...partes: string[]) => join(RAIZ, ...partes);
