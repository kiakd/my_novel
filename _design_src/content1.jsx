/* ============ Plot + Characters ============ */
(function(){
const { Row, Col, Lines, Img, Avatar, Btn, Tag, Note, Field, ShellFrame } = window.WF;

/* ---------------- PLOT ---------------- */
const PLOT_FIELDS=['Genre','Theme','Premise','Detailed plot','World rules','Style guide','Vocabulary palette','Do / Don\'t list'];

function PlotA(){
  return <ShellFrame active="plot">
    <Row justify="space-between" align="center"><div><h2 className="ttl">Plot</h2><p className="sub" style={{margin:0}}>Story bible · auto-saves as you type</p></div><span className="wf-save">● saving…</span></Row>
    <Col gap={16} style={{marginTop:16,maxWidth:760}}>
      {PLOT_FIELDS.map((f,i)=>(
        <div key={f}>
          <Row justify="space-between" align="center" style={{marginBottom:5}}>
            <span style={{font:'15px Kalam',color:'var(--muted)'}}>{f}</span>
            <span style={{font:"14px 'Caveat'",color:'var(--accent)'}}>✦ AI assist</span>
          </Row>
          <div className="sketch fill0" style={{padding:9}}><Lines n={i<2?2:3} short/></div>
        </div>
      ))}
    </Col>
    <Note style={{marginTop:14}}>↑ one big textarea per field, generous height · tiny "AI assist" link per field (inline, low-key)</Note>
  </ShellFrame>;
}

function PlotB(){
  return <ShellFrame active="plot">
    <h2 className="ttl">Plot</h2><p className="sub">Two-column · section index keeps the whole bible navigable.</p>
    <Row gap={18} align="flex-start">
      <Col gap={4} style={{width:150,flexShrink:0,position:'sticky',top:0}}>
        <div style={{font:'12px ui-monospace,monospace',letterSpacing:1,color:'#9a988f',marginBottom:4}}>SECTIONS</div>
        {PLOT_FIELDS.map((f,i)=><div key={f} className={"wf-nav"+(i===0?" on":"")} style={{fontSize:14.5}}>{f}</div>)}
      </Col>
      <div style={{flex:1,minWidth:0,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {PLOT_FIELDS.map((f,i)=>(
          <Field key={f} label={f} lines={i<2?2:3}/>
        ))}
      </div>
    </Row>
    <Note style={{marginTop:12}}>↑ denser grid fits more above the fold · sticky left index jumps between sections</Note>
  </ShellFrame>;
}

function PlotC(){
  const groups=[['Foundations',['Genre','Theme','Premise']],['World',['Detailed plot','World rules']],['Voice',['Style guide','Vocabulary palette','Do / Don\'t list']]];
  return <ShellFrame active="plot">
    <h2 className="ttl">Plot</h2><p className="sub">Collapsible cards by group · AI suggestion strip inside each card.</p>
    <Col gap={14} style={{maxWidth:800}}>
      {groups.map(([g,fs],gi)=>(
        <div key={g} className="sketch" style={{padding:14}}>
          <Row justify="space-between" align="center" style={{marginBottom:gi===0?12:0}}>
            <span style={{fontSize:17}}>{g}</span><span style={{color:'#9a988f'}}>{gi===0?'▾':'▸'}</span>
          </Row>
          {gi===0 && <><Col gap={12}>{fs.map(f=><Field key={f} label={f} lines={2}/>)}</Col>
            <div className="sketch fill1" style={{marginTop:12,padding:'9px 11px',borderColor:'var(--accent)',borderStyle:'dashed'}}>
              <Row gap={8} align="center"><span style={{font:"15px 'Caveat'",color:'var(--accent)'}}>✦ AI</span><span style={{font:'13.5px Kalam',color:'var(--muted)'}}>"Tighten this premise" · "Suggest 3 themes"</span></Row>
            </div></>}
        </div>
      ))}
    </Col>
    <Note style={{marginTop:12}}>↑ AI assistance lives contextually at the bottom of each section card, not a global toolbar</Note>
  </ShellFrame>;
}

window.WFScreens.plot = {
  label:'Plot', glyph:'✎', group:'Content',
  eyebrow:'Long-form · story bible', title:'Plot',
  blurb:'A bundle of big free-text fields (genre, theme, premise, world rules, style guide, vocabulary, do/don\'t). Explores how to make a wall of textareas feel calm — and where AI assistance should sit.',
  approaches:[
    {id:'A',name:'Stacked column',desc:'roomy · inline per-field AI',render:PlotA},
    {id:'B',name:'Two-column + index',desc:'dense · sticky section nav',render:PlotB},
    {id:'C',name:'Grouped cards',desc:'collapsible · AI strip per group',render:PlotC},
  ]
};

/* ---------------- CHARACTERS ---------------- */
const CHARS=[['Kaelen','protagonist'],['Mira','deuteragonist'],['Vorst','antagonist'],['Old Sela','mentor'],['Tam','support'],['The Warden','minor']];

function CharCard({name,role,onClick}){
  return <div className="sketch" style={{padding:12,display:'flex',flexDirection:'column',gap:9,alignItems:'flex-start',cursor:'default'}}>
    <Img label="avatar" h={88} round={8}/>
    <div><div style={{fontSize:17}}>{name}</div><Tag accent={role==='protagonist'}>{role}</Tag></div>
  </div>;
}
function CharGrid({cols=3,dim}){
  return <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap:14,opacity:dim?.4:1,filter:dim?'blur(.4px)':'none'}}>
    {CHARS.map(([n,r])=><CharCard key={n} name={n} role={r}/>)}
  </div>;
}
function EditTabs(){
  return <>
    <Row gap={0} style={{borderBottom:'1.7px solid var(--line)',marginBottom:14}}>
      <span style={{padding:'7px 14px',borderBottom:'2.5px solid var(--accent)',color:'var(--accent)',marginBottom:-2}}>Profile</span>
      <span style={{padding:'7px 14px',color:'var(--muted)'}}>Visual</span>
    </Row>
    <Row gap={14} align="flex-start">
      <Col gap={10} style={{flex:1}}>
        <Field label="Appearance" lines={2}/><Field label="Bio" lines={2}/>
        <Row gap={10}><Field label="Skill" style={{flex:1}}/><Field label="Mindset" style={{flex:1}}/></Row>
      </Col>
      <Col gap={10} style={{flex:1}}>
        <Field label="Behavior" lines={2}/>
        <div><span style={{font:'14.5px Kalam',color:'var(--muted)'}}>Speech</span>
          <Row gap={8} style={{marginTop:5}}><Field hint="self pronoun" style={{flex:1}}/><Field hint="other pronoun" style={{flex:1}}/></Row>
          <div style={{marginTop:8}}><Field label="Tone + sample lines" lines={2}/></div>
        </div>
        <Row gap={8} align="center"><span style={{font:'14.5px Kalam',color:'var(--muted)'}}>Accent</span>
          {['#6c5ce0','#c0564b','#3a8f5a','#2d6fb3'].map(c=><span key={c} style={{width:20,height:20,borderRadius:'50%',background:c,border:c==='#6c5ce0'?'2.5px solid var(--ink)':'1.4px solid #b9b7ae'}}/>)}
        </Row>
      </Col>
    </Row>
  </>;
}

function CharsA(){
  return <ShellFrame active="characters">
    <div style={{position:'relative'}}>
      <Row justify="space-between" align="center"><h2 className="ttl">Characters</h2><Btn primary sm>+ Add character</Btn></Row>
      <p className="sub">Click a card → centered modal with Profile / Visual tabs.</p>
      <CharGrid cols={3} dim/>
      {/* modal */}
      <div style={{position:'absolute',inset:'30px 8% 0',background:'rgba(0,0,0,.04)',display:'flex',justifyContent:'center',alignItems:'flex-start',paddingTop:6}}>
        <div className="sketch-wob" style={{width:'100%',maxWidth:620,padding:18,background:'#fff',boxShadow:'5px 7px 0 rgba(52,50,46,.12)'}}>
          <Row justify="space-between" align="center" style={{marginBottom:12}}>
            <Row gap={10} align="center"><Avatar size={40}/><span style={{fontSize:19}}>Edit · Kaelen</span></Row>
            <span style={{fontSize:20,color:'#9a988f'}}>✕</span>
          </Row>
          <EditTabs/>
          <Row justify="flex-end" gap={9} style={{marginTop:14}}><Btn>Cancel</Btn><Btn primary>Save</Btn></Row>
        </div>
      </div>
    </div>
    <Note style={{marginTop:10}}>↑ classic centered modal · focused editing, dims the grid behind</Note>
  </ShellFrame>;
}

function CharsB(){
  return <ShellFrame active="characters">
    <Row justify="space-between" align="center"><h2 className="ttl">Characters</h2><Btn primary sm>+ Add character</Btn></Row>
    <p className="sub">Right slide-over sheet — grid stays visible & scrollable while you edit.</p>
    <Row gap={16} align="flex-start">
      <div style={{flex:1,minWidth:0}}><CharGrid cols={2}/></div>
      <div className="sketch" style={{width:320,flexShrink:0,padding:16,boxShadow:'-4px 6px 0 rgba(52,50,46,.08)'}}>
        <Row justify="space-between" align="center" style={{marginBottom:12}}><span style={{fontSize:18}}>Kaelen</span><span style={{color:'#9a988f'}}>✕</span></Row>
        <EditTabs/>
        <Btn primary style={{marginTop:14,width:'100%',justifyContent:'center'}}>Save</Btn>
      </div>
    </Row>
    <Note style={{marginTop:10}}>↑ sheet slides from the right · keep context on the roster, quick to dismiss</Note>
  </ShellFrame>;
}

function CharsC(){
  return <ShellFrame active="characters">
    <h2 className="ttl">Characters</h2><p className="sub">Master–detail: pick from the list, edit inline. Fastest for heavy editing.</p>
    <Row gap={16} align="flex-start">
      <Col gap={4} style={{width:200,flexShrink:0}}>
        <Btn primary sm style={{marginBottom:6,justifyContent:'center'}}>+ Add character</Btn>
        {CHARS.map(([n,r],i)=><div key={n} className={"wf-nav"+(i===0?" on":"")} style={{justifyContent:'flex-start',gap:9}}><Avatar size={24}/><span>{n}</span></div>)}
      </Col>
      <div className="sketch" style={{flex:1,minWidth:0,padding:18}}>
        <Row gap={12} align="center" style={{marginBottom:14}}><Img label="avatar" w={70} h={70} round={8}/><div><div style={{fontSize:20}}>Kaelen</div><Tag accent>protagonist</Tag></div></Row>
        <EditTabs/>
      </div>
    </Row>
    <Note style={{marginTop:10}}>↑ no modal at all · inline detail pane = least friction when editing many characters back-to-back</Note>
  </ShellFrame>;
}

window.WFScreens.characters = {
  label:'Characters', glyph:'☺', group:'Content',
  eyebrow:'Grid → edit', title:'Characters',
  blurb:'A roster of character cards that open into a rich editor (Profile + Visual tabs, speech, accent color). The real question is the editing surface — overlay modal, side sheet, or inline detail?',
  approaches:[
    {id:'A',name:'Grid + center modal',desc:'focused overlay editor',render:CharsA},
    {id:'B',name:'Grid + right sheet',desc:'roster stays visible',render:CharsB},
    {id:'C',name:'Master–detail',desc:'inline · no modal',render:CharsC},
  ]
};
})();
