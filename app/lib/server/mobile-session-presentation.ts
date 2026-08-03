import QRCode from "@/app/vendor/qrcode/core/qrcode";
import SvgRenderer from "@/app/vendor/qrcode/renderer/svg-tag";

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

export function mobileSessionPresentation(requestUrl: string, token: string) {
  const captureUrl = new URL("/captura", requestUrl);
  captureUrl.hash = token;
  const serializedCaptureUrl = captureUrl.toString();

  return {
    captureUrl: serializedCaptureUrl,
    qrDataUrl: svgDataUrl(serializedCaptureUrl),
  };
}
