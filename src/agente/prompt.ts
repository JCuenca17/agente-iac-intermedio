import { readFileSync } from "node:fs";
import { enRaiz } from "../rutas.js";
import type { ErrorValidacion } from "../validador/tipos.js";

const ESQUEMA = readFileSync(enRaiz("esquema", "artefacto.schema.json"), "utf8");

/**
 * Requisitos de seguridad del proyecto. Son los mismos que verifica la capa C3 y se dan
 * igual en la generación directa (B0, B1), para que la comparación sea justa.
 */
export const REQUISITOS_SEGURIDAD = `- Buckets S3: bloqueo de acceso público completo y cifrado del lado del servidor.
- Colas SQS: cifradas (sqs_managed_sse_enabled o una clave KMS).
- Políticas IAM: solo las acciones necesarias; nunca "*" ni "servicio:*" en las acciones.
- Grupos de seguridad: hacia internet (0.0.0.0/0) solo los puertos 80 y 443.
- Tablas DynamoDB: recuperación ante borrado (point_in_time_recovery) activada.
- Grupos de logs de CloudWatch: retención definida (retention_in_days).
- Bases de datos RDS: almacenamiento cifrado y sin acceso público.`;

export interface OpcionesPrompt {
  conRag: boolean;
  versionProveedor: string;
}

/** Prompt de sistema del agente que genera el artefacto intermedio. */
export function construirSistema({ conRag, versionProveedor }: OpcionesPrompt): string {
  const acciones = conRag
    ? `Tienes dos acciones posibles y respondes siempre con un único objeto JSON, sin texto fuera de él:

1. Consultar el esquema vigente del proveedor para ciertos tipos de recurso (máximo 10 tipos por consulta):
   {"accion": "consultar_esquema", "tipos": ["aws_sqs_queue", "aws_lambda_function"]}
   Recibirás los campos asignables, los obligatorios y los deprecados de cada tipo. Úsala cuando no estés seguro del nombre de un atributo o de si un bloque sigue vigente.

2. Entregar el artefacto:
   {"accion": "entregar", "artefacto": { ... }}`
    : `Respondes siempre con un único objeto JSON, sin texto fuera de él:

   {"accion": "entregar", "artefacto": { ... }}`;

  return `Eres un arquitecto de infraestructura en AWS. A partir de un requerimiento en lenguaje natural diseñas la infraestructura como un artefacto intermedio en JSON. De ese artefacto se generan automáticamente el diagrama de arquitectura para revisión humana y el código OpenTofu, así que el artefacto debe ser completo y exacto.

${acciones}

## Formato del artefacto (JSON Schema)

${ESQUEMA}

## Reglas

- Cada recurso usa un tipo real del proveedor AWS de OpenTofu, versión ${versionProveedor}, y en "atributos" van los argumentos con los mismos nombres que en OpenTofu. Los bloques anidados se escriben como objeto o lista de objetos.
- Usa la forma vigente de esa versión del proveedor y evita atributos o bloques deprecados.
- Para referirte a otro recurso dentro de un valor usa \${ref:id_recurso.atributo}, por ejemplo "\${ref:cola_fallidos.arn}". No escribas referencias con la sintaxis de OpenTofu.
- Los documentos JSON (políticas IAM, redrive_policy) se escriben como objetos, no como texto.
- No incluyas el código de las funciones Lambda (filename, source_code_hash): la herramienta agrega un paquete fijo.
- Declara en "relaciones" cómo se conectan los recursos (quién invoca, lee, escribe o notifica a quién) y en "supuestos" lo que decidiste porque el requerimiento no lo dice.
- No configures el proveedor, la región ni credenciales: los pone la herramienta.

## Requisitos de seguridad del proyecto

${REQUISITOS_SEGURIDAD}`;
}

/** Mensaje inicial con el requerimiento. */
export function mensajeRequerimiento(requerimiento: string): string {
  return `Requerimiento:\n\n${requerimiento}`;
}

/** Mensaje de retroalimentación con los errores de la validación (ciclo de corrección). */
export function mensajeRetroalimentacion(errores: ErrorValidacion[]): string {
  const lista = errores.map((e) => `- [${e.capa}] ${e.ruta} (${e.regla}): ${e.mensaje}`).join("\n");
  return `El artefacto que entregaste no pasó la validación. Errores encontrados:\n\n${lista}\n\nCorrige todos los errores y entrega otra vez el artefacto completo.`;
}
