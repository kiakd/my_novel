/* ============ Characters ============ */
(function(){
const { useState } = React;
const { SectionTitle, Card, Avatar, Tag, Btn, IconBtn, Modal, Field, Input, Textarea, EmptyState, Img, toast, cx, pal, darken } = window;

const COLORS = ['grape','coral','mint','sun','sky','bubble','lilac','slate'];

function CharCard({c, onOpen}){
  return <Card hover onClick={()=>onOpen(c)} className="p-5 flex flex-col items-center text-center">
    <Avatar initial={c.initial} color={c.color} size={72} ring />
    <h3 className="font-display text-lg font-semibold text-ink mt-3">{c.name}</h3>
    <Tag color={c.color} className="mt-1.5">{c.role}</Tag>
    <p className="text-[13.5px] text-muted font-semibold mt-3 line-clamp-2 leading-snug">{c.bio}</p>
  </Card>;
}

function Pronoun({label, value}){
  return <div className="flex-1">
    <div className="text-[12px] font-extrabold text-muted mb-1">{label}</div>
    <Input defaultValue={value} className="py-1.5 text-sm" />
  </div>;
}

function ProfileTab({c}){
  return <div className="grid grid-cols-2 gap-x-5 gap-y-4">
    <Field label="Appearance" className="col-span-2"><Textarea rows={2} defaultValue={c.appearance}/></Field>
    <Field label="Bio" className="col-span-2"><Textarea rows={2} defaultValue={c.bio}/></Field>
    <Field label="Skill"><Input defaultValue={c.skill}/></Field>
    <Field label="Mindset"><Input defaultValue={c.mindset}/></Field>
    <Field label="Behavior" className="col-span-2"><Textarea rows={2} defaultValue={c.behavior}/></Field>
    <div className="col-span-2 bg-white rounded-3xl border border-line p-4">
      <div className="font-display text-[15px] font-medium text-ink mb-3 flex items-center gap-2">🗣️ Speech</div>
      <div className="flex gap-3 mb-3">
        <Pronoun label="Self pronoun" value={c.selfP}/>
        <Pronoun label="Other pronoun" value={c.otherP}/>
        <div className="flex-[1.4]"><div className="text-[12px] font-extrabold text-muted mb-1">Tone</div><Input defaultValue={c.tone} className="py-1.5 text-sm"/></div>
      </div>
      <Field label="Sample lines"><Textarea rows={2} defaultValue={c.sample}/></Field>
    </div>
  </div>;
}

function VisualTab({c, accent, setAccent}){
  return <div className="grid grid-cols-2 gap-x-5 gap-y-4">
    <div className="col-span-2 flex gap-4 items-center bg-white rounded-3xl border border-line p-4">
      <div className="h-28 w-28 rounded-3xl grid place-items-center text-4xl shrink-0 relative overflow-hidden"
        style={{background:`linear-gradient(140deg, ${pal(accent).tint}, ${pal(accent).c})`}}>
        <span className="opacity-90">🖼️</span>
        <div className="absolute inset-0" style={{background:'repeating-linear-gradient(45deg,rgba(255,255,255,.08) 0 8px,transparent 8px 16px)'}}/>
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-extrabold text-muted mb-1.5">Reference image</div>
        <p className="text-sm text-muted font-semibold mb-2.5">Drop a portrait or generate one in Image Gen.</p>
        <Btn variant="soft" color={accent} size="sm">🖼️ Open in Image Gen</Btn>
      </div>
    </div>
    <Field label="Prompt anchor" className="col-span-2"><Textarea rows={2} defaultValue={c.anchor}/></Field>
    <Field label="Negative anchor" className="col-span-2"><Textarea rows={2} defaultValue={c.neg}/></Field>
    <Field label="Default outfit" className="col-span-2"><Input defaultValue={c.outfit}/></Field>
    <div>
      <div className="text-[13.5px] font-extrabold text-ink/70 mb-1.5">Render style</div>
      <div className="flex gap-2">
        {['anime','photoreal'].map(m=><button key={m} className={cx('flex-1 rounded-2xl py-2 font-bold text-sm border-2 transition capitalize')}
          style={c.mode===m?{borderColor:pal(accent).c,background:pal(accent).soft,color:darken(pal(accent).c,.7)}:{borderColor:'#ECE2D1',color:'#988C7C'}}>{m}</button>)}
      </div>
    </div>
    <div>
      <div className="text-[13.5px] font-extrabold text-ink/70 mb-1.5">Accent color</div>
      <div className="flex flex-wrap gap-2 pt-1">
        {COLORS.map(col=><button key={col} onClick={()=>setAccent(col)} className={cx('h-8 w-8 rounded-full transition active:scale-90')}
          style={{background:pal(col).c, boxShadow: accent===col?`0 0 0 3px #fff, 0 0 0 5px ${pal(col).c}`:'0 2px 6px -1px rgba(0,0,0,.2)'}}/>)}
      </div>
    </div>
  </div>;
}

function CharModal({c, onClose}){
  const [tab,setTab]=useState('profile');
  const [accent,setAccent]=useState(c.color);
  const P=pal(accent);
  return <Modal open={!!c} onClose={onClose} size="lg">
    <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-6 pb-3 border-b border-line">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Avatar initial={c.initial} color={accent} size={52} ring/>
          <div>
            <input defaultValue={c.name} className="font-display text-2xl font-semibold text-ink bg-transparent focus:outline-none focus:bg-white rounded-xl px-1 -ml-1"/>
            <div className="mt-0.5"><Tag color={accent}>{c.role}</Tag></div>
          </div>
        </div>
        <IconBtn onClick={onClose} title="Close">✕</IconBtn>
      </div>
      <div className="flex gap-1.5 mt-4">
        {[['profile','📋 Profile'],['visual','🎨 Visual']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} className="rounded-full px-4 py-1.5 font-bold text-sm transition"
            style={tab===id?{background:P.c,color:'#fff'}:{color:'#988C7C'}}>{lbl}</button>
        ))}
      </div>
    </div>
    <div className="p-6 pt-5">
      {tab==='profile' ? <ProfileTab c={c}/> : <VisualTab c={c} accent={accent} setAccent={setAccent}/>}
    </div>
    <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex justify-between items-center">
      <button className="text-coral font-bold text-sm hover:underline">🗑 Delete character</button>
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" color={accent} onClick={()=>{onClose();toast('Character saved','💾');}}>Save changes</Btn>
      </div>
    </div>
  </Modal>;
}

function CharactersScreen(){
  const [list]=useState(CHARACTERS);
  const [active,setActive]=useState(null);
  return <div className="max-w-5xl mx-auto">
    <SectionTitle emoji="👤" color="coral" title="Characters" sub={`${list.length} souls in this story`}
      right={<Btn variant="primary" color="coral" onClick={()=>toast('New character','✨')}>＋ Add character</Btn>} />
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-10">
      {list.map(c=><CharCard key={c.id} c={c} onOpen={setActive}/>)}
      <button onClick={()=>toast('New character','✨')} className="rounded-4xl border-2 border-dashed border-line text-muted font-bold flex flex-col items-center justify-center gap-2 py-10 hover:border-coral hover:text-coral transition min-h-[200px]">
        <span className="text-3xl">＋</span>Add character
      </button>
    </div>
    {active && <CharModal c={active} onClose={()=>setActive(null)} />}
  </div>;
}

window.Screens = window.Screens || {};
window.Screens.characters = CharactersScreen;
})();
