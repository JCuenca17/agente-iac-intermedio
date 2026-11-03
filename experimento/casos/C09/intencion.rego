# Lista de verificación de C09 (N3). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
package intencion.c09

import rego.v1

import data.intencion.comun

nivel := "N3"

requisitos := {
	"api": "Existe una API de API Gateway",
	"ruta": "Existe una ruta POST /usuarios",
	"funcion": "Existe una función Lambda integrada con la API",
	"tabla": "Existe una tabla de DynamoDB con recuperación ante borrado",
	"permisos_tabla": "El rol de la función puede escribir en DynamoDB sin comodines",
	"permiso_api": "La función permite que API Gateway la invoque",
}

cumple contains "api" if comun.hay("aws_apigatewayv2_api")

cumple contains "api" if comun.hay("aws_api_gateway_rest_api")

cumple contains "ruta" if {
	some r in comun.recursos("aws_apigatewayv2_route")
	r.values.route_key == "POST /usuarios"
}

# API REST (v1): el método debe estar en el recurso /usuarios.
cumple contains "ruta" if {
	some r in comun.recursos("aws_api_gateway_resource")
	r.values.path_part == "usuarios"
	some m in comun.recursos("aws_api_gateway_method")
	m.values.http_method == "POST"
	m.values.resource_id == r.values.id
}

cumple contains "funcion" if comun.conecta("aws_apigatewayv2_integration", "integration_uri", "aws_lambda_function")

cumple contains "funcion" if comun.conecta("aws_api_gateway_integration", "uri", "aws_lambda_function")

cumple contains "tabla" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.point_in_time_recovery[0].enabled == true
}

cumple contains "permisos_tabla" if {
	"dynamodb:PutItem" in comun.acciones_iam
	not "dynamodb:*" in comun.acciones_iam
	not "*" in comun.acciones_iam
}

cumple contains "permiso_api" if {
	some p in comun.recursos("aws_lambda_permission")
	p.values.principal == "apigateway.amazonaws.com"
}
