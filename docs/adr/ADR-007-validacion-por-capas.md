# ADR-007: Cuatro capas de validación

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-04, RF-05, RF-06, RF-08, RNF-06

## Contexto

La validación sintáctica sola no basta (S05, S06); los mejores resultados combinan validación sintáctica, de planificación y semántica (S08, S12). OPA, Checkov, TFLint y el plan de Terraform son los motores más usados.

## Opciones consideradas

1. Una sola capa con `tofu validate`.
2. Capas sobre el código generado.
3. Capas sobre el artefacto y luego sobre el código.

## Decisión

C1 valida la estructura con Ajv; C2, la semántica con reglas propias contra el esquema del proveedor; C3, las políticas con OPA/Rego sobre el artefacto; C4, `tofu validate` y `tofu plan` contra el emulador. Se ejecutan de la más barata a la más costosa y se detienen en la primera que falla.

## Consecuencias

Los errores de diseño se detectan antes de generar código. Detenerse en la primera capa que falla ahorra tiempo, pero oculta errores de capas posteriores en esa iteración. Checkov y TFLint quedan fuera: repiten parte de lo que hacen C2 y el plan.
