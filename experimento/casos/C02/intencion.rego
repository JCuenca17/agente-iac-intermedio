# Lista de verificación de C02 (N1). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
package intencion.c02

import rego.v1

import data.intencion.comun

nivel := "N1"

requisitos := {
	"tabla": "Existe una tabla de DynamoDB",
	"claves": "La tabla tiene clave de partición y clave de ordenamiento",
	"pago_por_uso": "La tabla usa facturación por solicitud (PAY_PER_REQUEST)",
	"expiracion": "La tabla tiene TTL activado",
	"recuperacion": "La tabla tiene recuperación ante borrado (PITR)",
}

cumple contains "tabla" if comun.hay("aws_dynamodb_table")

cumple contains "claves" if {
	some t in comun.recursos("aws_dynamodb_table")
	comun.con_valor(t.values.hash_key)
	comun.con_valor(t.values.range_key)
}

cumple contains "pago_por_uso" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.billing_mode == "PAY_PER_REQUEST"
}

cumple contains "expiracion" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.ttl[0].enabled == true
}

cumple contains "recuperacion" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.point_in_time_recovery[0].enabled == true
}
