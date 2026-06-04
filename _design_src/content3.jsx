/* ============ Timeline + Image Gen + AI Log ============ */
(function(){
const { Row, Col, Lines, Img, Btn, Tag, Note, Field, ShellFrame } = window.WF;

/* ---------------- TIMELINE ---------------- */
const EVENTS=[['Day 0','The ashfall begins','Ch 1'],['Day 3','Crossing the Reach','Ch 2'],['Day 8','Vorst\'s bargain struck','Ch 3'],['Week 3','Embers rekindle','Ch 4'],['Week 5','The Warden wakes','Ch 5']];

function TimeA(){
  return <ShellFrame active="timeline">
    <Row justify="space-between" align="center"><h2 className="ttl">Timeline</h2><Btn primary sm>+ Add event</Btn></Row>
    <p className="sub">Vertical chronology · each event links to its chapter.</p>
    <div style={{position:'relative',paddingLeft:26}}>
      <div style={{position:'absolute',left:7,top:6,bottom:6,width:2,background:'#cfcdc6'}}/>
      <Col gap={14}>{EVENTS.map(([t,e,ch])=>(
        <div key={e} style={{position:'relative'}}>
          <span style={{position:'absolute',left:-26,top:6,width:14,height:14,borderRadius:'50%',background:'#fff',border:'2px solid var(--accent)'}}/>
          <div className="sketch" style={{padding:'10px 14px'}}>
            <Row justify="space-between" align="center"><span style={{fontSize:16}}>{e}</span><Tag accent>{ch}</Tag></Row>
            <div style={{font:"14px 'Caveat'",color:'var(--muted)',marginTop:2}}>{t}</div>
          </div>
        </div>))}</Col>
    </div>
    <Note style={{marginTop:12}}>↑ simplest & most legible · reads like a story beat-sheet · chapter chip jumps to the editor</Note>
  </ShellFrame>;
}

function TimeB(){
  return <ShellFrame active="timeline">
    <h2 className="ttl">Timeline</h2><p className="sub">Horizontal track — see pacing & gaps across the whole book.</p>
    <div className="sketch fill1" style={{padding:'22px 16px',overflow:'auto'}}>
      <div style={{position:'relative',minWidth:760,height:150}}>
        <div style={{position:'absolute',left:0,right:0,top:70,height:2,background:'#cfcdc6'}}/>
        {EVENTS.map(([t,e,ch],i)=>{const x=i*180+30;const up=i%2===0;
          return <div key={e} style={{position:'absolute',left:x,top:up?2:84,width:150}}>
            <div className="sketch" style={{padding:'7px 9px',fontSize:13.5}}><div>{e}</div><Tag accent style={{marginTop:4}}>{ch}</Tag></div>
            <div style={{position:'absolute',left:18,top:up?'auto':-14,bottom:up?-14:'auto',width:10,height:10,borderRadius:'50%',background:'var(--accent)'}}/>
            <div style={{position:'absolute',left:34,top:up?64:-22,font:"13px 'Caveat'",color:'var(--muted)'}}>{t}</div>
          </div>;})}
      </div>
    </div>
    <Note style={{marginTop:12}}>↑ great for sensing rhythm & long time-skips · horizontal scroll · alternating lanes reduce crowding</Note>
  </ShellFrame>;
}

function TimeC(){
  const groups=[['Ch 1',[EVENTS[0]]],['Ch 2',[EVENTS[1]]],['Ch 3',[EVENTS[2]]],['Ch 4–5',[EVENTS[3],EVENTS[4]]]];
  return <ShellFrame active="timeline">
    <h2 className="ttl">Timeline</h2><p className="sub">Time axis on the left, event cards grouped by chapter on the right.</p>
    <Row gap={0} align="stretch">
      <Col gap={0} style={{width:120,flexShrink:0,borderRight:'2px solid #cfcdc6',paddingRight:14}}>
        {groups.map(([ch],i)=><div key={ch} style={{minHeight:78,paddingTop:8,textAlign:'right'}}><div style={{fontSize:16}}>{ch}</div><div style={{font:"13px 'Caveat'",color:'var(--muted)'}}>{EVENTS[Math.min(i,4)][0]}</div></div>)}
      </Col>
      <Col gap={12} style={{flex:1,paddingLeft:16}}>
        {groups.map(([ch,evs])=><div key={ch}>{evs.map(([t,e])=><div key={e} className="sketch" style={{padding:'10px 14px',marginBottom:8}}><div style={{fontSize:16}}>{e}</div><Lines n={1}/></div>)}</div>)}
      </Col>
    </Row>
    <Note style={{marginTop:12}}>↑ ties chronology directly to chapter structure · easy to spot which chapter covers which span</Note>
  </ShellFrame>;
}

window.WFScreens.timeline = {
  label:'Timeline', glyph:'◷', group:'Content',
  eyebrow:'Chronology', title:'Timeline',
  blurb:'Story events in order, each tied to a chapter. Vertical reads like a beat sheet; horizontal reveals pacing; an axis-plus-cards layout binds time to chapter structure.',
  approaches:[
    {id:'A',name:'Vertical list',desc:'beat-sheet · most legible',render:TimeA},
    {id:'B',name:'Horizontal track',desc:'see pacing & gaps',render:TimeB},
    {id:'C',name:'Axis + cards',desc:'grouped by chapter',render:TimeC},
  ]
};

/* ---------------- IMAGE GEN ---------------- */
const POSES=['standing','3/4 turn','action','portrait','seated','back'];
function PromptBlock(){
  return <>
    <Row gap={8} align="center" style={{marginBottom:10}}>
      <span style={{font:'14.5px Kalam',color:'var(--muted)'}}>Provider</span>
      <div className="sketch wf-select" style={{minWidth:150}}><span>NovelAI</span><span style={{color:'#9a988f'}}>▾</span></div>
    </Row>
    <Field label="Prompt" lines={2}/><div style={{height:8}}/>
    <Field label="Negative" lines={1}/>
    <Btn sm style={{marginTop:10}}>✦ Scene → prompt</Btn>
  </>;
}
function PoseGrid(){
  return <div>
    <div style={{font:'14.5px Kalam',color:'var(--muted)',marginBottom:6}}>Pose preset</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
      {POSES.map((p,i)=><Img key={p} label={p} h={52} round={6} style={i===0?{borderColor:'var(--accent)',borderStyle:'solid'}:null}/>)}
    </div>
  </div>;
}
function Gallery({cols=3,n=6,label='Ch 3'}){
  return <div>
    <Row justify="space-between" align="center" style={{marginBottom:8}}><span style={{fontSize:16}}>Gallery · {label}</span><Tag>{n} images</Tag></Row>
    <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap:10}}>
      {Array.from({length:n}).map((_,i)=><Img key={i} label={i===0?'generating…':'render'} h={cols>3?96:120} round={8} style={i===0?{borderColor:'var(--accent)'}:null}/>)}
    </div>
  </div>;
}

function ImgA(){
  return <ShellFrame active="imagegen">
    <h2 className="ttl">Image Gen</h2><p className="sub">Controls left, results right. Familiar two-panel generator.</p>
    <Row gap={16} align="flex-start">
      <div className="sketch" style={{width:300,flexShrink:0,padding:16}}><PromptBlock/><div style={{height:14}}/><PoseGrid/><Btn primary style={{marginTop:14,width:'100%',justifyContent:'center'}}>✦ Generate</Btn></div>
      <div style={{flex:1,minWidth:0}}><Gallery/></div>
    </Row>
    <Note style={{marginTop:10}}>↑ all controls in one rail · progress shows on the first (active) tile</Note>
  </ShellFrame>;
}

function ImgB(){
  return <ShellFrame active="imagegen">
    <Row justify="space-between" align="center"><h2 className="ttl">Image Gen</h2>
      <Row gap={0} style={{border:'1.7px solid var(--line)',borderRadius:8,overflow:'hidden'}}><span style={{padding:'6px 13px',background:'var(--accent-tint)',color:'var(--accent)'}}>Per-chapter</span><span style={{padding:'6px 13px',color:'var(--muted)'}}>Reference sheet</span></Row></Row>
    <p className="sub">Wide control bar on top, big gallery below.</p>
    <div className="sketch" style={{padding:14,marginBottom:14}}>
      <Row gap={12} align="flex-end" wrap>
        <div className="sketch wf-select" style={{minWidth:140}}><span>NovelAI ▾</span></div>
        <Field hint="prompt…" style={{flex:2,minWidth:200}}/><Field hint="negative…" style={{flex:1,minWidth:140}}/>
        <Btn sm>✦ Scene→prompt</Btn><Btn primary>Generate</Btn>
      </Row>
    </div>
    <Gallery cols={4} n={8}/>
    <Note style={{marginTop:12}}>↑ maximizes gallery space · top tab swaps to a 6-angle character reference sheet</Note>
  </ShellFrame>;
}

function ImgC(){
  return <ShellFrame active="imagegen">
    <h2 className="ttl">Image Gen</h2><p className="sub">Three columns: presets · prompt & preview · gallery.</p>
    <Row gap={14} align="flex-start">
      <div className="sketch" style={{width:170,flexShrink:0,padding:12}}><PoseGrid/></div>
      <div className="sketch" style={{flex:1,minWidth:0,padding:14}}><PromptBlock/>
        <div style={{marginTop:12}}><Img label="live preview" h={150} round={8} style={{borderColor:'var(--accent)'}}/></div>
        <Btn primary style={{marginTop:12,width:'100%',justifyContent:'center'}}>✦ Generate</Btn></div>
      <div style={{width:200,flexShrink:0}}><Gallery cols={2} n={6}/></div>
    </Row>
    <Note style={{marginTop:10}}>↑ preview front-and-center · presets & history flank it · best on wide desktop screens</Note>
  </ShellFrame>;
}

window.WFScreens.imagegen = {
  label:'Image Gen', glyph:'▦', group:'Content',
  eyebrow:'Visuals', title:'Image Generation',
  blurb:'Generate scene & character art: provider picker, prompt/negative, scene→prompt helper, pose presets, per-chapter gallery and a 6-angle reference sheet. Explores how to arrange controls vs. output.',
  approaches:[
    {id:'A',name:'Controls + gallery',desc:'two-panel · familiar',render:ImgA},
    {id:'B',name:'Top bar + big gallery',desc:'gallery-first · ref-sheet tab',render:ImgB},
    {id:'C',name:'Three columns',desc:'preview-centric',render:ImgC},
  ]
};

/* ---------------- AI LOG ---------------- */
const LOGS=[['14:02:11','/continue','NovelAI','kayra-v1','ok','1,240'],['13:51:48','/review','OpenAI','gpt-4o','ok','880'],['13:44:02','/summary','Claude','sonnet','ok','610'],['13:30:19','/continue','NovelAI','kayra-v1','error','—'],['13:12:55','/scene-prompt','Claude','sonnet','ok','420']];
function LogTable({onRow,activeRow=-1}){
  return <div className="sketch" style={{overflow:'hidden'}}>
    <Row style={{padding:'9px 14px',font:'13px ui-monospace,monospace',color:'var(--muted)',background:'#f0efe9',borderBottom:'1.7px solid var(--line)'}}>
      <span style={{flex:1}}>TIME</span><span style={{flex:1.4}}>ENDPOINT</span><span style={{flex:1.2}}>PROVIDER</span><span style={{flex:1.2}}>MODEL</span><span style={{width:64}}>STATUS</span><span style={{width:70,textAlign:'right'}}>ms</span>
    </Row>
    {LOGS.map((r,i)=><Row key={i} align="center" style={{padding:'10px 14px',borderBottom:i<LOGS.length-1?'1px solid #ece9e1':'none',font:'14.5px Kalam',background:i===activeRow?'var(--accent-tint)':'transparent'}}>
      <span style={{flex:1}}>{r[0]}</span><span style={{flex:1.4,fontFamily:'ui-monospace,monospace',fontSize:13}}>{r[1]}</span><span style={{flex:1.2}}>{r[2]}</span><span style={{flex:1.2}}>{r[3]}</span>
      <span style={{width:64}}><Tag style={r[4]==='error'?{borderColor:'#c0564b',color:'#c0564b'}:{borderColor:'#3a8f5a',color:'#3a8f5a'}}>{r[4]}</Tag></span>
      <span style={{width:70,textAlign:'right',color:'var(--muted)'}}>{r[5]}</span></Row>)}
  </div>;
}
function LogDetail(){
  return <><div style={{fontSize:17,marginBottom:4}}>/continue · NovelAI</div><div style={{font:'13px ui-monospace,monospace',color:'var(--muted)',marginBottom:12}}>14:02:11 · kayra-v1 · 1,240ms</div>
    <div style={{font:'13px ui-monospace,monospace',color:'#9a988f',marginBottom:5}}>SYSTEM PROMPT</div><div className="sketch fill1" style={{padding:10,marginBottom:12}}><Lines n={3}/></div>
    <div style={{font:'13px ui-monospace,monospace',color:'#9a988f',marginBottom:5}}>USER</div><div className="sketch fill1" style={{padding:10,marginBottom:12}}><Lines n={2}/></div>
    <div style={{font:'13px ui-monospace,monospace',color:'#9a988f',marginBottom:5}}>RESPONSE</div><div className="sketch fill0" style={{padding:10}}><Lines n={5}/></div></>;
}

function LogA(){
  return <ShellFrame active="ailog">
    <div style={{position:'relative'}}>
      <h2 className="ttl">AI Log</h2><p className="sub">Table of calls · row click opens a detail drawer.</p>
      <LogTable activeRow={0}/>
      <div className="sketch" style={{position:'absolute',top:0,right:-22,width:300,height:'108%',padding:16,background:'#fff',boxShadow:'-5px 6px 0 rgba(52,50,46,.1)'}}>
        <Row justify="space-between" align="center" style={{marginBottom:12}}><span style={{fontSize:16}}>Call detail</span><span style={{color:'#9a988f'}}>✕</span></Row><LogDetail/>
      </div>
    </div>
    <Note style={{marginTop:10}}>↑ drawer slides over from the right · table stays put underneath</Note>
  </ShellFrame>;
}
function LogB(){
  return <ShellFrame active="ailog">
    <h2 className="ttl">AI Log</h2><p className="sub">Inline expandable rows — detail unfolds in place.</p>
    <div className="sketch" style={{overflow:'hidden'}}>
      <Row style={{padding:'9px 14px',font:'13px ui-monospace,monospace',color:'var(--muted)',background:'#f0efe9',borderBottom:'1.7px solid var(--line)'}}><span style={{flex:1}}>TIME</span><span style={{flex:1.4}}>ENDPOINT</span><span style={{flex:1.2}}>PROVIDER</span><span style={{flex:1.2}}>MODEL</span><span style={{width:64}}>STATUS</span><span style={{width:60,textAlign:'right'}}>ms</span></Row>
      <Row align="center" style={{padding:'10px 14px',background:'var(--accent-tint)',font:'14.5px Kalam'}}><span style={{flex:1}}>14:02:11</span><span style={{flex:1.4,fontFamily:'ui-monospace,monospace',fontSize:13}}>/continue</span><span style={{flex:1.2}}>NovelAI</span><span style={{flex:1.2}}>kayra-v1</span><span style={{width:64}}><Tag style={{borderColor:'#3a8f5a',color:'#3a8f5a'}}>ok</Tag></span><span style={{width:60,textAlign:'right',color:'var(--muted)'}}>▾</span></Row>
      <div style={{padding:14,borderBottom:'1px solid #ece9e1',background:'#faf9f5'}}><LogDetail/></div>
      {LOGS.slice(1).map((r,i)=><Row key={i} align="center" style={{padding:'10px 14px',borderBottom:i<LOGS.length-2?'1px solid #ece9e1':'none',font:'14.5px Kalam'}}><span style={{flex:1}}>{r[0]}</span><span style={{flex:1.4,fontFamily:'ui-monospace,monospace',fontSize:13}}>{r[1]}</span><span style={{flex:1.2}}>{r[2]}</span><span style={{flex:1.2}}>{r[3]}</span><span style={{width:64}}><Tag style={r[4]==='error'?{borderColor:'#c0564b',color:'#c0564b'}:{borderColor:'#3a8f5a',color:'#3a8f5a'}}>{r[4]}</Tag></span><span style={{width:60,textAlign:'right',color:'var(--muted)'}}>▸</span></Row>)}
    </div>
    <Note style={{marginTop:10}}>↑ no overlay · compare a call against its neighbors while expanded</Note>
  </ShellFrame>;
}
function LogC(){
  return <ShellFrame active="ailog">
    <h2 className="ttl">AI Log</h2><p className="sub">Master–detail split — list left, full detail pinned right.</p>
    <Row gap={16} align="flex-start">
      <div style={{flex:1.3,minWidth:0}}><LogTable activeRow={0}/></div>
      <div className="sketch" style={{flex:1,minWidth:0,padding:16}}><LogDetail/></div>
    </Row>
    <Note style={{marginTop:10}}>↑ click through calls fast, detail always visible · widest layout of the three</Note>
  </ShellFrame>;
}

window.WFScreens.ailog = {
  label:'AI Log', glyph:'≣', group:'System',
  eyebrow:'Diagnostics', title:'AI Log',
  blurb:'A running history of every AI call — timestamp, endpoint, provider, model, status, latency — with full prompt/response on demand. Explores how to reveal that detail: drawer, inline, or split.',
  approaches:[
    {id:'A',name:'Table + drawer',desc:'overlay detail',render:LogA},
    {id:'B',name:'Inline expand',desc:'unfolds in place',render:LogB},
    {id:'C',name:'Master–detail split',desc:'detail always visible',render:LogC},
  ]
};
})();
