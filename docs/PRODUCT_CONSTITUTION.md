# Constitución de HHR Documentos

## Misión

Reducir la fricción administrativa del trabajo clínico mediante un espacio privado, claro y confiable para crear, revisar, imprimir, escanear y respaldar documentos, manteniendo siempre el control profesional sobre el resultado final.

## Objetivo del producto

Unificar formularios oficiales, documentos clínicos editables, archivos, captura móvil e importación asistida por IA en un flujo simple, trazable y preparado para integraciones de solo lectura.

## Principios de producto

1. **La superficie debe ser simple.** Cada pantalla presenta una tarea principal, sus controles directos y un estado comprensible. No se muestran detalles técnicos, advertencias repetidas ni explicaciones que no ayuden a completar la tarea.
2. **No hay contenido de demostración en producción.** Los estados vacíos son realmente vacíos. No se crean pacientes, documentos, resultados ni conexiones de muestra.
3. **El profesional conserva el control.** La IA genera borradores editables; nunca finaliza, firma ni envía un documento por sí sola.
4. **La fuente se preserva.** Los formularios institucionales se muestran e imprimen sin redibujarlos. Los datos importados no se completan por inferencia.
5. **Privacidad por defecto.** Acceso autenticado, mínima exposición de datos, secretos solo en servidor, archivos privados y operaciones atribuidas.
6. **Los estados son explícitos.** Nuevo, guardado, revisado y finalizado deben reflejar acciones reales y persistidas.
7. **La integración externa es de solo lectura.** Ninguna extensión o conexión escribe de regreso en sistemas clínicos sin un diseño, autorización y auditoría específicos.

## Constitución visual

- Fondo blanco o gris neutro; superficies clínicas limpias y sin decoración innecesaria.
- Azul profundo para navegación y acciones principales; cian únicamente como acento funcional; verde para éxito; amarillo y rojo solo para atención real.
- Jerarquía tipográfica sobria, controles compactos y áreas de trabajo amplias.
- Una acción primaria por contexto. Botones secundarios visibles solo cuando son útiles.
- Listas antes que carruseles; espacio abierto antes que acumulación de tarjetas.
- Sin insignias promocionales, gradientes decorativos, métricas inventadas ni lenguaje de marketing.
- Las alertas se reservan para errores o decisiones con impacto. La orientación normal aparece junto al control correspondiente.
- Escritorio y móvil comparten la misma arquitectura de información; el móvil prioriza captura, edición y revisión por etapas.

## Constitución de programación

1. **Responsabilidad única.** Las páginas componen; los componentes presentan; los hooks coordinan estado; los clientes HTTP transportan; el servidor valida y persiste.
2. **Módulos por dominio.** Documentos, firmas, IA, archivos y escáner viven en módulos propios con tipos y contratos explícitos.
3. **Sin monolitos.** Un componente no debe concentrar red, persistencia, transformación, interacción y presentación. Cuando acumule más de una de esas responsabilidades, debe dividirse.
4. **Datos reales o estado vacío.** Los fixtures pertenecen exclusivamente a pruebas automatizadas y nunca al código productivo.
5. **Validación en el límite.** Toda entrada de API se autentica, limita y normaliza antes de tocar D1, R2 o un proveedor externo.
6. **Errores seguros.** Los errores se registran sin datos clínicos sensibles y se presentan con mensajes accionables.
7. **Persistencia compatible.** Las migraciones son aditivas o preservan datos; los cambios destructivos requieren decisión explícita.
8. **Rendimiento predecible.** Consultas independientes en paralelo, listas acotadas, dependencias pesadas cargadas solo cuando se usan y efectos de React pequeños y estables.
9. **Accesibilidad funcional.** Navegación por teclado, foco visible, etiquetas, estados anunciables y controles táctiles suficientes.
10. **Definición de terminado.** Sin contenido de muestra, sin errores de lint, build correcto, pruebas del flujo principal, revisión responsive y evidencia de que la versión desplegada corresponde al código validado.

## Límites actuales

La aplicación no afirma acreditación clínica, firma electrónica avanzada, validez de receta para dispensación ni integración productiva con sistemas externos. Esas capacidades requieren evaluación institucional, legal, de seguridad y operativa antes de activarse.
