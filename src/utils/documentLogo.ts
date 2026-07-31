import type { jsPDF } from 'jspdf';

export type CustomLogoSettings = {
  scale: number;
};

export const DEFAULT_CUSTOM_LOGO_SETTINGS: CustomLogoSettings = { scale: 100 };

export const normalizeCustomLogoSettings = (value: unknown): CustomLogoSettings => {
  const scale = typeof value === 'object' && value !== null && 'scale' in value
    ? Number((value as { scale?: unknown }).scale)
    : DEFAULT_CUSTOM_LOGO_SETTINGS.scale;

  return {
    scale: Number.isFinite(scale) ? Math.min(100, Math.max(50, Math.round(scale))) : DEFAULT_CUSTOM_LOGO_SETTINGS.scale
  };
};

export const getDocumentLogoPreviewStyle = (settings: unknown) => {
  const { scale } = normalizeCustomLogoSettings(settings);
  return { width: `${scale}%`, height: `${scale}%` };
};

export const drawDocumentLogo = (
  doc: jsPDF,
  logoBase64: string,
  settings: unknown,
  x = 20,
  y = 11
) => {
  // Espaço ampliado para dar mais presença ao timbre no documento.
  const containerWidth = 58;
  const containerHeight = 20;
  const { scale } = normalizeCustomLogoSettings(settings);

  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, containerWidth, containerHeight, 'F');

  const image = doc.getImageProperties(logoBase64);
  const aspectRatio = image.width / image.height;
  const maxWidth = containerWidth * (scale / 100);
  const maxHeight = containerHeight * (scale / 100);
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  doc.addImage(logoBase64, 'PNG', x + (containerWidth - width) / 2, y + (containerHeight - height) / 2, width, height, undefined, 'FAST');
  doc.setDrawColor(200, 195, 190);
  doc.setLineWidth(0.25);
  doc.line(x + containerWidth + 4, y, x + containerWidth + 4, y + containerHeight);

  return x + containerWidth + 8;
};
