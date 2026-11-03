# ADR-008: Tope de tres iteraciones

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-09

## Contexto

La retroalimentación de la validación hacia la generación aparece en el 33.3 % de los estudios. S05 y S10 iteran hasta 3 veces.

## Opciones consideradas

1. 3 iteraciones.
2. 5 iteraciones.

## Decisión

El tope es 3 iteraciones (`MAX_ITERACIONES`). Si se agotan, la corrida termina sin desplegar.

## Consecuencias

Acota el costo por corrida. El experimento registra en qué iteración se resuelve cada caso para juzgar si 3 alcanza.
