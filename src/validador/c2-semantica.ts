import { buscarReferencias, escaparPuntero, type Artefacto } from "../artefacto/tipos.js";
import { esSoloLectura, sugerir, type BloqueEsquema, type EsquemaProveedor } from "../proveedor/esquema.js";
import type { ErrorValidacion, ResultadoValidacion } from "./tipos.js";

/**
 * C2: revisa la coherencia del artefacto y lo contrasta con el esquema real del proveedor.
 * Supone que el artefacto ya pasó C1. Es determinista y no llama a ningún servicio.
 */
export function validarSemantica(artefacto: Artefacto, esquema: EsquemaProveedor): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const agregar = (ruta: string, regla: string, mensaje: string) => errores.push({ capa: "C2", ruta, regla, mensaje });

  // Identificadores únicos
  const tipoPorId = new Map<string, string>();
  artefacto.recursos.forEach((r, i) => {
    if (tipoPorId.has(r.id)) agregar(`/recursos/${i}/id`, "id-duplicado", `el identificador "${r.id}" ya se usó en otro recurso`);
    else tipoPorId.set(r.id, r.tipo);
  });

  artefacto.recursos.forEach((recurso, i) => {
    const base = `/recursos/${i}`;
    const esquemaRecurso = esquema.recursos[recurso.tipo];

    if (!esquemaRecurso) {
      const parecidos = sugerir(recurso.tipo, Object.keys(esquema.recursos));
      agregar(
        `${base}/tipo`,
        "tipo-inexistente",
        `"${recurso.tipo}" no existe en el proveedor AWS ${esquema.version}` +
          (parecidos.length ? `; ¿quisiste decir ${parecidos.join(", ")}?` : ""),
      );
    } else {
      if (esquemaRecurso.deprecado) {
        agregar(`${base}/tipo`, "tipo-deprecado", `"${recurso.tipo}" está deprecado en el proveedor AWS ${esquema.version}; usa otro servicio`);
      }
      revisarBloque(recurso.atributos, esquemaRecurso, `${base}/atributos`, recurso.tipo, agregar);
    }

    // Interpolaciones escritas a mano en lugar de ${ref:...}
    revisarInterpolaciones(recurso.atributos, `${base}/atributos`, agregar);

    // Referencias a otros recursos
    for (const ref of buscarReferencias(recurso.atributos, `${base}/atributos`)) {
      const tipoDestino = tipoPorId.get(ref.id);
      if (!tipoDestino) {
        agregar(ref.ruta, "referencia-rota", `se referencia al recurso "${ref.id}", que no está declarado`);
        continue;
      }
      const destino = esquema.recursos[tipoDestino];
      if (destino && !(ref.atributo in destino.atributos)) {
        const parecidos = sugerir(ref.atributo, Object.keys(destino.atributos));
        agregar(
          ref.ruta,
          "atributo-referenciado-inexistente",
          `"${tipoDestino}" no tiene el atributo "${ref.atributo}"` + (parecidos.length ? `; ¿quisiste decir ${parecidos.join(", ")}?` : ""),
        );
      }
    }

    recurso.depende_de?.forEach((id, j) => {
      if (!tipoPorId.has(id)) agregar(`${base}/depende_de/${j}`, "dependencia-rota", `depende de "${id}", que no está declarado`);
    });
  });

  artefacto.relaciones.forEach((rel, i) => {
    for (const lado of ["origen", "destino"] as const) {
      if (!tipoPorId.has(rel[lado])) {
        agregar(`/relaciones/${i}/${lado}`, "relacion-rota", `la relación apunta a "${rel[lado]}", que no está declarado`);
      }
    }
  });

  const ciclo = buscarCiclo(artefacto);
  if (ciclo) agregar("/recursos", "dependencia-circular", `dependencia circular: ${ciclo.join(" -> ")}`);

  return { valido: errores.length === 0, errores };
}

type Agregar = (ruta: string, regla: string, mensaje: string) => void;

function revisarBloque(valores: Record<string, unknown>, bloque: BloqueEsquema, ruta: string, tipo: string, agregar: Agregar): void {
  for (const [nombre, valor] of Object.entries(valores)) {
    const rutaCampo = `${ruta}/${escaparPuntero(nombre)}`;
    const atributo = bloque.atributos[nombre];
    const anidado = bloque.bloques[nombre];

    if (atributo) {
      if (atributo.deprecado) agregar(rutaCampo, "atributo-deprecado", `"${nombre}" está deprecado en ${tipo}`);
      if (esSoloLectura(atributo)) agregar(rutaCampo, "atributo-solo-lectura", `"${nombre}" lo calcula el proveedor y no se puede asignar`);
    } else if (anidado) {
      if (anidado.deprecado) {
        agregar(rutaCampo, "atributo-deprecado", `el bloque "${nombre}" está deprecado en ${tipo}; en las versiones actuales se configura con un recurso aparte`);
      }
      const elementos = Array.isArray(valor) ? valor : [valor];
      elementos.forEach((elemento, k) => {
        const rutaElemento = Array.isArray(valor) ? `${rutaCampo}/${k}` : rutaCampo;
        if (elemento && typeof elemento === "object" && !Array.isArray(elemento)) {
          revisarBloque(elemento as Record<string, unknown>, anidado, rutaElemento, tipo, agregar);
        } else {
          agregar(rutaElemento, "bloque-mal-formado", `"${nombre}" es un bloque y debe escribirse como objeto o lista de objetos`);
        }
      });
    } else {
      const parecidos = sugerir(nombre, [...Object.keys(bloque.atributos), ...Object.keys(bloque.bloques)]);
      agregar(
        rutaCampo,
        "atributo-inexistente",
        `"${nombre}" no existe en ${tipo}` + (parecidos.length ? `; ¿quisiste decir ${parecidos.join(", ")}?` : ""),
      );
    }
  }

  const faltantes = Object.entries(bloque.atributos)
    .filter(([nombre, a]) => a.requerido && !(nombre in valores))
    .map(([nombre]) => nombre);
  const bloquesFaltantes = Object.entries(bloque.bloques)
    .filter(([nombre, b]) => (b.min ?? 0) > 0 && !(nombre in valores))
    .map(([nombre]) => nombre);
  if (faltantes.length || bloquesFaltantes.length) {
    agregar(ruta, "atributo-requerido-faltante", `faltan campos obligatorios en ${tipo}: ${[...faltantes, ...bloquesFaltantes].join(", ")}`);
  }
}

function revisarInterpolaciones(valor: unknown, ruta: string, agregar: Agregar): void {
  if (typeof valor === "string") {
    for (const m of valor.matchAll(/\$\{(?!ref:)/g)) {
      agregar(ruta, "interpolacion-no-permitida", `usa \${ref:id_recurso.atributo} para referirte a otro recurso, no sintaxis de OpenTofu ("${valor.slice(m.index, m.index + 40)}")`);
      return;
    }
  } else if (Array.isArray(valor)) valor.forEach((v, i) => revisarInterpolaciones(v, `${ruta}/${i}`, agregar));
  else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) revisarInterpolaciones(v, `${ruta}/${escaparPuntero(k)}`, agregar);
  }
}

/** Busca un ciclo en el grafo de dependencias (referencias + depende_de). Devuelve el camino o null. */
function buscarCiclo(artefacto: Artefacto): string[] | null {
  const aristas = new Map<string, Set<string>>();
  for (const r of artefacto.recursos) {
    const destinos = new Set<string>([...buscarReferencias(r.atributos, "").map((x) => x.id), ...(r.depende_de ?? [])]);
    destinos.delete(r.id);
    aristas.set(r.id, destinos);
  }
  const estado = new Map<string, "visitando" | "listo">();
  const pila: string[] = [];

  const visitar = (id: string): string[] | null => {
    estado.set(id, "visitando");
    pila.push(id);
    for (const siguiente of aristas.get(id) ?? []) {
      if (!aristas.has(siguiente)) continue;
      if (estado.get(siguiente) === "visitando") return [...pila.slice(pila.indexOf(siguiente)), siguiente];
      if (!estado.has(siguiente)) {
        const ciclo = visitar(siguiente);
        if (ciclo) return ciclo;
      }
    }
    pila.pop();
    estado.set(id, "listo");
    return null;
  };

  for (const id of aristas.keys()) {
    if (!estado.has(id)) {
      const ciclo = visitar(id);
      if (ciclo) return ciclo;
    }
  }
  return null;
}
