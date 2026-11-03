import { spawnSync } from "node:child_process";
import { enRaiz } from "../rutas.js";

export interface ResultadoIntencion {
  caso: string;
  requisitos: Record<string, string>;
  cumplidos: string[];
  faltantes: string[];
  /** M4: proporción de requisitos cumplidos (0 a 1). */
  proporcion: number;
}

const DIR_INTENCION = enRaiz("experimento");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/**
 * Entrada de M4 sobre lo desplegado: los valores reales del estado después del apply y la
 * configuración (con las referencias entre recursos) del plan posterior. Se mide así en
 * todas las configuraciones porque en el plan los valores que dependen de otros recursos,
 * como una política IAM con referencias, quedan desconocidos hasta aplicar.
 */
export function entradaDesplegada(estado: Json, planPosterior: Json): Json {
  return {
    planned_values: { root_module: estado?.values?.root_module ?? { resources: [] } },
    configuration: planPosterior?.configuration ?? { root_module: { resources: [] } },
  };
}

/**
 * M4: evalúa la lista de verificación de un caso (experimento/casos/CXX/intencion.rego)
 * sobre el plan en JSON. Sirve igual para la herramienta y para la generación directa.
 */
export function evaluarIntencion(caso: string, plan: unknown): ResultadoIntencion {
  const paquete = `data.intencion.${caso.toLowerCase()}`;
  const consulta = `x := {"requisitos": ${paquete}.requisitos, "cumplidos": [k | some k in ${paquete}.cumple]}`;
  const r = spawnSync("opa", ["eval", "--stdin-input", "--format", "json", "-d", DIR_INTENCION, consulta], {
    input: JSON.stringify(plan),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new Error(`No se pudo ejecutar opa: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`opa eval falló:\n${r.stderr || r.stdout}`);
  const x = JSON.parse(r.stdout).result?.[0]?.bindings?.x;
  if (!x) throw new Error(`No existe la lista de verificación del caso ${caso}`);

  const requisitos = x.requisitos as Record<string, string>;
  const cumplidos = (x.cumplidos as string[]).filter((k) => k in requisitos).sort();
  const faltantes = Object.keys(requisitos).filter((k) => !cumplidos.includes(k)).sort();
  return { caso, requisitos, cumplidos, faltantes, proporcion: cumplidos.length / Object.keys(requisitos).length };
}
