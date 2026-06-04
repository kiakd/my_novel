/* ============ Relations + Chapters ============ */
(function(){
const { Row, Col, Lines, Img, Btn, Tag, Note, Field, ShellFrame } = window.WF;

/* ---------------- RELATIONS ---------------- */
const NODES=[['Kaelen',150,90],['Mira',330,60],['Vorst',420,200],['Old Sela',110,230],['Tam',270,250]];
const EDGES=[[0,1,'allies'],[0,2,'rivals'],[0,3,'mentored by'],[1,4,'sibling'],[2,4,'employs']];

function Graph(){
  return <div className="sketch fill1" style={{position:'relative',height:330,overflow:'hidden'}}>
    <svg width="100%" height="100%" style={{position:'absolute',inset:0}}>
      {EDGES.map(([a,b,label],i)=>{
        const [,ax,ay]=NODES[a],[,bx,by]=NODES[b];
        return <g key={i}>
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#9a988f" strokeWidth="1.6" strokeDasharray="5 4"/>
          <text x={(ax+bx)/2} y={(ay+by)/2-4} fill="#6f6d63" fontSize="12.5" fontFamily="Caveat" textAnchor="middle">{label}</text>
        </g>;
      })}
    </svg>
    {NODES.map(([n,x,y],i)=>(
      <div key={n} style={{position:'absolute',left:x-34,top:y-18,width:68,padding:'6px 4px',textAlign:'center',
        background:i===0?'var(--accent-tint)':'#fff',border:'1.7px solid '+(i===0?'var(--accent)':'var(--line)'),
        borderRadius:20,font:'14px Kalam',color:i===0?'var(--accent)':'var(--ink)'}}>{n}</div>
    ))}
    <Note size={15} color="#9a988f" style={{position:'absolute',right:10,bottom:8}}>drag nodes to arrange ⟲</Note>
  </div>;
}

function RelA(){
  return <ShellFrame active="relations">
    <Row justify="space-between" align="center"><h2 className="ttl">Relations</h2><Btn primary sm>+ Add relation</Btn></Row>
    <p className="sub">Force-directed graph + side panel to edit the selected edge.</p>
    <Row gap={16} align="flex-start">
      <div style={{flex:1,minWidth:0}}><Graph/></div>
      <div className="sketch" style={{width:250,flexShrink:0,padding:14}}>
        <div style={{fontSize:17,marginBottom:12}}>Edit relation</div>
        <Row gap={8} align="center" style={{marginBottom:10}}><Field hint="Kaelen" style={{flex:1}}/><span style={{color:'var(--accent)'}}>→</span><Field hint="Vorst" style={{flex:1}}/></Row>
        <Field label="Type" hint="rivals" /><div style={{height:10}}/><Field label="Feeling" lines={2}/>
        <Btn primary style={{marginTop:12,width:'100%',justifyContent:'center'}}>Save edge</Btn>
      </div>
    </Row>
    <Note style={{marginTop:10}}>↑ visual & intuitive · can get tangled with many characters</Note>
  </ShellFrame>;
}

function RelB(){
  const names=['Kaelen','Mira','Vorst','Sela','Tam'];
  const cell=(r,c)=>{ if(r===c) return <span style={{color:'#cfcdc6'}}>—</span>;
    const m={'0-1':'ally','0-2':'rival','0-3':'mentor','1-4':'sib','2-4':'boss'};
    const k=`${Math.min(r,c)}-${Math.max(r,c)}`; return m[k]?<Tag accent={r<c} style={{fontSize:11.5,padding:'0 6px'}}>{m[k]}</Tag>:<span style={{color:'#e0ded6'}}>·</span>; };
  return <ShellFrame active="relations">
    <h2 className="ttl">Relations</h2><p className="sub">Adjacency matrix — every pair at a glance, no overlapping lines.</p>
    <div className="sketch" style={{padding:6,overflow:'auto'}}>
      <table style={{borderCollapse:'collapse',width:'100%',font:'14px Kalam'}}>
        <thead><tr><th></th>{names.map(n=><th key={n} style={{padding:'8px 4px',color:'var(--muted)',fontWeight:400}}>{n}</th>)}</tr></thead>
        <tbody>{names.map((rn,r)=><tr key={rn}><td style={{padding:'8px 10px',color:'var(--muted)',whiteSpace:'nowrap'}}>{rn}</td>
          {names.map((_,c)=><td key={c} style={{textAlign:'center',padding:'6px',borderLeft:'1px solid #ece9e1',borderTop:'1px solid #ece9e1'}}>{cell(r,c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <Note style={{marginTop:12}}>↑ scales to large casts cleanly · click a cell to set the relation type · less "story-map", more spreadsheet</Note>
  </ShellFrame>;
}

function RelC(){
  return <ShellFrame active="relations">
    <h2 className="ttl">Relations</h2><p className="sub">Graph on top for the shape, sortable edge table below for precision.</p>
    <div style={{height:230}}><Graph/></div>
    <div className="sketch" style={{marginTop:14,padding:0,overflow:'hidden'}}>
      <Row style={{borderBottom:'1.7px solid var(--line)',padding:'9px 14px',font:'13px ui-monospace,monospace',color:'var(--muted)',background:'#f0efe9'}}>
        <span style={{flex:1}}>FROM</span><span style={{flex:1}}>TO</span><span style={{flex:1}}>TYPE</span><span style={{flex:2}}>FEELING</span><span style={{width:30}}></span>
      </Row>
      {EDGES.map(([a,b,t],i)=><Row key={i} style={{padding:'9px 14px',borderBottom:i<EDGES.length-1?'1px solid #ece9e1':'none',font:'14.5px Kalam'}}>
        <span style={{flex:1}}>{NODES[a][0]}</span><span style={{flex:1}}>{NODES[b][0]}</span><span style={{flex:1}}><Tag accent>{t}</Tag></span>
        <span style={{flex:2}}><div className="bar" style={{width:'70%'}}/></span><span style={{width:30,color:'#9a988f'}}>✎</span></Row>)}
    </div>
    <Note style={{marginTop:10}}>↑ best of both · see the web, edit the rows · table is the source of truth</Note>
  </ShellFrame>;
}

window.WFScreens.relations = {
  label:'Relations', glyph:'⇄', group:'Content',
  eyebrow:'Character web', title:'Relations',
  blurb:'How characters connect — typed, directional relationships with feelings. A graph reads beautifully but tangles; a matrix scales but feels clinical. Three ways to balance shape vs. editability.',
  approaches:[
    {id:'A',name:'Node graph + panel',desc:'visual · draggable nodes',render:RelA},
    {id:'B',name:'Adjacency matrix',desc:'scales to big casts',render:RelB},
    {id:'C',name:'Graph + edge table',desc:'shape above, data below',render:RelC},
  ]
};

/* ---------------- CHAPTERS ---------------- */
const CHAPS=['1 · The Ashfall','2 · Crossing the Reach','3 · Vorst\'s Bargain','4 · Embers','5 · The Warden Wakes'];

function ChapList({active=2}){
  return <Col gap={3}>
    <Btn primary sm style={{marginBottom:6,justifyContent:'center'}}>+ New chapter</Btn>
    {CHAPS.map((c,i)=><div key={c} className={"wf-nav"+(i===active?" on":"")} style={{justifyContent:'space-between'}}>
      <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c}</span>
      <span style={{color:'#bdbbb2',fontSize:13}}>⠿</span></div>)}
    <Note size={15} color="#9a988f" style={{marginTop:6,paddingLeft:6}}>drag ⠿ to reorder · + / ✕ to add/del</Note>
  </Col>;
}
function Editor({pad=26}){
  return <div className="sketch fill0" style={{minHeight:300,padding:pad}}>
    <div style={{fontSize:22,marginBottom:14}}>Vorst's Bargain</div>
    <Lines n={8} gap={11}/>
    <div style={{height:14}}/><Lines n={5} gap={11}/>
  </div>;
}
const AIPills = ({vert}) => <div style={{display:'flex',flexDirection:vert?'column':'row',gap:9}}>
  <Btn primary sm>✦ Continue ▶</Btn><Btn sm>Review</Btn><Btn sm>Auto-summary</Btn>
</div>;

function ChapA(){
  return <ShellFrame active="chapters">
    <Row gap={16} align="flex-start">
      <div style={{width:200,flexShrink:0}}><ChapList/></div>
      <div style={{flex:1,minWidth:0,position:'relative'}}>
        <Row justify="space-between" align="center" style={{marginBottom:10}}><span style={{color:'var(--muted)',font:'14px Kalam'}}>Chapter 3 · ~2,140 words</span><span className="wf-save">● saved</span></Row>
        <Editor/>
        {/* floating toolbar */}
        <div className="sketch-wob" style={{position:'absolute',left:'50%',bottom:14,transform:'translateX(-50%)',background:'#fff',padding:'8px 12px',boxShadow:'3px 5px 0 rgba(52,50,46,.12)'}}><AIPills/></div>
      </div>
    </Row>
    <Note style={{marginTop:10}}>↑ AI as a floating pill over the editor · out of the way, summoned when needed · live word count up top</Note>
  </ShellFrame>;
}

function ChapB(){
  return <ShellFrame active="chapters">
    <Row gap={14} align="flex-start">
      <div style={{width:180,flexShrink:0}}><ChapList/></div>
      <div style={{flex:1,minWidth:0}}><Editor pad={20}/></div>
      <div className="sketch" style={{width:240,flexShrink:0,padding:14}}>
        <div style={{fontSize:16,marginBottom:10}}>✦ AI</div>
        <AIPills vert/>
        <div className="sketch fill1" style={{marginTop:14,padding:11}}><div className="bar" style={{width:'40%',height:10,marginBottom:8}}/><Lines n={4}/></div>
        <Row gap={8} style={{marginTop:10}}><Btn sm>Insert</Btn><Btn sm ghost>Discard</Btn></Row>
      </div>
    </Row>
    <Note style={{marginTop:10}}>↑ persistent AI rail · output streams in place, review before inserting · costs horizontal room</Note>
  </ShellFrame>;
}

function ChapC(){
  return <ShellFrame active="chapters">
    <Row justify="space-between" align="center" style={{marginBottom:12}}>
      <Row gap={10} align="center"><Btn sm ghost>☰ Chapters</Btn><span style={{color:'var(--muted)',font:'14px Kalam'}}>Chapter 3</span></Row>
      <Row gap={10} align="center"><AIPills/><span style={{color:'var(--muted)',font:'14px Kalam'}}>2,140 words</span></Row>
    </Row>
    <div style={{maxWidth:680,margin:'0 auto'}}><Editor pad={34}/></div>
    <Note style={{marginTop:10,textAlign:'center'}}>↑ distraction-free · chapter list collapses to a toggle · AI inline in a slim top bar · centered measure for comfortable reading</Note>
  </ShellFrame>;
}

window.WFScreens.chapters = {
  label:'Chapters', glyph:'▤', group:'Content',
  eyebrow:'Write with AI', title:'Chapters',
  blurb:'The core writing surface: an ordered chapter list and a full rich-text editor with AI actions (continue, review, summarize) and a live counter. The decision is where AI lives — floating, docked, or inline.',
  approaches:[
    {id:'A',name:'Floating AI toolbar',desc:'two-pane · pill over editor',render:ChapA},
    {id:'B',name:'Three-pane AI rail',desc:'docked · output streams',render:ChapB},
    {id:'C',name:'Distraction-free',desc:'collapsed list · top bar',render:ChapC},
  ]
};
})();
