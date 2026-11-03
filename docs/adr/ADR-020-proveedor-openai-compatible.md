# ADR-020: Proveedor compatible con la API de OpenAI

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RF-14, RNF-01, RNF-03

## Contexto

Un integrante del equipo propuso poder usar modelos de otros proveedores, como NVIDIA u OpenRouter. Muchos de ellos (OpenRouter, NVIDIA, Groq, Ollama local) ofrecen la misma API, con el formato chat/completions de OpenAI. El agente no depende de funciones propias de Claude: pide la respuesta como JSON en texto (ADR-006), así que cualquier modelo de chat puede producir el artefacto.

## Opciones consideradas

1. Un proveedor por servicio, cada uno con su SDK.
2. Un solo proveedor para el formato común, sin SDK, configurado con la URL base, la clave y el modelo.

## Decisión

Opción 2: `openai-compatible`, implementado con el `fetch` de Node, sin dependencias nuevas. Se configura con `LLM_BASE_URL`, `LLM_API_KEY` (opcional en un servidor local) y `LLM_MODELO`. Reintenta hasta tres veces ante 429 y errores 5xx, y traduce `finish_reason = length` a `max_tokens` para que una respuesta cortada se informe igual que con Claude. La clave no pasa al entorno de OpenTofu (ADR-018).

Para medir el costo (M6) y aplicar los límites de gasto, un modelo que no está en `precios.json` toma su precio de `LLM_PRECIO_ENTRADA_MTOK` y `LLM_PRECIO_SALIDA_MTOK` (0 si es gratuito). Si no hay precio, la herramienta se detiene antes de la primera llamada.

## Consecuencias

Quien ejecute puede probar otros modelos sin cambiar el código, incluso gratuitos. La caché del prompt depende de cada proveedor: los tokens leídos de caché se registran aparte y se cobran a precio de entrada normal, lo que da una estimación conservadora. Comparar modelos en el experimento sería una pregunta de investigación nueva, que por ahora no se incluye. Con un modelo distinto, todas las configuraciones de un mismo experimento deben usar ese mismo modelo.
