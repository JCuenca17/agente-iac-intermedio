# Lista de verificación de C06 (N2). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
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

# Se cuentan las instancias (también las creadas con count o for_each) y cada política debe
# admitir al tema: por el servicio de SNS o por el ARN del tema.
cumple contains "politicas_colas" if {
	politicas := comun.recursos("aws_sqs_queue_policy")
	count(politicas) >= 2
	every p in politicas {
		admite_tema(p)
	}
}

admite_tema(p) if contains(p.values.policy, "sns.amazonaws.com")

admite_tema(p) if {
	some t in comun.recursos("aws_sns_topic")
	contains(p.values.policy, t.values.arn)
}
