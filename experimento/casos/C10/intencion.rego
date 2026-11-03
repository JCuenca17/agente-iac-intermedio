# Lista de verificación de C10 (N3). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c10

import rego.v1

import data.intencion.comun

nivel := "N3"

requisitos := {
	"bucket": "Existe un bucket de S3",
	"funcion": "Existe una función Lambda",
	"disparo": "El bucket notifica a la función al crear objetos",
	"permiso_s3": "La función permite que S3 la invoque",
	"tabla": "Existe una tabla de DynamoDB",
	"fallidos": "Los fallos de la función van a una cola de SQS",
	"permisos": "El rol puede leer objetos y escribir en la tabla",
}

cumple contains "bucket" if comun.hay("aws_s3_bucket")

cumple contains "funcion" if comun.hay("aws_lambda_function")

cumple contains "disparo" if comun.conecta("aws_s3_bucket_notification", "lambda_function", "aws_lambda_function")

cumple contains "permiso_s3" if {
	some p in comun.recursos("aws_lambda_permission")
	p.values.principal == "s3.amazonaws.com"
}

cumple contains "tabla" if comun.hay("aws_dynamodb_table")

cumple contains "fallidos" if comun.conecta("aws_lambda_function", "dead_letter_config", "aws_sqs_queue")

cumple contains "fallidos" if comun.conecta("aws_lambda_function_event_invoke_config", "destination_config", "aws_sqs_queue")

cumple contains "permisos" if {
	"s3:GetObject" in comun.acciones_iam
	"dynamodb:PutItem" in comun.acciones_iam
}
