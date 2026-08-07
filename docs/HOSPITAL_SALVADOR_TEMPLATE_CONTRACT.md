# Contrato de la plantilla de traslado al Hospital del Salvador

## Referencia

- Fuente retenida: `/Users/daniel/Documents/Plantillas Documentos Medicos/08-traslado-hospital-salvador/plantilla/Formato informe traslado H. Salvador.docx`
- Copia de distribución: `public/templates/formato-informe-traslado-hospital-salvador.docx`
- SHA-256: `c23e3517eb0626c2702c5404b4f5315d1adc4a260a3955a410395211d94f57b2`
- Páginas en blanco: 1. Secciones Word: 1.
- Evidencia visual y auditorías: render y análisis realizados el 26-07-2026 en un directorio temporal de control.

## Sistema de página

- Tamaño: oficio, 8,5 × 14 pulgadas (`12240 × 20160` DXA), orientación vertical.
- Márgenes: superior e inferior `1417` DXA; izquierdo y derecho `1701` DXA.
- Distancia de encabezado y pie: `720` DXA.
- Una sección, encabezado y pie propios, sin primera página diferente.

## Elementos que no se modifican

- Encabezado `word/header1.xml`, incluida la leyenda `DEPARTAMENTO GESTION DE CAMAS 2026`.
- Pie `word/footer1.xml`.
- Logos `word/media/image1.png` y `word/media/image2.png`, sus relaciones `rId7` y `rId8`, tamaño y posición.
- Título `Hospital Del Salvador`, numeraciones, estilos, tema, fuentes, geometría, relaciones y partes opacas del paquete.
- Orden, rótulos y numeración de los campos oficiales.

## Campos editables

Los valores se incorporan en `word/document.xml` junto al rótulo existente. Ningún campo se elimina; cuando no existe respaldo se usa `-`.

### Antecedentes personales

1. Nombre Completo
2. RUT
3. Edad
4. Fecha de solicitud de traslado
5. Tipo FONASA
6. Domicilio
7. Ocupación
8. AUGE (caso inscrito)
9. Red de apoyo (teléfono familiar o persona responsable)

### Antecedentes clínicos

1. Historia clínica actual del paciente (precisar sintomatología del paciente, motivo de consulta)
2. Examen físico completo
3. Anamnesis remota (historial de hospitalizaciones)
4. Diseño de estudio diagnóstico
5. Resultados de exámenes (adjuntarlos)
6. Tratamiento actual y evolución del paciente
7. Diagnóstico
8. Fundamento diagnóstico
9. Fundamento de solicitud de traslado (indicar especialidad)

## Reglas de generación

- La aplicación descarga la copia oficial y modifica únicamente `word/document.xml`.
- El contenido se escapa como XML; no se inserta XML procedente de los archivos clínicos ni de la respuesta del modelo.
- Las demás partes del paquete se conservan con los mismos bytes descomprimidos.
- La firma profesional se agrega después de los campos, antes de `w:sectPr`, usando tipografía y tamaño derivados del documento.
- El nombre de salida identifica al paciente cuando está disponible, sin sobrescribir la plantilla.

## Compuertas de fidelidad

- La plantilla distribuida debe conservar el SHA-256 registrado.
- El archivo final debe contener `word/header1.xml`, `word/footer1.xml`, ambos archivos de `word/media/` y las relaciones de imagen.
- El encabezado debe seguir conteniendo `DEPARTAMENTO GESTION DE CAMAS 2026`.
- Deben existir los 18 rótulos oficiales y cada uno debe tener un valor.
- Una prueba estructural debe confirmar que solo `word/document.xml` cambia respecto de la plantilla.
- El archivo generado debe abrir como DOCX válido y conservar página oficio, logos, título, numeración, encabezado y pie.
