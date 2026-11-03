# Políticas de la capa C3. Se evalúan sobre el artefacto intermedio (no sobre el código),
# para que los problemas de seguridad se detecten en el diseño, antes de traducir.
#
# Cada violación es un objeto {regla, ruta, mensaje}. La ruta es un JSON Pointer dentro
# del artefacto, igual que en C1 y C2, para que la retroalimentación al modelo sea uniforme.
package artefacto.politicas

import rego.v1

# --- Utilidades -------------------------------------------------------------

# Identificadores de recursos referenciados con ${ref:id.atributo} en cualquier texto del valor.
referencias(valor) := {m[1] |
	walk(valor, [_, v])
	is_string(v)
	some m in regex.find_all_string_submatch_n(`\$\{ref:([a-z][a-z0-9_]*)\.[a-z0-9_]+\}`, v, -1)
}

recursos_de_tipo(tipo) := {i: r | some i, r in input.recursos; r.tipo == tipo}

# ¿Algún recurso del tipo dado referencia al recurso con este id en el atributo indicado?
apunta_a(tipo, atributo, id) if {
	some r in input.recursos
	r.tipo == tipo
	id in referencias(r.atributos[atributo])
}

ruta(i, sufijo) := sprintf("/recursos/%d%s", [i, sufijo])

# --- P1: buckets sin acceso público ----------------------------------------------

deny contains v if {
	some i, b in recursos_de_tipo("aws_s3_bucket")
	not bucket_bloqueado(b.id)
	v := {
		"regla": "s3-acceso-publico",
		"ruta": ruta(i, ""),
		"mensaje": sprintf("el bucket \"%s\" necesita un aws_s3_bucket_public_access_block con block_public_acls, block_public_policy, ignore_public_acls y restrict_public_buckets en true", [b.id]),
	}
}

bucket_bloqueado(id) if {
	some r in input.recursos
	r.tipo == "aws_s3_bucket_public_access_block"
	id in referencias(r.atributos.bucket)
	r.atributos.block_public_acls == true
	r.atributos.block_public_policy == true
	r.atributos.ignore_public_acls == true
	r.atributos.restrict_public_buckets == true
}

# --- P2: buckets cifrados ---------------------------------------------------------

deny contains v if {
	some i, b in recursos_de_tipo("aws_s3_bucket")
	not apunta_a("aws_s3_bucket_server_side_encryption_configuration", "bucket", b.id)
	v := {
		"regla": "s3-cifrado",
		"ruta": ruta(i, ""),
		"mensaje": sprintf("el bucket \"%s\" necesita un aws_s3_bucket_server_side_encryption_configuration", [b.id]),
	}
}

# --- P3: colas cifradas -------------------------------------------------------------

deny contains v if {
	some i, q in recursos_de_tipo("aws_sqs_queue")
	not q.atributos.sqs_managed_sse_enabled == true
	not q.atributos.kms_master_key_id
	v := {
		"regla": "sqs-cifrado",
		"ruta": ruta(i, "/atributos"),
		"mensaje": sprintf("la cola \"%s\" debe cifrarse: sqs_managed_sse_enabled = true o kms_master_key_id", [q.id]),
	}
}

# --- P4: sin comodines de acciones en políticas IAM ----------------------------------

atributos_politica := {"policy", "assume_role_policy", "inline_policy"}

deny contains v if {
	some i, r in input.recursos
	some nombre in atributos_politica
	documento := r.atributos[nombre]
	walk(documento, [camino, accion])
	accion_comodin(camino, accion)
	v := {
		"regla": "iam-sin-comodin",
		"ruta": ruta(i, sprintf("/atributos/%s", [nombre])),
		"mensaje": sprintf("\"%s\" concede la acción \"%s\"; usa solo las acciones necesarias (mínimo privilegio)", [r.id, accion]),
	}
}

accion_comodin(camino, accion) if {
	is_string(accion)
	clave_accion(camino)
	es_comodin(accion)
}

clave_accion(camino) if {
	some k in camino
	k in {"Action", "actions"}
}

es_comodin(a) if a == "*"

es_comodin(a) if endswith(a, ":*")

# --- P5: grupos de seguridad sin puertos abiertos a internet salvo 80 y 443 ----------

puertos_web := {80, 443}

deny contains v if {
	some i, g in recursos_de_tipo("aws_security_group")
	reglas := entradas(g.atributos.ingress)
	some j, regla in reglas
	"0.0.0.0/0" in object.get(regla, "cidr_blocks", [])
	not solo_web(regla)
	v := {
		"regla": "sg-abierto",
		"ruta": ruta(i, sprintf("/atributos/ingress/%d", [j])),
		"mensaje": sprintf("el grupo \"%s\" abre a 0.0.0.0/0 puertos distintos de 80 y 443", [g.id]),
	}
}

deny contains v if {
	some i, r in recursos_de_tipo("aws_vpc_security_group_ingress_rule")
	r.atributos.cidr_ipv4 == "0.0.0.0/0"
	not solo_web(r.atributos)
	v := {
		"regla": "sg-abierto",
		"ruta": ruta(i, "/atributos"),
		"mensaje": sprintf("la regla \"%s\" abre a 0.0.0.0/0 puertos distintos de 80 y 443", [r.id]),
	}
}

entradas(x) := x if is_array(x)

entradas(x) := [x] if is_object(x)

solo_web(regla) if {
	regla.from_port == regla.to_port
	regla.from_port in puertos_web
}

# --- P6: tablas con recuperación ante borrado -------------------------------------

deny contains v if {
	some i, t in recursos_de_tipo("aws_dynamodb_table")
	not pitr_activo(t)
	v := {
		"regla": "dynamodb-recuperacion",
		"ruta": ruta(i, "/atributos"),
		"mensaje": sprintf("la tabla \"%s\" debe activar point_in_time_recovery { enabled = true }", [t.id]),
	}
}

pitr_activo(t) if t.atributos.point_in_time_recovery.enabled == true

pitr_activo(t) if t.atributos.point_in_time_recovery[0].enabled == true

# --- P7: logs con retención definida ---------------------------------------------------

deny contains v if {
	some i, g in recursos_de_tipo("aws_cloudwatch_log_group")
	not retencion_definida(g)
	v := {
		"regla": "logs-retencion",
		"ruta": ruta(i, "/atributos"),
		"mensaje": sprintf("el grupo de logs \"%s\" debe definir retention_in_days", [g.id]),
	}
}

retencion_definida(g) if g.atributos.retention_in_days > 0

# --- P8: bases de datos cifradas y no públicas --------------------------------------------

deny contains v if {
	some i, db in recursos_de_tipo("aws_db_instance")
	not db.atributos.storage_encrypted == true
	v := {
		"regla": "rds-cifrado",
		"ruta": ruta(i, "/atributos"),
		"mensaje": sprintf("la base de datos \"%s\" debe tener storage_encrypted = true", [db.id]),
	}
}

deny contains v if {
	some i, db in recursos_de_tipo("aws_db_instance")
	db.atributos.publicly_accessible == true
	v := {
		"regla": "rds-publica",
		"ruta": ruta(i, "/atributos/publicly_accessible"),
		"mensaje": sprintf("la base de datos \"%s\" no debe ser accesible desde internet", [db.id]),
	}
}
