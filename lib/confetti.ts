/**
 * Dependency-free confetti burst. Spawns a fixed-position canvas, fires a
 * pastel burst that matches the Aurora theme, then removes itself.
 * Respects prefers-reduced-motion (does nothing for those users).
 */
const COLORS = ['#c4b5fd', '#a78bfa', '#6ee7b7', '#fde68a', '#fca5a5', '#bae6fd'];

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; vr: number;
  size: number; color: string; round: boolean;
};

export function fireConfetti(opts?: { count?: number; originY?: number }) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const count = opts?.count ?? 130;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w / 2;
  const cy = h * (opts?.originY ?? 0.32);

  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      size: 6 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.5,
    };
  });

  const gravity = 0.2;
  const drag = 0.99;
  const duration = 2600;
  const start = performance.now();

  function frame(now: number) {
    const t = now - start;
    ctx!.clearRect(0, 0, w, h);
    const fade = t > duration - 700 ? Math.max(0, (duration - t) / 700) : 1;
    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx!.save();
      ctx!.globalAlpha = fade;
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.fillStyle = p.color;
      if (p.round) {
        ctx!.beginPath();
        ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      }
      ctx!.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
