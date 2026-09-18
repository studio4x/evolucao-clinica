import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

type Props = { onChange: (blob: Blob | null) => void };

export default function SessionSignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const snapshot = hasInk ? canvas.toDataURL('image/png') : null;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#105576';
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawingRef.current = true;
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const commit = () => {
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    canvas.toBlob((blob) => onChange(blob), 'image/png', 0.92);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-text"><PenLine size={14} />Assine no espaço abaixo</p>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-text-muted hover:bg-brand-bg"><Eraser size={13} />Limpar</button>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-dashed border-brand-primary/25 bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="block h-56 w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={commit}
          onPointerCancel={commit}
          onPointerLeave={commit}
        />
      </div>
      <p className="text-[10px] leading-relaxed text-brand-text-muted">Use o dedo, mouse ou caneta do tablet. Esta assinatura registra a confirmação da sessão e não é apresentada como assinatura digital qualificada.</p>
    </div>
  );
}
