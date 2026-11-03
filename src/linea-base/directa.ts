import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { problemaRespuesta } from "../agente/agente.js";
import { REQUISITOS_SEGURIDAD } from "../agente/prompt.js";
import type { MensajeModelo, ProveedorModelo, UsoTokens } from "../modelo/tipos.js";
import { enRaiz } from "../rutas.js";
import { configuracionProveedor, ZIP_LAMBDA } from "../traductor/opentofu.js";
import type { Registro } from "../trazas/registro.js";
import { validarConOpenTofu, type ResultadoC4, type ResumenPlan } from "../validador/c4-opentofu.js";
import { revisarHcl } from "../validador/seguridad-codigo.js";
import type { ErrorValidacion } from "../validador/tipos.js";

/** Prompt de la generación directa: el modelo escribe OpenTofu sin artefacto intermedio. */
export function construirSistemaDirecto(versionProveedor: string): string {
  return `Eres un ingeniero de infraestructura en AWS. A partir de un requerimiento en lenguaje natural escribes la configuración de OpenTofu (lenguaje HCL) que lo implementa.

## Reglas

- Usa el proveedor AWS de OpenTofu, versión ${versionProveedor}, con la forma vigente de esa versión y sin atributos ni bloques deprecados.
- Escribe solo bloques "resource" (y "data" si los necesitas). No escribas los bloques "terraform" ni "provider": la herramienta ya configura el proveedor, la región y las credenciales.
- Para el código de las funciones Lambda usa filename = "${ZIP_LAMBDA}" y source_code_hash = filebase64sha256("${ZIP_LAMBDA}"); ese paquete ya existe.
- Responde solo con la configuración dentro de un bloque \`\`\`hcl, sin explicaciones.

## Requisitos de seguridad del proyecto

${REQUISITOS_SEGURIDAD}`;
}

/**
 * Extrae el código HCL de la respuesta: todos los bloques ```hcl, ```terraform o ```tf
 * (el modelo a veces parte la configuración en varios), o el texto completo si no hay bloques.
 */
export function extraerCodigo(texto: string): string {
  const bloques = [...texto.matchAll(/```(?:hcl|terraform|tf)?[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  return (bloques.length ? bloques.join("\n\n") : texto.trim()) + "\n";
}

export interface OpcionesDirecta {
  proveedor: ProveedorModelo;
  endpoint: string;
  region: string;
  versionProveedor: string;
  dirTrabajo: string;
  registro: Registro;
  /** B1: retroalimenta los errores de tofu validate/plan. B0: un solo intento sin validar. */
  conRetroalimentacion: boolean;
  maxIteraciones: number;
  limiteGastoUsd: number;
  /** Para pruebas: reemplaza tofu validate + plan. */
  validar?: (dir: string) => Promise<ResultadoC4>;
}

export interface ResultadoDirecta {
  listo: boolean;
  motivo: "valido" | "sin-validacion" | "iteraciones-agotadas" | "limite-gasto" | "construccion-no-permitida";
  iteraciones: number;
  dirFinal?: string;
  plan?: unknown;
  resumenPlan?: ResumenPlan;
  erroresPorIteracion: ErrorValidacion[][];
  uso: UsoTokens;
  costoUsd: number;
  llamadas: number;
}

/** Escribe el código del modelo junto a la configuración del proveedor (igual que la herramienta). */
function prepararDirecto(dir: string, codigo: string, o: OpcionesDirecta): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "main.tf"), codigo);
  writeFileSync(join(dir, "proveedor.tf.json"), JSON.stringify(configuracionProveedor(o), null, 2));
  copyFileSync(enRaiz("prueba-minima", ".terraform.lock.hcl"), join(dir, ".terraform.lock.hcl"));
  copyFileSync(enRaiz("recursos", "lambda", "minima.zip"), join(dir, ZIP_LAMBDA));
}

/**
 * Línea base: generación directa de OpenTofu, sin artefacto intermedio, sin capas C1-C3
 * y sin RAG. B0 entrega el primer intento sin validar; B1 itera con los errores de
 * tofu validate y tofu plan, como hace la mayoría de los estudios de la revisión.
 */
export async function ejecutarDirecta(requerimiento: string, o: OpcionesDirecta): Promise<ResultadoDirecta> {
  const sistema = construirSistemaDirecto(o.versionProveedor);
  const mensajes: MensajeModelo[] = [{ rol: "usuario", texto: `Requerimiento:\n\n${requerimiento}` }];
  const uso: UsoTokens = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
  const erroresPorIteracion: ErrorValidacion[][] = [];
  let costoUsd = 0;
  let llamadas = 0;
  const base = () => ({ uso, costoUsd, llamadas, erroresPorIteracion });
  const maxIteraciones = o.conRetroalimentacion ? o.maxIteraciones : 1;
  o.registro.anotar("ciclo-inicio", { configuracion: o.conRetroalimentacion ? "B1" : "B0", proveedor: o.proveedor.nombre });

  for (let iteracion = 1; iteracion <= maxIteraciones; iteracion++) {
    const r = await o.registro.medir("generacion", () => o.proveedor.completar(sistema, mensajes), { iteracion });
    llamadas++;
    costoUsd += r.costoUsd;
    uso.entrada += r.uso.entrada;
    uso.salida += r.uso.salida;
    uso.cacheEscritura += r.uso.cacheEscritura;
    uso.cacheLectura += r.uso.cacheLectura;
    o.registro.anotar("llamada", { iteracion, modelo: r.modelo, modeloExacto: r.modeloExacto, uso: r.uso, costoUsd: r.costoUsd, duracionMs: r.duracionMs, motivoParada: r.motivoParada });
    mensajes.push({ rol: "asistente", texto: r.texto.trim() ? r.texto : "(respuesta vacía)" });

    const dir = join(o.dirTrabajo, `iter-${iteracion}`);
    const codigo = extraerCodigo(r.texto);
    const problema = problemaRespuesta(r);
    // Lo que no puede llegar a OpenTofu (provisioners, otros proveedores...) se revisa antes
    // de escribir nada; en B0 la corrida termina, en B1 se devuelve como error.
    const previos: ErrorValidacion[] = problema
      ? [{ capa: "C0", ruta: "/", regla: "formato-respuesta", mensaje: problema }]
      : revisarHcl(codigo);
    if (!previos.length) prepararDirecto(dir, codigo, o);

    if (!o.conRetroalimentacion) {
      erroresPorIteracion.push(previos);
      if (previos.length) {
        const motivo = problema ? "iteraciones-agotadas" : "construccion-no-permitida";
        o.registro.anotar("ciclo-fin", { motivo, iteraciones: 1, costoUsd });
        return { ...base(), listo: false, motivo, iteraciones: 1 };
      }
      o.registro.anotar("ciclo-fin", { motivo: "sin-validacion", iteraciones: 1, costoUsd });
      return { ...base(), listo: true, motivo: "sin-validacion", iteraciones: 1, dirFinal: dir };
    }

    const c4: ResultadoC4 = previos.length
      ? { valido: false, errores: previos }
      : await o.registro.medir("C4", () => (o.validar ?? validarConOpenTofu)(dir), { iteracion });
    o.registro.anotar("validacion", { iteracion, capa: problema ? "C0" : "C4", valido: c4.valido, errores: c4.errores.length, reglas: [...new Set(c4.errores.map((e) => e.regla))] });
    erroresPorIteracion.push(c4.errores);
    if (c4.valido) {
      o.registro.anotar("ciclo-fin", { motivo: "valido", iteraciones: iteracion, costoUsd });
      return { ...base(), listo: true, motivo: "valido", iteraciones: iteracion, dirFinal: dir, plan: c4.plan, resumenPlan: c4.resumen };
    }
    if (costoUsd > o.limiteGastoUsd) {
      o.registro.anotar("ciclo-fin", { motivo: "limite-gasto", iteraciones: iteracion, costoUsd });
      return { ...base(), listo: false, motivo: "limite-gasto", iteraciones: iteracion };
    }
    const lista = c4.errores.map((e) => `- ${e.ruta} (${e.regla}): ${e.mensaje}`).join("\n");
    mensajes.push({ rol: "usuario", texto: `La configuración no pasó la validación. Errores:\n\n${lista}\n\nCorrige todos los errores y entrega otra vez la configuración completa.` });
  }

  o.registro.anotar("ciclo-fin", { motivo: "iteraciones-agotadas", iteraciones: maxIteraciones, costoUsd });
  return { ...base(), listo: false, motivo: "iteraciones-agotadas", iteraciones: maxIteraciones };
}
