import { esSoloLectura, sugerir, type BloqueEsquema, type EsquemaProveedor } from "./esquema.js";

export interface ResultadoConsulta {
  existe: boolean;
  texto: string;
}

/** Campos que el proveedor agrega solo y que no aportan al diseño. */
const OMITIR = new Set(["id", "tags_all", "timeouts", "region"]);
const PROFUNDIDAD_MAXIMA = 2;

function tipoLegible(tipo: unknown): string {
  if (typeof tipo === "string") return tipo;
  if (Array.isArray(tipo)) return `${tipo[0]}(${tipoLegible(tipo[1])})`;
  return "objeto";
}

function describirBloque(bloque: BloqueEsquema, sangria: string, nivel: number, deprecados: string[], prefijo: string): string[] {
  const lineas: string[] = [];
  for (const [nombre, a] of Object.entries(bloque.atributos).sort(([x], [y]) => x.localeCompare(y))) {
    if (OMITIR.has(nombre) || esSoloLectura(a)) continue;
    if (a.deprecado) {
      deprecados.push(prefijo + nombre);
      continue;
    }
    lineas.push(`${sangria}${nombre} (${tipoLegible(a.tipo)}${a.requerido ? ", obligatorio" : ""})`);
  }
  for (const [nombre, b] of Object.entries(bloque.bloques).sort(([x], [y]) => x.localeCompare(y))) {
    if (OMITIR.has(nombre)) continue;
    if (b.deprecado) {
      deprecados.push(prefijo + nombre);
      continue;
    }
    const cantidad = b.anidamiento === "single" || b.max === 1 ? "objeto" : "lista";
    const obligatorio = (b.min ?? 0) > 0 ? ", obligatorio" : "";
    lineas.push(`${sangria}${nombre} { ${cantidad}${obligatorio} }`);
    if (nivel < PROFUNDIDAD_MAXIMA) {
      lineas.push(...describirBloque(b, sangria + "  ", nivel + 1, deprecados, `${prefijo}${nombre}.`));
    }
  }
  return lineas;
}

/**
 * Herramienta del RAG: describe los campos vigentes de un tipo de recurso del proveedor.
 * Búsqueda exacta por tipo, sin base vectorial ni servicios externos.
 */
export function consultarEsquema(esquema: EsquemaProveedor, tipo: string): ResultadoConsulta {
  const recurso = esquema.recursos[tipo];
  if (!recurso) {
    const parecidos = sugerir(tipo, Object.keys(esquema.recursos), 5);
    return {
      existe: false,
      texto: `"${tipo}" no existe en el proveedor AWS ${esquema.version}.` + (parecidos.length ? ` Tipos parecidos: ${parecidos.join(", ")}.` : ""),
    };
  }
  const deprecados: string[] = [];
  const lineas = [
    `${tipo} (proveedor AWS ${esquema.version})${recurso.deprecado ? " — DEPRECADO: no usar este tipo" : ""}`,
    "Campos asignables:",
    ...describirBloque(recurso, "  ", 1, deprecados, ""),
  ];
  if (deprecados.length) lineas.push(`Deprecados (no usar): ${deprecados.join(", ")}`);
  return { existe: true, texto: lineas.join("\n") };
}
