# Funciones comunes para las listas de verificación (métrica M4).
# El experimento las evalúa sobre lo desplegado: `planned_values` trae los valores del
# estado después del apply y `configuration`, las expresiones del plan posterior (con las
# referencias entre recursos). Ver entradaDesplegada en src/experimento/intencion.ts.
# Sirven igual para la herramienta y para la generación directa.
#
# En el estado, un texto opcional sin valor queda como "" (no como null): para saber si
# un atributo tiene valor se usa con_valor.
package intencion.comun

import rego.v1

# Recursos gestionados del plan, con sus valores planeados.
recursos(tipo) := [r |
	some r in input.planned_values.root_module.resources
	r.mode == "managed"
	r.type == tipo
]

# Recursos de la configuración (con las expresiones y sus referencias).
config(tipo) := [r |
	some r in input.configuration.root_module.resources
	r.mode == "managed"
	r.type == tipo
]

hay(tipo) if count(recursos(tipo)) > 0

# Texto con valor (ni null ni vacío).
con_valor(x) if {
	is_string(x)
	x != ""
}

# Todas las referencias de una expresión, por ejemplo "aws_sqs_queue.avisos.arn".
referencias(expresion) := {ref |
	walk(expresion, [camino, ref])
	count(camino) > 0
	camino[count(camino) - 2] == "references"
}

# ¿Algún recurso de `tipo` referencia a un recurso de `destino` en el atributo dado?
conecta(tipo, atributo, destino) if {
	some r in config(tipo)
	some ref in referencias(object.get(r.expressions, atributo, {}))
	startswith(ref, sprintf("%s.", [destino]))
}

# ¿Algún recurso de `tipo` referencia a un recurso de `destino` en cualquier atributo?
conecta_en_algo(tipo, destino) if {
	some r in config(tipo)
	some ref in referencias(r.expressions)
	startswith(ref, sprintf("%s.", [destino]))
}

# Acciones IAM que se conceden (solo declaraciones Allow) en las políticas IAM (tipos_iam):
# atributo "policy" de esos recursos y "policy" de cada bloque inline_policy de un rol
# (en el estado, inline_policy es una lista de {name, policy}).
acciones_iam contains accion if {
	some r in input.planned_values.root_module.resources
	r.type in tipos_iam
	some documento in documentos(r.values)
	some declaracion in declaraciones(documento)
	permite(object.get(declaracion, "Effect", "Allow"))
	some accion in lista(object.get(declaracion, "Action", []))
}

acciones_iam contains accion if {
	some r in input.configuration.root_module.resources
	r.type == "aws_iam_policy_document"
	some declaracion in r.expressions.statement
	permite(object.get(object.get(declaracion, "effect", {}), "constant_value", "Allow"))
	some accion in declaracion.actions.constant_value
}

acciones_iam contains accion if {
	some r in input.planned_values.root_module.resources
	r.type == "aws_iam_policy_document"
	some declaracion in r.values.statement
	permite(object.get(declaracion, "effect", "Allow"))
	some accion in declaracion.actions
}

# Recursos que son políticas IAM (de identidades y de confianza de roles). Las políticas de
# recurso (claves KMS, endpoints de VPC, colas, buckets...) no entran: la política por defecto de
# AWS para una clave KMS da "kms:*" a la cuenta raíz y no concede permisos por sí misma.
tipos_iam := {
	"aws_iam_policy",
	"aws_iam_role_policy",
	"aws_iam_user_policy",
	"aws_iam_group_policy",
	"aws_iam_role",
	"aws_iam_policy_document",
}

documentos(valores) := propio | en_linea if {
	propio := {d |
		texto := object.get(valores, "policy", "")
		is_string(texto)
		json.is_valid(texto)
		d := json.unmarshal(texto)
	}
	en_linea := {d |
		some bloque in lista_o_vacia(object.get(valores, "inline_policy", []))
		is_object(bloque)
		texto := object.get(bloque, "policy", "")
		is_string(texto)
		json.is_valid(texto)
		d := json.unmarshal(texto)
	}
}

lista_o_vacia(x) := x if is_array(x)

lista_o_vacia(x) := [] if not is_array(x)

# Statement puede ser una lista o un solo objeto.
declaraciones(documento) := documento.Statement if is_array(documento.Statement)

declaraciones(documento) := [documento.Statement] if is_object(documento.Statement)

permite(efecto) if lower(efecto) == "allow"

lista(x) := x if is_array(x)

lista(x) := [x] if is_string(x)
