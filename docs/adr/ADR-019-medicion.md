# ADR-019: Métricas sobre lo desplegado y diferencias cosméticas

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RNF-07, RF-16

## Contexto

Medido sobre el plan, una política IAM con referencias a otros recursos queda desconocida hasta aplicar; el caso C07 perdía un requisito que sí cumplía. Además, con `skip_requesting_account_id`, el emulador devuelve `referenced_security_group_id` con el número de cuenta delante y el plan posterior muestra un cambio que no es real. En P2, Floci 2.4.0 informa la política de autoescalado como desactivada y con un cooldown de 300 s, y no guarda los parámetros del grupo de parámetros de RDS, aunque ambos se crearon como se declararon.

## Opciones consideradas

1. Medir sobre el plan.
2. Medir sobre el estado después del apply.

## Decisión

M3 y M4 se miden sobre el estado después del apply, con las referencias de la configuración. Las listas de M4 aceptan formas deprecadas que siguen funcionando (la forma deprecada la cuenta M2). Se tratan como cosméticas, y se registran aparte, solo estas diferencias y solo en su forma exacta: el ID de grupo con la cuenta delante; en `aws_autoscaling_policy`, `enabled` informado como `false` cuando se declaró `true` y un `cooldown` informado cuando no se declaró; y en `aws_db_parameter_group`, una lista de parámetros vacía cuando se declararon parámetros. Cualquier otra diferencia en esos recursos cuenta como real (decisión aprobada por el autor el 2026-11-03). Todo se aplica igual a todas las configuraciones.

## Consecuencias

Si una configuración no despliega, M3 y M4 valen 0. IaC-Eval se mide con su propio protocolo, sobre el plan, para poder comparar con S12.
