# ADR-003: Docker para ejecutar Floci

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RNF-03

## Contexto

La documentación de Floci menciona un binario nativo para Windows, pero ninguna versión publicada lo incluye; su instalador oficial (floci-cli) lo ejecuta como contenedor.

## Opciones consideradas

1. Usar solo MiniStack, sin Docker.
2. Instalar Docker Desktop (gratuito para uso personal y educativo).

## Decisión

Se usa Docker Desktop para correr Floci. MiniStack queda como alternativa para quien no tenga Docker.

## Consecuencias

Con Docker, los servicios que necesitan contenedores (por ejemplo, bases de datos) se emulan con más fidelidad, y se puede probar en local la configuración de Codespaces.
