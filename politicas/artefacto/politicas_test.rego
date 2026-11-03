package artefacto.politicas_test

import rego.v1

import data.artefacto.politicas

artefacto(recursos) := {"version": "1.0", "resumen": "prueba", "recursos": recursos, "relaciones": []}

reglas(recursos) := {v.regla | some v in politicas.deny with input as artefacto(recursos)}

bucket := {"id": "datos", "tipo": "aws_s3_bucket", "proposito": "x", "atributos": {"bucket": "datos"}}

bloqueo := {"id": "datos_bloqueo", "tipo": "aws_s3_bucket_public_access_block", "proposito": "x", "atributos": {
	"bucket": "${ref:datos.id}",
	"block_public_acls": true, "block_public_policy": true,
	"ignore_public_acls": true, "restrict_public_buckets": true,
}}

cifrado := {"id": "datos_cifrado", "tipo": "aws_s3_bucket_server_side_encryption_configuration", "proposito": "x", "atributos": {
	"bucket": "${ref:datos.id}",
	"rule": {"apply_server_side_encryption_by_default": {"sse_algorithm": "AES256"}},
}}

test_bucket_completo_pasa if {
	count(reglas([bucket, bloqueo, cifrado])) == 0
}

test_bucket_sin_bloqueo if {
	"s3-acceso-publico" in reglas([bucket, cifrado])
}

test_bloqueo_incompleto if {
	parcial := json.patch(bloqueo, [{"op": "replace", "path": "/atributos/ignore_public_acls", "value": false}])
	"s3-acceso-publico" in reglas([bucket, parcial, cifrado])
}

test_bucket_sin_cifrado if {
	"s3-cifrado" in reglas([bucket, bloqueo])
}

test_cola_sin_cifrado if {
	"sqs-cifrado" in reglas([{"id": "cola", "tipo": "aws_sqs_queue", "proposito": "x", "atributos": {"name": "c"}}])
}

test_cola_con_kms_pasa if {
	not "sqs-cifrado" in reglas([{"id": "cola", "tipo": "aws_sqs_queue", "proposito": "x", "atributos": {"kms_master_key_id": "alias/aws/sqs"}}])
}

test_iam_comodin_total if {
	politica := {"id": "p", "tipo": "aws_iam_policy", "proposito": "x", "atributos": {"policy": {"Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}]}}}
	"iam-sin-comodin" in reglas([politica])
}

test_iam_comodin_de_servicio if {
	politica := {"id": "p", "tipo": "aws_iam_role_policy", "proposito": "x", "atributos": {"policy": {"Statement": [{"Effect": "Allow", "Action": ["s3:*"], "Resource": "${ref:datos.arn}"}]}}}
	"iam-sin-comodin" in reglas([politica])
}

test_iam_acciones_concretas_pasa if {
	politica := {"id": "p", "tipo": "aws_iam_role_policy", "proposito": "x", "atributos": {"policy": {"Statement": [{"Effect": "Allow", "Action": ["s3:GetObject"], "Resource": "*"}]}}}
	not "iam-sin-comodin" in reglas([politica])
}

test_sg_ssh_abierto if {
	sg := {"id": "sg", "tipo": "aws_security_group", "proposito": "x", "atributos": {"ingress": [{"from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]}]}}
	"sg-abierto" in reglas([sg])
}

test_sg_https_pasa if {
	sg := {"id": "sg", "tipo": "aws_security_group", "proposito": "x", "atributos": {"ingress": [{"from_port": 443, "to_port": 443, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]}]}}
	not "sg-abierto" in reglas([sg])
}

test_regla_suelta_abierta if {
	r := {"id": "r", "tipo": "aws_vpc_security_group_ingress_rule", "proposito": "x", "atributos": {"cidr_ipv4": "0.0.0.0/0", "from_port": 0, "to_port": 65535, "ip_protocol": "tcp"}}
	"sg-abierto" in reglas([r])
}

test_tabla_sin_recuperacion if {
	"dynamodb-recuperacion" in reglas([{"id": "t", "tipo": "aws_dynamodb_table", "proposito": "x", "atributos": {"name": "t"}}])
}

test_tabla_con_recuperacion_pasa if {
	t := {"id": "t", "tipo": "aws_dynamodb_table", "proposito": "x", "atributos": {"point_in_time_recovery": {"enabled": true}}}
	not "dynamodb-recuperacion" in reglas([t])
}

test_logs_sin_retencion if {
	"logs-retencion" in reglas([{"id": "l", "tipo": "aws_cloudwatch_log_group", "proposito": "x", "atributos": {"name": "/x"}}])
}

test_base_de_datos_insegura if {
	db := {"id": "bd", "tipo": "aws_db_instance", "proposito": "x", "atributos": {"publicly_accessible": true}}
	r := reglas([db])
	"rds-cifrado" in r
	"rds-publica" in r
}

test_ruta_apunta_al_recurso if {
	vs := politicas.deny with input as artefacto([bucket, cifrado])
	some v in vs
	v.regla == "s3-acceso-publico"
	v.ruta == "/recursos/0"
}
