# Preparación para producción

## Estado actual

La aplicación está preparada como un entorno privado funcional, pero no se declara acreditada para operación clínica institucional. La promoción a producción clínica requiere completar los controles organizacionales y operativos pendientes, además del código.

## Controles implementados

- Acceso autenticado y separación de datos por usuario.
- Secretos de OpenAI almacenados en el servidor, nunca en el navegador.
- Documentos y metadatos persistidos en D1; archivos y firmas privados en R2.
- Límites explícitos de tamaño y tipo para archivos, capturas y firmas.
- Borradores de IA editables, sin finalización o firma automática.
- Registro de creación, actualización, carga, generación y errores relevantes.
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
- Recorridos de integración para autenticación, aislamiento por propietario, concurrencia y restauración documental, archivos, firmas, ciclo de vida y procedencia de sesiones móviles, y autorización de IA sin proveedores externos.
- Gate de integración continua con verificación de build, migraciones, presupuesto de JavaScript/CSS e integración del runtime privado.

## Controles pendientes antes de uso clínico institucional

1. Aprobación institucional del tratamiento de datos y del proveedor de IA.
2. Política documentada de retención, eliminación, exportación y derecho de acceso.
3. Estrategia de respaldo de D1/R2 y simulacro de restauración verificado.
4. Monitoreo operativo, alertas, trazas y procedimiento de respuesta a incidentes.
5. Límites de consumo por usuario y protección contra abuso de APIs costosas.
6. Revisión de amenazas, pruebas de penetración y validación de dependencias transitivas.
7. Matriz de roles y permisos clínicos más granular si se amplía el acceso.
8. Validación legal de firma, receta, consentimiento e integraciones externas.
9. Plan de continuidad operativa y procedimiento manual de contingencia.
10. Piloto controlado con usuarios designados, criterios de salida y registro de hallazgos.

## Regla de promoción

Una versión solo puede promoverse cuando el código validado coincide con el artefacto desplegado, no contiene datos de muestra, los controles pendientes aplicables tienen responsable y evidencia, y existe un procedimiento de reversión probado.
