import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { escaparPuntero, type Artefacto } from "../artefacto/tipos.js";
import { ZIP_LAMBDA, type ResultadoTraduccion } from "../traductor/opentofu.js";
import type { ErrorValidacion, ResultadoValidacion } from "./tipos.js";
import { enRaiz } from "../rutas.js";
import { ejecutarTofu as tofu } from "../tofu.js";

const LOCK = enRaiz("prueba-minima", ".terraform.lock.hcl");
const ZIP = enRaiz("recursos", "lambda", "minima.zip");

interface Diagnostico {
  severity: string;
  summary: string;
  detail?: string;
  address?: string;
  snippet?: { context?: string; code?: string };
}

export interface ResumenPlan {
  crear: number;
  cambiar: number;
  destruir: number;
}

export interface ResultadoC4 extends ResultadoValidacion {
  /** Plan en JSON (`tofu show -json`), para medir políticas y la intención de IaC-Eval. */
  plan?: unknown;
  resumen?: ResumenPlan;
}

/** Ubica un diagnóstico de OpenTofu dentro del artefacto (JSON Pointer). Sin artefacto, usa la dirección. */
function ruta(d: Diagnostico, artefacto?: Artefacto): string {
  // El contexto viene como "resource.tipo.nombre" en main.tf.json y como
  // 'resource "tipo" "nombre"' en archivos .tf (generación directa).
  const contexto = d.snippet?.context
    ?.replace(/^resource "([^"]+)" "([^"]+)".*$/, "$1.$2")
    .replace(/^resource\./, "");
  const direccion = d.address ?? contexto;
  if (!direccion) return "/";
  if (!artefacto) return direccion;
  const id = direccion.split(".")[1]?.replace(/\[.*$/, "");
  const indice = artefacto.recursos.findIndex((r) => r.id === id);
  if (indice < 0) return "/";
  const atributo = d.snippet?.code?.match(/^\s*"([^"]+)"\s*:/)?.[1];
  return `/recursos/${indice}` + (atributo ? `/atributos/${escaparPuntero(atributo)}` : "");
}

function aError(d: Diagnostico, regla: string, artefacto?: Artefacto): ErrorValidacion {
  const mensaje = d.detail ? `${d.summary}: ${d.detail}` : d.summary;
  return { capa: "C4", ruta: ruta(d, artefacto), regla, mensaje };
}

/** Errores de `tofu validate -json`. */
export function erroresDeValidate(salida: string, artefacto?: Artefacto): ErrorValidacion[] {
  let r: { diagnostics?: Diagnostico[] };
  try {
    r = JSON.parse(salida);
  } catch {
    return [];
  }
  return (r.diagnostics ?? []).filter((d) => d.severity === "error").map((d) => aError(d, "tofu-validate", artefacto));
}

function lineasJson(salida: string): Record<string, unknown>[] {
  return salida
    .split(/\r?\n/)
    .filter((l) => l.startsWith("{"))
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

/** Errores de `tofu plan -json` (una línea JSON por mensaje). */
export function erroresDePlan(salida: string, artefacto?: Artefacto): ErrorValidacion[] {
  return lineasJson(salida)
    .filter((m) => m.type === "diagnostic" && (m.diagnostic as Diagnostico)?.severity === "error")
    .map((m) => aError(m.diagnostic as Diagnostico, "tofu-plan", artefacto));
}

export function resumenDePlan(salida: string): ResumenPlan | undefined {
  const m = lineasJson(salida).find((x) => x.type === "change_summary");
  if (!m) return undefined;
  const c = m.changes as { add: number; change: number; remove: number };
  return { crear: c.add, cambiar: c.change, destruir: c.remove };
}


/** Escribe main.tf.json, el lock del proveedor fijado y los archivos auxiliares en `dir`. */
export function prepararDirectorio(dir: string, traduccion: ResultadoTraduccion): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "main.tf.json"), JSON.stringify(traduccion.codigo, null, 2));
  copyFileSync(LOCK, join(dir, ".terraform.lock.hcl"));
  if (traduccion.archivosAuxiliares.includes(ZIP_LAMBDA)) copyFileSync(ZIP, join(dir, ZIP_LAMBDA));
}

/**
 * C4: `tofu init`, `tofu validate` y `tofu plan` contra el emulador, sin crear nada.
 * Si todo sale bien, devuelve también el plan en JSON.
 */
export async function validarConOpenTofu(dir: string, artefacto?: Artefacto): Promise<ResultadoC4> {
  if (!existsSync(join(dir, ".terraform"))) {
    const init = await tofu(["init", "-input=false", "-no-color"], dir);
    if (init.codigo !== 0) {
      return { valido: false, errores: [{ capa: "C4", ruta: "/", regla: "tofu-init", mensaje: (init.error || init.salida).trim().slice(0, 500) }] };
    }
  }

  const validate = await tofu(["validate", "-json", "-no-color"], dir);
  const erroresValidate = erroresDeValidate(validate.salida, artefacto);
  if (erroresValidate.length) return { valido: false, errores: erroresValidate };
  if (validate.codigo !== 0) return { valido: false, errores: [falloSinDetalle("tofu-validate", validate)] };

  const plan = await tofu(["plan", "-json", "-input=false", "-no-color", "-out=plan.tfplan"], dir);
  const erroresPlan = erroresDePlan(plan.salida, artefacto);
  if (plan.codigo !== 0 || erroresPlan.length) {
    const errores = erroresPlan.length
      ? erroresPlan
      : [{ capa: "C4" as const, ruta: "/", regla: "tofu-plan", mensaje: (plan.error || "el plan falló sin detalle").trim().slice(0, 500) }];
    return { valido: false, errores };
  }

  const mostrar = await tofu(["show", "-json", "plan.tfplan"], dir);
  const planJson = leerJson(mostrar.salida);
  if (mostrar.codigo !== 0 || planJson === undefined) return { valido: false, errores: [falloSinDetalle("tofu-show", mostrar)] };
  return { valido: true, errores: [], plan: planJson, resumen: resumenDePlan(plan.salida) };
}

/** JSON de la salida de un comando, o undefined si no lo es. */
export function leerJson(salida: string): unknown {
  try {
    return JSON.parse(salida);
  } catch {
    return undefined;
  }
}

/** Error de un comando de OpenTofu que falló sin diagnósticos en JSON (por ejemplo, por tiempo límite). */
export function falloSinDetalle(regla: string, r: { codigo: number; salida: string; error: string }): ErrorValidacion {
  return { capa: "C4", ruta: "/", regla, mensaje: (r.error || r.salida || `código ${r.codigo}`).trim().slice(0, 500) };
}
