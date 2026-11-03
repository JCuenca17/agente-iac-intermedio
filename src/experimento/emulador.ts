/**
 * Contenedores que Floci crea para ejecutar tareas (por ejemplo, las tareas de ECS de R1 o
 * un clúster de Redshift) y que no detiene al borrar el recurso ni al reiniciarse. Se
 * excluyen los contenedores de servicio que Floci reutiliza (ayudante de volúmenes y
 * registro de imágenes).
 */
export function contenedoresHuerfanos(nombres: string[]): string[] {
  const deServicio = ["floci-aws-ec2-volume-helper", "floci-aws-ecr-registry"];
  return nombres.filter((n) => n.startsWith("floci-aws-") && !deServicio.includes(n));
}
