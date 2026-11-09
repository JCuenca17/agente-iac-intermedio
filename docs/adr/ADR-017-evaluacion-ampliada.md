# ADR-017: IaC-Eval y proyectos grandes en la evaluación

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RF-18

## Contexto

Se pidió probar la herramienta con un proyecto grande y compararla con un trabajo existente. Según los autores de S12, IaC-Eval es el único benchmark para generar Terraform desde lenguaje natural, y S12 publica resultados sobre él.

## Opciones consideradas

1. Solo los 12 casos propios.
2. Agregar IaC-Eval y dos proyectos grandes.

## Decisión

Se agrega una muestra de IaC-Eval (hasta 10 tareas por nivel de dificultad, cuya referencia funciona en el emulador), medida con su propio protocolo para comparar con la Tabla 2 de S12, y dos proyectos grandes: P1, tienda serverless de 47 recursos, y P2, aplicación de tres capas.

## Consecuencias

Las cifras de S12 provienen de otros modelos y de AWS real; la comparación justa es interna. Se encontraron referencias de IaC-Eval que no cumplen su propia política; se descartan y se reporta.
