/* ============ UI kit ============ */
const { useState, useEffect, useRef, useCallback } = React;
const cx = (...a) => a.filter(Boolean).join(' ');

function darken(hex, f=0.82){
  const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  r=Math.round(r*f);g=Math.round(g*f);b=Math.round(b*f);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
const pal = k => PALETTE[k] || PALETTE.grape;

/* chunky button with a soft 3D base */
function Btn({children, variant='soft', color='grape', size='md', className='', ...p}){
  const P = pal(color);
  const sizes = {sm:'text-sm px-3 py-1.5 gap-1.5', md:'text-[15px] px-4 py-2 gap-2', lg:'text-base px-5 py-2.5 gap-2'};
  const base = 'inline-flex items-center justify-center font-bold rounded-full transition-all duration-150 active:translate-y-[2px] whitespace-nowrap select-none disabled:opacity-50';
  let style={}, extra='';
  if(variant==='primary'){ style={background:P.c, color:'#fff', boxShadow:`0 4px 0 ${darken(P.c)}`}; extra='hover:brightness-105 active:shadow-[0_2px_0_'+darken(P.c)+']'; }
  else if(variant==='soft'){ style={background:P.soft, color:darken(P.c,.78)}; extra='hover:brightness-[.97]'; }
  else if(variant==='outline'){ style={border:`2px solid ${P.c}`, color:darken(P.c,.8), background:'#fff'}; extra='hover:bg-black/[.03]'; }
  else if(variant==='ghost'){ style={color:'#6f6555'}; extra='hover:bg-ink/[.06]'; }
  return <button className={cx(base,sizes[size],extra,className)} style={style} {...p}>{children}</button>;
}

function IconBtn({children, title, color='slate', active, className='', ...p}){
  const P=pal(color);
  return <button title={title} className={cx('h-9 w-9 grid place-items-center rounded-2xl transition active:scale-90',className)}
    style={active?{background:P.soft,color:P.c}:{color:'#8a7f6e'}} onMouseEnter={e=>{if(!active)e.currentTarget.style.background='rgba(74,65,56,.06)';}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent';}} {...p}>{children}</button>;
}

function Card({children, className='', hover, ...p}){
  return <div className={cx('bg-white rounded-4xl border border-line shadow-soft', hover&&'transition-all duration-200 hover:-translate-y-1 hover:shadow-pop cursor-pointer', className)} {...p}>{children}</div>;
}

function Tag({children, color='slate', solid, className=''}){
  const P=pal(color);
  const style = solid ? {background:P.c,color:'#fff'} : {background:P.soft,color:darken(P.c,.74)};
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold',className)} style={style}>{children}</span>;
}

function Avatar({initial, color='grape', size=44, ring, className=''}){
  const P=pal(color);
  return <div className={cx('rounded-full grid place-items-center font-display font-semibold text-white shrink-0',className)}
    style={{width:size,height:size,fontSize:size*.4,background:`linear-gradient(140deg, ${P.tint}, ${P.c})`,
      boxShadow:`0 4px 12px -3px ${P.c}88`, border:ring?`3px solid #fff`:'none'}}>{initial}</div>;
}

function Input(props){
  return <input {...props} className={cx('w-full bg-cream/70 rounded-2xl px-4 py-2.5 text-ink placeholder:text-muted/70 border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition font-semibold',props.className)} />;
}
function Textarea(props){
  return <textarea {...props} className={cx('w-full bg-cream/70 rounded-2xl px-4 py-3 text-ink placeholder:text-muted/70 border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition resize-none leading-relaxed',props.className)} />;
}
function Field({label, hint, children, className=''}){
  return <label className={cx('block',className)}>
    <div className="flex items-center justify-between mb-1.5 gap-2">
      <span className="text-[13.5px] font-extrabold text-ink/70 tracking-wide">{label}</span>
      {hint}
    </div>
    {children}
  </label>;
}

/* simple select styled like a cute pill */
function Select({value, onChange, options, className='', color='slate'}){
  const P=pal(color);
  return <div className={cx('relative inline-block',className)}>
    <select value={value} onChange={onChange}
      className="appearance-none font-bold rounded-full pl-4 pr-9 py-2 border-2 cursor-pointer focus:outline-none"
      style={{borderColor:P.soft, background:'#fff', color:'#4A4138'}}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
  </div>;
}

function SectionTitle({emoji, color, title, sub, right}){
  const P=pal(color);
  return <div className="flex items-start justify-between gap-4 mb-6">
    <div className="flex items-center gap-3.5">
      <div className="h-12 w-12 rounded-3xl grid place-items-center text-2xl shrink-0 floaty" style={{background:P.soft}}>{emoji}</div>
      <div>
        <h1 className="font-display text-[28px] leading-none font-semibold text-ink">{title}</h1>
        {sub && <p className="text-muted font-semibold mt-1.5 text-[15px]">{sub}</p>}
      </div>
    </div>
    {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
  </div>;
}

function Modal({open, onClose, children, size='md'}){
  useEffect(()=>{ if(!open) return; const h=e=>e.key==='Escape'&&onClose(); window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[open,onClose]);
  if(!open) return null;
  const w={sm:'max-w-md', md:'max-w-2xl', lg:'max-w-4xl'}[size];
  return <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{animation:'fadein .18s ease'}}>
    <div className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose}/>
    <div className={cx('relative w-full bg-cream rounded-5xl shadow-pop border-2 border-white max-h-[90vh] overflow-auto anim-pop',w)}>{children}</div>
  </div>;
}

function Drawer({open, onClose, children, width=440}){
  return <div className={cx('fixed inset-0 z-50', open?'':'pointer-events-none')}>
    <div className={cx('absolute inset-0 bg-ink/30 transition-opacity duration-300', open?'opacity-100':'opacity-0')} onClick={onClose}/>
    <div className="absolute top-0 right-0 h-full bg-cream shadow-pop border-l-2 border-line overflow-auto transition-transform duration-300"
      style={{width, transform:open?'translateX(0)':'translateX(100%)'}}>{children}</div>
  </div>;
}

function EmptyState({emoji, title, sub, action, color='grape'}){
  const P=pal(color);
  return <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div className="h-24 w-24 rounded-[2rem] grid place-items-center text-5xl mb-5 floaty" style={{background:P.soft}}>{emoji}</div>
    <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
    <p className="text-muted font-semibold mt-1.5 max-w-sm">{sub}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

function Spinner({size=16, color='#7C6FE8'}){
  return <span className="inline-block rounded-full border-[2.5px] border-current/20" style={{width:size,height:size,borderTopColor:color,color,animation:'spin .7s linear infinite'}}/>;
}

/* toast system */
function Toaster(){
  const [items,setItems]=useState([]);
  useEffect(()=>{
    const h=e=>{ const id=Math.random().toString(36); setItems(x=>[...x,{id,...e.detail}]);
      setTimeout(()=>setItems(x=>x.filter(i=>i.id!==id)),2600); };
    window.addEventListener('app-toast',h); return ()=>window.removeEventListener('app-toast',h);
  },[]);
  return <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center pointer-events-none">
    {items.map(i=><div key={i.id} className="anim-pop bg-ink text-cream pl-3 pr-4 py-2.5 rounded-full shadow-pop font-bold text-sm flex items-center gap-2">
      <span className="text-base">{i.emoji||'✨'}</span>{i.msg}</div>)}
  </div>;
}
const toast = (msg, emoji) => window.dispatchEvent(new CustomEvent('app-toast',{detail:{msg,emoji}}));

Object.assign(window, { cx, darken, pal, Btn, IconBtn, Card, Tag, Avatar, Input, Textarea, Field, Select, SectionTitle, Modal, Drawer, EmptyState, Spinner, Toaster, toast });
