# ADR-016: Protocolo JSON de texto para el agente

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RF-02, RF-03

## Contexto

La consulta al esquema (ADR-006) requiere que el agente pueda pedir información durante la generación. Claude Code en modo no interactivo y las respuestas grabadas no admiten la función de herramientas de la API.

## Opciones consideradas

1. Herramientas nativas de la API (tool use).
2. Protocolo de texto: el modelo responde siempre un objeto JSON con la acción `consultar_esquema` o `entregar`.

## Decisión

Se usa el protocolo de texto, con un máximo de consultas por iteración.

## Consecuencias

El comportamiento es idéntico con los tres proveedores y las respuestas grabadas reproducen corridas completas. Una respuesta que no se puede leer cuenta como error C0 y también se retroalimenta.
