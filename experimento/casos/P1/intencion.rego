# Lista de verificación de P1 (proyecto grande: tienda serverless). Métrica M4.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración.
package intencion.p1

import rego.v1

import data.intencion.comun

nivel := "PG"

requisitos := {
	"api": "Existe una API de API Gateway",
	"rutas": "Existen las rutas de catálogo, carrito y pedidos",
	"funciones": "Existen al menos cinco funciones Lambda",
	"tablas": "Existen tres tablas de DynamoDB con recuperación ante borrado",
	"pago_por_uso": "Todas las tablas usan facturación por solicitud",
	"expiracion_carritos": "Alguna tabla tiene TTL activado",
	"imagenes": "Un bucket privado, versionado y cifrado guarda las imágenes",
	"cola_pedidos": "Una cola cifrada con cola de fallidos recibe los pedidos",
	"procesamiento": "La cola dispara una función",
	"avisos": "Existe un tema de SNS y alguna función puede publicar en él",
	"reporte_diario": "Una regla programada ejecuta una función",
	"logs": "Los grupos de logs de las funciones guardan 30 días",
	"roles_propios": "Cada función tiene un rol propio",
	"minimo_privilegio": "Ninguna política concede acciones comodín",
}

cumple contains "api" if comun.hay("aws_apigatewayv2_api")

cumple contains "api" if comun.hay("aws_api_gateway_rest_api")

rutas_v2 := {r.values.route_key | some r in comun.recursos("aws_apigatewayv2_route")}

cumple contains "rutas" if {
	some r in rutas_v2
	endswith(r, "/productos")
	some c in rutas_v2
	contains(c, "/carrito")
	"POST /pedidos" in rutas_v2
}

# API REST (v1): deben existir los recursos de productos, carrito y pedidos, con métodos.
cumple contains "rutas" if {
	partes := {r.values.path_part | some r in comun.recursos("aws_api_gateway_resource")}
	{"productos", "carrito", "pedidos"} - partes == set()
	count(comun.recursos("aws_api_gateway_method")) >= 5
}

cumple contains "funciones" if count(comun.recursos("aws_lambda_function")) >= 5

cumple contains "tablas" if {
	tablas := comun.recursos("aws_dynamodb_table")
	count(tablas) >= 3
	every t in tablas {
		t.values.point_in_time_recovery[0].enabled == true
	}
}

cumple contains "pago_por_uso" if {
	tablas := comun.recursos("aws_dynamodb_table")
	count(tablas) > 0
	every t in tablas {
		t.values.billing_mode == "PAY_PER_REQUEST"
	}
}

cumple contains "expiracion_carritos" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.ttl[0].enabled == true
}

cumple contains "imagenes" if {
	comun.hay("aws_s3_bucket")
	comun.conecta("aws_s3_bucket_versioning", "bucket", "aws_s3_bucket")
	comun.conecta("aws_s3_bucket_server_side_encryption_configuration", "bucket", "aws_s3_bucket")
	comun.conecta("aws_s3_bucket_public_access_block", "bucket", "aws_s3_bucket")
	some b in comun.recursos("aws_s3_bucket_public_access_block")
	b.values.block_public_acls == true
	b.values.block_public_policy == true
	b.values.ignore_public_acls == true
	b.values.restrict_public_buckets == true
}

cumple contains "cola_pedidos" if {
	comun.conecta("aws_sqs_queue", "redrive_policy", "aws_sqs_queue")
	every q in comun.recursos("aws_sqs_queue") {
		cifrada(q)
	}
}

cifrada(q) if q.values.sqs_managed_sse_enabled == true

cifrada(q) if comun.con_valor(q.values.kms_master_key_id)

cumple contains "procesamiento" if comun.conecta("aws_lambda_event_source_mapping", "event_source_arn", "aws_sqs_queue")

cumple contains "avisos" if {
	comun.hay("aws_sns_topic")
	"sns:Publish" in comun.acciones_iam
}

cumple contains "reporte_diario" if {
	some r in comun.recursos("aws_cloudwatch_event_rule")
	comun.con_valor(r.values.schedule_expression)
	comun.conecta("aws_cloudwatch_event_target", "rule", "aws_cloudwatch_event_rule")
	comun.conecta("aws_cloudwatch_event_target", "arn", "aws_lambda_function")
}

cumple contains "reporte_diario" if comun.conecta_en_algo("aws_scheduler_schedule", "aws_lambda_function")

cumple contains "logs" if {
	grupos := comun.recursos("aws_cloudwatch_log_group")
	count(grupos) >= 5
	every g in grupos {
		g.values.retention_in_days == 30
	}
}

cumple contains "roles_propios" if {
	funciones := comun.recursos("aws_lambda_function")
	count(funciones) > 0
	roles := {f.values.role | some f in funciones}
	count(roles) == count(funciones)
}

cumple contains "minimo_privilegio" if {
	count(comun.acciones_iam) > 0
	every a in comun.acciones_iam {
		a != "*"
		not endswith(a, ":*")
	}
}
