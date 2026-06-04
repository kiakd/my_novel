/* ============ App Shell — 3 nav/layout approaches ============ */
(function(){
const { Row, Col, Lines, Btn, Tag, Note, ShellFrame, GenericContent, NAV } = window.WF;

/* B — full-height left sidebar, top bar only over content, collapsible */
function ShellB(){
  return (
    <div className="wf-app sketch-wob" style={{display:'flex',minHeight:610,overflow:'hidden'}}>
      <nav style={{width:198,borderRight:'1.7px solid var(--line)',padding:'14px 10px',display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'2px 6px 12px'}}>
          <span style={{fontSize:18,fontWeight:700}}>📖 Novel Studio</span>
        </div>
        <div className="sketch wf-select" style={{margin:'0 4px 10px'}}><span>The Ashfall Saga</span><span style={{color:'#9a988f'}}>▾</span></div>
        {Object.entries(NAV).map(([grp,items])=>(
          <React.Fragment key={grp}>
            <div className="wf-grp">{grp}</div>
            {items.map(([id,g,label])=>(
              <div key={id} className={"wf-nav"+(id==='plot'?" on":"")}><span className="g">{g}</span>{label}</div>
            ))}
          </React.Fragment>
        ))}
        <div style={{marginTop:'auto',padding:'10px 6px 0',borderTop:'1.4px solid #e0ded6'}}>
          <div className="wf-nav"><span className="g">«</span>Collapse</div>
        </div>
        <Note style={{position:'absolute',marginTop:-30,marginLeft:150}}>↙ collapses to icons<br/>on small screens</Note>
      </nav>
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
        <div className="wf-head" style={{borderBottom:'1.7px solid var(--line)'}}>
          <div className="wf-hl"><span style={{fontSize:18}}>Plot</span><span style={{color:'#9a988f'}}>/ story bible</span><span className="wf-save">● saved</span></div>
          <div className="wf-hr"><Btn sm>⟳ Sync DB</Btn><Btn sm>Export</Btn><Btn sm>.md</Btn><Btn sm>Import</Btn></div>
        </div>
        <div style={{padding:'20px 22px'}}><GenericContent title="Plot" sub="Per-screen toolbar sits in the top bar; global title + story switcher move into the sidebar."/></div>
      </div>
    </div>
  );
}

window.WFScreens.shell = {
  label:'App Shell', glyph:'◱', group:'Foundation',
  eyebrow:'Navigation & layout',
  title:'App Shell',
  blurb:'The persistent frame around every screen — header, story switcher, save state, global actions, and the two-group sidebar. Three takes on where the chrome lives and how much breathing room the content gets.',
  approaches:[
    { id:'A', name:'Top header + grouped sidebar', desc:'Your pick · global bar always visible',
      render:()=> <div style={{position:'relative'}}>
        <ShellFrame active="plot"><GenericContent title="Plot" sub="Active route renders here. Header spans full width so global actions + save state are always in reach."/></ShellFrame>
        <Note style={{marginTop:10}}>↑ full-width header keeps story switcher, save status & export always visible · sidebar splits CONTENT / SYSTEM</Note>
      </div> },
    { id:'B', name:'Full-height sidebar', desc:'Collapsible · denser, more vertical room',
      render:()=> <div style={{position:'relative'}}>
        <ShellB/>
        <Note style={{marginTop:10}}>↑ logo + story switcher live in the rail · per-screen toolbar in a slim top bar · sidebar collapses to icons</Note>
      </div> },
    { id:'C', name:'Header + sidebar + context rail', desc:'3-column · contextual right panel',
      render:()=> <div style={{position:'relative'}}>
        <ShellFrame active="plot"
          rail={<div>
            <div style={{font:'12px ui-monospace,monospace',letterSpacing:1.2,color:'#9a988f',marginBottom:8}}>CONTEXT</div>
            <div className="sketch" style={{padding:11,marginBottom:10}}>
              <div className="bar" style={{width:'55%',height:11,marginBottom:8}}/><Lines n={3}/>
            </div>
            <Tag accent>characters in scene</Tag>
            <div style={{marginTop:10}}><Tag>quick refs</Tag></div>
            <Note style={{marginTop:14}}>← surfaces what you need<br/>without leaving the screen<br/>(AI suggestions, refs…)</Note>
          </div>}>
          <GenericContent title="Plot" sub="A right rail carries contextual help that changes per screen."/>
        </ShellFrame>
        <Note style={{marginTop:10}}>↑ optional right rail = context without navigating away · collapses first on small screens</Note>
      </div> },
  ]
};
})();
