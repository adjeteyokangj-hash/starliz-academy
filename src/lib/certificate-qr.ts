import QRCode from "qrcode";

type QrSvgOptions = {
  cellSize?: number;
  marginCells?: number;
  darkColor?: string;
  lightColor?: string;
};

const DEFAULT_QR_VALUE = "https://starliz.academy/certificates/verify";

function normalizeQrValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_QR_VALUE;
}

export function buildVerificationQrSvg(value: string, options: QrSvgOptions = {}): string {
  const cellSize = options.cellSize ?? 4;
  const marginCells = options.marginCells ?? 2;
  const darkColor = options.darkColor ?? "#0f172a";
  const lightColor = options.lightColor ?? "#ffffff";

  const qr = QRCode.create(normalizeQrValue(value), { errorCorrectionLevel: "M" });
  const modules = qr.modules;
  const moduleCount = modules.size;
  const totalSize = (moduleCount + marginCells * 2) * cellSize;

  let darkRects = "";
  for (let y = 0; y < moduleCount; y += 1) {
    for (let x = 0; x < moduleCount; x += 1) {
      if (!modules.get(x, y)) continue;
      const dx = (x + marginCells) * cellSize;
      const dy = (y + marginCells) * cellSize;
      darkRects += `<rect x="${dx}" y="${dy}" width="${cellSize}" height="${cellSize}"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" role="img" aria-label="Verification QR code"><rect width="100%" height="100%" fill="${lightColor}"/><g fill="${darkColor}">${darkRects}</g></svg>`;
}

export function buildVerificationQrDataUrl(value: string, options: QrSvgOptions = {}): string {
  const svg = buildVerificationQrSvg(value, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
