# Métrica M3: violaciones de política en lo desplegado.
# Son las mismas reglas de seguridad de la capa C3, pero evaluadas sobre el estado después
# del apply (`tofu show -json`), para medir igual a la herramienta y a la generación
# directa, que no tiene artefacto intermedio.
package desplegado.politicas

import rego.v1

recursos(tipo) := [r |
	some r in input.values.root_module.resources
	r.mode == "managed"
	r.type == tipo
]

# --- P1 y P2: buckets privados y cifrados ---------------------------------------------------

deny contains {"regla": "s3-acceso-publico", "recurso": b.address} if {
	some b in recursos("aws_s3_bucket")
	not bucket_bloqueado(b.values.bucket)
}

bucket_bloqueado(nombre) if {
	some p in recursos("aws_s3_bucket_public_access_block")
	p.values.bucket == nombre
	p.values.block_public_acls == true
	p.values.block_public_policy == true
	p.values.ignore_public_acls == true
	p.values.restrict_public_buckets == true
}

deny contains {"regla": "s3-cifrado", "recurso": b.address} if {
	some b in recursos("aws_s3_bucket")
	not bucket_cifrado(b.values.bucket)
}

bucket_cifrado(nombre) if {
	some c in recursos("aws_s3_bucket_server_side_encryption_configuration")
	c.values.bucket == nombre
}

# --- P3: colas cifradas -----------------------------------------------------------------

deny contains {"regla": "sqs-cifrado", "recurso": q.address} if {
	some q in recursos("aws_sqs_queue")
	not q.values.sqs_managed_sse_enabled == true
	not kms(q)
}

kms(q) if {
	q.values.kms_master_key_id != null
	q.values.kms_master_key_id != ""
}

# --- P4: sin comodines en acciones IAM -----------------------------------------------------

deny contains {"regla": "iam-sin-comodin", "recurso": r.address} if {
	some r in input.values.root_module.resources
	r.mode == "managed"
	some campo in ["policy", "inline_policy"]
	documento := json.unmarshal(r.values[campo])
	some declaracion in documento.Statement
	some accion in lista(declaracion.Action)
	comodin(accion)
}

lista(x) := x if is_array(x)

lista(x) := [x] if is_string(x)

comodin(a) if a == "*"

comodin(a) if endswith(a, ":*")

# --- P5: grupos de seguridad sin puertos abiertos salvo 80 y 443 ---------------------------

deny contains {"regla": "sg-abierto", "recurso": g.address} if {
	some g in recursos("aws_security_group")
	some i in g.values.ingress
	"0.0.0.0/0" in i.cidr_blocks
	not solo_web(i.from_port, i.to_port)
}

deny contains {"regla": "sg-abierto", "recurso": r.address} if {
	some r in recursos("aws_vpc_security_group_ingress_rule")
	r.values.cidr_ipv4 == "0.0.0.0/0"
	not solo_web(r.values.from_port, r.values.to_port)
}

solo_web(desde, hasta) if {
	desde == hasta
	desde in {80, 443}
}

# --- P6: tablas con recuperación ante borrado ---------------------------------------------

deny contains {"regla": "dynamodb-recuperacion", "recurso": t.address} if {
	some t in recursos("aws_dynamodb_table")
	not t.values.point_in_time_recovery[0].enabled == true
}

# --- P7: logs con retención ---------------------------------------------------------------

deny contains {"regla": "logs-retencion", "recurso": g.address} if {
	some g in recursos("aws_cloudwatch_log_group")
	not retencion_definida(g)
}

retencion_definida(g) if g.values.retention_in_days > 0

# --- P8: bases de datos cifradas y no públicas ---------------------------------------------

deny contains {"regla": "rds-cifrado", "recurso": d.address} if {
	some d in recursos("aws_db_instance")
	not d.values.storage_encrypted == true
}

deny contains {"regla": "rds-publica", "recurso": d.address} if {
	some d in recursos("aws_db_instance")
	d.values.publicly_accessible == true
}
