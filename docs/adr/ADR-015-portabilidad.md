# ADR-015: Portabilidad y Codespaces

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RNF-03, RNF-04

## Contexto

Quien ejecute el experimento debe poder instalar la herramienta en su equipo o usarla en la nube con su propia cuenta.

## Opciones consideradas

1. Solo instrucciones de instalación.
2. Instrucciones, diagnóstico y configuración de contenedor para Codespaces.

## Decisión

Todo lo variable va en `.env`; `versiones.json` fija las versiones; `npm run doctor` revisa el entorno; `.devcontainer/` instala las herramientas verificando sus sumas SHA-256 y arranca Floci.

## Consecuencias

Verificado en Windows y en la imagen de Codespaces. Codespaces se cobra a la cuenta de quien lo abre.
