import type { ErrorValidacion } from "./tipos.js";

/**
 * Construcciones que no pueden llegar a OpenTofu (RNF-02). Un provisioner, un dato external
 * o http, un módulo remoto, un backend u otro proveedor podrían ejecutar comandos en la PC de
 * quien corre la herramienta o salir a la red, fuera del emulador. El modelo solo debe
 * escribir recursos y datos de AWS; la herramienta configura el proveedor.
 */
const REGLA = "construccion-no-permitida";

const error = (ruta: string, mensaje: string): ErrorValidacion => ({ capa: "C4", ruta, regla: REGLA, mensaje });

/** Revisa el HCL que escribe el modelo en la generación directa (B0 y B1). */
export function revisarHcl(hcl: string): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const lineas = hcl.split("\n");
  lineas.forEach((linea, i) => {
    const ruta = `/main.tf:${i + 1}`;
    const t = linea.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(resource|data)\s+"([^"]+)"/))) {
      const [, clase, tipo] = m;
      if (!tipo.startsWith("aws_")) errores.push(error(ruta, `solo se permiten ${clase === "resource" ? "recursos" : "datos"} de AWS (aws_*), no "${tipo}"`));
    } else if ((m = t.match(/^provisioner\s+"([^"]+)"/))) {
      errores.push(error(ruta, `no se permiten provisioners ("${m[1]}"): ejecutan comandos fuera del emulador`));
    } else if (/^(connection)\s*\{/.test(t)) {
      errores.push(error(ruta, "no se permiten bloques connection"));
    } else if ((m = t.match(/^(provider|module)\s+"([^"]+)"/))) {
      errores.push(error(ruta, `no se permiten bloques ${m[1]} ("${m[2]}"): la herramienta ya configura el proveedor`));
    } else if (/^terraform\s*\{/.test(t)) {
      errores.push(error(ruta, "no se permite el bloque terraform: la herramienta ya configura el proveedor y el estado"));
    }
  });
  return errores;
}

/** Revisa el código traducido (.tf.json) del artefacto antes de entregarlo a OpenTofu. */
export function revisarTfJson(codigo: { resource?: Record<string, Record<string, Record<string, unknown>>> }): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  for (const [tipo, instancias] of Object.entries(codigo.resource ?? {})) {
    if (!tipo.startsWith("aws_")) {
      errores.push(error(`/resource/${tipo}`, `solo se permiten recursos de AWS (aws_*), no "${tipo}"`));
      continue;
    }
    for (const [id, cuerpo] of Object.entries(instancias)) {
      for (const clave of ["provisioner", "connection"]) {
        if (cuerpo && typeof cuerpo === "object" && clave in cuerpo) {
          errores.push(error(`/resource/${tipo}/${id}/${clave}`, `no se permite "${clave}" en un recurso: ejecuta comandos fuera del emulador`));
        }
      }
    }
  }
  return errores;
}
