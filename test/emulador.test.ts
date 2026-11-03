import { describe, expect, it } from "vitest";
import { contenedoresHuerfanos } from "../src/experimento/emulador.js";

describe("limpieza de Floci", () => {
  it("elige los contenedores de tareas que Floci crea y deja los de servicio", () => {
    const nombres = [
      "floci",
      "floci-aws-ecs-8d555fdd-FoodstoreFoods",
      "floci-aws-redshift-000000000000-default",
      "floci-aws-ec2-volume-helper",
      "floci-aws-ecr-registry",
      "mi-base-de-datos",
    ];
    expect(contenedoresHuerfanos(nombres)).toEqual(["floci-aws-ecs-8d555fdd-FoodstoreFoods", "floci-aws-redshift-000000000000-default"]);
  });
});
