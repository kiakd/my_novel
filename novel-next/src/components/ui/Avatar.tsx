'use client';
import { pal, cx } from '@/lib/theme';

interface AvatarProps {
  initial: string;
  color?: string;
  size?: number;
  ring?: boolean;
  className?: string;
}

/** วงกลมอักษรย่อ ไล่เฉดสีประจำตัว */
export function Avatar({ initial, color = 'grape', size = 44, ring, className = '' }: AvatarProps) {
  const P = pal(color);
  return (
    <div
      className={cx('rounded-full grid place-items-center font-display font-semibold text-white shrink-0', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, ${P.tint}, ${P.c})`,
        boxShadow: `0 4px 12px -3px ${P.c}88`,
        border: ring ? '3px solid #fff' : 'none',
      }}
    >
      {initial}
    </div>
  );
}
