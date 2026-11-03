# agente-iac-intermedio

Agente basado en un LLM que, a partir de un requerimiento en lenguaje natural, genera un artefacto intermedio en JSON que describe la infraestructura cloud. Del artefacto se derivan, de forma determinista, un diagrama Mermaid para revisión humana y el código OpenTofu. El artefacto se valida por capas antes de desplegar en un emulador de AWS.

Proyecto del curso Tópicos Avanzados en Ingeniería de Software, Universidad Nacional de San Agustín de Arequipa.

## Estado

En desarrollo.

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | Ejecutar la herramienta |
| OpenTofu | 1.13.1 | Validar, planificar y desplegar |
| OPA | 1.22.0 | Políticas |
| MiniStack o Floci | ver `versiones.json` | Emulador de AWS en `http://localhost:4566` |

Las versiones exactas están en `versiones.json`.

## Configuración

1. Copia `.env.example` como `.env`.
2. Elige el proveedor del modelo en `LLM_PROVEEDOR`. Con `grabado` no se usa ningún servicio de pago.
3. Si usas `anthropic`, pon tu propia clave en `ANTHROPIC_API_KEY`: el gasto se cobra a tu cuenta.

El archivo `.env` no se sube al repositorio.

## Autor

José Luis Cuenca Gutiérrez.
