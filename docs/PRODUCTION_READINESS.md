# Preparación para producción

## Estado actual

La aplicación está preparada como un entorno privado funcional, pero no se declara acreditada para operación clínica institucional. La promoción a producción clínica requiere completar los controles organizacionales y operativos pendientes, además del código.

## Controles implementados

- Acceso autenticado y separación de datos por usuario.
- Secretos de OpenAI almacenados en el servidor, nunca en el navegador.
- Documentos y metadatos persistidos en D1; archivos y firmas privados en R2.
- Límites explícitos de tamaño y tipo para archivos, capturas y firmas.
- Borradores de IA editables, sin finalización o firma automática.
- Reserva atómica en D1 antes de cada operación de IA, con cuota móvil por usuario, concurrencia separada para nube y modelo local, caducidad de ejecuciones abandonadas y timeouts acotados.
- Consumo de tokens registrado para borradores, mejora de prompts y plantillas derivadas; disponibilidad de la ventana de 24 horas visible sin añadir telemetría clínica.
- Registro de creación, actualización, carga, generación y errores relevantes.
- Errores API correlacionados mediante un código de soporte, contrato estable y logs estructurados sin cuerpos ni identificadores clínicos.
- Versionado de documentos al cambiar su estado clínico.
- Historial visible con restauración no destructiva como borrador y control optimista de concurrencia.
- Formularios institucionales originales preservados para impresión.
- Sin pacientes, resultados, conexiones ni documentos de muestra en la aplicación.
- Encabezados de seguridad para tipo de contenido, marcos, referencia y permisos del navegador.
- Una sola sesión de captura móvil activa por usuario, incluso ante creaciones concurrentes; un QR nuevo invalida el anterior.
- Capacidad de captura fuera de rutas HTTP y HTML renderizado, con revocación efectiva y rechazo de cargas posteriores.
- Archivos móviles atribuidos a su sesión exacta; una carga de escritorio no puede simular ese origen.
- Reserva D1 previa a cada escritura móvil en R2, publicación atómica y limpieza recuperable de cargas interrumpidas.
- Componentes de documentos e IA separados por dominio y responsabilidad.
- Dependencia directa de Next.js actualizada a la versión corregida de su rama estable.
- Overrides acotados de PostCSS y Sharp corrigen avisos transitivos; `npm audit --omit=dev` reporta cero vulnerabilidades productivas.
- Build reproducible, lint y TypeScript estricto sin errores.
- Pruebas automatizadas estructurales, de políticas puras y de integración HTTP contra el Worker construido con D1/R2 locales desechables.
- Recorridos de integración para autenticación, aislamiento por propietario, concurrencia y restauración documental, archivos, firmas, ciclo de vida y procedencia de sesiones móviles, y límites de IA sin proveedores externos.
- Gate de integración continua con verificación de build, migraciones, presupuesto de JavaScript/CSS e integración del runtime privado.
- Esquema D1 administrado exclusivamente por migraciones versionadas; ninguna solicitud crea tablas, altera columnas o aplica compatibilidades históricas.
- Pruebas de instalación vacía y actualización desde las rutas históricas y las dos versiones canónicas anteriores, con conservación de registros y rollback sobre una copia desechable.
- Verificador privado de migraciones, índices, versiones documentales, relaciones huérfanas y firmas predeterminadas que solo emite conteos.

## Controles pendientes antes de uso clínico institucional

1. Aprobación institucional del tratamiento de datos y del proveedor de IA.
2. Política documentada de retención, eliminación, exportación y derecho de acceso.
3. Automatización institucional de respaldos D1/R2 y simulacro remoto periódico; el procedimiento D1 y su ensayo local ya están documentados.
4. Alertas operativas externas y procedimiento institucional de respuesta a incidentes; la correlación y el diagnóstico local ya están documentados.
5. Revisión de amenazas, pruebas de penetración y validación de dependencias transitivas.
6. Matriz de roles y permisos clínicos más granular si se amplía el acceso.
7. Validación legal de firma, receta, consentimiento e integraciones externas.
8. Plan de continuidad operativa y procedimiento manual de contingencia.
9. Piloto controlado con usuarios designados, criterios de salida y registro de hallazgos.

## Regla de promoción

Una versión solo puede promoverse cuando el código validado coincide con el artefacto desplegado, no contiene datos de muestra, los controles pendientes aplicables tienen responsable y evidencia, y existe un procedimiento de reversión probado.
