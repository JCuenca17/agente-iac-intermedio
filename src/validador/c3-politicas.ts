import { spawnSync } from "node:child_process";
import { enRaiz } from "../rutas.js";
import type { ErrorValidacion, ResultadoValidacion } from "./tipos.js";

const DIR_POLITICAS = enRaiz("politicas", "artefacto");
const CONSULTA = "data.artefacto.politicas.deny";

interface Violacion {
  regla: string;
  ruta: string;
  mensaje: string;
}

/**
 * C3: evalúa las políticas de seguridad (OPA/Rego) sobre el artefacto intermedio.
 * Requiere el binario `opa` en el PATH. Es determinista y local.
 */
export function validarPoliticas(artefacto: unknown, dirPoliticas = DIR_POLITICAS): ResultadoValidacion {
  const r = spawnSync("opa", ["eval", "--stdin-input", "--format", "json", "-d", dirPoliticas, CONSULTA], {
    input: JSON.stringify(artefacto),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`No se pudo ejecutar opa: ${r.error.message}. Revisa la instalación con npm run doctor`);
  if (r.status !== 0) throw new Error(`opa eval falló:\n${r.stderr || r.stdout}`);

  const salida = JSON.parse(r.stdout);
  const violaciones: Violacion[] = salida.result?.[0]?.expressions?.[0]?.value ?? [];
  const errores: ErrorValidacion[] = violaciones
    .map((v) => ({ capa: "C3" as const, ruta: v.ruta, regla: v.regla, mensaje: v.mensaje }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta, "en", { numeric: true }) || a.regla.localeCompare(b.regla));
  return { valido: errores.length === 0, errores };
}
