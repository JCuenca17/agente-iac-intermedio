# Lista de verificación de C12 (N3). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
package intencion.c12

import rego.v1

import data.intencion.comun

nivel := "N3"

requisitos := {
	"programacion": "Existe una regla programada de EventBridge",
	"objetivo": "La regla tiene como objetivo la función Lambda",
	"permiso_eventos": "La función permite que EventBridge la invoque",
	"tema": "Existe un tema de SNS y el rol puede publicar en él",
	"logs": "Hay un grupo de logs con retención de 14 días",
}

cumple contains "programacion" if {
	some r in comun.recursos("aws_cloudwatch_event_rule")
	comun.con_valor(r.values.schedule_expression)
}

cumple contains "programacion" if {
	some r in comun.recursos("aws_scheduler_schedule")
	comun.con_valor(r.values.schedule_expression)
}

cumple contains "objetivo" if comun.conecta("aws_cloudwatch_event_target", "arn", "aws_lambda_function")

cumple contains "objetivo" if comun.conecta_en_algo("aws_scheduler_schedule", "aws_lambda_function")

cumple contains "permiso_eventos" if {
	some p in comun.recursos("aws_lambda_permission")
	p.values.principal in {"events.amazonaws.com", "scheduler.amazonaws.com"}
}

# Con EventBridge Scheduler, el permiso es un rol del programador que puede invocar la función.
cumple contains "permiso_eventos" if {
	comun.conecta_en_algo("aws_scheduler_schedule", "aws_iam_role")
	"lambda:InvokeFunction" in comun.acciones_iam
}

cumple contains "tema" if {
	comun.hay("aws_sns_topic")
	"sns:Publish" in comun.acciones_iam
}

cumple contains "logs" if {
	some g in comun.recursos("aws_cloudwatch_log_group")
	g.values.retention_in_days == 14
}
