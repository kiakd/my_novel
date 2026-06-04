/* ============ Relations ============ */
(function(){
const { useState, useRef } = React;
const { SectionTitle, Card, Avatar, Tag, Btn, IconBtn, Field, Input, Textarea, Select, toast, cx, pal, darken } = window;

const charById = id => CHARACTERS.find(c=>c.id===id);
const REL_TYPES = ['allies','rivals','mentored by','sibling','employs','keeps watch','loves','fears'];

function RelationsScreen(){
  const [pos,setPos] = useState({...NODE_POS});
  const [rels,setRels] = useState(RELATIONS);
  const [selId,setSelId] = useState('r2');
  const drag = useRef(null);
  const svgRef = useRef(null);

  const sel = rels.find(r=>r.id===selId);

  const onDown=(id,e)=>{ const r=svgRef.current.getBoundingClientRect(); drag.current={id, ox:e.clientX-r.left-pos[id].x, oy:e.clientY-r.top-pos[id].y}; };
  const onMove=(e)=>{ if(!drag.current) return; const r=svgRef.current.getBoundingClientRect();
    const x=Math.max(50,Math.min(650, e.clientX-r.left-drag.current.ox)); const y=Math.max(40,Math.min(420, e.clientY-r.top-drag.current.oy));
    setPos(p=>({...p,[drag.current.id]:{x,y}})); };
  const onUp=()=>{ drag.current=null; };

  const update=(k,v)=> setRels(rs=>rs.map(r=>r.id===selId?{...r,[k]:v}:r));

  return <div className="max-w-6xl mx-auto">
    <SectionTitle emoji="🔗" color="bubble" title="Relations" sub="Drag the faces around — the threads follow."
      right={<Btn variant="primary" color="bubble" onClick={()=>toast('New relation','🔗')}>＋ Add relation</Btn>} />

    <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 pb-10">
      {/* canvas */}
      <Card className="relative overflow-hidden" >
        <div className="absolute inset-0" style={{background:'radial-gradient(circle at 1px 1px, #ECE2D1 1.5px, transparent 0)', backgroundSize:'22px 22px', opacity:.6}}/>
        <svg ref={svgRef} viewBox="0 0 700 470" className="w-full block touch-none select-none" style={{height:470}}
          onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          {rels.map(r=>{ const a=pos[r.from], b=pos[r.to]; if(!a||!b) return null;
            const mx=(a.x+b.x)/2, my=(a.y+b.y)/2; const on=r.id===selId; const col=pal(charById(r.from).color).c;
            return <g key={r.id} onMouseDown={()=>setSelId(r.id)} style={{cursor:'pointer'}}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on?col:'#D8CDBA'} strokeWidth={on?3:2} strokeLinecap="round" strokeDasharray={on?'':'1 0'}/>
              <g transform={`translate(${mx},${my})`}>
                <rect x={-(r.type.length*3.6+14)} y={-12} width={r.type.length*7.2+28} height={24} rx={12} fill={on?col:'#fff'} stroke={on?col:'#E2D6C2'} strokeWidth="1.5"/>
                <text textAnchor="middle" dy="4.5" fontFamily="Nunito" fontWeight="800" fontSize="12.5" fill={on?'#fff':'#988C7C'}>{r.type}</text>
              </g>
            </g>;
          })}
          {Object.entries(pos).map(([id,p])=>{ const c=charById(id); if(!c) return null; const P=pal(c.color);
            return <g key={id} transform={`translate(${p.x},${p.y})`} onMouseDown={e=>onDown(id,e)} style={{cursor:'grab'}}>
              <circle r="27" fill="#fff" stroke={P.c} strokeWidth="3"/>
              <circle r="24" fill={P.c} opacity="0.16"/>
              <text textAnchor="middle" dy="2" fontFamily="Fredoka" fontWeight="600" fontSize="20" fill={darken(P.c,.7)}>{c.initial}</text>
              <text textAnchor="middle" y="44" fontFamily="Nunito" fontWeight="800" fontSize="13" fill="#4A4138">{c.name.split(' ')[0]}</text>
            </g>;
          })}
        </svg>
        <div className="absolute bottom-3 right-4 text-[12px] font-bold text-muted flex items-center gap-1.5">✋ drag nodes · tap a thread to edit</div>
      </Card>

      {/* edit panel */}
      <Card className="p-5 h-fit">
        <div className="font-display text-lg font-medium text-ink mb-4">Edit relationship</div>
        {sel ? <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-2.5 bg-cream/70 rounded-3xl py-4 border border-line">
            <div className="flex flex-col items-center gap-1"><Avatar initial={charById(sel.from).initial} color={charById(sel.from).color} size={44}/><span className="text-[12px] font-extrabold text-ink">{charById(sel.from).name.split(' ')[0]}</span></div>
            <span className="text-2xl" style={{color:pal('bubble').c}}>→</span>
            <div className="flex flex-col items-center gap-1"><Avatar initial={charById(sel.to).initial} color={charById(sel.to).color} size={44}/><span className="text-[12px] font-extrabold text-ink">{charById(sel.to).name.split(' ')[0]}</span></div>
          </div>
          <Field label="Type">
            <div className="flex flex-wrap gap-1.5">
              {REL_TYPES.map(t=><button key={t} onClick={()=>update('type',t)} className="rounded-full px-3 py-1 text-[12.5px] font-extrabold transition border-2"
                style={sel.type===t?{background:pal('bubble').c,color:'#fff',borderColor:pal('bubble').c}:{borderColor:'#ECE2D1',color:'#988C7C'}}>{t}</button>)}
            </div>
          </Field>
          <Field label="Feeling"><Textarea rows={4} value={sel.feeling} onChange={e=>update('feeling',e.target.value)}/></Field>
          <div className="flex gap-2">
            <Btn variant="primary" color="bubble" className="flex-1" onClick={()=>toast('Relationship saved','💾')}>Save</Btn>
            <Btn variant="ghost" onClick={()=>toast('Removed','🗑')}>🗑</Btn>
          </div>
        </div> : <p className="text-muted font-semibold text-sm">Tap a thread in the graph to edit it.</p>}
      </Card>
    </div>
  </div>;
}

window.Screens = window.Screens || {};
window.Screens.relations = RelationsScreen;
})();
