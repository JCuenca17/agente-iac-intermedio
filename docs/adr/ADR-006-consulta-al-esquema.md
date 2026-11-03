# ADR-006: Consulta exacta al esquema del proveedor como RAG

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-03, RF-05

## Contexto

Las alucinaciones y el conocimiento desactualizado son la limitación más frecuente (50 %). S06 mejoró la migración correcta por encima del 60 % dándole al modelo el esquema del proveedor obtenido con `providers schema -json`.

## Opciones consideradas

1. Consulta por tipo de recurso al esquema del proveedor, a pedido del agente.
2. Búsqueda por palabras clave sobre el requerimiento.
3. Base vectorial (Chroma) con embeddings.

## Decisión

El agente consulta el esquema vigente por tipo de recurso. El mismo índice lo usa la capa C2 para verificar. No se usa base vectorial.

## Consecuencias

Una sola fuente informa al modelo y lo verifica. Sin dependencias ni costos extra. En el piloto el modelo no usó la consulta en los casos simples; la ablación A3 mide su aporte.
