/* ============ Timeline · Image Gen · AI Log · Locations · Settings ============ */
(function(){
const { useState } = React;
const { SectionTitle, Card, Avatar, Tag, Btn, IconBtn, Drawer, Modal, Field, Input, Textarea, Select, Spinner, EmptyState, toast, cx, pal, darken } = window;
const chapTitle = id => (CHAPTERS.find(c=>c.id===id)||{}).title || '—';

/* ---------------- TIMELINE ---------------- */
function TimelineScreen(){
  return <div className="max-w-3xl mx-auto">
    <SectionTitle emoji="⏱️" color="sun" title="Timeline" sub="The story in the order it happens."
      right={<Btn variant="primary" color="sun" onClick={()=>toast('New event','⏱️')}>＋ Add event</Btn>} />
    <div className="relative pl-8 pb-10">
      <div className="absolute left-[11px] top-2 bottom-2 w-1 rounded-full" style={{background:'linear-gradient(#F2B23E, #ECE2D1)'}}/>
      <div className="flex flex-col gap-4">
        {EVENTS.map((e,i)=>{ const P=pal(e.color);
          return <div key={i} className="relative anim-rise" style={{animationDelay:`${i*60}ms`}}>
            <span className="absolute -left-[29px] top-4 h-5 w-5 rounded-full border-[3px] border-cream" style={{background:P.c, boxShadow:`0 0 0 3px ${P.soft}`}}/>
            <Card hover className="p-4 flex items-start gap-3">
              <div className="h-11 w-11 rounded-2xl grid place-items-center text-xl shrink-0" style={{background:P.soft}}>{['🔥','🧭','📜','💡','🪨'][i]||'•'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-[17px] font-medium text-ink">{e.title}</span>
                  <Tag color={e.color}>{e.when}</Tag>
                </div>
                <p className="text-[14px] text-muted font-semibold mt-1 leading-snug">{e.detail}</p>
                <button className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-extrabold rounded-full px-2.5 py-1 transition" style={{color:pal('sky').c, background:pal('sky').soft}}>📖 {chapTitle(e.chapter)}</button>
              </div>
            </Card>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

/* ---------------- IMAGE GEN ---------------- */
function GenTile({state, idx}){
  const palettes=['lilac','sky','bubble','mint','sun','coral'];
  const P=pal(palettes[idx%palettes.length]);
  if(state==='loading') return <div className="aspect-square rounded-3xl grid place-items-center border-2 border-dashed" style={{borderColor:P.c, background:P.soft}}><div className="flex flex-col items-center gap-2"><Spinner size={22} color={P.c}/><span className="text-[12px] font-extrabold" style={{color:P.c}}>dreaming…</span></div></div>;
  return <div className="aspect-square rounded-3xl relative overflow-hidden grid place-items-center group cursor-pointer" style={{background:`linear-gradient(140deg, ${P.tint}, ${P.c})`}}>
    <div className="absolute inset-0" style={{background:'repeating-linear-gradient(45deg,rgba(255,255,255,.10) 0 9px,transparent 9px 18px)'}}/>
    <span className="text-4xl opacity-90 relative">🖼️</span>
    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition">
      <span className="text-white text-[11px] font-extrabold font-mono">render · 1024²</span></div>
  </div>;
}
function ImageGenScreen(){
  const [tiles,setTiles]=useState(['done','done','done','done']);
  const [pose,setPose]=useState(0);
  const [provider,setProvider]=useState('NovelAI');
  const generate=()=>{ setTiles(t=>['loading',...t]); toast('Generating…','✦'); setTimeout(()=>{ setTiles(t=>t.map((x,i)=>i===0?'done':x)); toast('Image ready','🖼️'); },1600); };
  return <div className="max-w-6xl mx-auto">
    <SectionTitle emoji="🖼️" color="lilac" title="Image Gen" sub="Bring the cast and their world to life."
      right={<Select value={provider} onChange={e=>setProvider(e.target.value)} options={PROVIDERS} color="lilac"/>} />
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5 pb-10">
      <Card className="p-5 flex flex-col gap-4 h-fit">
        <Field label="Prompt" hint={<button className="text-[12px] font-extrabold" style={{color:pal('lilac').c}} onClick={()=>toast('Scene → prompt','✦')}>✦ Scene → prompt</button>}>
          <Textarea rows={3} defaultValue="1girl, ember sparks, ash-grey coat, warm rim light, detailed face"/>
        </Field>
        <Field label="Negative"><Textarea rows={2} defaultValue="lowres, extra fingers, watermark, blurry"/></Field>
        <div>
          <div className="text-[13.5px] font-extrabold text-ink/70 mb-2">Pose preset</div>
          <div className="grid grid-cols-3 gap-2">
            {POSES.map((p,i)=><button key={p} onClick={()=>setPose(i)} className="rounded-2xl py-2.5 text-[12.5px] font-bold border-2 transition flex flex-col items-center gap-0.5"
              style={pose===i?{borderColor:pal('lilac').c, background:pal('lilac').soft, color:darken(pal('lilac').c,.7)}:{borderColor:'#ECE2D1', color:'#988C7C'}}>
              <span className="text-lg">{p.split(' ')[0]}</span>{p.split(' ').slice(1).join(' ')}</button>)}
          </div>
        </div>
        <Btn variant="primary" color="lilac" size="lg" className="w-full" onClick={generate}>✦ Generate</Btn>
      </Card>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><span className="font-display text-lg font-medium text-ink">Gallery</span><Tag color="sky">📖 Vorst's Bargain</Tag></div>
          <button className="text-[13px] font-extrabold text-muted hover:text-ink transition">⊞ Reference sheet</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {tiles.map((s,i)=><GenTile key={i} state={s} idx={i}/>)}
        </div>
      </div>
    </div>
  </div>;
}

/* ---------------- AI LOG ---------------- */
function StatusDot({status}){
  const ok=status==='ok';
  return <Tag color={ok?'mint':'coral'}>{ok?'● ok':'✕ error'}</Tag>;
}
function AILogScreen(){
  const [open,setOpen]=useState(null);
  return <div className="max-w-5xl mx-auto">
    <SectionTitle emoji="📋" color="slate" title="AI Log" sub="Every call the studio has made on your behalf." />
    <Card className="overflow-hidden pb-1">
      <div className="grid grid-cols-[90px_1fr_1fr_1fr_90px_70px] gap-3 px-5 py-3 border-b border-line text-[12px] font-extrabold text-muted tracking-wide uppercase">
        <span>Time</span><span>Endpoint</span><span>Provider</span><span>Model</span><span>Status</span><span className="text-right">ms</span>
      </div>
      {LOGS.map((r,i)=><button key={r.id} onClick={()=>setOpen(r)} className={cx('w-full grid grid-cols-[90px_1fr_1fr_1fr_90px_70px] gap-3 px-5 py-3.5 items-center text-left transition hover:bg-cream/70', i<LOGS.length-1&&'border-b border-line/70')}>
        <span className="font-mono text-[13px] font-bold text-muted">{r.time}</span>
        <span className="font-mono text-[13px] font-bold" style={{color:pal('grape').c}}>{r.endpoint}</span>
        <span className="font-bold text-ink text-sm">{r.provider}</span>
        <span className="font-semibold text-muted text-sm">{r.model}</span>
        <span><StatusDot status={r.status}/></span>
        <span className="text-right font-bold text-sm text-ink">{r.ms||'—'}</span>
      </button>)}
    </Card>

    <Drawer open={!!open} onClose={()=>setOpen(null)} width={440}>
      {open && <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5"><div className="h-10 w-10 rounded-2xl grid place-items-center text-lg" style={{background:pal('slate').soft}}>📋</div>
            <div><div className="font-display text-lg font-medium text-ink">{open.endpoint}</div><div className="text-[12px] font-bold text-muted font-mono">{open.time} · {open.ms}ms</div></div></div>
          <IconBtn onClick={()=>setOpen(null)}>✕</IconBtn>
        </div>
        <div className="flex gap-2 mb-5"><Tag color="grape">{open.provider}</Tag><Tag color="sky">{open.model}</Tag><StatusDot status={open.status}/></div>
        {[['System prompt','grape',2],['User','sky',3],['Response',open.status==='ok'?'mint':'coral',5]].map(([lbl,col,n])=>(
          <div key={lbl} className="mb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{color:pal(col).c}}>{lbl}</div>
            <div className="bg-white rounded-2xl border border-line p-3.5 font-mono text-[13px] leading-relaxed text-ink/80">
              {lbl==='Response' && open.status==='error'
                ? <span className="text-coral font-bold">⚠ Provider timeout after 30s. Retried 0/2.</span>
                : <div className="flex flex-col gap-1.5">{Array.from({length:n}).map((_,i)=><div key={i} className="h-2.5 rounded bg-cream" style={{width:`${70+(i*7)%30}%`}}/>)}</div>}
            </div>
          </div>
        ))}
        <Btn variant="soft" color="slate" className="w-full" onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText('');toast('Copied','📋');}}>📋 Copy full payload</Btn>
      </div>}
    </Drawer>
  </div>;
}

/* ---------------- LOCATIONS ---------------- */
function LocationsScreen(){
  const [active,setActive]=useState(null);
  return <div className="max-w-5xl mx-auto">
    <SectionTitle emoji="🗺️" color="mint" title="Locations" sub={`${LOCATIONS.length} places in this world`}
      right={<Btn variant="primary" color="mint" onClick={()=>toast('New location','🗺️')}>＋ Add location</Btn>} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-10">
      {LOCATIONS.map(l=>{ const P=pal(l.color);
        return <Card key={l.id} hover onClick={()=>setActive(l)} className="p-5 flex gap-4">
          <div className="h-16 w-16 rounded-3xl grid place-items-center text-2xl shrink-0" style={{background:P.soft}}>📍</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><h3 className="font-display text-lg font-semibold text-ink">{l.name}</h3><Tag color={l.color}>{l.zone}</Tag></div>
            <p className="text-[12px] font-extrabold text-muted mt-0.5">{l.mood}</p>
            <p className="text-[14px] text-muted font-semibold mt-1.5 line-clamp-2 leading-snug">{l.desc}</p>
          </div>
        </Card>;
      })}
    </div>
    <Modal open={!!active} onClose={()=>setActive(null)} size="md">
      {active && <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3"><div className="h-12 w-12 rounded-3xl grid place-items-center text-2xl" style={{background:pal(active.color).soft}}>📍</div>
            <input defaultValue={active.name} className="font-display text-2xl font-semibold text-ink bg-transparent focus:outline-none"/></div>
          <IconBtn onClick={()=>setActive(null)}>✕</IconBtn>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone"><Input defaultValue={active.zone}/></Field>
          <Field label="Atmosphere"><Input defaultValue={active.mood}/></Field>
          <Field label="Description" className="col-span-2"><Textarea rows={3} defaultValue={active.desc}/></Field>
          <Field label="Details & notes" className="col-span-2"><Textarea rows={4} placeholder="Sensory details, history, who you'll find here…"/></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5"><Btn variant="ghost" onClick={()=>setActive(null)}>Cancel</Btn><Btn variant="primary" color="mint" onClick={()=>{setActive(null);toast('Location saved','💾');}}>Save</Btn></div>
      </div>}
    </Modal>
  </div>;
}

/* ---------------- SETTINGS ---------------- */
function SettingsScreen(){
  return <div className="max-w-2xl mx-auto">
    <SectionTitle emoji="⚙️" color="slate" title="Settings" sub="Keys, models, and the plumbing." />
    <div className="flex flex-col gap-5 pb-10">
      <Card className="p-6">
        <div className="font-display text-lg font-medium text-ink mb-4 flex items-center gap-2">🔑 Provider keys</div>
        <div className="flex flex-col gap-4">
          {PROVIDERS.map(p=><Field key={p} label={p}><Input type="password" defaultValue="sk-••••••••••••••••" /></Field>)}
        </div>
      </Card>
      <Card className="p-6">
        <div className="font-display text-lg font-medium text-ink mb-4 flex items-center gap-2">🧠 Defaults</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default text model"><Select value="claude-sonnet-4" onChange={()=>{}} options={['claude-sonnet-4','gpt-4o','kayra-v1']}/></Field>
          <Field label="Default image provider"><Select value="NovelAI" onChange={()=>{}} options={PROVIDERS}/></Field>
          <Field label="ComfyUI URL" className="col-span-2"><Input defaultValue="http://127.0.0.1:8188"/></Field>
        </div>
      </Card>
      <div className="flex justify-end"><Btn variant="primary" color="slate" size="lg" onClick={()=>toast('Settings saved','💾')}>Save settings</Btn></div>
    </div>
  </div>;
}

window.Screens = window.Screens || {};
Object.assign(window.Screens, { timeline:TimelineScreen, imagegen:ImageGenScreen, ailog:AILogScreen, locations:LocationsScreen, settings:SettingsScreen });
})();
