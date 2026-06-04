/* ============ Plot ============ */
(function(){
const { useState } = React;
const { SectionTitle, Textarea, Btn, Tag, toast, cx } = window;

const FIELDS = [
  {key:'genre', label:'Genre', emoji:'🎭', rows:2},
  {key:'theme', label:'Theme', emoji:'💭', rows:2},
  {key:'premise', label:'Premise', emoji:'✨', rows:3},
  {key:'plot', label:'Detailed plot', emoji:'🧭', rows:5},
  {key:'rules', label:'World rules', emoji:'🌍', rows:4},
  {key:'style', label:'Style guide', emoji:'🖋️', rows:3},
  {key:'vocab', label:'Vocabulary palette', emoji:'🎨', rows:2},
  {key:'donts', label:"Do / Don't list", emoji:'🚦', rows:3},
];

function PlotField({f, value, onChange}){
  const [busy,setBusy]=useState(false);
  const assist=()=>{ setBusy(true); toast('Drafting a suggestion…','✦'); setTimeout(()=>{setBusy(false);toast('Suggestion ready','✅');},1100); };
  return <div className="anim-rise">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{f.emoji}</span>
        <span className="font-display text-[17px] font-medium text-ink">{f.label}</span>
      </div>
      <button onClick={assist} className="group inline-flex items-center gap-1.5 text-[13px] font-extrabold rounded-full px-3 py-1 transition"
        style={{color:'#7C6FE8', background:busy?'#ECE9FB':'transparent'}}
        onMouseEnter={e=>e.currentTarget.style.background='#ECE9FB'} onMouseLeave={e=>!busy&&(e.currentTarget.style.background='transparent')}>
        <span className={cx('transition-transform', busy?'animate-pulse':'group-hover:rotate-12')}>✦</span>{busy?'thinking…':'AI assist'}
      </button>
    </div>
    <Textarea rows={f.rows} value={value} onChange={e=>onChange(f.key,e.target.value)} placeholder={`What's the ${f.label.toLowerCase()}?`} />
  </div>;
}

function PlotScreen(){
  const [vals,setVals]=useState({...PLOT});
  const [saved,setSaved]=useState(true);
  const onChange=(k,v)=>{ setVals(s=>({...s,[k]:v})); setSaved(false); clearTimeout(window.__plotT); window.__plotT=setTimeout(()=>setSaved(true),900); };
  return <div className="max-w-3xl mx-auto">
    <SectionTitle emoji="📝" color="grape" title="Plot" sub="Your living story bible — it saves itself as you dream."
      right={<span className="inline-flex items-center gap-2 font-bold text-sm rounded-full px-3.5 py-2"
        style={{background:saved?'#DDF4EC':'#FBEFD3', color:saved?'#1FB587':'#E9A52B'}}>
        <span className={cx('h-2 w-2 rounded-full', !saved&&'animate-ping')} style={{background:saved?'#1FB587':'#E9A52B'}}/>
        {saved?'Saved':'Saving…'}</span>} />
    <div className="flex flex-col gap-6 pb-10">
      {FIELDS.map(f=><PlotField key={f.key} f={f} value={vals[f.key]||''} onChange={onChange} />)}
    </div>
  </div>;
}

window.Screens = window.Screens || {};
window.Screens.plot = PlotScreen;
})();
