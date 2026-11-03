# ADR-001: Claude Haiku 5.5 como modelo

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RNF-01

## Contexto

El experimento tiene unas 414 corridas. El precio por millón de tokens es de US$ 0.10 / 0.50 para Haiku 5.5, US$ 2 / 10 para Sonnet 5.5 y US$ 4 / 20 para Opus 5.5.

## Opciones consideradas

1. Haiku 5.5.
2. Sonnet 5.5.
3. Opus 5.5.

## Decisión

Se usa Haiku 5.5. El modelo es configurable (`LLM_MODELO`) y se puede repetir parte del experimento con Sonnet 5.5 si hay presupuesto.

## Consecuencias

El experimento completo se estima por debajo de US$ 3.50 (ver `04-diseno-experimental.md`). Un modelo pequeño comete más errores, lo que da más casos para observar el validador y la retroalimentación. Los resultados valen para este modelo.
