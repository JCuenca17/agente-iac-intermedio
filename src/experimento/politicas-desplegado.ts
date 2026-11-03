import { spawnSync } from "node:child_process";
import { enRaiz } from "../rutas.js";

export interface Violacion {
  regla: string;
  recurso: string;
}

const DIR = enRaiz("politicas", "desplegado");

/**
 * M3: violaciones de las políticas de seguridad en lo desplegado (estado después del
 * apply, `tofu show -json`). Mismas reglas que la capa C3, igual para todas las configuraciones.
 */
export function violacionesDesplegado(estado: unknown): Violacion[] {
  const r = spawnSync("opa", ["eval", "--stdin-input", "--format", "json", "-d", DIR, "data.desplegado.politicas.deny"], {
    input: JSON.stringify(estado ?? {}),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new Error(`No se pudo ejecutar opa: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`opa eval falló:\n${r.stderr || r.stdout}`);
  const lista: Violacion[] = JSON.parse(r.stdout).result?.[0]?.expressions?.[0]?.value ?? [];
  return lista.sort((a, b) => a.recurso.localeCompare(b.recurso) || a.regla.localeCompare(b.regla));
}
