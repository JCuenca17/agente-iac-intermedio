# Lista de verificación de C03 (N1). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c03

import rego.v1

import data.intencion.comun

nivel := "N1"

requisitos := {
	"dos_colas": "Existen al menos dos colas de SQS",
	"redrive": "Una cola envía sus mensajes fallidos a otra cola (redrive_policy)",
	"cifrado": "Todas las colas están cifradas",
}

cumple contains "dos_colas" if count(comun.recursos("aws_sqs_queue")) >= 2

cumple contains "redrive" if comun.conecta("aws_sqs_queue", "redrive_policy", "aws_sqs_queue")

cumple contains "redrive" if comun.conecta("aws_sqs_queue_redrive_policy", "redrive_policy", "aws_sqs_queue")

cumple contains "cifrado" if {
	colas := comun.recursos("aws_sqs_queue")
	count(colas) > 0
	every q in colas {
		cola_cifrada(q)
	}
}

cola_cifrada(q) if q.values.sqs_managed_sse_enabled == true

cola_cifrada(q) if q.values.kms_master_key_id != null
