# Evaluaciones deterministas de obediencia clínica

`npm run test:ai-evals` comprueba que el flujo de generación respete alcance, exclusiones,
identidad estructurada y configuración de plantillas. Es una batería de regresión offline:
no puntúa estilo ni compara párrafos completos y nunca contacta a OpenAI u otro proveedor.

## Qué recorre

Cada caso conserva el camino productivo que interesa verificar:

1. compone el perfil y las indicaciones profesionales reales;
2. construye el contrato de sistema real;
3. ejecuta el grafo clínico con un proveedor simulado y una única generación;
4. parsea y protege la salida con `parseClinicalOutput`;
5. aplica el verificador exportado `verifyClinicalDraftOutput` mediante el workflow real;
6. ensambla las secciones con la configuración real de la plantilla;
7. comprueba en `tests/ai-evals/harness.ts` invariantes pequeñas sobre estructura y contenido
   permitido, declaradas por cada fixture mediante `EvalExpectedState` en
   `tests/ai-evals/fixtures.ts`.

Solo se sustituye la llamada de red. El proveedor simulado devuelve un JSON fijo para que un
fallo señale una regresión del contrato local y no una variación del modelo.

## Cobertura actual

Los diez escenarios cubren los ocho destinos clínicos y dos solicitudes libres:

| Área | Regla protegida |
| --- | --- |
| Epicrisis | Diferencia contenido confirmado, `No consta` y datos no encontrados. |
| Traslado agudo | Conserva contenido clínico válido que menciona al paciente. |
| Informe médico | Respeta identificadores, títulos y orden configurados en la plantilla. |
| Certificado | Incluye el texto aportado por el profesional y excluye laboratorio no solicitado. |
| Telegastroenterología | No inventa diagnóstico, tratamiento ni seguimiento. |
| Telenefrología | Una exclusión explícita prevalece sobre el contenido de la fuente. |
| Telereumatología | No agrega secciones o conclusiones no respaldadas. |
| Traslado al Salvador | Mantiene exactamente los 18 campos únicos y su orden canónico. |
| Modo libre: identidad | Extrae la identificación sin trasladar resultados al documento. |
| Modo libre: certificado | Elimina la sección identificatoria redundante y conserva el discurso solicitado. |

La suite exige además una sola ejecución del nodo de modelo, evidencia local verificable,
repetibilidad y mensajes de error con identificador del fixture, regla y resultado observado.

## Añadir una regresión

Cuando aparezca un fallo real:

1. Reduzca el caso a la menor fuente sintética que reproduzca la clase de error. No copie ni
   anonimice parcialmente un documento clínico real.
2. Añada el fixture a `tests/ai-evals/fixtures.ts` con un identificador descriptivo y una sola
   regla principal.
3. Modele la respuesta fija que debería atravesar el parser y el verificador. No cambie el
   prompt para acomodar el test.
4. Declare el payload en `EvalExpectedState`: términos requeridos o prohibidos, títulos, orden,
   identidad o asuntos pendientes. Añada una clase de invariante al harness solo cuando esos
   campos no expresen la regresión. Evite snapshots de prosa completa.
5. Ejecute `npm run test:ai-evals` y luego `npm run verify`.

Un fixture debe seguir siendo pequeño, legible y determinista. Si necesita red, reloj,
aleatoriedad, una segunda llamada al modelo o un evaluador generativo, no pertenece a esta
batería.

## Límites

Estas pruebas verifican obediencia del software frente a contratos concretos. No demuestran
calidad médica general, seguridad diagnóstica, aprobación institucional ni equivalencia entre
el proveedor simulado y un modelo remoto. Todo borrador continúa requiriendo revisión y firma
profesional.
