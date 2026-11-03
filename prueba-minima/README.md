# Prueba mínima de recursos en el emulador

Antes de construir el agente se comprobó qué recursos funcionan en el emulador. Para cada uno de los 12 casos del experimento (C01 a C12) hay una solución de referencia escrita a mano en `casos/CXX/main.tf`. El script la despliega, comprueba que un segundo `tofu plan` no muestre cambios pendientes y la destruye.

```bash
npm run prueba-minima          # los 12 casos
npm run prueba-minima C05 C11  # solo algunos
```

`proveedor.tf` apunta el proveedor AWS al emulador (`AWS_ENDPOINT`, por defecto `http://localhost:4566`). `.terraform.lock.hcl` fija la versión del proveedor para que todos usen la misma. Los resultados se guardan en `resultados.md` y `resultados.json`.

Estas soluciones sirven también como referencia de cada caso en el experimento: las listas de verificación de cumplimiento se escriben a partir de ellas.

## Casos

| Nivel | Caso | Servicios |
|---|---|---|
| N1 | C01 | S3 (versionado, cifrado, bloqueo de acceso público) |
| N1 | C02 | DynamoDB (clave compuesta, TTL, recuperación) |
| N1 | C03 | SQS con cola de fallidos |
| N1 | C04 | IAM (rol de solo lectura sobre un bucket) |
| N2 | C05 | S3 + SQS (notificación) |
| N2 | C06 | SNS + 2 SQS |
| N2 | C07 | Lambda + SQS + IAM |
| N2 | C08 | API Gateway HTTP + Lambda + IAM |
| N3 | C09 | API Gateway + Lambda + DynamoDB + IAM |
| N3 | C10 | S3 + Lambda + DynamoDB + SQS + IAM |
| N3 | C11 | VPC, subredes, rutas, grupos de seguridad |
| N3 | C12 | EventBridge + Lambda + SNS + CloudWatch Logs |

## Emuladores

Los 12 casos pasan completos en los dos emuladores (`resultados-floci.md` y `resultados-ministack.md`). `EMULADOR` indica cuál está en `AWS_ENDPOINT`: con `ministack`, el estado se reinicia entre casos; Floci no tiene ese endpoint, y no hace falta porque cada caso usa nombres propios y se destruye al terminar.

## Diferencias encontradas

- `aws_vpc_security_group_ingress_rule` con `referenced_security_group_id` deja el plan con un cambio pendiente: el valor vuelve como `000000000000/sg-...` en lugar de `sg-...`. No es un fallo del emulador. El proveedor escribe así el ID cuando no conoce la cuenta, y no la conoce porque `proveedor.tf` usa `skip_requesting_account_id = true`, igual que la guía oficial de Floci. Sin esa opción el proveedor llama a S3 Control con la cuenta como subdominio (`000000000000.localhost`), que no resuelve en local, y C01 falla. En el experimento, esta diferencia (mismo ID con la cuenta delante) se trata como cosmética al medir el plan posterior al apply, igual para todas las configuraciones.
- `s3control` está en la lista de endpoints del emulador para que ninguna llamada salga a AWS real.
- MiniStack 1.5.36 no guarda las etiquetas de `aws_vpc_security_group_egress_rule` con `ip_protocol = "-1"`, y el plan queda con cambios pendientes. Floci 2.4.0 no tiene ese problema. La referencia de C11 escribe las reglas dentro de `aws_security_group`, que funciona sin diferencias en los dos.
- P2 despliega en Floci 2.4.0, pero el plan posterior muestra dos diferencias del emulador: la política de autoescalado vuelve con `enabled = false` y `cooldown = 300`, y el grupo de parámetros de RDS vuelve sin sus parámetros. La prueba mínima lo informa tal cual; en el experimento esas diferencias exactas se tratan como cosméticas (ADR-019). En MiniStack, P2 no llega a desplegar (autoescalado con grupos de destino y alarmas de CloudWatch).
- Las funciones Lambda se crean pero no se invocan: el experimento mide la infraestructura, no el código de la aplicación.
