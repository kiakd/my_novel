/* ============ Novel Studio wireframe kit ============ */
/* Sketchy low-fi primitives, shared via window.WF */

const _W = {};

/* layout helpers */
const Row = ({gap=10, align='stretch', justify='flex-start', wrap, style, ...p}) =>
  <div style={{display:'flex',gap,alignItems:align,justifyContent:justify,flexWrap:wrap?'wrap':'nowrap',...style}} {...p}/>;
const Col = ({gap=10, style, ...p}) =>
  <div style={{display:'flex',flexDirection:'column',gap,...style}} {...p}/>;

/* placeholder text lines */
function Lines({n=3, gap=7, short, style}){
  const ws=['100%','94%','98%','86%','96%','79%','91%'];
  return <div style={{display:'flex',flexDirection:'column',gap,...style}}>
    {Array.from({length:n}).map((_,i)=>{
      const w=(short && i===n-1)?'52%':ws[i%ws.length];
      return <div key={i} className="bar" style={{width:w}}/>;
    })}
  </div>;
}

/* striped image placeholder */
function Img({label='image', w='100%', h=80, round, style}){
  return <div className="stripe dash" style={{width:w,height:h,borderRadius:round||6,
    display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',flexShrink:0,...style}}>
    <span style={{font:'12px ui-monospace,Courier New,monospace',color:'#8a887e',letterSpacing:.3,padding:'0 6px'}}>{label}</span>
  </div>;
}
const Avatar = ({size=46}) =>
  <div className="stripe" style={{width:size,height:size,borderRadius:'50%',border:'1.6px solid #b9b7ae',flexShrink:0}}/>;

/* pill button */
function Btn({children, primary, ghost, sm, style}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,
    padding: sm?'3px 10px':'6px 13px', borderRadius:8,
    border:'1.6px solid '+(primary?'var(--accent)':'#34322e'),
    background: primary?'var(--accent)':(ghost?'transparent':'#fff'),
    color: primary?'#fff':'var(--ink)',
    font:(sm?'14px':'15.5px')+" 'Kalam',cursive", whiteSpace:'nowrap',...style}}>{children}</span>;
}

/* small chip / tag */
function Tag({children, accent, style}){
  return <span style={{display:'inline-block',padding:'1px 9px',borderRadius:20,
    border:'1.4px solid '+(accent?'var(--accent)':'#9a988f'),
    color:accent?'var(--accent)':'#65635a', font:'13px Kalam',
    background:accent?'var(--accent-tint)':'#fff',...style}}>{children}</span>;
}

/* handwritten annotation (Caveat) */
function Note({children, color='var(--accent)', size=18, style}){
  return <div style={{font:size+"px 'Caveat',cursive",color,lineHeight:1.12,...style}}>{children}</div>;
}

/* labelled field — input (lines=0) or textarea (lines>0) */
function Field({label, h, lines=0, hint, style}){
  const height = h || (lines ? 22+lines*16 : 36);
  return <label style={{display:'flex',flexDirection:'column',gap:5,minWidth:0,...style}}>
    {label && <span style={{font:'14.5px Kalam',color:'var(--muted)'}}>{label}</span>}
    <div className="sketch fill0" style={{height,padding:lines?9:'0 11px',
      display:'flex',alignItems:lines?'flex-start':'center'}}>
      {lines ? <Lines n={lines} short style={{width:'100%'}}/> :
        (hint ? <span style={{color:'#b3b1a7',font:'14px Kalam'}}>{hint}</span> : null)}
    </div>
  </label>;
}

/* glyph token */
const Glyph = ({g, style}) =>
  <span style={{display:'inline-block',width:18,textAlign:'center',...style}}>{g}</span>;

/* ---- standard app frame used by content screens ---- */
const NAV = {
  CONTENT:[['plot','✎','Plot'],['characters','☺','Characters'],['locations','◎','Locations'],
           ['relations','⇄','Relations'],['chapters','▤','Chapters'],['timeline','◷','Timeline'],
           ['imagegen','▦','Image Gen']],
  SYSTEM:[['ailog','≣','AI Log'],['settings','⚙','Settings']]
};

function ShellFrame({active, children, rail}){
  return (
    <div className="wf-app sketch-wob">
      <div className="wf-head">
        <div className="wf-hl">
          <span className="wf-logo"><span style={{fontSize:18}}>📖</span> Novel Studio</span>
          <div className="sketch wf-select"><span>The Ashfall Saga</span><span style={{color:'#9a988f'}}>▾</span></div>
          <Btn sm>+ New</Btn><Btn sm>Rename</Btn><Btn sm>Delete</Btn>
          <span className="wf-save">● saved</span>
        </div>
        <div className="wf-hr">
          <Btn sm>⟳ Sync DB</Btn><Btn sm>Export</Btn><Btn sm>.md</Btn><Btn sm>Import</Btn>
        </div>
      </div>
      <div className="wf-body">
        <nav className="wf-side">
          {Object.entries(NAV).map(([grp,items])=>(
            <React.Fragment key={grp}>
              <div className="wf-grp">{grp}</div>
              {items.map(([id,g,label])=>(
                <div key={id} className={"wf-nav"+(id===active?" on":"")}>
                  <span className="g">{g}</span>{label}
                </div>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <main className="wf-content">{children}</main>
        {rail && <aside className="wf-rail">{rail}</aside>}
      </div>
    </div>
  );
}

/* a generic page body used for shell demos */
function GenericContent({title, sub}){
  return <div>
    <h2 className="ttl">{title}</h2>
    <p className="sub">{sub}</p>
    <Row gap={14} wrap style={{marginTop:4}}>
      {[0,1,2].map(i=><div key={i} className="sketch" style={{flex:'1 1 200px',padding:14}}>
        <div className="bar" style={{width:'45%',height:12,marginBottom:10}}/>
        <Lines n={4}/>
      </div>)}
    </Row>
    <div className="sketch" style={{marginTop:14,padding:14}}><Lines n={5}/></div>
  </div>;
}

Object.assign(_W,{Row,Col,Lines,Img,Avatar,Btn,Tag,Note,Field,Glyph,ShellFrame,GenericContent,NAV});
window.WF = _W;
window.WFScreens = window.WFScreens || {};
