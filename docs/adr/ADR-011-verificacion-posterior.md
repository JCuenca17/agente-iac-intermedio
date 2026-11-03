# ADR-011: Plan posterior al apply como verificación

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-12

## Contexto

Hay que confirmar que lo desplegado coincide con lo declarado, como hace S11 después del despliegue.

## Opciones consideradas

1. No verificar.
2. Volver a planificar después del apply y exigir que no queden cambios.
3. Consultar cada recurso con la CLI de AWS.

## Decisión

Después del apply se ejecuta `tofu plan` y se exige que no queden cambios reales. Es la condición de éxito M1.

## Consecuencias

Gratis y sin código por tipo de recurso. Ciertas diferencias de representación entre el proveedor y el emulador se tratan como cosméticas (ADR-019).
