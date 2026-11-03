# Lista de verificación de C08 (N2). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c08

import rego.v1

import data.intencion.comun

nivel := "N2"

requisitos := {
	"api": "Existe una API de API Gateway",
	"funcion": "Existe una función Lambda",
	"integracion": "La API está integrada con la función",
	"ruta": "Existe una ruta GET /saludo",
	"permiso": "La función permite que API Gateway la invoque",
}

cumple contains "api" if comun.hay("aws_apigatewayv2_api")

cumple contains "api" if comun.hay("aws_api_gateway_rest_api")

cumple contains "funcion" if comun.hay("aws_lambda_function")

cumple contains "integracion" if comun.conecta("aws_apigatewayv2_integration", "integration_uri", "aws_lambda_function")

cumple contains "integracion" if comun.conecta("aws_api_gateway_integration", "uri", "aws_lambda_function")

cumple contains "ruta" if {
	some r in comun.recursos("aws_apigatewayv2_route")
	r.values.route_key == "GET /saludo"
}

cumple contains "ruta" if {
	some m in comun.recursos("aws_api_gateway_method")
	m.values.http_method == "GET"
}

cumple contains "permiso" if {
	some p in comun.recursos("aws_lambda_permission")
	p.values.principal == "apigateway.amazonaws.com"
}
