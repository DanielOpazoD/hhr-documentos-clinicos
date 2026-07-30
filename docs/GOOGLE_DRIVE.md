# Google Drive

La integración usa Google Identity Services y Google Picker con el alcance
`drive.file`. El usuario inicia el acceso desde un gesto explícito, navega por
carpetas en el selector oficial y comparte solamente los archivos elegidos.
El token de acceso permanece en memoria durante la pestaña y no se guarda en D1,
R2 ni en el navegador.

## Configuración

1. En Google Cloud, habilitar **Google Picker API** y **Google Drive API**.
2. Configurar la pantalla de consentimiento OAuth.
3. Crear un cliente OAuth de tipo **Aplicación web** y registrar como orígenes
   JavaScript autorizados `http://localhost:3030` y la URL de producción.
4. Crear una API key restringida a las APIs Picker y Drive. En **Restricciones
   de sitios web**, registrar exactamente:
   - `http://localhost:3030/*`
   - `https://hhr-documentos-clinicos.danielopazo.chatgpt.site/*`
5. Configurar en el entorno de la aplicación:
   - `GOOGLE_DRIVE_CLIENT_ID`: identificador del cliente OAuth web.
   - `GOOGLE_DRIVE_API_KEY`: API key restringida por origen y API.
   - `GOOGLE_DRIVE_APP_ID`: número del proyecto de Google Cloud.

No se utiliza `client_secret`. Los documentos nativos de Google Docs se exportan
temporalmente como DOCX; PDF, DOCX, JPG y PNG se descargan tal como fueron
seleccionados y pasan por las mismas validaciones de tamaño, firma y autorización
que una carga local.

Si el selector muestra `The API developer key is invalid` pero el inicio de
sesión sí funciona, comprobar primero las restricciones HTTP de la API key. Una
clave que autoriza localhost pero no la URL de Sites produce ese mensaje dentro
del Picker aunque el cliente OAuth sea correcto.
