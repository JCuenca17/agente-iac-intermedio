# Funciones comunes para las listas de verificación (métrica M4).
# Se evalúan sobre el plan en JSON (`tofu show -json`), igual que las políticas de
# intención de IaC-Eval, así que sirven para la herramienta y para la generación directa.
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

# Acciones IAM concedidas en documentos de política, de recursos o de data sources.
acciones_iam contains accion if {
	some r in input.planned_values.root_module.resources
	some campo in ["policy", "inline_policy"]
	documento := json.unmarshal(r.values[campo])
	some declaracion in documento.Statement
	some accion in lista(declaracion.Action)
}

acciones_iam contains accion if {
	some r in input.configuration.root_module.resources
	r.type == "aws_iam_policy_document"
	some declaracion in r.expressions.statement
	some accion in declaracion.actions.constant_value
}

acciones_iam contains accion if {
	some r in input.planned_values.root_module.resources
	r.type == "aws_iam_policy_document"
	some declaracion in r.values.statement
	some accion in declaracion.actions
}

lista(x) := x if is_array(x)

lista(x) := [x] if is_string(x)
