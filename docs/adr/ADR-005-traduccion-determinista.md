# ADR-005: Traductor y diagrama deterministas

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-07, RF-10

## Contexto

Si el modelo generara también el código o el diagrama, estos podrían contradecir al artefacto y entre sí.

## Opciones consideradas

1. El modelo traduce el artefacto a HCL.
2. Un traductor en código genera `main.tf.json` y el diagrama.

## Decisión

La traducción a `main.tf.json` y el diagrama Mermaid los genera código determinista, sin el modelo.

## Consecuencias

El diagrama que se revisa y el código que se despliega salen del mismo objeto validado. Se ahorra una llamada al modelo por iteración. El diagrama hereda la validación del artefacto, que atiende la falta de validación automática de artefactos de diseño señalada por la revisión.
