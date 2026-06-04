'use client';

interface SpinnerProps {
  size?: number;
  color?: string;
}

/** วงกลมหมุน */
export function Spinner({ size = 16, color = '#7C6FE8' }: SpinnerProps) {
  return (
    <span
      className="inline-block rounded-full border-[2.5px] border-current/20"
      style={{ width: size, height: size, borderTopColor: color, color, animation: 'spin .7s linear infinite' }}
    />
  );
}
