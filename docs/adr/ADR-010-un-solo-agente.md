# ADR-010: Un solo agente

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RNF-01

## Contexto

Los agentes múltiples con roles son la familia más frecuente (50 %), pero multiplican las llamadas: S04 reporta de 4 a 8 USD por tarea compleja.

## Opciones consideradas

1. Un agente con herramientas y verificadores deterministas.
2. Varios agentes con roles.

## Decisión

Un solo agente; la verificación la hacen componentes deterministas.

## Consecuencias

Menos llamadas y menor costo. La comparación con sistemas multiagente queda fuera del estudio.
