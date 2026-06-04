'use client';
import { Card, Avatar, Tag } from '@/components/ui';
import { charInitial, charColor } from './util';
import type { Char } from '@/lib/types';

interface CharCardProps {
  c: Char;
  onOpen: (c: Char) => void;
}

/** การ์ดตัวละครในกริด */
export function CharCard({ c, onOpen }: CharCardProps) {
  return (
    <Card hover onClick={() => onOpen(c)} className="p-5 flex flex-col items-center text-center">
      <Avatar initial={charInitial(c)} color={charColor(c)} size={72} ring />
      <h3 className="font-display text-lg font-semibold text-ink mt-3">{c.name}</h3>
      {c.role && <Tag color={charColor(c)} className="mt-1.5">{c.role}</Tag>}
      <p className="text-[13.5px] text-muted font-semibold mt-3 line-clamp-2 leading-snug">{c.description}</p>
    </Card>
  );
}
