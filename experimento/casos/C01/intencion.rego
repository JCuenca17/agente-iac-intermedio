# Lista de verificación de C01 (N1). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
package intencion.c01

import rego.v1

import data.intencion.comun

nivel := "N1"

requisitos := {
	"bucket": "Existe un bucket de S3",
	"versionado": "El versionado del bucket está activado",
	"cifrado": "El bucket tiene cifrado del lado del servidor",
	"privado": "El bucket bloquea todo acceso público",
}

cumple contains "bucket" if comun.hay("aws_s3_bucket")

cumple contains "versionado" if {
	some v in comun.recursos("aws_s3_bucket_versioning")
	v.values.versioning_configuration[0].status == "Enabled"
	comun.conecta("aws_s3_bucket_versioning", "bucket", "aws_s3_bucket")
}

# También vale la forma antigua (deprecada) dentro del bucket: el requisito es que el
# versionado y el cifrado estén activos, no la forma de escribirlo (eso lo mide M2).
cumple contains "versionado" if {
	some b in comun.config("aws_s3_bucket")
	some v in b.expressions.versioning
	v.enabled.constant_value == true
}

cumple contains "cifrado" if comun.conecta("aws_s3_bucket_server_side_encryption_configuration", "bucket", "aws_s3_bucket")

# En el estado, todo bucket informa el cifrado por defecto del servicio; por eso la forma
# antigua se reconoce en la configuración, donde solo aparece si se escribió.
cumple contains "cifrado" if {
	some b in comun.config("aws_s3_bucket")
	count(object.get(b.expressions, "server_side_encryption_configuration", [])) > 0
}

cumple contains "privado" if {
	comun.conecta("aws_s3_bucket_public_access_block", "bucket", "aws_s3_bucket")
	some b in comun.recursos("aws_s3_bucket_public_access_block")
	b.values.block_public_acls == true
	b.values.block_public_policy == true
	b.values.ignore_public_acls == true
	b.values.restrict_public_buckets == true
}
