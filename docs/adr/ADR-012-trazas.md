# ADR-012: Trazas en JSON Lines

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-13

## Contexto

Las métricas del experimento salen de lo que pasa dentro de cada corrida.

## Opciones consideradas

1. JSON Lines, un archivo por corrida.
2. SQLite.

## Decisión

Un archivo `trazas.jsonl` por corrida, con un evento por línea y su tiempo.

## Consecuencias

Sin dependencias; se analiza con cualquier lenguaje.
