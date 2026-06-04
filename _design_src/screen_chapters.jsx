/* ============ Chapters ============ */
(function(){
const { useState, useRef } = React;
const { SectionTitle, Card, Tag, Btn, IconBtn, Spinner, EmptyState, toast, cx, pal, darken } = window;

const STATUS = { done:{label:'Done',color:'mint'}, draft:{label:'Draft',color:'sun'}, empty:{label:'Empty',color:'slate'} };

function ChapterRow({c, active, onClick, idx}){
  const s=STATUS[c.status];
  return <button onClick={onClick} className={cx('w-full text-left rounded-3xl p-3 pr-2.5 transition border-2 group', active?'bg-white shadow-soft':'border-transparent hover:bg-white/60')}
    style={active?{borderColor:pal('sky').c}:{}}>
    <div className="flex items-center gap-2.5">
      <span className="h-7 w-7 rounded-xl grid place-items-center font-display font-semibold text-sm shrink-0" style={{background:active?pal('sky').c:'#ECE2D1', color:active?'#fff':'#988C7C'}}>{idx+1}</span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-ink truncate text-[15px]">{c.title}</div>
        <div className="text-[12px] font-bold text-muted">{c.words.toLocaleString()} words</div>
      </div>
      <span className="opacity-0 group-hover:opacity-100 transition text-muted cursor-grab">⠿</span>
    </div>
  </button>;
}

function AIBar({onAct, busy}){
  const acts=[['continue','▶ Continue','primary'],['review','🔍 Review','soft'],['summary','📝 Summary','soft']];
  return <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
    <div className="bg-white rounded-full shadow-pop border-2 border-line px-2.5 py-2 flex items-center gap-2">
      <span className="pl-2 pr-1 text-[13px] font-extrabold flex items-center gap-1.5" style={{color:pal('sky').c}}>{busy?<Spinner size={14} color={pal('sky').c}/>:'✦'} AI</span>
      {acts.map(([id,lbl,v])=><Btn key={id} variant={v} color="sky" size="sm" disabled={busy} onClick={()=>onAct(id,lbl)}>{lbl}</Btn>)}
    </div>
  </div>;
}

function ChaptersScreen(){
  const [list,setList]=useState(CHAPTERS);
  const [activeId,setActiveId]=useState('c3');
  const [busy,setBusy]=useState(false);
  const active=list.find(c=>c.id===activeId);
  const words = active && active.body ? active.body.trim().split(/\s+/).filter(Boolean).length : 0;

  const setBody=(v)=> setList(l=>l.map(c=>c.id===activeId?{...c,body:v,words:v.trim().split(/\s+/).filter(Boolean).length, status:v.trim()?(c.status==='empty'?'draft':c.status):'empty'}:c));
  const act=(id,lbl)=>{ setBusy(true); toast(lbl.replace(/^[^ ]+ /,'')+'…','✦'); setTimeout(()=>{setBusy(false);toast('Done','✅');},1300); };
  const addChapter=()=>{ const id='c'+Date.now(); setList(l=>[...l,{id,title:`Chapter ${l.length+1}`,words:0,status:'empty',body:''}]); setActiveId(id); toast('Chapter added','📖'); };

  return <div className="max-w-6xl mx-auto pb-24">
    <SectionTitle emoji="📖" color="sky" title="Chapters" sub="Where the words actually happen." />
    <div className="flex flex-col md:flex-row gap-5 items-start">
      {/* chapter list */}
      <Card className="p-3 w-full md:w-[260px] md:shrink-0">
        <Btn variant="primary" color="sky" className="mb-2 w-full" onClick={addChapter}>＋ New chapter</Btn>
        <div className="flex flex-col gap-1 max-md:max-h-[280px] overflow-auto -mr-1 pr-1">
          {list.map((c,i)=><ChapterRow key={c.id} c={c} idx={i} active={c.id===activeId} onClick={()=>setActiveId(c.id)} />)}
        </div>
      </Card>

      {/* editor */}
      <Card className="relative flex flex-col min-h-[560px] w-full md:flex-1">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <Tag color={STATUS[active.status].color}>{STATUS[active.status].label}</Tag>
            <span className="font-bold text-muted text-sm">Chapter {list.indexOf(active)+1}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-extrabold text-sm" style={{color:pal('sky').c}}>{words.toLocaleString()} words</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-sm text-mint"><span className="h-2 w-2 rounded-full bg-mint"/>saved</span>
          </div>
        </div>
        <div className="flex-1 px-8 py-6">
          <input value={active.title} onChange={e=>setList(l=>l.map(c=>c.id===activeId?{...c,title:e.target.value}:c))}
            className="font-display text-3xl font-semibold text-ink bg-transparent w-full focus:outline-none mb-5 placeholder:text-muted/50" placeholder="Untitled chapter"/>
          {active.body || active.status!=='empty'
            ? <textarea value={active.body} onChange={e=>setBody(e.target.value)} placeholder="Begin where the fire is…"
                className="w-full bg-transparent focus:outline-none resize-none text-[17px] leading-[1.85] text-ink/90 font-medium" style={{minHeight:360}}/>
            : <div className="pt-6"><EmptyState emoji="🪶" color="sky" title="A blank page, full of maybe" sub="Start typing, or let the AI sketch an opening you can rewrite."
                action={<Btn variant="primary" color="sky" onClick={()=>{setBody(' ');toast('Opening drafted','✦');}}>✦ Draft an opening</Btn>} /></div>}
        </div>
      </Card>
    </div>
    <AIBar onAct={act} busy={busy} />
  </div>;
}

window.Screens = window.Screens || {};
window.Screens.chapters = ChaptersScreen;
})();
