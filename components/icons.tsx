// Small stroked SVG icons (lucide-style). They inherit currentColor so they
// tint with the surrounding text, unlike platform emoji which render
// differently on every device and can't be styled.
import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 18, className, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function BallIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.7}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6l4.2 3-1.6 4.9H9.4L7.8 10.6z" />
      <path d="M12 7.6V3m4.2 7.6L20.6 9.2M14.6 15.5l2.6 3.7M9.4 15.5l-2.6 3.7M7.8 10.6 3.4 9.2" />
    </Svg>
  );
}

export function ChartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 20v-8M12 20V5M19 20v-5" />
    </Svg>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.4-3.4 4.3-5 7.5-5s6.1 1.6 7.5 5" />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </Svg>
  );
}

export function TimerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 10v3.5l2.2 2.2M9.5 2.5h5" />
    </Svg>
  );
}

export function TargetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function SwapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </Svg>
  );
}

export function ZapIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 2.5}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
