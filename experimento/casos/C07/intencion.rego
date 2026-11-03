# Lista de verificación de C07 (N2). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c07

import rego.v1

import data.intencion.comun

nivel := "N2"

requisitos := {
	"funcion": "Existe una función Lambda",
	"cola": "Existe una cola de SQS",
	"disparador": "La cola dispara la función (event source mapping)",
	"rol": "La función tiene un rol de IAM propio",
	"permisos_cola": "El rol puede recibir y borrar mensajes de SQS",
}

cumple contains "funcion" if comun.hay("aws_lambda_function")

cumple contains "cola" if comun.hay("aws_sqs_queue")

cumple contains "disparador" if comun.conecta("aws_lambda_event_source_mapping", "event_source_arn", "aws_sqs_queue")

cumple contains "rol" if comun.conecta("aws_lambda_function", "role", "aws_iam_role")

cumple contains "permisos_cola" if {
	"sqs:ReceiveMessage" in comun.acciones_iam
	"sqs:DeleteMessage" in comun.acciones_iam
}

cumple contains "permisos_cola" if {
	some a in comun.recursos("aws_iam_role_policy_attachment")
	contains(a.values.policy_arn, "AWSLambdaSQSQueueExecutionRole")
}
