# ADR-014: Tres proveedores del modelo

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RF-14

## Contexto

Hay tres situaciones de uso: desarrollo sin gasto, pruebas puntuales con un plan de suscripción y el experimento con la API.

## Opciones consideradas

1. Solo la API.
2. Grabado, Claude Code en modo no interactivo y API, detrás de una misma interfaz.

## Decisión

Tres proveedores con la misma interfaz. `claude-code` ejecuta `claude -p` sin herramientas, sin guardar la sesión, desde una carpeta temporal vacía (para no cargar instrucciones de otros proyectos) y sin claves de API en el entorno. `anthropic` usa el SDK oficial con caché del prompt de sistema.

## Consecuencias

El mismo ciclo funciona con los tres. Los tokens de `claude-code` incluyen un contexto propio de Claude Code; sirven para estimar el presupuesto, no para el experimento.
