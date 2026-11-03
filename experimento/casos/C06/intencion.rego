# Lista de verificación de C06 (N2). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c06

import rego.v1

import data.intencion.comun

nivel := "N2"

requisitos := {
	"tema": "Existe un tema de SNS",
	"dos_colas": "Existen al menos dos colas de SQS",
	"suscripciones": "Hay al menos dos suscripciones SQS al tema",
	"politicas_colas": "Las colas tienen políticas que permiten recibir del tema",
}

cumple contains "tema" if comun.hay("aws_sns_topic")

cumple contains "dos_colas" if count(comun.recursos("aws_sqs_queue")) >= 2

cumple contains "suscripciones" if {
	subs := [s | some s in comun.recursos("aws_sns_topic_subscription"); s.values.protocol == "sqs"]
	count(subs) >= 2
}

cumple contains "politicas_colas" if count(comun.config("aws_sqs_queue_policy")) >= 2
