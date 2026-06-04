/* ============ App shell + router ============ */
const { useState } = React;

function Header({story, setStory}){
  return <header className="shrink-0 bg-white/80 backdrop-blur border-b border-line px-4 lg:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-2.5 flex-wrap">
      <div className="flex items-center gap-2 pr-1">
        <span className="text-2xl floaty">📖</span>
        <span className="font-display text-xl font-semibold text-ink hidden sm:block whitespace-nowrap">Novel Studio</span>
      </div>
      <div className="relative">
        <select value={story} onChange={e=>setStory(e.target.value)}
          className="appearance-none font-display font-medium text-[15px] rounded-full pl-4 pr-9 py-1.5 cursor-pointer focus:outline-none border-2"
          style={{background:pal('grape').soft, borderColor:pal('grape').soft, color:darken(pal('grape').c,.7)}}>
          {STORIES.map(s=><option key={s}>{s}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs" style={{color:pal('grape').c}}>▾</span>
      </div>
      <div className="hidden md:flex items-center gap-1.5">
        <Btn variant="ghost" size="sm" onClick={()=>toast('New story','✨')}>＋ New</Btn>
        <Btn variant="ghost" size="sm" onClick={()=>toast('Rename','✏️')}>✏️ Rename</Btn>
        <Btn variant="ghost" size="sm" onClick={()=>toast('Delete?','🗑')}>🗑 Delete</Btn>
      </div>
      <span className="inline-flex items-center gap-1.5 font-bold text-[13px] text-mint ml-1"><span className="h-2 w-2 rounded-full bg-mint"/>saved</span>
    </div>
    <div className="flex items-center gap-1.5">
      <Btn variant="soft" color="sky" size="sm" onClick={()=>toast('Synced to DB','🔄')}>🔄 <span className="hidden lg:inline">Sync DB</span></Btn>
      <Btn variant="soft" color="mint" size="sm" onClick={()=>toast('Exported','💾')}>💾 <span className="hidden lg:inline">Export</span></Btn>
      <Btn variant="soft" color="sun" size="sm" onClick={()=>toast('Exported .md','📝')}>📝 <span className="hidden lg:inline">.md</span></Btn>
      <Btn variant="soft" color="coral" size="sm" onClick={()=>toast('Import','📂')}>📂 <span className="hidden lg:inline">Import</span></Btn>
    </div>
  </header>;
}

function NavItem({item, active, onClick}){
  const P=pal(item.color);
  return <button onClick={onClick}
    className={cx('w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 font-bold text-[15px] transition-all duration-150 active:scale-[.98]', !active&&'hover:bg-ink/[.05]')}
    style={active?{background:P.c,color:'#fff',boxShadow:`0 5px 14px -5px ${P.c}`}:{color:'#6f6555'}}>
    <span className={cx('h-8 w-8 rounded-xl grid place-items-center text-base transition', active&&'scale-110')}
      style={{background:active?'rgba(255,255,255,.25)':P.soft}}>{item.emoji}</span>
    {item.label}
  </button>;
}

function Sidebar({view, setView}){
  return <aside className="bg-white/55 border-r border-line p-3.5 overflow-auto flex flex-col">
    {Object.entries(NAV).map(([group,items])=>(
      <div key={group} className="mb-3">
        <div className="px-3 py-2 text-[11px] font-extrabold tracking-[.14em] text-muted">{group}</div>
        <div className="flex flex-col gap-1">
          {items.map(it=><NavItem key={it.id} item={it} active={view===it.id} onClick={()=>setView(it.id)} />)}
        </div>
      </div>
    ))}
    <div className="mt-auto px-3 pt-3">
      <div className="rounded-3xl p-4 text-center" style={{background:pal('grape').soft}}>
        <div className="text-2xl mb-1">✨</div>
        <div className="font-display font-medium text-ink text-sm">12,120 words</div>
        <div className="text-[12px] font-bold text-muted">this week — keep going!</div>
      </div>
    </div>
  </aside>;
}

function App(){
  const [view,setView]=useState(()=>localStorage.getItem('ns_view')||'chapters');
  const [story,setStory]=useState(STORIES[0]);
  const go=(v)=>{ setView(v); localStorage.setItem('ns_view',v); };
  const Screen = window.Screens[view] || window.Screens.chapters;
  return <div className="h-screen flex flex-col">
    <Header story={story} setStory={setStory} />
    <div className="flex-1 min-h-0 grid" style={{gridTemplateColumns:'232px 1fr'}}>
      <Sidebar view={view} setView={go} />
      <main className="overflow-auto p-6 lg:p-8" key={view}>
        <Screen/>
      </main>
    </div>
    <Toaster/>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
