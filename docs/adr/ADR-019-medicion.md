# ADR-019: Métricas sobre lo desplegado y diferencias cosméticas

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RNF-07, RF-16

## Contexto

Medido sobre el plan, una política IAM con referencias a otros recursos queda desconocida hasta aplicar; el caso C07 perdía un requisito que sí cumplía. Además, con `skip_requesting_account_id`, el emulador devuelve `referenced_security_group_id` con el número de cuenta delante y el plan posterior muestra un cambio que no es real.

## Opciones consideradas

1. Medir sobre el plan.
2. Medir sobre el estado después del apply.

## Decisión

M3 y M4 se miden sobre el estado después del apply, con las referencias de la configuración. Las listas de M4 aceptan formas deprecadas que siguen funcionando (la forma deprecada la cuenta M2). La diferencia del ID de grupo con la cuenta delante se trata como cosmética y se registra aparte. Todo se aplica igual a todas las configuraciones.

## Consecuencias

Si una configuración no despliega, M3 y M4 valen 0. IaC-Eval se mide con su propio protocolo, sobre el plan, para poder comparar con S12.
