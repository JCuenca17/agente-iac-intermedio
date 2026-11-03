# Lista de verificación de C05 (N2). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
package intencion.c05

import rego.v1

import data.intencion.comun

nivel := "N2"

requisitos := {
	"bucket": "Existe un bucket de S3",
	"cola": "Existe una cola de SQS",
	"notificacion": "El bucket notifica a la cola al crear objetos",
	"politica_cola": "La cola tiene una política que permite a S3 enviarle mensajes",
}

cumple contains "bucket" if comun.hay("aws_s3_bucket")

cumple contains "cola" if comun.hay("aws_sqs_queue")

cumple contains "notificacion" if comun.conecta("aws_s3_bucket_notification", "queue", "aws_sqs_queue")

cumple contains "politica_cola" if {
	comun.conecta("aws_sqs_queue_policy", "queue_url", "aws_sqs_queue")
	some p in comun.recursos("aws_sqs_queue_policy")
	contains(p.values.policy, "s3.amazonaws.com")
}
