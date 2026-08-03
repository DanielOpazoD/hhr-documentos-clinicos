# Subconjunto QR para SVG

Este directorio conserva únicamente el núcleo y el renderizador SVG necesarios del paquete
MIT `qrcode` vendorizado por el proyecto. La única entrada autorizada está en
`app/lib/server/mobile-session-presentation.ts`.

El navegador recibe el enlace temporal y su SVG ya generado. No debe importar este código:
así el codificador no aumenta el bundle cliente y la construcción del enlace de captura
permanece bajo autoridad del servidor.
