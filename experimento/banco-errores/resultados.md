# Banco de errores insertados: resultados

Fecha: 2026-11-03 · Emulador: http://localhost:4567 · Proveedor AWS 6.71.0

Cada caso es un artefacto válido (C01, C03 o C07) con un solo error insertado a mano. Se valida con las capas C1-C4 reales, sin modelo.

| Tipo de error | Casos | Detectados | En la capa esperada | C1 | C2 | C3 | C4 |
|---|---|---|---|---|---|---|---|
| estructura | 5 | 100 % | 100 % | 5 | 0 | 0 | 0 |
| atributo-inexistente | 5 | 100 % | 100 % | 0 | 5 | 0 | 0 |
| atributo-deprecado | 5 | 100 % | 100 % | 0 | 5 | 0 | 0 |
| referencia-rota | 5 | 100 % | 100 % | 0 | 5 | 0 | 0 |
| dependencia-circular | 5 | 100 % | 100 % | 0 | 5 | 0 | 0 |
| tipo-invalido | 5 | 100 % | 100 % | 0 | 5 | 0 | 0 |
| violacion-politica | 5 | 100 % | 100 % | 0 | 0 | 5 | 0 |
| fuera-de-rango | 5 | 80 % | 80 % | 0 | 0 | 0 | 4 |
| Total | 40 | 98 % | 98 % | | | | |

Casos detectados en otra capa o no detectados:

- fuera-de-rango-4: esperada C4, detectada ninguna (sin errores)
