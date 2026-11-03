# Lista de verificación de R1 (proyecto real). Métrica M4: proporción de requisitos cumplidos.
# Proyecto: localstack-samples/sample-terraform-ecs-apigateway (Apache-2.0). Los requisitos
# salen de lo que declara su README (dos servicios con PUT y GET, autenticación con Cognito,
# ECS, DynamoDB y API Gateway) y de su arquitectura (subredes privadas, enlace de VPC y
# descubrimiento de servicios). Se evalúa sobre lo desplegado (estado) con las referencias de
# la configuración (ver experimento/intencion/comun.rego).
package intencion.r1

import rego.v1

import data.intencion.comun

nivel := "PR"

requisitos := {
	"cluster": "Existe un clúster de ECS",
	"dos_servicios": "Hay al menos dos servicios de ECS en Fargate",
	"tablas": "Hay al menos dos tablas de DynamoDB",
	"api_http": "Existe una API HTTP de API Gateway",
	"rutas": "La API tiene GET y PUT en /foodstore/foods/{foodId} y en /petstore/pets/{petId}",
	"autenticacion": "Existe un grupo de usuarios de Cognito y la API tiene un autorizador",
	"solo_lectura_anonima": "PUT exige autorización y GET no",
	"privados": "Los servicios corren sin IP pública",
	"enlace_vpc": "La API llega a los servicios mediante un enlace de VPC",
	"descubrimiento": "Los servicios se registran en el descubrimiento de servicios",
}

cumple contains "cluster" if comun.hay("aws_ecs_cluster")

cumple contains "dos_servicios" if {
	fargate := [s | some s in comun.recursos("aws_ecs_service"); en_fargate(s)]
	count(fargate) >= 2
}

en_fargate(s) if s.values.launch_type == "FARGATE"

en_fargate(s) if {
	some c in object.get(s.values, "capacity_provider_strategy", [])
	startswith(c.capacity_provider, "FARGATE")
}

cumple contains "tablas" if count(comun.recursos("aws_dynamodb_table")) >= 2

cumple contains "api_http" if {
	some a in comun.recursos("aws_apigatewayv2_api")
	a.values.protocol_type == "HTTP"
}

# Las rutas pueden ser recursos aws_apigatewayv2_route o venir en el documento OpenAPI de la API.
rutas := {sprintf("%s %s", [m, p]) |
	some r in comun.recursos("aws_apigatewayv2_route")
	[m, p] := split(r.values.route_key, " ")
} | {sprintf("%s %s", [upper(m), p]) |
	some a in comun.recursos("aws_apigatewayv2_api")
	comun.con_valor(a.values.body)
	json.is_valid(a.values.body)
	some p, operaciones in json.unmarshal(a.values.body).paths
	some m, _ in operaciones
}

cumple contains "rutas" if {
	{"GET /foodstore/foods/{foodId}", "PUT /foodstore/foods/{foodId}", "GET /petstore/pets/{petId}", "PUT /petstore/pets/{petId}"} - rutas == set()
}

cumple contains "autenticacion" if {
	comun.hay("aws_cognito_user_pool")
	autorizador
}

autorizador if comun.hay("aws_apigatewayv2_authorizer")

autorizador if {
	some a in comun.recursos("aws_apigatewayv2_api")
	contains(object.get(a.values, "body", ""), "x-amazon-apigateway-authorizer")
}

# Qué métodos exigen autorización: según los recursos de ruta o el documento OpenAPI.
con_autorizacion contains m if {
	some r in comun.recursos("aws_apigatewayv2_route")
	[m, _] := split(r.values.route_key, " ")
	not r.values.authorization_type in {"NONE", ""}
}

con_autorizacion contains upper(m) if {
	some a in comun.recursos("aws_apigatewayv2_api")
	comun.con_valor(a.values.body)
	json.is_valid(a.values.body)
	some _, operaciones in json.unmarshal(a.values.body).paths
	some m, op in operaciones
	count(object.get(op, "security", [])) > 0
}

cumple contains "solo_lectura_anonima" if {
	"PUT" in con_autorizacion
	not "GET" in con_autorizacion
}

cumple contains "privados" if {
	servicios := comun.recursos("aws_ecs_service")
	count(servicios) >= 2
	every s in servicios {
		some n in s.values.network_configuration
		n.assign_public_ip == false
	}
}

cumple contains "enlace_vpc" if comun.hay("aws_apigatewayv2_vpc_link")

cumple contains "descubrimiento" if {
	comun.hay("aws_service_discovery_service")
	servicios := comun.recursos("aws_ecs_service")
	count(servicios) >= 2
	every s in servicios {
		count(object.get(s.values, "service_registries", [])) > 0
	}
}
