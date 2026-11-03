# ADR-002: Floci como emulador principal y MiniStack como réplica

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RF-19, R-02

## Contexto

Toda la validación previa de la revisión se hace en entornos sustitutos, y S06 y S08 usan LocalStack. Desde el 23 de marzo de 2026 LocalStack exige cuenta y token incluso en su plan gratuito, y no publica qué servicios incluye. Aparecieron alternativas gratuitas y de código abierto con la misma interfaz.

## Opciones consideradas

1. LocalStack (plan gratuito con cuenta).
2. Floci (MIT, sin cuenta; en Windows necesita Docker).
3. MiniStack (MIT, sin cuenta, instalable con pip).
4. Moto en modo servidor.

## Decisión

Floci 2.4.0 es el emulador principal y MiniStack 1.5.36 el de réplica. Los dos pasan los 12 casos de la prueba mínima (despliegue, plan posterior sin cambios y destrucción). Floci guarda correctamente las etiquetas de las reglas de salida de los grupos de seguridad, que MiniStack pierde.

## Consecuencias

Correr el experimento en dos emuladores reduce la amenaza de que los resultados dependan de uno. Ninguno de los dos aparece en la literatura revisada; se declara como amenaza a la validez. Cada emulador tiene huecos de cobertura, documentados en `prueba-minima/README.md`.
