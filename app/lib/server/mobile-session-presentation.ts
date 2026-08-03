import QRCode from "@/app/vendor/qrcode/core/qrcode";
import SvgRenderer from "@/app/vendor/qrcode/renderer/svg-tag";

const DEFAULT_PUBLIC_ORIGIN = "https://hhr-documentos-clinicos.danielopazo.chatgpt.site";

const qrOptions = {
  width: 360,
  margin: 2,
  color: { dark: "#123b49", light: "#ffffff" },
} as const;

function svgDataUrl(value: string): string {
  const code = QRCode.create(value, {} as Parameters<typeof QRCode.create>[1]);
  const svg = SvgRenderer.render(code, qrOptions);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}

function publicOrigin(requestUrl: string, configuredOrigin?: string): string {
  const request = new URL(requestUrl);
  const candidate = configuredOrigin?.trim()
    || (isLoopback(request.hostname) ? request.origin : DEFAULT_PUBLIC_ORIGIN);

  let origin: URL;
  try {
    origin = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_APP_ORIGIN debe ser un origen absoluto válido.");
  }

  const secure = origin.protocol === "https:"
    || (origin.protocol === "http:" && isLoopback(origin.hostname));
  if (
    !secure
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new Error("PUBLIC_APP_ORIGIN debe contener solo un origen HTTPS seguro.");
  }

  return origin.origin;
}

export function mobileSessionPresentation(
  requestUrl: string,
  token: string,
  configuredOrigin?: string,
) {
  const captureUrl = new URL("/captura", publicOrigin(requestUrl, configuredOrigin));
  captureUrl.hash = token;
  const serializedCaptureUrl = captureUrl.toString();

  return {
    captureUrl: serializedCaptureUrl,
    qrDataUrl: svgDataUrl(serializedCaptureUrl),
  };
}
