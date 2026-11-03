# Proyectos reales R1 y R2

R1 y R2 son proyectos públicos de terceros, usados como proyectos grandes del experimento. Cada carpeta conserva la licencia original (`LICENSE`).

| Caso | Proyecto | Versión usada | Licencia |
|---|---|---|---|
| R1 | [localstack-samples/sample-terraform-ecs-apigateway](https://github.com/localstack-samples/sample-terraform-ecs-apigateway): APIs en contenedores con ECS Fargate, API Gateway, Cognito y DynamoDB | commit `98f30b3` (2026-10-19), carpeta `terraform/` | Apache-2.0 |
| R2 | [jcolemorrison/vault-on-aws](https://github.com/jcolemorrison/vault-on-aws): clúster de HashiCorp Vault con autoescalado, KMS, DynamoDB y S3 | commit `c1100f9` (2022-03-30), todos los `.tf` | MIT, Copyright (c) 2020 Johnathan Cole Morrison |

El requerimiento de cada caso (`experimento/casos/R1` y `R2`) resume lo que el propio proyecto declara en su README. La lista de verificación de M4 sale de esas mismas funciones.

## Cambios respecto del original

Los cambios se limitan a lo necesario para que cada proyecto se despliegue solo en el emulador con el proveedor fijado (6.71.0). Cada uno está comentado en el `main.tf`.

**R1**

- Se quitó el bloque `provider` (fijaba el proveedor en la versión 5.8 o anterior y agregaba etiquetas de AWS Partner); la herramienta configura el proveedor.
- `aws_eip`: `vpc = true` pasa a `domain = "vpc"`, y `data.aws_region` usa `region` en lugar de `name`, formas vigentes en la versión 6.
- El recurso `container_security_group_self_ingress` declaraba un grupo de seguridad con el ID de otro grupo como `vpc_id`, error de la traducción desde CloudFormation que también falla en AWS. Se reemplazó por la regla que define la plantilla de CloudFormation del mismo proyecto: entrada TCP 8080 del grupo de contenedores desde sí mismo.

**R2**

- Se unieron los archivos `.tf` en un solo `main.tf`, en el mismo orden temático; la plantilla `files/userdata_template.sh` se conserva.
- Se quitó `providers.tf`, que apuntaba a un perfil real de AWS.
- El certificado de ACM y el par de claves SSH se crean en la configuración; el original exigía que existieran antes. El par usa una clave pública de prueba, sin clave privada.
- Se quitó la lectura de la AMI desde SSM; se usa la AMI fija que el original ya trae por defecto.
- Se quitaron los dos `local_file` que escribían archivos en la PC.
- `domain_name` y `ec2_key_pair_name` tienen valores por defecto.
- Formas eliminadas en versiones recientes del proveedor: `vpc = true` en `aws_eip` y la lista `tags` de `aws_autoscaling_group` (pasa a bloques `tag`).

## Limitación del emulador

En Floci 2.4.0, al borrar un servicio de ECS el contenedor de su tarea sigue corriendo y el clúster no se puede eliminar (`ClusterContainsTasksException`); tampoco se quitan los registros de las tareas en el descubrimiento de servicios (`ResourceInUse`). Por eso la destrucción de R1 falla en Floci. Cuando una destrucción falla, el experimento elimina los contenedores que Floci dejó y lo reinicia, lo que deja su estado vacío. No afecta a M1, que se mide antes de destruir.
