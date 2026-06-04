'use client';
import { useState } from 'react';
import { SectionTitle, Card, Tag, Btn, Field, Textarea, Select, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal, darken } from '@/lib/theme';
import { POSES, PROVIDERS } from '@/lib/mock-data';
import { GenTile, type TileState } from './GenTile';

/** หน้าเจนรูป — แผงตั้งค่า + แกลเลอรี */
export function ImageGenScreen() {
  const { t } = useI18n();
  const [tiles, setTiles] = useState<TileState[]>(['done', 'done', 'done', 'done']);
  const [pose, setPose] = useState(0);
  const [provider, setProvider] = useState('NovelAI');

  const generate = () => {
    setTiles((tl) => ['loading', ...tl]);
    toast(t('toast.generating'), '✦');
    setTimeout(() => { setTiles((tl) => tl.map((x, i) => (i === 0 ? 'done' : x))); toast(t('toast.imageReady'), '🖼️'); }, 1600);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <SectionTitle
        emoji="🖼️"
        color="lilac"
        title={t('imagegen.title')}
        sub={t('imagegen.sub')}
        right={<Select value={provider} onChange={(e) => setProvider(e.target.value)} options={PROVIDERS} color="lilac" />}
      />
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5 pb-10">
        <Card className="p-5 flex flex-col gap-4 h-fit">
          <Field
            label={t('imagegen.prompt')}
            hint={<button className="text-[12px] font-extrabold" style={{ color: pal('lilac').c }} onClick={() => toast(t('toast.scenePrompt'), '✦')}>✦ {t('imagegen.scenePrompt')}</button>}
          >
            <Textarea rows={3} defaultValue="1girl, ember sparks, ash-grey coat, warm rim light, detailed face" />
          </Field>
          <Field label={t('imagegen.negative')}><Textarea rows={2} defaultValue="lowres, extra fingers, watermark, blurry" /></Field>
          <div>
            <div className="text-[13.5px] font-extrabold text-ink/70 mb-2">{t('imagegen.posePreset')}</div>
            <div className="grid grid-cols-3 gap-2">
              {POSES.map((p, i) => (
                <button
                  key={p}
                  onClick={() => setPose(i)}
                  className="rounded-2xl py-2.5 text-[12.5px] font-bold border-2 transition flex flex-col items-center gap-0.5"
                  style={pose === i
                    ? { borderColor: pal('lilac').c, background: pal('lilac').soft, color: darken(pal('lilac').c, 0.7) }
                    : { borderColor: '#ECE2D1', color: '#988C7C' }}
                >
                  <span className="text-lg">{p.split(' ')[0]}</span>{p.split(' ').slice(1).join(' ')}
                </button>
              ))}
            </div>
          </div>
          <Btn variant="primary" color="lilac" size="lg" className="w-full" onClick={generate}>✦ {t('imagegen.generate')}</Btn>
        </Card>
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-medium text-ink">{t('imagegen.gallery')}</span>
              <Tag color="sky">📖 Vorst&apos;s Bargain</Tag>
            </div>
            <button className="text-[13px] font-extrabold text-muted hover:text-ink transition">⊞ {t('imagegen.referenceSheet')}</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {tiles.map((s, i) => <GenTile key={i} state={s} idx={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
