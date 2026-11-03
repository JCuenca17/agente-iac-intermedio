import type { Artefacto } from "../artefacto/tipos.js";
import type { Capa } from "../validador/tipos.js";

/**
 * Banco de errores insertados: versiones de artefactos válidos con un solo error cada una,
 * para medir qué capa del validador lo detecta sin llamar al modelo (estudio complementario
 * de PE2, ver docs/04-diseno-experimental.md).
 */
export const TIPOS_ERROR = [
  "estructura",
  "atributo-inexistente",
  "atributo-deprecado",
  "referencia-rota",
  "dependencia-circular",
  "tipo-invalido",
  "violacion-politica",
  "fuera-de-rango",
] as const;
export type TipoError = (typeof TIPOS_ERROR)[number];

export type Base = "c01" | "c03" | "c07";

export interface CasoBanco {
  id: string;
  tipo: TipoError;
  /** Capa que, según el diseño, debería detectar el error. */
  capaEsperada: Exclude<Capa, "C0">;
  descripcion: string;
  base: Base;
  artefacto: Artefacto;
}

type Mutar = (a: Artefacto) => void;
interface Mutacion {
  tipo: TipoError;
  base: Base;
  descripcion: string;
  mutar: Mutar;
}

const CAPA_ESPERADA: Record<TipoError, CasoBanco["capaEsperada"]> = {
  estructura: "C1",
  "atributo-inexistente": "C2",
  "atributo-deprecado": "C2",
  "referencia-rota": "C2",
  "dependencia-circular": "C2",
  "tipo-invalido": "C2",
  "violacion-politica": "C3",
  "fuera-de-rango": "C4",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const recurso = (a: Artefacto, id: string) => {
  const r = a.recursos.find((x) => x.id === id);
  if (!r) throw new Error(`El artefacto base no tiene el recurso ${id}`);
  return r;
};
const atributos = (a: Artefacto, id: string): Json => recurso(a, id).atributos;
/** Quita un recurso y las relaciones que lo mencionan, para que el único error sea el insertado. */
const quitarRecurso = (a: Artefacto, id: string) => {
  a.recursos = a.recursos.filter((r) => r.id !== id);
  a.relaciones = a.relaciones.filter((r) => r.origen !== id && r.destino !== id);
};

const MUTACIONES: Mutacion[] = [
  // C1: estructura
  { tipo: "estructura", base: "c03", descripcion: "Falta el propósito de un recurso", mutar: (a) => delete (recurso(a, "cola_fallidos") as Json).proposito },
  { tipo: "estructura", base: "c07", descripcion: "Tipo de relación desconocido", mutar: (a) => ((a.relaciones[0] as Json).tipo = "habla_con") },
  { tipo: "estructura", base: "c01", descripcion: "Propiedad no definida en el esquema", mutar: (a) => ((a as Json).codigo = 'resource "aws_s3_bucket" "x" {}') },
  { tipo: "estructura", base: "c07", descripcion: "Tipo de recurso sin el prefijo aws_", mutar: (a) => (recurso(a, "cola_trabajos").tipo = "sqs_queue") },
  { tipo: "estructura", base: "c03", descripcion: "Versión del formato equivocada", mutar: (a) => ((a as Json).version = "2.0") },
  // C2: atributo inexistente
  { tipo: "atributo-inexistente", base: "c03", descripcion: "Nombre inventado para el cifrado de la cola", mutar: (a) => (atributos(a, "cola_fallidos").sqs_managed_encryption = true) },
  { tipo: "atributo-inexistente", base: "c01", descripcion: "Atributo inexistente en el bucket", mutar: (a) => (atributos(a, "respaldos").bucket_nombre = "x") },
  { tipo: "atributo-inexistente", base: "c07", descripcion: "Memoria con un nombre inventado", mutar: (a) => (atributos(a, "procesador").memoria = 256) },
  { tipo: "atributo-inexistente", base: "c07", descripcion: "Atributo inexistente en el rol", mutar: (a) => (atributos(a, "rol_procesador").descripcion_rol = "x") },
  { tipo: "atributo-inexistente", base: "c01", descripcion: "Nombre parecido pero inexistente en el bloqueo público", mutar: (a) => (atributos(a, "respaldos_bloqueo").block_public_buckets = true) },
  // C2: atributo deprecado
  { tipo: "atributo-deprecado", base: "c01", descripcion: "acl dentro del bucket", mutar: (a) => (atributos(a, "respaldos").acl = "private") },
  { tipo: "atributo-deprecado", base: "c01", descripcion: "Bloque versioning dentro del bucket", mutar: (a) => (atributos(a, "respaldos").versioning = { enabled: true }) },
  {
    tipo: "atributo-deprecado",
    base: "c01",
    descripcion: "Bloque server_side_encryption_configuration dentro del bucket",
    mutar: (a) => (atributos(a, "respaldos").server_side_encryption_configuration = { rule: { apply_server_side_encryption_by_default: { sse_algorithm: "AES256" } } }),
  },
  { tipo: "atributo-deprecado", base: "c07", descripcion: "managed_policy_arns en el rol", mutar: (a) => (atributos(a, "rol_procesador").managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]) },
  { tipo: "atributo-deprecado", base: "c01", descripcion: "expected_bucket_owner en el versionado", mutar: (a) => (atributos(a, "respaldos_versionado").expected_bucket_owner = "000000000000") },
  // C2: referencia rota
  { tipo: "referencia-rota", base: "c03", descripcion: "La cola de fallidos referenciada no existe", mutar: (a) => (atributos(a, "cola_trabajos").redrive_policy.deadLetterTargetArn = "${ref:cola_muertos.arn}") },
  { tipo: "referencia-rota", base: "c07", descripcion: "El rol de la función no existe", mutar: (a) => (atributos(a, "procesador").role = "${ref:rol_inexistente.arn}") },
  { tipo: "referencia-rota", base: "c07", descripcion: "La cola del disparador no existe", mutar: (a) => (atributos(a, "disparador").event_source_arn = "${ref:cola_x.arn}") },
  { tipo: "referencia-rota", base: "c01", descripcion: "El bucket del versionado no existe", mutar: (a) => (atributos(a, "respaldos_versionado").bucket = "${ref:cubeta.id}") },
  {
    tipo: "referencia-rota",
    base: "c07",
    descripcion: "Atributo referenciado que la cola no tiene",
    mutar: (a) => (atributos(a, "permisos_cola").policy.Statement[0].Resource = "${ref:cola_trabajos.arn_cola}"),
  },
  // C2: dependencia circular
  { tipo: "dependencia-circular", base: "c03", descripcion: "La cola de fallidos depende de la principal", mutar: (a) => (recurso(a, "cola_fallidos").depende_de = ["cola_trabajos"]) },
  { tipo: "dependencia-circular", base: "c07", descripcion: "El rol depende de la función que lo usa", mutar: (a) => (recurso(a, "rol_procesador").depende_de = ["procesador"]) },
  { tipo: "dependencia-circular", base: "c07", descripcion: "La cola depende del disparador que la lee", mutar: (a) => (recurso(a, "cola_trabajos").depende_de = ["disparador"]) },
  { tipo: "dependencia-circular", base: "c01", descripcion: "El bucket depende de su versionado", mutar: (a) => (recurso(a, "respaldos").depende_de = ["respaldos_versionado"]) },
  { tipo: "dependencia-circular", base: "c07", descripcion: "El rol depende de su propia política", mutar: (a) => (recurso(a, "rol_procesador").depende_de = ["permisos_cola"]) },
  // C2: tipo inválido
  { tipo: "tipo-invalido", base: "c03", descripcion: "aws_sqs_cola", mutar: (a) => (recurso(a, "cola_fallidos").tipo = "aws_sqs_cola") },
  { tipo: "tipo-invalido", base: "c01", descripcion: "aws_s3_buckets", mutar: (a) => (recurso(a, "respaldos").tipo = "aws_s3_buckets") },
  { tipo: "tipo-invalido", base: "c07", descripcion: "aws_lambda_func", mutar: (a) => (recurso(a, "procesador").tipo = "aws_lambda_func") },
  { tipo: "tipo-invalido", base: "c07", descripcion: "aws_iam_rol", mutar: (a) => (recurso(a, "rol_procesador").tipo = "aws_iam_rol") },
  { tipo: "tipo-invalido", base: "c01", descripcion: "aws_s3_bucket_versionado", mutar: (a) => (recurso(a, "respaldos_versionado").tipo = "aws_s3_bucket_versionado") },
  // C3: violación de política
  { tipo: "violacion-politica", base: "c03", descripcion: "Cola sin cifrar", mutar: (a) => delete atributos(a, "cola_fallidos").sqs_managed_sse_enabled },
  { tipo: "violacion-politica", base: "c01", descripcion: "Bucket sin bloqueo de acceso público", mutar: (a) => quitarRecurso(a, "respaldos_bloqueo") },
  { tipo: "violacion-politica", base: "c01", descripcion: "Bucket sin cifrado", mutar: (a) => quitarRecurso(a, "respaldos_cifrado") },
  { tipo: "violacion-politica", base: "c07", descripcion: "Política con la acción sqs:*", mutar: (a) => (atributos(a, "permisos_cola").policy.Statement[0].Action = ["sqs:*"]) },
  {
    tipo: "violacion-politica",
    base: "c07",
    descripcion: "Grupo de logs sin retención",
    mutar: (a) => a.recursos.push({ id: "logs_procesador", tipo: "aws_cloudwatch_log_group", proposito: "Logs de la función.", atributos: { name: "/aws/lambda/c07-procesador" } }),
  },
  {
    tipo: "violacion-politica",
    base: "c07",
    descripcion: "Grupo de seguridad con SSH abierto a internet",
    mutar: (a) =>
      a.recursos.push({
        id: "sg_admin",
        tipo: "aws_security_group",
        proposito: "Acceso de administración.",
        atributos: { name: "c07-admin", ingress: [{ from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] }] },
      }),
  },
  {
    tipo: "violacion-politica",
    base: "c07",
    descripcion: "Tabla DynamoDB sin recuperación ante borrado",
    mutar: (a) =>
      a.recursos.push({
        id: "tabla_resultados",
        tipo: "aws_dynamodb_table",
        proposito: "Resultados del procesamiento.",
        atributos: { name: "c07-resultados", billing_mode: "PAY_PER_REQUEST", hash_key: "id", attribute: [{ name: "id", type: "S" }] },
      }),
  },
  {
    tipo: "violacion-politica",
    base: "c07",
    descripcion: "Base de datos RDS sin cifrar",
    mutar: (a) =>
      a.recursos.push({
        id: "base_datos",
        tipo: "aws_db_instance",
        proposito: "Base de datos de la aplicación.",
        atributos: {
          identifier: "c07-bd",
          engine: "postgres",
          instance_class: "db.t3.micro",
          allocated_storage: 20,
          username: "app",
          manage_master_user_password: true,
          publicly_accessible: false,
          skip_final_snapshot: true,
        },
      }),
  },
  // C4: valores que solo rechaza OpenTofu
  { tipo: "fuera-de-rango", base: "c03", descripcion: "delay_seconds mayor que 900", mutar: (a) => (atributos(a, "cola_trabajos").delay_seconds = 99999) },
  { tipo: "fuera-de-rango", base: "c03", descripcion: "message_retention_seconds menor que 60", mutar: (a) => (atributos(a, "cola_fallidos").message_retention_seconds = 10) },
  { tipo: "fuera-de-rango", base: "c07", descripcion: "timeout de la función mayor que 900", mutar: (a) => (atributos(a, "procesador").timeout = 99999) },
  { tipo: "fuera-de-rango", base: "c07", descripcion: "batch_size igual a 0", mutar: (a) => (atributos(a, "disparador").batch_size = 0) },
  { tipo: "fuera-de-rango", base: "c07", descripcion: "memory_size menor que 128", mutar: (a) => (atributos(a, "procesador").memory_size = 64) },
];

/** Genera el banco: una copia de la base por mutación, con un solo error insertado. */
export function generarBanco(bases: Record<Base, Artefacto>): CasoBanco[] {
  const contador = new Map<TipoError, number>();
  return MUTACIONES.map((m) => {
    const n = (contador.get(m.tipo) ?? 0) + 1;
    contador.set(m.tipo, n);
    const artefacto = structuredClone(bases[m.base]);
    m.mutar(artefacto);
    return { id: `${m.tipo}-${n}`, tipo: m.tipo, capaEsperada: CAPA_ESPERADA[m.tipo], descripcion: m.descripcion, base: m.base, artefacto };
  });
}

/** Lo mínimo que se necesita del resultado de la validación por capas. */
export interface Deteccion {
  valido: boolean;
  capaFallida?: Capa;
  errores: { regla: string }[];
}

export interface ResultadoCaso {
  id: string;
  tipo: TipoError;
  capaEsperada: CasoBanco["capaEsperada"];
  /** Capa que detectó el error, o null si el artefacto pasó todas. */
  capaDetecta: Capa | null;
  reglas: string[];
  enCapaEsperada: boolean;
}

export interface ResumenTipo {
  casos: number;
  detectados: number;
  enCapaEsperada: number;
  porCapa: Partial<Record<Capa, number>>;
}

export interface ResultadoBanco {
  resultados: ResultadoCaso[];
  porTipo: Partial<Record<TipoError, ResumenTipo>>;
  total: { casos: number; detectados: number; enCapaEsperada: number };
}

/** Pasa cada caso por el validador y registra qué capa detectó el error insertado. */
export async function evaluarBanco(casos: CasoBanco[], validar: (caso: CasoBanco) => Promise<Deteccion>): Promise<ResultadoBanco> {
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    const v = await validar(caso);
    const capaDetecta = v.valido ? null : (v.capaFallida ?? null);
    resultados.push({
      id: caso.id,
      tipo: caso.tipo,
      capaEsperada: caso.capaEsperada,
      capaDetecta,
      reglas: [...new Set(v.errores.map((e) => e.regla))].sort(),
      enCapaEsperada: capaDetecta === caso.capaEsperada,
    });
  }

  const porTipo: ResultadoBanco["porTipo"] = {};
  for (const r of resultados) {
    const t = (porTipo[r.tipo] ??= { casos: 0, detectados: 0, enCapaEsperada: 0, porCapa: {} });
    t.casos++;
    if (r.capaDetecta) {
      t.detectados++;
      t.porCapa[r.capaDetecta] = (t.porCapa[r.capaDetecta] ?? 0) + 1;
    }
    if (r.enCapaEsperada) t.enCapaEsperada++;
  }
  const total = {
    casos: resultados.length,
    detectados: resultados.filter((r) => r.capaDetecta).length,
    enCapaEsperada: resultados.filter((r) => r.enCapaEsperada).length,
  };
  return { resultados, porTipo, total };
}
