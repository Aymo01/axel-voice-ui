import { useEffect, useRef } from 'react';

export type WaveformMode = 'wake-listening' | 'recording' | 'processing' | 'speaking';

interface WaveformProps {
  mode: WaveformMode;
  audioLevel?: number;
}

const BAR_COUNT = 40;

export default function Waveform({ mode, audioLevel = 0 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);
  const modeRef = useRef(mode);
  const levelRef = useRef(audioLevel);

  modeRef.current = mode;
  levelRef.current = audioLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let rafId: number;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const currentMode = modeRef.current;
      const level = levelRef.current;

      const speed = currentMode === 'recording' ? 0.32 : currentMode === 'speaking' ? 0.22 : currentMode === 'processing' ? 0.4 : 0.05;
      phaseRef.current += speed;
      const phase = phaseRef.current;

      const barWidth = w / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        let amplitude: number;

        if (currentMode === 'recording') {
          amplitude = (0.12 + level * 0.88) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.5 + phase)));
        } else if (currentMode === 'speaking') {
          amplitude =
            0.25 +
            0.55 * Math.abs(Math.sin(i * 0.65 + phase * 1.4)) * (0.6 + 0.4 * Math.abs(Math.sin(phase * 0.6)));
        } else if (currentMode === 'processing') {
          const t = (i / BAR_COUNT) * Math.PI * 2;
          amplitude = 0.18 + 0.22 * Math.abs(Math.sin(t - phase * 2));
        } else {
          amplitude = 0.1 + 0.08 * Math.abs(Math.sin(i * 0.3 + phase));
        }

        const barHeight = Math.max(4, amplitude * h);
        const x = i * barWidth;
        const y = (h - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, 'rgba(103, 232, 249, 0.95)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0.85)');

        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        const radius = Math.min(4, barWidth * 0.3);
        ctx.roundRect(x + barWidth * 0.22, y, barWidth * 0.56, barHeight, radius);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-40 w-full md:h-56" aria-hidden="true" />;
}
