# ADR-000: Modelo de costos: sin gasto por defecto

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-14, RNF-01

## Contexto

Probar con un modelo real cuesta dinero, y el desarrollo exige ejecutar el agente muchas veces. El costo y la latencia de los mecanismos de control son una limitación en el 41.7 % de los estudios de la revisión.

## Opciones consideradas

1. Llamar siempre a la API real.
2. Usar respuestas grabadas durante el desarrollo y la API solo en el experimento.
3. Usar un modelo local gratuito.

## Decisión

El proveedor por defecto es `grabado`: respuestas guardadas que reproducen corridas completas sin llamar a ningún servicio. El gasto de API ocurre solo al ejecutar el experimento, con la clave y la cuenta de quien lo ejecuta, y con límites por corrida y por experimento.

## Consecuencias

Todo el desarrollo y las pruebas automáticas cuestan cero. Las respuestas grabadas no miden la calidad del modelo; para eso están el piloto y el experimento.
