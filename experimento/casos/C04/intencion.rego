# Lista de verificación de C04 (N1). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c04

import rego.v1

import data.intencion.comun

nivel := "N1"

requisitos := {
	"rol": "Existe un rol de IAM",
	"permiso_lectura": "El rol tiene permiso para leer objetos (s3:GetObject)",
	"sin_escritura": "No se conceden acciones de escritura o borrado en S3 ni comodines",
	"politica_asociada": "La política está asociada al rol",
}

cumple contains "rol" if comun.hay("aws_iam_role")

cumple contains "permiso_lectura" if "s3:GetObject" in comun.acciones_iam

cumple contains "sin_escritura" if {
	count(comun.acciones_iam) > 0
	every a in comun.acciones_iam {
		not prohibida(a)
	}
}

prohibida(a) if a in {"*", "s3:*", "s3:PutObject", "s3:DeleteObject", "s3:DeleteBucket", "s3:PutBucketPolicy"}

cumple contains "politica_asociada" if comun.conecta("aws_iam_role_policy_attachment", "role", "aws_iam_role")

cumple contains "politica_asociada" if comun.conecta("aws_iam_role_policy", "role", "aws_iam_role")

cumple contains "politica_asociada" if {
	some r in comun.recursos("aws_iam_role")
	count(object.get(r.values, "inline_policy", [])) > 0
}
