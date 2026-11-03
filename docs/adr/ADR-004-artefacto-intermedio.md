# ADR-004: Artefacto intermedio híbrido

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-02

## Contexto

Las representaciones intermedias aparecen en solo el 16.7 % de los estudios (S03, S08). S08 genera un grafo que una ontología completa; S03 mantiene un estado estructurado y lo muestra como diagrama.

## Opciones consideradas

1. Lista de recursos con tipos del proveedor y atributos (casi Terraform en JSON).
2. Componentes abstractos que el traductor convierte en recursos.
3. Híbrido: recursos con tipo real del proveedor, más relaciones explícitas, propósito, requisito atendido y supuestos.

## Decisión

Se adopta el artefacto híbrido, definido en `esquema/artefacto.schema.json`. Las referencias entre recursos se escriben como `${ref:id.atributo}`.

## Consecuencias

El traductor sigue siendo simple. Las relaciones y las justificaciones alimentan el diagrama y la revisión humana, y permiten a C2 detectar dependencias faltantes, la causa del 80 % de las fallas de S08.
