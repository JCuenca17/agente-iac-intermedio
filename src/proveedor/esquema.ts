import { existsSync, readFileSync } from "node:fs";

/** Atributo de un recurso, tal como lo resume scripts/esquema-proveedor.mjs. */
export interface AtributoEsquema {
  tipo: unknown;
  requerido?: true;
  opcional?: true;
  calculado?: true;
  deprecado?: true;
}

export interface BloqueEsquema {
  deprecado?: true;
  atributos: Record<string, AtributoEsquema>;
  bloques: Record<string, BloqueAnidado>;
}

export interface BloqueAnidado extends BloqueEsquema {
  anidamiento: "single" | "list" | "set" | "map" | "group";
  min?: number;
  max?: number;
}

export interface EsquemaProveedor {
  fuente: string;
  version: string;
  recursos: Record<string, BloqueEsquema>;
}

/** Carga el índice compacto generado con `npm run esquema-proveedor`. */
export function cargarEsquemaProveedor(ruta = ".cache/esquema-aws.json"): EsquemaProveedor {
  if (!existsSync(ruta)) {
    throw new Error(`No existe ${ruta}. Genéralo con: npm run esquema-proveedor`);
  }
  return JSON.parse(readFileSync(ruta, "utf8"));
}

/** Un atributo que solo calcula el proveedor y que no se puede asignar. */
export function esSoloLectura(a: AtributoEsquema): boolean {
  return Boolean(a.calculado && !a.opcional && !a.requerido);
}

/** Distancia de edición, para sugerir el nombre correcto cuando el modelo inventa uno. */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temporal;
    }
  }
  return fila[b.length];
}

/** Devuelve hasta `n` nombres parecidos, de más a menos parecido. */
export function sugerir(nombre: string, candidatos: Iterable<string>, n = 3): string[] {
  const limite = Math.max(3, Math.floor(nombre.length / 2));
  return [...candidatos]
    .map((c) => {
      const d = distancia(nombre, c);
      // Un prefijo común largo cuenta como parecido aunque la distancia sea grande.
      const comun = [...nombre].findIndex((ch, i) => c[i] !== ch);
      const prefijo = comun === -1 ? nombre.length : comun;
      return { c, d: prefijo >= 6 ? Math.min(d, limite) : d };
    })
    .filter((x) => x.d <= limite)
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, n)
    .map((x) => x.c);
}
