import { useEffect, useRef, useState } from 'react';
import { Crop, Move } from 'lucide-react';

export type ImageCropAspectOption = {
  value: number;
  label: string;
};

type CropPosition = { x: number; y: number };

type CreateCroppedImageBlobOptions = {
  imageUrl: string;
  aspect: number;
  zoom: number;
  position: CropPosition;
  outputWidth: number;
};

type ImageCropEditorProps = {
  imageUrl: string;
  title: string;
  description: string;
  imageAlt: string;
  onApply: (blob: Blob) => Promise<void> | void;
  onError?: (error: unknown) => Promise<unknown> | unknown;
  applying?: boolean;
  initialAspect?: number;
  aspectOptions?: ImageCropAspectOption[];
  outputWidth?: number;
  applyLabel?: string;
  applyingLabel?: string;
  maxPreviewClassName?: string;
};

const DEFAULT_ASPECT_OPTIONS: ImageCropAspectOption[] = [
  { value: 3, label: 'Horizontal 3:1' },
  { value: 2, label: 'Horizontal 2:1' },
  { value: 16 / 9, label: 'Panorâmico 16:9' },
  { value: 1, label: 'Quadrado 1:1' },
];

const clampPosition = (value: number) => Math.max(-1, Math.min(1, value));
const DEFAULT_CROP_ZOOM = 1.15;

export const createCroppedImageBlob = ({
  imageUrl,
  aspect,
  zoom,
  position,
  outputWidth,
}: CreateCroppedImageBlobOptions) => new Promise<Blob>((resolve, reject) => {
  const image = new window.Image();
  if (/^https?:\/\//i.test(imageUrl)) {
    image.crossOrigin = 'anonymous';
  }
  image.onload = () => {
    const imageAspect = image.naturalWidth / image.naturalHeight;
    const baseWidth = imageAspect > aspect ? image.naturalHeight * aspect : image.naturalWidth;
    const baseHeight = imageAspect > aspect ? image.naturalHeight : image.naturalWidth / aspect;
    const sourceWidth = baseWidth / zoom;
    const sourceHeight = baseHeight / zoom;
    const sourceX = (image.naturalWidth - sourceWidth) / 2
      + position.x * ((image.naturalWidth - sourceWidth) / 2);
    const sourceY = (image.naturalHeight - sourceHeight) / 2
      + position.y * ((image.naturalHeight - sourceHeight) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth / aspect);
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('Não foi possível preparar o editor de imagem.'));
      return;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o recorte da imagem.')),
      'image/png',
    );
  };
  image.onerror = () => reject(new Error('Não foi possível carregar esta imagem para recorte.'));
  image.src = imageUrl;
});

export function ImageCropEditor({
  imageUrl,
  title,
  description,
  imageAlt,
  onApply,
  onError,
  applying = false,
  initialAspect = 3,
  aspectOptions = DEFAULT_ASPECT_OPTIONS,
  outputWidth = 1800,
  applyLabel = 'Aplicar corte',
  applyingLabel = 'Aplicando...',
  maxPreviewClassName = 'max-w-2xl',
}: ImageCropEditorProps) {
  const [cropAspect, setCropAspect] = useState(initialAspect);
  const [cropZoom, setCropZoom] = useState(DEFAULT_CROP_ZOOM);
  const [cropPosition, setCropPosition] = useState<CropPosition>({ x: 0, y: 0 });
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  useEffect(() => {
    setCropAspect(initialAspect);
    setCropZoom(DEFAULT_CROP_ZOOM);
    setCropPosition({ x: 0, y: 0 });
    setImageAspect(null);
  }, [imageUrl, initialAspect]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      x: cropPosition.x,
      y: cropPosition.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const start = dragStart.current;
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setCropPosition({
      x: clampPosition(start.x + ((event.clientX - start.pointerX) / bounds.width) * 2),
      y: clampPosition(start.y + ((event.clientY - start.pointerY) / bounds.height) * 2),
    });
  };

  const updateTouchPosition = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setCropPosition({
      x: clampPosition(start.x + ((touch.clientX - start.pointerX) / bounds.width) * 2),
      y: clampPosition(start.y + ((touch.clientY - start.pointerY) / bounds.height) * 2),
    });
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    dragStart.current = {
      x: cropPosition.x,
      y: cropPosition.y,
      pointerX: touch.clientX,
      pointerY: touch.clientY,
    };
  };

  const handleApply = async () => {
    try {
      setCreating(true);
      const blob = await createCroppedImageBlob({
        imageUrl,
        aspect: cropAspect,
        zoom: cropZoom,
        position: cropPosition,
        outputWidth,
      });
      await onApply(blob);
    } catch (error) {
      if (onError) {
        await onError(error);
      } else {
        console.error('[ImageCropEditor] Erro ao aplicar recorte:', error);
      }
    } finally {
      setCreating(false);
    }
  };

  const busy = applying || creating;
  const selectedAspect = aspectOptions.find((option) => option.value === cropAspect);
  const fittedImageAspect = imageAspect || cropAspect;
  const imageWidthPercent = fittedImageAspect > cropAspect
    ? (fittedImageAspect / cropAspect) * cropZoom * 100
    : cropZoom * 100;
  const imageHeightPercent = fittedImageAspect > cropAspect
    ? cropZoom * 100
    : (cropAspect / fittedImageAspect) * cropZoom * 100;
  const horizontalOverflowPercent = Math.max(0, (imageWidthPercent - 100) / 2);
  const verticalOverflowPercent = Math.max(0, (imageHeightPercent - 100) / 2);
  const imageLeftPercent = 50 - cropPosition.x * horizontalOverflowPercent;
  const imageTopPercent = 50 - cropPosition.y * verticalOverflowPercent;

  return (
    <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <Crop size={17} /> {title}
          </h3>
          <p className="mt-1 text-[10px] text-brand-text-muted">{description} Você pode mover o recorte na horizontal e na vertical.</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primary">
          Proporção {selectedAspect?.label.split(' ').at(-1) || cropAspect}
        </span>
      </div>

      <div
        className={`relative mx-auto touch-none overflow-hidden rounded-xl border-2 border-dashed border-brand-primary/40 bg-stone-100 shadow-inner cursor-grab active:cursor-grabbing ${maxPreviewClassName}`}
        style={{ aspectRatio: String(cropAspect) }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={() => { dragStart.current = null; }}
        onPointerCancel={() => { dragStart.current = null; }}
        onTouchStart={handleTouchStart}
        onTouchMove={updateTouchPosition}
        onTouchEnd={() => { dragStart.current = null; }}
        onTouchCancel={() => { dragStart.current = null; }}
      >
        <img
          src={imageUrl}
          alt={imageAlt}
          draggable={false}
          className="absolute max-w-none select-none transition-[width,left,top] duration-75"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            const renderedBounds = event.currentTarget.getBoundingClientRect();
            const renderedAspect = renderedBounds.width / renderedBounds.height;
            if (renderedAspect > 0) {
              setImageAspect(renderedAspect);
            } else if (naturalWidth > 0 && naturalHeight > 0) {
              setImageAspect(naturalWidth / naturalHeight);
            }
          }}
          style={{
            width: `${imageWidthPercent}%`,
            height: 'auto',
            left: `${imageLeftPercent}%`,
            top: `${imageTopPercent}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 border-8 border-white/25" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-semibold text-white">
            <Move size={13} className="mr-1 inline" /> Arraste para mover
          </span>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${aspectOptions.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {aspectOptions.length > 1 && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Proporção</span>
            <select
              value={cropAspect}
              onChange={(event) => setCropAspect(Number(event.target.value))}
              className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-primary"
            >
              {aspectOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">
            <span>Aproximação</span><span>{Math.round(cropZoom * 100)}%</span>
          </span>
          <input
            type="range"
            min="1.05"
            max="3"
            step="0.05"
            value={cropZoom}
            onChange={(event) => setCropZoom(Number(event.target.value))}
            className="mt-3 w-full accent-brand-primary"
          />
        </label>

        <label className="block">
          <span className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">
            <span>Posição horizontal</span><span>{Math.round(cropPosition.x * 100)}%</span>
          </span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={cropPosition.x}
            onChange={(event) => setCropPosition((current) => ({ ...current, x: Number(event.target.value) }))}
            aria-label="Posição horizontal do recorte"
            className="mt-3 w-full accent-brand-primary"
          />
        </label>

        <label className="block">
          <span className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">
            <span>Posição vertical</span><span>{Math.round(cropPosition.y * 100)}%</span>
          </span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={cropPosition.y}
            onChange={(event) => setCropPosition((current) => ({ ...current, y: Number(event.target.value) }))}
            aria-label="Posição vertical do recorte"
            className="mt-3 w-full accent-brand-primary"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setCropZoom(DEFAULT_CROP_ZOOM);
              setCropPosition({ x: 0, y: 0 });
            }}
            disabled={busy}
            className="rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-brand-text-muted hover:bg-brand-bg disabled:opacity-60"
          >
            Redefinir
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
          >
            {busy ? applyingLabel : applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
