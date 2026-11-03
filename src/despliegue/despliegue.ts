import { existsSync } from "node:fs";
import { join } from "node:path";
import { ejecutarTofu as tofu } from "../tofu.js";
import { erroresDePlan, falloSinDetalle, leerJson } from "../validador/c4-opentofu.js";
import type { ErrorValidacion } from "../validador/tipos.js";

interface CambioPlan {
  address: string;
  type?: string;
  change: { actions: string[]; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; after_unknown?: unknown };
}

export interface CambioRecurso {
  direccion: string;
  atributos: string[];
}

/**
 * Diferencias que no son reales sino de representación entre el proveedor y el emulador.
 * Documentadas en prueba-minima/README.md. Se aplican igual a todas las configuraciones.
 */
function esCosmetico(tipo: string | undefined, atributo: string, antes: unknown, despues: unknown): boolean {
  // Con skip_requesting_account_id el proveedor no conoce la cuenta y el emulador devuelve
  // el ID del grupo con la cuenta delante: "000000000000/sg-123" frente a "sg-123".
  if (atributo === "referenced_security_group_id") {
    return typeof antes === "string" && typeof despues === "string" && antes.replace(/^\d{12}\//, "") === despues.replace(/^\d{12}\//, "");
  }
  // Floci 2.4.0 informa toda política de autoescalado como desactivada y con cooldown de
  // 300 s, aunque se haya creado activa y sin cooldown (P2).
  if (tipo === "aws_autoscaling_policy") {
    if (atributo === "enabled") return antes === false && despues === true;
    if (atributo === "cooldown") return typeof antes === "number" && despues === null;
  }
  // Floci 2.4.0 no guarda los parámetros de un grupo de parámetros de RDS (P2).
  if (tipo === "aws_db_parameter_group" && atributo === "parameter") {
    return Array.isArray(antes) && antes.length === 0 && Array.isArray(despues) && despues.length > 0;
  }
  return false;
}

/** Separa los cambios pendientes del plan posterior al apply en reales y cosméticos. */
export function clasificarCambios(plan: { resource_changes?: CambioPlan[] }): { reales: CambioRecurso[]; cosmeticos: CambioRecurso[] } {
  const reales: CambioRecurso[] = [];
  const cosmeticos: CambioRecurso[] = [];
  for (const c of plan.resource_changes ?? []) {
    const acciones = c.change.actions;
    if (acciones.length === 1 && (acciones[0] === "no-op" || acciones[0] === "read")) continue;
    if (!(acciones.length === 1 && acciones[0] === "update")) {
      reales.push({ direccion: c.address, atributos: [`(${acciones.join("+")})`] });
      continue;
    }
    const antes = c.change.before ?? {};
    const despues = c.change.after ?? {};
    const distintos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
      (k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]),
    );
    const reals = distintos.filter((k) => !esCosmetico(c.type, k, antes[k], despues[k]));
    const cosms = distintos.filter((k) => esCosmetico(c.type, k, antes[k], despues[k]));
    if (reals.length) reales.push({ direccion: c.address, atributos: reals });
    else if (cosms.length) cosmeticos.push({ direccion: c.address, atributos: cosms });
    else reales.push({ direccion: c.address, atributos: ["(update)"] });
  }
  return { reales, cosmeticos };
}


export interface ResultadoDespliegue {
  /** El apply terminó sin errores. */
  aplicado: boolean;
  errores: ErrorValidacion[];
  /** El plan posterior no tiene cambios reales pendientes (M1 exige aplicado && sinCambios). */
  sinCambios: boolean;
  cambiosPendientes: CambioRecurso[];
  cosmeticosIgnorados: CambioRecurso[];
  /** Plan posterior en JSON (incluye la configuración, con las referencias entre recursos). */
  planPosterior?: unknown;
  /** Estado después del apply (`tofu show -json`): valores reales de lo desplegado. */
  estado?: unknown;
}

/**
 * Despliega en el emulador el código de `dir` y comprueba con un segundo plan que lo
 * desplegado coincide con lo declarado. Usa el plan de C4 si existe (plan.tfplan).
 */
export async function desplegar(dir: string): Promise<ResultadoDespliegue> {
  const vacio = { sinCambios: false, cambiosPendientes: [], cosmeticosIgnorados: [] };
  if (!existsSync(join(dir, ".terraform"))) {
    const init = await tofu(["init", "-input=false", "-no-color"], dir);
    if (init.codigo !== 0) {
      return { ...vacio, aplicado: false, errores: [{ capa: "C4", ruta: "/", regla: "tofu-init", mensaje: (init.error || init.salida).slice(0, 500) }] };
    }
  }

  const usarPlan = existsSync(join(dir, "plan.tfplan"));
  const apply = await tofu(usarPlan ? ["apply", "-json", "-input=false", "-no-color", "plan.tfplan"] : ["apply", "-json", "-auto-approve", "-input=false", "-no-color"], dir);
  const errores = erroresDePlan(apply.salida).map((e) => ({ ...e, regla: "tofu-apply" }));
  if (apply.codigo !== 0 || errores.length) {
    const lista = errores.length ? errores : [{ capa: "C4" as const, ruta: "/", regla: "tofu-apply", mensaje: (apply.error || "el apply falló sin detalle").slice(0, 500) }];
    return { ...vacio, aplicado: false, errores: lista };
  }

  const plan = await tofu(["plan", "-input=false", "-no-color", "-out=posterior.tfplan"], dir);
  if (plan.codigo !== 0) {
    return { ...vacio, aplicado: true, errores: [{ capa: "C4", ruta: "/", regla: "plan-posterior", mensaje: (plan.error || plan.salida).slice(0, 500) }] };
  }
  const mostrarPlan = await tofu(["show", "-json", "posterior.tfplan"], dir);
  const planPosterior = leerJson(mostrarPlan.salida);
  const mostrarEstado = await tofu(["show", "-json"], dir);
  const estado = leerJson(mostrarEstado.salida);
  // Si no se pudo leer el plan o el estado, lo aplicado queda en el emulador (hay que
  // destruirlo), pero no se puede afirmar que no haya cambios pendientes.
  if (planPosterior === undefined || estado === undefined) {
    const fallo = planPosterior === undefined ? mostrarPlan : mostrarEstado;
    return { ...vacio, aplicado: true, errores: [falloSinDetalle("tofu-show", fallo)] };
  }
  const { reales, cosmeticos } = clasificarCambios(planPosterior as Parameters<typeof clasificarCambios>[0]);
  return { aplicado: true, errores: [], sinCambios: reales.length === 0, cambiosPendientes: reales, cosmeticosIgnorados: cosmeticos, planPosterior, estado };
}

/** Destruye lo desplegado en `dir`, para dejar el emulador limpio. */
export async function destruir(dir: string): Promise<boolean> {
  if (!existsSync(join(dir, ".terraform"))) return true;
  return (await tofu(["destroy", "-auto-approve", "-input=false", "-no-color"], dir)).codigo === 0;
}
