// Lista los comandos de la herramienta con una línea de explicación y un ejemplo.
// Uso: npm run ayuda
// El detalle de cada comando está en docs/05-manual-de-uso.md.

const comandos = [
  ["Preparar", [
    ["npm run doctor", "Revisa que la PC tenga todo (Node, OpenTofu, OPA, esquema, .env, emulador) y dice qué falta"],
    ["npm run esquema-proveedor", "Genera el esquema del proveedor AWS fijado (.cache/esquema-aws.json); una sola vez por PC"],
    ["npm run prueba-minima [-- C01 C02]", "Despliega las soluciones de referencia en el emulador para comprobar que funciona"],
  ]],
  ["Usar la herramienta", [
    ['npm run agente -- "<requerimiento>"', "Diseña, valida, muestra la revisión y, si apruebas, despliega en el emulador y lo destruye"],
    ["npm run agente -- --archivo <ruta>", "Lo mismo, con el requerimiento en un archivo (por ejemplo experimento/casos/C10/requerimiento.md)"],
    ["npm run agente -- --sesion tienda \"<requerimiento>\"", "Agrupa la corrida en una sesión (proyecto) para el historial de consumo"],
    ["npm run historial [-- tienda]", "Tokens de entrada y salida y costo por sesión; con un nombre, cada corrida de esa sesión"],
    ["npm run agente -- --ayuda", "Todas las opciones del agente (--sesion, --sin-desplegar, --conservar, ablaciones...)"],
  ]],
  ["Experimento", [
    ["npm run experimento -- --casos C01 --repeticiones 1", "Ensayo: un caso con las 6 configuraciones, para revisar costo y entorno"],
    ["npm run experimento -- --salida resultados/exp1", "Corrida completa de los casos propios (reanudable con la misma --salida)"],
    ["npm run experimento -- --ayuda", "Todas las opciones (--casos, --config, --repeticiones, reales, grandes, iaceval)"],
    ["npm run resumen -- <carpeta>", "Resume un experimento: resumen.md, resumen.json y resumen.html con gráficos"],
  ]],
  ["Estudios sin costo", [
    ["npm run banco-errores", "Mide qué capa del validador detecta cada uno de 43 errores insertados a mano"],
    ["npm run iaceval:preparar", "Vuelve a seleccionar las tareas de IaC-Eval (ya están en experimento/iaceval/)"],
  ]],
  ["Desarrollo", [
    ["npm test", "Pruebas unitarias y de políticas (sin emulador ni modelo)"],
    ["npm run test:integracion", "Pruebas contra el emulador"],
    ["npm run build", "Compila TypeScript a dist/"],
  ]],
];

console.log("Comandos de la herramienta (detalle en docs/05-manual-de-uso.md)\n");
for (const [grupo, lista] of comandos) {
  console.log(grupo);
  for (const [comando, que] of lista) console.log(`  ${comando}\n      ${que}`);
  console.log("");
}
console.log("La configuración (modelo, clave, emulador, límites de gasto) va en .env; copia .env.example para empezar.");
