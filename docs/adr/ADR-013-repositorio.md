# ADR-013: Repositorio y commits

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RNF-08

## Contexto

El desarrollo debe quedar registrado paso a paso.

## Opciones consideradas

1. Repositorio privado durante el desarrollo y público al entregar.
2. Repositorio público desde el inicio.

## Decisión

Repositorio en GitHub, privado durante el desarrollo, con un commit por paso que describe lo hecho y lo verificado. Las claves y la configuración local no se suben.

## Consecuencias

El historial sirve de evidencia del proceso. Antes de hacerlo público se revisa que no haya datos sensibles.
