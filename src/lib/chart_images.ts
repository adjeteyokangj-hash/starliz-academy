type LinePoint = { label: string; value: number };
type BarPoint = { label: string; value: number; color?: string };
type ChartThemeOptions = {
  surface?: string;
  titleColor?: string;
  labelColor?: string;
  valueColor?: string;
};

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = svgToDataUrl(svg);
  });
}

export async function createLineChartImage(title: string, points: LinePoint[], color = "#00CEC9", theme?: ChartThemeOptions): Promise<string | null> {
  if (!points.length) return null;
  const width = 720;
  const height = 280;
  const padding = 32;
  const max = Math.max(1, ...points.map((point) => point.value));
  const min = Math.min(0, ...points.map((point) => point.value));
  const range = Math.max(1, max - min);

  const coords = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, points.length - 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });

  const d = coords.map((c, index) => `${index === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const labels = coords.map((c) => `<text x="${c.x}" y="${height - 6}" text-anchor="middle" font-size="16" fill="${theme?.labelColor ?? "#64748b"}">${c.label}</text>`).join("");
  const dots = coords.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="6" fill="${color}" />`).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${theme?.surface ?? "#f8fafc"}" rx="28" />
    <text x="24" y="28" font-size="22" font-weight="700" fill="${theme?.titleColor ?? "#1e293b"}">${title}</text>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${labels}
  </svg>`;

  return svgToPngDataUrl(svg, width, height);
}

export async function createBarChartImage(title: string, points: BarPoint[], theme?: ChartThemeOptions): Promise<string | null> {
  if (!points.length) return null;
  const width = 720;
  const height = 280;
  const padding = 32;
  const max = Math.max(1, ...points.map((point) => point.value));
  const band = (width - padding * 2) / points.length;

  const bars = points.map((point, index) => {
    const barHeight = ((height - 100) * point.value) / max;
    const x = padding + index * band + 12;
    const y = height - 48 - barHeight;
    const w = Math.max(40, band - 24);
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${barHeight}" rx="16" fill="${point.color ?? "#6C5CE7"}" />
      <text x="${x + w / 2}" y="${height - 18}" text-anchor="middle" font-size="16" fill="${theme?.labelColor ?? "#64748b"}">${point.label}</text>
      <text x="${x + w / 2}" y="${Math.max(48, y - 8)}" text-anchor="middle" font-size="16" font-weight="700" fill="${theme?.valueColor ?? "#1e293b"}">${point.value}</text>
    `;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${theme?.surface ?? "#f8fafc"}" rx="28" />
    <text x="24" y="28" font-size="22" font-weight="700" fill="${theme?.titleColor ?? "#1e293b"}">${title}</text>
    ${bars}
  </svg>`;

  return svgToPngDataUrl(svg, width, height);
}
