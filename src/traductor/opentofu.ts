import { PATRON_REFERENCIA, type Artefacto } from "../artefacto/tipos.js";
import type { BloqueEsquema, EsquemaProveedor } from "../proveedor/esquema.js";

export interface OpcionesTraduccion {
  /** URL del emulador de AWS. */
  endpoint: string;
  region: string;
  /** Versión exacta del proveedor AWS (versiones.json). */
  versionProveedor: string;
}

/** Nombre del paquete Lambda mínimo que se copia junto a main.tf.json. */
export const ZIP_LAMBDA = "lambda_minima.zip";

/**
 * Servicios que se redirigen al emulador. Cubre los casos C01-C12, IaC-Eval y los
 * proyectos grandes; un servicio que no esté aquí iría a AWS real y fallaría por credenciales.
 */
const SERVICIOS = [
  "acm", "apigateway", "apigatewayv2", "autoscaling", "cloudformation", "cloudfront", "cloudwatch",
  "cloudwatchlogs", "cognitoidentity", "cognitoidp", "dynamodb", "ec2", "ecr", "ecs", "efs", "eks",
  "elasticache", "elb", "elbv2", "events", "firehose", "iam", "kinesis", "kms", "lambda", "rds",
  "route53", "s3", "s3control", "scheduler", "secretsmanager", "sfn", "sns", "sqs", "ssm", "sts",
];

// Tipos de valor del main.tf.json. Se dejan abiertos porque los atributos dependen del recurso.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface ResultadoTraduccion {
  /** Contenido de main.tf.json. */
  codigo: Json;
  /** Archivos que deben copiarse junto a main.tf.json (por ahora, el paquete Lambda). */
  archivosAuxiliares: string[];
}

/**
 * Bloques terraform y provider: el proveedor AWS fijado, apuntado al emulador con
 * credenciales de prueba. Lo usan igual la herramienta y la generación directa (B0, B1).
 */
export function configuracionProveedor(opciones: OpcionesTraduccion) {
  return {
    terraform: {
      required_providers: { aws: { source: "hashicorp/aws", version: opciones.versionProveedor } },
    },
    provider: {
      aws: {
        region: opciones.region,
        access_key: "test",
        secret_key: "test",
        skip_credentials_validation: true,
        // Igual que la guía oficial de Floci: sin esto el proveedor usa S3 Control con la
        // cuenta como subdominio (000000000000.localhost), que no resuelve en local.
        skip_requesting_account_id: true,
        skip_metadata_api_check: true,
        s3_use_path_style: true,
        endpoints: Object.fromEntries(SERVICIOS.map((s) => [s, opciones.endpoint])),
        default_tags: { tags: { proyecto: "agente-iac-intermedio" } },
      },
    },
  };
}

/**
 * Traduce el artefacto intermedio a OpenTofu en formato JSON. Es determinista: no usa
 * el modelo, así que el código y el diagrama salen del mismo objeto validado.
 */
export function traducir(artefacto: Artefacto, esquema: EsquemaProveedor, opciones: OpcionesTraduccion): ResultadoTraduccion {
  const tipoPorId = new Map(artefacto.recursos.map((r) => [r.id, r.tipo]));

  const convertirTexto = (texto: string): string =>
    texto
      // Escapa lo que OpenTofu interpretaría como plantilla y no sea una referencia del artefacto.
      .replaceAll("%{", "%%{")
      // En el texto de reemplazo "$$" vale un "$", así que "$$$${" escribe "$${".
      .replace(/\$\{(?!ref:)/g, "$$$${")
      .replace(PATRON_REFERENCIA, (_, id: string, atributo: string) => `\${${tipoPorId.get(id) ?? "desconocido"}.${id}.${atributo}}`);

  const convertirValor = (valor: Json): Json => {
    if (typeof valor === "string") return convertirTexto(valor);
    if (Array.isArray(valor)) return valor.map(convertirValor);
    if (valor && typeof valor === "object") {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, convertirValor(v)]));
    }
    return valor;
  };

  // En JSON, `route`, `ingress` o `egress` son atributos con objetos que exigen todas sus claves,
  // mientras que en HCL se escriben como bloques y las claves omitidas valen null.
  const completarObjetos = (valor: Json, tipo: unknown): Json => {
    if (!Array.isArray(tipo)) return valor;
    const [forma, interno] = tipo;
    if ((forma === "list" || forma === "set") && Array.isArray(valor)) {
      return valor.map((v) => completarObjetos(v, interno));
    }
    if (forma === "object" && valor && typeof valor === "object" && !Array.isArray(valor)) {
      const salida: Record<string, Json> = { ...valor };
      for (const [clave, tipoClave] of Object.entries(interno as Record<string, unknown>)) {
        salida[clave] = clave in valor ? completarObjetos(valor[clave], tipoClave) : null;
      }
      return salida;
    }
    return valor;
  };

  const convertirBloque = (valores: Record<string, Json>, bloque: BloqueEsquema | undefined): Record<string, Json> => {
    const salida: Record<string, Json> = {};
    for (const [nombre, valor] of Object.entries(valores)) {
      const atributo = bloque?.atributos[nombre];
      const anidado = bloque?.bloques[nombre];
      if (atributo?.tipo === "string" && valor !== null && typeof valor === "object") {
        // Documentos JSON (políticas IAM, redrive_policy...): el proveedor espera texto.
        salida[nombre] = JSON.stringify(convertirValor(valor));
      } else if (anidado && valor !== null && typeof valor === "object") {
        salida[nombre] = Array.isArray(valor)
          ? valor.map((v) => (v && typeof v === "object" ? convertirBloque(v, anidado) : convertirValor(v)))
          : convertirBloque(valor, anidado);
      } else {
        salida[nombre] = completarObjetos(convertirValor(valor), atributo?.tipo);
      }
    }
    return salida;
  };

  const recursos: Record<string, Record<string, Json>> = {};
  const auxiliares = new Set<string>();

  for (const r of artefacto.recursos) {
    const cuerpo = convertirBloque(r.atributos, esquema.recursos[r.tipo]);
    if (r.tipo === "aws_lambda_function" && !("filename" in cuerpo || "s3_bucket" in cuerpo || "image_uri" in cuerpo)) {
      cuerpo.filename = ZIP_LAMBDA;
      cuerpo.source_code_hash = `\${filebase64sha256("${ZIP_LAMBDA}")}`;
      auxiliares.add(ZIP_LAMBDA);
    }
    if (r.depende_de?.length) {
      cuerpo.depends_on = r.depende_de.map((id) => `${tipoPorId.get(id) ?? "desconocido"}.${id}`);
    }
    (recursos[r.tipo] ??= {})[r.id] = cuerpo;
  }

  const codigo = { ...configuracionProveedor(opciones), resource: recursos };

  return { codigo, archivosAuxiliares: [...auxiliares] };
}
