import { readFileSync } from "node:fs";
import { Ajv, type ErrorObject } from "ajv";
import { enRaiz } from "../rutas.js";
import type { ErrorValidacion, ResultadoValidacion } from "./tipos.js";

const rutaEsquema = enRaiz("esquema", "artefacto.schema.json");
export const esquemaArtefacto = JSON.parse(readFileSync(rutaEsquema, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: true });
const validar = ajv.compile(esquemaArtefacto);

function traducir(e: ErrorObject): ErrorValidacion {
  const ruta = e.instancePath || "/";
  let mensaje: string;
  switch (e.keyword) {
    case "required":
      mensaje = `falta la propiedad obligatoria "${e.params.missingProperty}"`;
      break;
    case "additionalProperties":
      mensaje = `la propiedad "${e.params.additionalProperty}" no está definida en el esquema`;
      break;
    case "pattern":
      mensaje = `el valor no cumple el formato ${e.params.pattern}`;
      break;
    case "enum":
      mensaje = `valor no permitido; opciones: ${(e.params.allowedValues as string[]).join(", ")}`;
      break;
    case "const":
      mensaje = `el valor debe ser ${JSON.stringify(e.params.allowedValue)}`;
      break;
    case "type":
      mensaje = `se esperaba un valor de tipo ${e.params.type}`;
      break;
    default:
      mensaje = e.message ?? "valor inválido";
  }
  return { capa: "C1", ruta, regla: e.keyword, mensaje };
}

/** C1: comprueba que el artefacto cumpla el JSON Schema. No consulta nada externo. */
export function validarEstructura(artefacto: unknown): ResultadoValidacion {
  const valido = validar(artefacto) as boolean;
  const errores = valido ? [] : (validar.errors ?? []).map(traducir);
  return { valido, errores };
}
