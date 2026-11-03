import type { Artefacto, Recurso, TipoRelacion } from "../artefacto/tipos.js";

/** Nombre legible del servicio a partir del tipo del recurso (aws_sqs_queue -> SQS). */
const SERVICIOS: [prefijo: string, nombre: string][] = [
  ["aws_apigatewayv2_", "API Gateway"],
  ["aws_api_gateway_", "API Gateway"],
  ["aws_cloudwatch_event_", "EventBridge"],
  ["aws_cloudwatch_log_", "CloudWatch Logs"],
  ["aws_cloudwatch_", "CloudWatch"],
  ["aws_dynamodb_", "DynamoDB"],
  ["aws_lambda_", "Lambda"],
  ["aws_s3_", "S3"],
  ["aws_sqs_", "SQS"],
  ["aws_sns_", "SNS"],
  ["aws_iam_", "IAM"],
  ["aws_db_", "RDS"],
  ["aws_rds_", "RDS"],
  ["aws_lb", "Balanceo de carga"],
  ["aws_autoscaling_", "Auto Scaling"],
  ["aws_launch_template", "Auto Scaling"],
  ["aws_kms_", "KMS"],
  ["aws_", "Red y otros"],
];

/** Recursos que se dibujan como almacenamiento (cilindro). */
const ALMACENAMIENTO = new Set(["aws_s3_bucket", "aws_dynamodb_table", "aws_db_instance", "aws_rds_cluster"]);

const ETIQUETAS: Record<TipoRelacion, string> = {
  invoca: "invoca",
  lee_de: "lee de",
  escribe_en: "escribe en",
  notifica_a: "notifica a",
  publica_en: "publica en",
  suscribe_a: "se suscribe a",
  asume_rol: "asume el rol",
  otorga_permiso: "otorga permiso a",
  contiene: "contiene",
  enruta_a: "enruta a",
  protege: "protege",
};

function servicio(tipo: string): string {
  return SERVICIOS.find(([prefijo]) => tipo.startsWith(prefijo))?.[1] ?? "Otros";
}

/** Mermaid no admite comillas dentro de una etiqueta entre comillas; se usan entidades. */
function escapar(valor: unknown): string {
  return String(valor ?? "").replaceAll('"', "#quot;").replaceAll("[", "#91;").replaceAll("]", "#93;");
}

function idSubgrafo(nombre: string): string {
  return "svc_" + nombre.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Id del nodo en Mermaid. Se antepone "r_" porque un recurso puede llamarse como una
 * palabra reservada de Mermaid (end, graph, subgraph, class...); el id real va en la etiqueta.
 */
const idNodo = (id: string) => `r_${id}`;

function nodo(r: Recurso): string {
  const etiqueta = `"<b>${escapar(r.id)}</b><br/><small>${escapar(r.tipo)}</small>"`;
  return ALMACENAMIENTO.has(r.tipo) ? `${idNodo(r.id)}[(${etiqueta})]` : `${idNodo(r.id)}[${etiqueta}]`;
}

/**
 * Genera el diagrama Mermaid del artefacto. Es determinista y no usa el modelo:
 * lo que ve la persona que revisa sale del mismo objeto que se traduce a código.
 */
export function generarMermaid(artefacto: Artefacto): string {
  const lineas = ["flowchart LR"];

  const grupos = new Map<string, Recurso[]>();
  for (const r of artefacto.recursos) {
    const s = servicio(r.tipo);
    grupos.set(s, [...(grupos.get(s) ?? []), r]);
  }
  for (const [nombre, recursos] of [...grupos].sort(([a], [b]) => a.localeCompare(b))) {
    lineas.push(`  subgraph ${idSubgrafo(nombre)}["${escapar(nombre)}"]`);
    for (const r of recursos) lineas.push(`    ${nodo(r)}`);
    lineas.push("  end");
  }

  // Sin validador (A1) el artefacto puede venir sin relaciones o con un tipo desconocido.
  for (const rel of artefacto.relaciones ?? []) {
    lineas.push(`  ${idNodo(rel.origen)} -->|"${escapar(ETIQUETAS[rel.tipo] ?? rel.tipo)}"| ${idNodo(rel.destino)}`);
  }
  for (const r of artefacto.recursos) {
    for (const id of r.depende_de ?? []) lineas.push(`  ${idNodo(r.id)} -.->|depende de| ${idNodo(id)}`);
  }

  return lineas.join("\n") + "\n";
}
