import { useState, useEffect, useMemo, useCallback } from "react";

// ─── PALETTE ────────────────────────────────────────────────────────────────
const C = {
  bg:"#F8F3EA", card:"#FFFFFF", deep:"#141F10", forest:"#1C3820",
  gold:"#C9912A", goldLt:"#EDD070", coral:"#E05035", sage:"#3E8556",
  mid:"#7A8C80", bdr:"#E2DAD0", text:"#1A2C1E",
  blue:"#1A6BBD", amber:"#C97A12", red:"#C53030", pur:"#7C3AED",
};

// ─── FAMILY DEFAULTS ────────────────────────────────────────────────────────
const DEFAULT_FAM = [
  {id:"andy",  name:"Andy",   emoji:"👨", role:"Dad",      goal:"weight_loss", weight:85, color:C.coral, mult:1.8},
  {id:"clare", name:"Clare",  emoji:"👩", role:"Mum",      goal:"weight_loss", weight:70, color:C.pur,   mult:1.8},
  {id:"ollie", name:"Oliver", emoji:"💪", role:"Son",      goal:"muscle",      weight:65, color:C.blue,  mult:2.0},
  {id:"d1",    name:"Ella",   emoji:"🧒", role:"Daughter", goal:"growth",      weight:28, color:C.gold,  mult:1.1, age:9},
  {id:"d2",    name:"Ruby",   emoji:"👧", role:"Daughter", goal:"growth",      weight:22, color:C.sage,  mult:1.1, age:7},
];

const GOAL = {
  weight_loss:{ label:"Weight Loss",  hint:"1.8g x bodyweight", icon:"📉" },
  muscle:     { label:"Lean Muscle",  hint:"2.0g x bodyweight", icon:"💪" },
  growth:     { label:"Growth & Dev", hint:"1.1g x bodyweight", icon:"🌱" },
};

const DAYS_S  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_L  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SEA_MAP = {0:"Winter",1:"Winter",2:"Spring",3:"Spring",4:"Spring",5:"Summer",6:"Summer",7:"Summer",8:"Autumn",9:"Autumn",10:"Autumn",11:"Winter"};
const SEA_ICO = {Winter:"❄️",Spring:"🌸",Summer:"☀️",Autumn:"🍂"};

// ─── UTILS ──────────────────────────────────────────────────────────────────
const getMon  = (off=0)=>{ const d=new Date(); d.setHours(0,0,0,0); const w=d.getDay(); d.setDate(d.getDate()-(w===0?6:w-1)+off*7); return d; };
const getWeek = mon=>Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
const dk      = d=>d.toISOString().split("T")[0];
const todayDk = ()=>dk(new Date());
const prot    = m=>({ daily:Math.round(m.weight*m.mult), dinner:Math.round(m.weight*m.mult*0.35) });
const season  = ()=>SEA_MAP[new Date().getMonth()];
const monName = ()=>new Date().toLocaleString("en-GB",{month:"long"});
const f2      = n=>Number(n||0).toFixed(2);
const clamp   = (v,min,max)=>Math.min(Math.max(v,min),max);

// ─── STORAGE (localStorage) ──────────────────────────────────────────────────
const store = {
  get: k => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch(e) { console.warn("store.set", k, e); }
  },
};

// ─── AI (calls our own /api/suggest serverless route) ───────────────────────
async function callChef({ fam, history, pantry, plan, filters }) {
  const planned   = Object.values(plan).filter(d=>d?.accepted).map(d=>d.meal?.name).filter(Boolean);
  const recent    = history.slice(-20).map(h=>`${h.meal?.name}(${h.rating}star)`).join(", ")||"none";
  const stock     = pantry.map(p=>p.name).join(", ")||"none";
  const famStr    = fam.map(m=>{ const pt=prot(m); return `${m.name}(${m.role},${GOAL[m.goal].label},${m.weight}kg,~${pt.dinner}g protein from dinner)`; }).join("; ");
  const filterStr = [
    filters?.slowCooker && "MUST be a slow cooker recipe",
    filters?.quick      && "MUST be ready in under 30 minutes",
    filters?.budget     && "MUST cost under 12 GBP total",
  ].filter(Boolean).join("; ") || "no extra filters";

  const prompt = `You are a professional UK chef and nutritionist for a British family.
IMPORTANT: Return ONLY a raw valid JSON object. The response must start with { and end with }. No markdown, no backticks, no explanation before or after.

Suggest one dinner for the Payne family (5 people, UK).
Family: ${famStr}
Season: ${season()} (${monName()}) - use seasonal British produce
Budget: 12-20 GBP total (unless filter overrides)
Shops: Sainsbury's and Lidl/Aldi - estimate prices for both
Filters: ${filterStr}
Do not repeat these meals: ${planned.join(", ")||"nothing yet"}
Learn from these past ratings: ${recent}
Pantry already stocked: ${stock}

Return this exact JSON structure, all fields required:
{"name":"Meal Name","description":"Two appetising sentences.","emoji":"plate emoji","cuisine":"British","cookTime":35,"isSlowCooker":false,"difficulty":"Easy","tags":["High Protein","Seasonal"],"servings":5,"macrosPerServing":{"calories":480,"protein":42,"carbs":38,"fat":16},"costPerServing":2.60,"totalCost":13.00,"makesLeftovers":false,"leftoverNote":"Great for lunch next day","ingredients":[{"name":"Chicken thighs","qty":900,"unit":"g","category":"Meat and Fish","sainsburys":5.50,"lidl":4.20}],"method":["Step 1","Step 2","Step 3","Step 4"],"whyPerfect":"Why this suits the family.","chefTip":"One pro tip."}`;

  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Bad response from server (status ${res.status})`); }

  if (!res.ok) {
    throw new Error(data?.error || `Server error ${res.status}`);
  }
  if (data.error) throw new Error(data.error);

  const raw = (data.content || []).map(c => c.text || "").join("");
  if (!raw) throw new Error("Empty response from API");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON in response. Got: ${raw.slice(0, 60)}`);
  try { return JSON.parse(m[0]); }
  catch(pe) { throw new Error(`JSON parse failed: ${pe.message}`); }
}

// ─── SHOPPING LIST ───────────────────────────────────────────────────────────
const buildList = (plan, pantry) => {
  const agg={};
  Object.values(plan).filter(d=>d?.accepted&&d.meal?.ingredients).forEach(day=>{
    day.meal.ingredients.forEach(ing=>{
      const k=ing.name.toLowerCase().trim();
      if(agg[k]){ agg[k].qty=(agg[k].qty||0)+(ing.qty||0); agg[k].sainsburys=(agg[k].sainsburys||0)+(ing.sainsburys||0); agg[k].lidl=(agg[k].lidl||0)+(ing.lidl||0); }
      else agg[k]={...ing};
    });
  });
  const have=new Set(pantry.map(p=>p.name.toLowerCase().trim()));
  const out={};
  Object.values(agg).forEach(item=>{ if(have.has(item.name.toLowerCase().trim()))return; const cat=item.category||"Other"; (out[cat]=out[cat]||[]).push(item); });
  return out;
};

// ─── MICRO COMPONENTS ───────────────────────────────────────────────────────
const Stars=({v=0,onRate,sz=20})=>(
  <div style={{display:"flex",gap:1}}>{[1,2,3,4,5].map(s=>(
    <span key={s} onClick={()=>onRate?.(s)}
      style={{fontSize:sz,cursor:onRate?"pointer":"default",lineHeight:1,userSelect:"none",
        color:s<=v?"#D97706":"#D1D5DB",transition:"color .12s",display:"block"}}
      onMouseEnter={e=>{if(onRate)e.target.style.transform="scale(1.3)";}}
      onMouseLeave={e=>{e.target.style.transform="scale(1)";}}>★</span>
  ))}</div>
);

const Pill=({icon,val,label,color})=>(
  <div style={{flex:1,background:color+"1A",borderRadius:10,padding:"6px 3px",textAlign:"center",minWidth:0}}>
    <div style={{fontSize:11}}>{icon}</div>
    <div style={{fontSize:13,fontWeight:700,color,fontFamily:"DM Sans,sans-serif",lineHeight:1.1}}>{val}</div>
    <div style={{fontSize:9,color:C.mid,fontFamily:"DM Sans,sans-serif",marginTop:1}}>{label}</div>
  </div>
);

const Tag=({text,color=C.mid,onClick,active})=>(
  <span onClick={onClick} style={{background:active?color:color+"1A",color:active?"white":color,
    borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap",
    fontFamily:"DM Sans,sans-serif",cursor:onClick?"pointer":"default",
    border:`1.5px solid ${color}${active?"":"30"}`,transition:"all .15s",userSelect:"none"}}>{text}</span>
);

const Btn=({ch,fn,col=C.coral,sm,full,dis,sx={}})=>(
  <button onClick={fn} disabled={dis} className="press" style={{
    background:dis?"#9CA3AF":col,color:"white",border:"none",
    borderRadius:sm?8:12,padding:sm?"7px 13px":"11px 18px",
    fontSize:sm?12:14,fontWeight:600,cursor:dis?"not-allowed":"pointer",
    width:full?"100%":"auto",letterSpacing:.2,
    boxShadow:dis?"none":`0 2px 12px ${col}38`,transition:"background .15s",...sx}}>{ch}</button>
);

const GBtn=({ch,fn,col=C.mid,sm})=>(
  <button onClick={fn} className="press" style={{
    background:"transparent",color:col,border:`1.5px solid ${col}55`,
    borderRadius:sm?8:12,padding:sm?"6px 13px":"10px 16px",
    fontSize:sm?12:14,fontWeight:600,cursor:"pointer",letterSpacing:.2}}>{ch}</button>
);

const Acc=({label,open,toggle,count})=>(
  <button onClick={toggle} style={{width:"100%",background:"none",border:"none",cursor:"pointer",
    padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
    borderTop:`1px solid ${C.bdr}`}}>
    <span style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif"}}>
      {label}{count!=null&&<span style={{color:C.mid,fontWeight:400}}> ({count})</span>}
    </span>
    <span style={{color:C.mid,fontSize:11}}>{open?"▲ hide":"▼ show"}</span>
  </button>
);

const Skel=()=>(
  <div style={{borderRadius:16,overflow:"hidden",border:`1px solid ${C.bdr}`,background:C.card,marginBottom:8}}>
    <div className="shim" style={{height:88}}/>
    <div style={{padding:16}}>{[60,88,72].map((w,i)=><div key={i} className="shim" style={{height:11,borderRadius:8,marginBottom:9,width:`${w}%`}}/>)}</div>
  </div>
);

// ─── NUTRITION DASHBOARD ─────────────────────────────────────────────────────
const NutritionDashboard = ({ fam, plan, weekDks }) => {
  const [open, setOpen] = useState(false);
  const weekMeals = weekDks.map(d=>plan[d]).filter(d=>d?.accepted&&d.meal?.macrosPerServing);
  const avgProt = weekMeals.length ? Math.round(weekMeals.reduce((s,d)=>s+(d.meal.macrosPerServing.protein||0),0)/weekMeals.length) : 0;
  const avgCal  = weekMeals.length ? Math.round(weekMeals.reduce((s,d)=>s+(d.meal.macrosPerServing.calories||0),0)/weekMeals.length) : 0;

  return (
    <div style={{background:C.card,borderRadius:16,marginBottom:14,border:`1px solid ${C.bdr}`,overflow:"hidden",boxShadow:"0 2px 10px rgba(22,34,16,.05)"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:"13px 15px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>📊</span>
          <span style={{fontFamily:"Playfair Display,serif",fontSize:15,fontWeight:700,color:C.text}}>This Week&apos;s Nutrition</span>
          <Tag text={`${weekMeals.length} meals planned`} color={weekMeals.length>=5?C.sage:C.amber}/>
        </div>
        <span style={{color:C.mid,fontSize:11,fontFamily:"DM Sans,sans-serif"}}>{open?"▲ hide":"▼ show"}</span>
      </button>
      {open && (
        <div className="fadeIn" style={{padding:"0 15px 15px"}}>
          <div style={{display:"flex",gap:7,marginBottom:14}}>
            {[
              {l:"Meals planned",v:`${weekMeals.length}/7`,c:weekMeals.length>=5?C.sage:C.amber,icon:"🍽️"},
              {l:"Protein/dinner",v:`${avgProt}g`,c:C.blue,icon:"💪"},
              {l:"Avg kcal",v:avgCal,c:C.coral,icon:"🔥"},
            ].map(x=>(
              <div key={x.l} style={{flex:1,background:x.c+"12",borderRadius:10,padding:"9px 6px",textAlign:"center",border:`1px solid ${x.c}20`}}>
                <div style={{fontSize:14}}>{x.icon}</div>
                <div style={{fontFamily:"Playfair Display,serif",fontSize:18,fontWeight:700,color:x.c}}>{x.v}</div>
                <div style={{fontSize:9,color:C.mid,fontFamily:"DM Sans,sans-serif",marginTop:1}}>{x.l}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:C.mid,textTransform:"uppercase",letterSpacing:1.2,marginBottom:9,fontFamily:"DM Sans,sans-serif"}}>Weekly protein from dinners</div>
          {fam.map(m=>{
            const perPersonActual = weekMeals.reduce((s,d)=>s+(d.meal.macrosPerServing?.protein||0),0);
            const target = prot(m).dinner * Math.max(weekMeals.length,1);
            const pct = clamp(Math.round((perPersonActual/Math.max(target,1))*100),0,100);
            return (
              <div key={m.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:16}}>{m.emoji}</span>
                    <span style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif"}}>{m.name}</span>
                    <Tag text={GOAL[m.goal].label} color={m.color}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:pct>=80?C.sage:C.amber,fontFamily:"DM Sans,sans-serif"}}>{perPersonActual}g / {target}g</span>
                </div>
                <div style={{height:10,background:C.bg,borderRadius:10,overflow:"hidden",border:`1px solid ${C.bdr}`}}>
                  <div style={{height:"100%",borderRadius:10,width:`${pct}%`,background:pct>=100?C.sage:pct>=60?C.gold:C.coral,transition:"width .5s ease"}}/>
                </div>
                <div style={{fontSize:10,color:C.mid,fontFamily:"DM Sans,sans-serif",marginTop:2,textAlign:"right"}}>
                  {pct}% · target {prot(m).dinner}g/dinner
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── MEAL CARD ────────────────────────────────────────────────────────────────
const MealCard = ({ meal, proposed, accepted, rating, leftover, onAccept, onReject, onRate, onRemove, onToggleLeftover }) => {
  const [showIng,  setShowIng]  = useState(false);
  const [showMeth, setShowMeth] = useState(false);
  const mac   = meal.macrosPerServing || {};
  const ings  = meal.ingredients || [];
  const steps = meal.method || [];
  const sT = ings.reduce((s,i)=>s+(i.sainsburys||0),0);
  const lT = ings.reduce((s,i)=>s+(i.lidl||0),0);
  const best = sT<=lT ? "Sainsbury's" : "Lidl";
  const save = Math.abs(sT-lT);
  const hdr = proposed ? `linear-gradient(145deg,${C.coral},#F07050)` : accepted ? `linear-gradient(145deg,${C.forest},${C.sage})` : `linear-gradient(145deg,#253A28,#1A2E1C)`;

  return (
    <div className="popIn" style={{borderRadius:18,overflow:"hidden",background:C.card,border:`1px solid ${C.bdr}`,boxShadow:"0 4px 20px rgba(22,34,16,.09)"}}>
      <div style={{background:hdr,padding:"17px 17px 14px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-14,right:-10,fontSize:84,opacity:.1,userSelect:"none",lineHeight:1}}>{meal.emoji||"🍽️"}</div>
        <div style={{position:"relative"}}>
          <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            <Tag text={meal.cuisine||"Dinner"} color="rgba(255,255,255,.9)"/>
            {meal.isSlowCooker&&<Tag text="🥘 Slow Cooker" color="rgba(255,255,255,.9)"/>}
            <Tag text={meal.difficulty||"Easy"} color={{Easy:C.sage,Medium:C.amber,Hard:C.coral}[meal.difficulty]||C.mid}/>
          </div>
          <div style={{fontFamily:"Playfair Display,serif",fontSize:20,fontWeight:700,color:"white",lineHeight:1.2,marginBottom:5}}>{meal.name}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.8)",fontFamily:"DM Sans,sans-serif",lineHeight:1.55}}>{meal.description}</div>
          <div style={{marginTop:9,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,.8)",fontFamily:"DM Sans,sans-serif"}}>⏱ {meal.cookTime}min · 👥 {meal.servings||5}</span>
            <span style={{flex:1}}/>
            <span style={{fontFamily:"Playfair Display,serif",fontSize:19,fontWeight:700,color:C.goldLt}}>£{f2(meal.totalCost)}</span>
          </div>
        </div>
      </div>

      {(meal.tags||[]).length>0&&<div style={{padding:"8px 15px 4px",display:"flex",gap:5,flexWrap:"wrap"}}>{meal.tags.map(t=><Tag key={t} text={t} color={C.sage}/>)}</div>}

      {(meal.makesLeftovers||leftover)&&<div style={{margin:"6px 15px 0",background:`${C.amber}18`,border:`1.5px solid ${C.amber}40`,borderRadius:9,padding:"7px 10px",fontSize:12,color:C.text,fontFamily:"DM Sans,sans-serif",lineHeight:1.5}}>
        🍱 <strong>Leftovers:</strong> {meal.leftoverNote||"Great for lunch the next day"}
      </div>}

      <div style={{padding:"10px 15px",display:"flex",gap:5}}>
        <Pill icon="🔥" val={mac.calories||0}              label="kcal"    color={C.coral}/>
        <Pill icon="💪" val={`${mac.protein||0}g`}         label="protein" color={C.blue}/>
        <Pill icon="🌾" val={`${mac.carbs||0}g`}           label="carbs"   color={C.amber}/>
        <Pill icon="🧈" val={`${mac.fat||0}g`}             label="fat"     color={C.mid}/>
        <Pill icon="👤" val={`£${f2(meal.costPerServing)}`} label="/head"  color={C.sage}/>
      </div>

      <div style={{margin:"0 15px 10px",background:C.bg,borderRadius:11,padding:"9px 11px"}}>
        <div style={{fontSize:9,color:C.mid,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:7,fontFamily:"DM Sans,sans-serif"}}>Price comparison</div>
        <div style={{display:"flex",gap:6}}>
          {[{s:"Sainsbury's",v:sT,b:sT<=lT},{s:"Lidl / Aldi",v:lT,b:lT<=sT}].map(x=>(
            <div key={x.s} style={{flex:1,background:x.b?C.sage+"18":C.card,border:`1.5px solid ${x.b?C.sage:C.bdr}`,borderRadius:9,padding:"7px",textAlign:"center"}}>
              <div style={{fontSize:10,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>{x.s}</div>
              <div style={{fontSize:15,fontWeight:700,color:x.b?C.sage:C.text,fontFamily:"DM Sans,sans-serif"}}>£{f2(x.v)}</div>
              {x.b&&<div style={{fontSize:9,color:C.sage,fontWeight:700,fontFamily:"DM Sans,sans-serif"}}>✓ BEST</div>}
            </div>
          ))}
          <div style={{flex:1,background:C.gold+"18",border:`1.5px solid ${C.gold}35`,borderRadius:9,padding:"7px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>You save</div>
            <div style={{fontSize:15,fontWeight:700,color:C.gold,fontFamily:"DM Sans,sans-serif"}}>£{f2(save)}</div>
            <div style={{fontSize:9,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>at {best}</div>
          </div>
        </div>
      </div>

      {meal.whyPerfect&&<div style={{margin:"0 15px 8px",background:`${C.gold}12`,borderLeft:`3px solid ${C.gold}`,borderRadius:"0 9px 9px 0",padding:"8px 11px",fontSize:12,color:C.text,fontFamily:"DM Sans,sans-serif",lineHeight:1.6}}>💡 <strong>Why tonight:</strong> {meal.whyPerfect}</div>}
      {meal.chefTip&&<div style={{margin:"0 15px 10px",background:`${C.sage}10`,borderLeft:`3px solid ${C.sage}`,borderRadius:"0 9px 9px 0",padding:"8px 11px",fontSize:12,color:C.text,fontFamily:"DM Sans,sans-serif",lineHeight:1.6}}>👨‍🍳 <strong>Chef&apos;s tip:</strong> {meal.chefTip}</div>}

      <Acc label="🛒 Ingredients" open={showIng} toggle={()=>setShowIng(v=>!v)} count={ings.length}/>
      {showIng&&<div style={{padding:"4px 15px 11px"}} className="fadeIn">{ings.map((ing,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",padding:"6px 0",borderBottom:i<ings.length-1?`1px solid ${C.bdr}`:"none",gap:8}}>
          <div style={{flex:1,minWidth:0,fontSize:13,fontFamily:"DM Sans,sans-serif"}}>
            <span style={{fontWeight:500,color:C.text}}>{ing.name}</span>
            <span style={{color:C.mid}}> — {ing.qty}{ing.unit}</span>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0,fontSize:11,fontFamily:"DM Sans,sans-serif"}}>
            <span style={{color:C.coral}}>S:£{f2(ing.sainsburys)}</span>
            <span style={{color:C.blue}}>L:£{f2(ing.lidl)}</span>
          </div>
        </div>
      ))}</div>}

      <Acc label="👨‍🍳 Method" open={showMeth} toggle={()=>setShowMeth(v=>!v)} count={steps.length?`${steps.length} steps`:undefined}/>
      {showMeth&&<div style={{padding:"4px 15px 13px"}} className="fadeIn">{steps.map((step,i)=>(
        <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<steps.length-1?`1px solid ${C.bdr}`:"none"}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:C.forest,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0,marginTop:1,fontFamily:"DM Sans,sans-serif"}}>{i+1}</div>
          <p style={{margin:0,fontSize:13,color:C.text,fontFamily:"DM Sans,sans-serif",lineHeight:1.6}}>{step}</p>
        </div>
      ))}</div>}

      <div style={{padding:"12px 15px",borderTop:`1px solid ${C.bdr}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {proposed&&(<><Btn ch="✓ Add to Week" fn={onAccept} col={C.sage} sx={{flex:1}}/><GBtn ch="✗ Try Another" fn={onReject} col={C.coral}/></>)}
        {accepted&&(<>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif",marginBottom:3}}>Rate this meal:</div>
            <Stars v={rating||0} onRate={onRate} sz={26}/>
          </div>
          <button onClick={onToggleLeftover} className="press" style={{background:leftover?C.amber+"22":"transparent",border:`1.5px solid ${leftover?C.amber:C.bdr}`,borderRadius:9,padding:"6px 10px",cursor:"pointer",fontSize:13,color:leftover?C.amber:C.mid,transition:"all .15s"}}>
            🍱{leftover?" Leftovers on":" Leftovers?"}
          </button>
          <GBtn ch="Remove" fn={onRemove} col={C.mid} sm/>
        </>)}
      </div>
    </div>
  );
};

// ─── PLAN VIEW ───────────────────────────────────────────────────────────────
const PlanView = ({ fam, plan, setPlan, history, pantry, proposed, setProposed, wkOff, setWkOff, onRated }) => {
  const [loading, setLoading] = useState(null);
  const [err,     setErr]     = useState(null);
  const [filters, setFilters] = useState({ slowCooker:false, quick:false, budget:false });

  const mon   = useMemo(()=>getMon(wkOff),[wkOff]);
  const week  = useMemo(()=>getWeek(mon),[mon]);
  const wkDks = useMemo(()=>week.map(d=>dk(d)),[week]);
  const accepted = useMemo(()=>Object.values(plan).filter(d=>d?.accepted),[plan]);
  const spend    = accepted.reduce((s,d)=>s+(d.meal?.totalCost||0),0);
  const today    = todayDk();
  const now      = new Date(); now.setHours(0,0,0,0);
  const wLabel   = `${week[0].getDate()} ${MONTHS[week[0].getMonth()]} – ${week[6].getDate()} ${MONTHS[week[6].getMonth()]}`;

  const suggest = async dk_ => {
    setLoading(dk_); setErr(null);
    try { const meal=await callChef({fam,history,pantry,plan,filters}); setProposed(p=>({...p,[dk_]:meal})); }
    catch(e) { console.error("callChef:",e); setErr(e.message||"Unknown error"); }
    finally { setLoading(null); }
  };
  const accept        = dk_=>{ const m=proposed[dk_]; if(!m)return; setPlan(p=>({...p,[dk_]:{meal:m,accepted:true,rating:0,leftover:m.makesLeftovers||false}})); setProposed(p=>{const n={...p};delete n[dk_];return n;}); };
  const reject        = dk_=>setProposed(p=>{const n={...p};delete n[dk_];return n;});
  const rate          = (dk_,r)=>{ setPlan(p=>({...p,[dk_]:{...p[dk_],rating:r}})); onRated(dk_,plan[dk_]?.meal,r); };
  const remove        = dk_=>setPlan(p=>{const n={...p};delete n[dk_];return n;});
  const toggleLO      = dk_=>setPlan(p=>({...p,[dk_]:{...p[dk_],leftover:!p[dk_]?.leftover}}));
  const toggleF       = k=>setFilters(f=>({...f,[k]:!f[k]}));

  return (
    <div style={{padding:"16px 14px 28px"}}>
      <div style={{background:C.card,borderRadius:16,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.bdr}`,boxShadow:"0 2px 10px rgba(22,34,16,.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setWkOff(v=>v-1)} className="press" style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,cursor:"pointer",fontSize:14,color:C.mid,flexShrink:0}}>◀</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:10,color:C.mid,fontWeight:600,textTransform:"uppercase",letterSpacing:1,fontFamily:"DM Sans,sans-serif"}}>{wkOff===0?"This week":wkOff===1?"Next week":"Week of"}</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:"DM Sans,sans-serif"}}>{wLabel}</div>
          </div>
          <button onClick={()=>setWkOff(v=>v+1)} className="press" style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,cursor:"pointer",fontSize:14,color:C.mid,flexShrink:0}}>▶</button>
        </div>
        {accepted.length>0&&<div style={{marginTop:9,display:"flex",gap:7}}>
          {[{i:"🍽️",v:`${accepted.length} planned`,c:C.sage},{i:"💷",v:`~£${f2(spend)}`,c:C.gold}].map(x=>(
            <div key={x.v} style={{flex:1,background:x.c+"14",borderRadius:8,padding:"5px",textAlign:"center",border:`1px solid ${x.c}28`}}>
              <span style={{fontSize:12,fontWeight:600,color:x.c,fontFamily:"DM Sans,sans-serif"}}>{x.i} {x.v}</span>
            </div>
          ))}
        </div>}
      </div>

      <NutritionDashboard fam={fam} plan={plan} weekDks={wkDks}/>

      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,color:C.mid,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:7,fontFamily:"DM Sans,sans-serif"}}>Tonight&apos;s filters</div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {[{k:"slowCooker",label:"🥘 Slow Cooker",color:C.pur},{k:"quick",label:"⚡ Under 30 min",color:C.blue},{k:"budget",label:"💰 Budget night",color:C.sage}].map(f=>(
            <Tag key={f.k} text={f.label} color={f.color} active={filters[f.k]} onClick={()=>toggleF(f.k)}/>
          ))}
        </div>
      </div>

      {err&&<div className="fadeIn" style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:11,padding:"10px 14px",marginBottom:12,color:C.red,fontFamily:"DM Sans,sans-serif"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <span style={{fontSize:13,fontWeight:600}}>⚠️ Could not get a suggestion</span>
          <span onClick={()=>setErr(null)} style={{cursor:"pointer",opacity:.6,fontSize:14,marginLeft:8}}>✕</span>
        </div>
        <div style={{fontSize:11,lineHeight:1.5,wordBreak:"break-all",opacity:.85}}>{err}</div>
      </div>}

      {week.map((date,i)=>{
        const dk_=dk(date); const day=plan[dk_]; const prop=proposed[dk_];
        const isToday=dk_===today; const isPast=date<now&&!isToday;
        return (
          <div key={dk_} style={{marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{padding:"3px 11px",borderRadius:7,background:isToday?C.coral:day?.accepted?C.sage:isPast?"#9CA3AF":C.forest,color:"white",fontSize:12,fontWeight:700,fontFamily:"DM Sans,sans-serif",letterSpacing:.3}}>{DAYS_S[i]}</div>
              <span style={{fontSize:13,fontWeight:500,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>{DAYS_L[i]}, {date.getDate()} {MONTHS[date.getMonth()]}{isToday&&<span style={{color:C.coral,fontWeight:700}}> · Today</span>}</span>
              {day?.leftover&&<span style={{fontSize:14}}>🍱</span>}
              {day?.accepted&&day.rating>0&&<Stars v={day.rating} sz={13}/>}
            </div>
            {day?.accepted?(
              <MealCard meal={day.meal} accepted rating={day.rating} leftover={day.leftover} onRate={r=>rate(dk_,r)} onRemove={()=>remove(dk_)} onToggleLeftover={()=>toggleLO(dk_)}/>
            ):loading===dk_?(
              <div>
                <div style={{textAlign:"center",padding:26,background:C.card,borderRadius:18,border:`1px solid ${C.bdr}`,marginBottom:8}}>
                  <div className="pulse" style={{fontSize:46,marginBottom:8}}>👨‍🍳</div>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:16,color:C.text,marginBottom:3}}>Chef is thinking…</div>
                  <div style={{fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif",lineHeight:1.6}}>Season · ratings · budget · pantry</div>
                </div>
                <Skel/><Skel/>
              </div>
            ):prop?(
              <MealCard meal={prop} proposed onAccept={()=>accept(dk_)} onReject={()=>reject(dk_)}/>
            ):(
              <div style={{background:C.card,borderRadius:14,padding:20,textAlign:"center",border:`2px dashed ${C.bdr}`}}>
                {isPast?<div style={{color:C.mid,fontSize:13,fontFamily:"DM Sans,sans-serif"}}>No meal logged for this day</div>:<Btn ch="✨ Suggest Tonight's Dinner" fn={()=>suggest(dk_)} col={C.coral}/>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── PANTRY VIEW ─────────────────────────────────────────────────────────────
const LOCS = [{id:"cupboard",label:"Cupboard",icon:"🗄️"},{id:"fridge",label:"Fridge",icon:"🧊"},{id:"freezer",label:"Freezer",icon:"❄️"}];

const PantryView = ({ pantry, setPantry }) => {
  const [loc,  setLoc]  = useState("cupboard");
  const [form, setForm] = useState({name:"",qty:"",unit:"g"});
  const add=()=>{ if(!form.name.trim()||!form.qty)return; setPantry(p=>[...p,{id:Date.now().toString(),name:form.name.trim(),qty:parseFloat(form.qty),unit:form.unit,location:loc,added:new Date().toISOString()}]); setForm(f=>({...f,name:"",qty:""})); };
  const items=pantry.filter(p=>p.location===loc);
  const counts=Object.fromEntries(LOCS.map(l=>[l.id,pantry.filter(p=>p.location===l.id).length]));
  return (
    <div style={{padding:"16px 14px 28px"}}>
      <h2 style={{fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:C.text,margin:"0 0 4px"}}>Pantry</h2>
      <p style={{fontSize:13,color:C.mid,fontFamily:"DM Sans,sans-serif",margin:"0 0 14px"}}>Items here are excluded from your shopping list.</p>
      <div style={{background:C.card,borderRadius:16,padding:15,marginBottom:13,border:`1px solid ${C.bdr}`,boxShadow:"0 2px 10px rgba(22,34,16,.05)"}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif",marginBottom:8}}>Add an item</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="e.g. Olive oil, Pasta…" style={{flex:2,border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 11px",fontSize:13,color:C.text,background:C.bg}}/>
          <input value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Qty" type="number" style={{width:62,border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 6px",fontSize:13,color:C.text,background:C.bg}}/>
          <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} style={{border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 5px",fontSize:12,color:C.text,background:C.bg}}>
            {["g","kg","ml","l","pcs","tbsp","tsp","pack","tin","jar"].map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:9}}>
          {LOCS.map(l=><button key={l.id} onClick={()=>setLoc(l.id)} className="press" style={{flex:1,padding:"7px 0",borderRadius:9,border:`1.5px solid ${loc===l.id?C.forest:C.bdr}`,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"DM Sans,sans-serif",background:loc===l.id?C.forest:"transparent",color:loc===l.id?"white":C.mid}}>{l.icon} {l.label}</button>)}
        </div>
        <Btn ch={`+ Add to ${LOCS.find(l=>l.id===loc)?.label}`} fn={add} col={C.sage} full/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:13}}>
        {LOCS.map(l=><button key={l.id} onClick={()=>setLoc(l.id)} className="press" style={{flex:1,padding:"9px 4px",borderRadius:12,border:`1.5px solid ${loc===l.id?C.forest:C.bdr}`,cursor:"pointer",background:loc===l.id?C.forest:C.card,color:loc===l.id?"white":C.mid,fontFamily:"DM Sans,sans-serif",fontWeight:600,fontSize:11,textAlign:"center"}}>
          <div style={{fontSize:18}}>{l.icon}</div><div>{l.label}</div><div style={{fontSize:9,opacity:.6,marginTop:1}}>{counts[l.id]} items</div>
        </button>)}
      </div>
      {items.length===0?(
        <div style={{textAlign:"center",padding:"38px 20px",color:C.mid,fontFamily:"DM Sans,sans-serif"}}>
          <div style={{fontSize:48,marginBottom:9}}>{LOCS.find(l=>l.id===loc)?.icon}</div>
          <div style={{fontFamily:"Playfair Display,serif",fontSize:18,color:C.text,marginBottom:5}}>Your {loc} is empty</div>
          <div style={{fontSize:13,lineHeight:1.6}}>Add items so Yes Chef knows what you already have.</div>
        </div>
      ):items.map(item=>(
        <div key={item.id} className="fadeIn" style={{background:C.card,borderRadius:12,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10,border:`1px solid ${C.bdr}`}}>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif"}}>{item.name}</div><div style={{fontSize:12,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>{item.qty} {item.unit}</div></div>
          <button onClick={()=>setPantry(p=>p.filter(x=>x.id!==item.id))} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",fontSize:18,padding:4}}>🗑</button>
        </div>
      ))}
    </div>
  );
};

// ─── SHOP VIEW ────────────────────────────────────────────────────────────────
const ShopView = ({ plan, pantry }) => {
  const [ticked,   setTicked]   = useState(new Set());
  const [manForm,  setManForm]  = useState({name:"",qty:"",unit:"pcs",category:"Other"});
  const [manItems, setManItems] = useState([]);
  const [showAdd,  setShowAdd]  = useState(false);
  const [copied,   setCopied]   = useState(false);

  const grp = useMemo(()=>buildList(plan,pantry),[plan,pantry]);
  const allGrouped = useMemo(()=>{
    const merged={...Object.fromEntries(Object.entries(grp).map(([k,v])=>[k,[...v]]))};
    manItems.forEach(item=>{ const cat=item.category||"Other"; (merged[cat]=merged[cat]||[]).push({...item,isManual:true}); });
    return merged;
  },[grp,manItems]);

  const cats     = Object.keys(allGrouped).sort();
  const allItems = Object.values(allGrouped).flat();
  const unticked = allItems.filter(i=>!ticked.has(i.name));
  const sT = unticked.reduce((s,i)=>s+(i.sainsburys||0),0);
  const lT = unticked.reduce((s,i)=>s+(i.lidl||0),0);
  const best = sT<=lT?"Sainsbury's":"Lidl";
  const saving = Math.abs(sT-lT);

  const tick = name=>setTicked(prev=>{ const n=new Set(prev); n.has(name)?n.delete(name):n.add(name); return n; });
  const addManual=()=>{ if(!manForm.name.trim())return; setManItems(p=>[...p,{id:Date.now().toString(),...manForm,name:manForm.name.trim()}]); setManForm(f=>({...f,name:"",qty:""})); };

  const copy=()=>{
    const lines=["PAYNE'S YES CHEF — Shopping List",""];
    cats.forEach(cat=>{ lines.push(`-- ${cat.toUpperCase()} --`); allGrouped[cat].forEach(i=>lines.push(`  * ${ticked.has(i.name)?"DONE ":""}${i.name} (${i.qty||""}${i.unit||""})   S: £${f2(i.sainsburys)}  Lidl: £${f2(i.lidl)}`)); lines.push(""); });
    lines.push(`Sainsbury's: £${f2(sT)}  |  Lidl: £${f2(lT)}  |  Best: ${best} (save £${f2(saving)})`);
    navigator.clipboard.writeText(lines.join("\n")).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);}).catch(()=>{});
  };

  if(!cats.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:68,marginBottom:12}}>🛒</div>
      <div style={{fontFamily:"Playfair Display,serif",fontSize:22,color:C.text,marginBottom:7}}>Your list is empty</div>
      <div style={{fontSize:14,color:C.mid,fontFamily:"DM Sans,sans-serif",lineHeight:1.7,maxWidth:280,margin:"0 auto"}}>Accept meals in the Plan tab and your list builds here automatically.</div>
    </div>
  );

  return (
    <div style={{padding:"16px 14px 28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <h2 style={{fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:C.text,margin:0}}>Shopping List</h2>
        <button onClick={()=>setShowAdd(v=>!v)} className="press" style={{background:showAdd?C.sage:C.bg,color:showAdd?"white":C.mid,border:`1.5px solid ${showAdd?C.sage:C.bdr}`,borderRadius:9,padding:"6px 11px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"DM Sans,sans-serif"}}>{showAdd?"✕ Close":"+ Add item"}</button>
      </div>
      <p style={{fontSize:13,color:C.mid,fontFamily:"DM Sans,sans-serif",margin:"0 0 14px"}}>{allItems.length} items · {ticked.size} ticked off · tap to check</p>

      {showAdd&&<div className="fadeIn" style={{background:C.card,borderRadius:14,padding:14,marginBottom:14,border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif",marginBottom:8}}>Add a manual item</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={manForm.name} onChange={e=>setManForm(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addManual()} placeholder="e.g. Milk, Bread, Eggs…" style={{flex:2,border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 10px",fontSize:13,color:C.text,background:C.bg}}/>
          <input value={manForm.qty} onChange={e=>setManForm(f=>({...f,qty:e.target.value}))} placeholder="Qty" style={{width:55,border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 5px",fontSize:13,color:C.text,background:C.bg}}/>
          <select value={manForm.unit} onChange={e=>setManForm(f=>({...f,unit:e.target.value}))} style={{border:`1.5px solid ${C.bdr}`,borderRadius:9,padding:"9px 4px",fontSize:12,color:C.text,background:C.bg}}>
            {["pcs","g","kg","ml","l","pack","bottle","box","tin"].map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
        <Btn ch="+ Add to list" fn={addManual} col={C.sage} full/>
      </div>}

      <div style={{background:`linear-gradient(145deg,${C.forest},#2A5C38)`,borderRadius:18,padding:16,marginBottom:16,boxShadow:`0 6px 24px rgba(22,34,16,.22)`}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,.55)",fontWeight:600,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10,fontFamily:"DM Sans,sans-serif"}}>Remaining items · best price</div>
        <div style={{display:"flex",gap:9,marginBottom:13}}>
          {[{s:"Sainsbury's",v:sT,b:sT<=lT},{s:"Lidl / Aldi",v:lT,b:lT<sT}].map(x=>(
            <div key={x.s} style={{flex:1,background:"rgba(255,255,255,.1)",borderRadius:11,padding:"9px 7px",textAlign:"center",border:`1.5px solid ${x.b?"rgba(255,255,255,.4)":"rgba(255,255,255,.1)"}`}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"DM Sans,sans-serif"}}>{x.s}</div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:21,fontWeight:700,color:"white"}}>£{f2(x.v)}</div>
              {x.b&&<div style={{fontSize:9,color:C.goldLt,fontWeight:700,fontFamily:"DM Sans,sans-serif"}}>✓ BEST DEAL</div>}
            </div>
          ))}
          <div style={{flex:1,background:`${C.gold}28`,border:`1.5px solid ${C.gold}55`,borderRadius:11,padding:"9px 7px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontFamily:"DM Sans,sans-serif"}}>You save</div>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:21,fontWeight:700,color:C.goldLt}}>£{f2(saving)}</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:"DM Sans,sans-serif"}}>at {best}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copy} className="press" style={{flex:1,background:"white",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,color:C.forest,fontFamily:"DM Sans,sans-serif",cursor:"pointer"}}>{copied?"✓ Copied!":"📋 Copy List"}</button>
          {ticked.size>0&&<button onClick={()=>setTicked(new Set())} className="press" style={{background:"rgba(255,255,255,.15)",border:"1.5px solid rgba(255,255,255,.3)",borderRadius:10,padding:"11px 14px",fontSize:12,fontWeight:600,color:"white",fontFamily:"DM Sans,sans-serif",cursor:"pointer",flexShrink:0}}>Clear {ticked.size}</button>}
        </div>
      </div>

      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:C.mid,textTransform:"uppercase",letterSpacing:1.5,marginBottom:7,paddingLeft:2,fontFamily:"DM Sans,sans-serif"}}>{cat}</div>
          <div style={{background:C.card,borderRadius:13,overflow:"hidden",border:`1px solid ${C.bdr}`,boxShadow:"0 1px 7px rgba(22,34,16,.04)"}}>
            {allGrouped[cat].map((item,i)=>{
              const isT=ticked.has(item.name); const sb=(item.sainsburys||0)<=(item.lidl||0); const isM=item.isManual;
              return(
                <div key={item.id||i} onClick={()=>tick(item.name)} style={{display:"flex",alignItems:"center",padding:"11px 13px",borderBottom:i<allGrouped[cat].length-1?`1px solid ${C.bdr}`:"none",gap:8,cursor:"pointer",background:isT?"#F9F9F9":"white",transition:"background .12s"}}>
                  <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${isT?C.sage:C.bdr}`,background:isT?C.sage:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                    {isT&&<span style={{color:"white",fontSize:13,fontWeight:700,lineHeight:1}}>✓</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:500,color:isT?C.mid:C.text,textDecoration:isT?"line-through":"none",fontFamily:"DM Sans,sans-serif",transition:"all .12s"}}>{item.name}{isM&&<span style={{fontSize:10,color:C.mid,marginLeft:4}}>(added)</span>}</div>
                    {(item.qty||item.unit)&&<div style={{fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>{item.qty}{item.unit}</div>}
                  </div>
                  {!isM&&<div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,opacity:isT?.4:1,transition:"opacity .12s"}}>
                    <div style={{textAlign:"center",minWidth:40}}><div style={{fontSize:8,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>S&apos;bury</div><div style={{fontSize:12,fontWeight:700,color:sb?C.sage:C.mid,fontFamily:"DM Sans,sans-serif"}}>£{f2(item.sainsburys)}</div></div>
                    <div style={{textAlign:"center",minWidth:36}}><div style={{fontSize:8,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>Lidl</div><div style={{fontSize:12,fontWeight:700,color:!sb?C.sage:C.mid,fontFamily:"DM Sans,sans-serif"}}>£{f2(item.lidl)}</div></div>
                  </div>}
                  {isM&&<button onClick={e=>{e.stopPropagation();setManItems(p=>p.filter(x=>x.id!==item.id));}} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",fontSize:15,padding:3,flexShrink:0}}>🗑</button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p style={{textAlign:"center",fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif",paddingBottom:4}}>* Estimated prices — always verify in-store</p>
    </div>
  );
};

// ─── FAMILY VIEW ──────────────────────────────────────────────────────────────
const FamilyView = ({ fam, setFam }) => {
  const [editId, setEditId] = useState(null);
  const [form,   setForm]   = useState({});
  const startEdit=m=>{setEditId(m.id);setForm({name:m.name,weight:m.weight});};
  const saveEdit =id=>{setFam(p=>p.map(m=>m.id===id?{...m,name:form.name||m.name,weight:parseFloat(form.weight)||m.weight}:m));setEditId(null);};
  const totals=fam.reduce((a,m)=>{const p=prot(m);return{daily:a.daily+p.daily,dinner:a.dinner+p.dinner};},{daily:0,dinner:0});
  return (
    <div style={{padding:"16px 14px 28px"}}>
      <h2 style={{fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:C.text,margin:"0 0 4px"}}>The Payne Family</h2>
      <p style={{fontSize:13,color:C.mid,fontFamily:"DM Sans,sans-serif",margin:"0 0 13px",lineHeight:1.5}}>Update weights and protein targets recalculate automatically.</p>
      <div style={{background:C.gold+"18",border:`1.5px solid ${C.gold}38`,borderRadius:13,padding:"11px 13px",marginBottom:13}}>
        <div style={{fontSize:12,fontWeight:600,color:C.gold,fontFamily:"DM Sans,sans-serif",marginBottom:5}}>How protein targets work</div>
        {Object.entries(GOAL).map(([k,v])=><div key={k} style={{fontSize:12,color:C.text,fontFamily:"DM Sans,sans-serif",padding:"2px 0",lineHeight:1.5}}>{v.icon} <strong>{v.label}:</strong> {v.hint} of bodyweight</div>)}
      </div>
      {fam.map(m=>{
        const pt=prot(m); const g=GOAL[m.goal]; const isE=editId===m.id;
        return (
          <div key={m.id} className="fadeIn" style={{background:C.card,borderRadius:16,marginBottom:11,overflow:"hidden",border:`1px solid ${C.bdr}`,boxShadow:"0 2px 12px rgba(22,34,16,.05)"}}>
            <div style={{background:`linear-gradient(135deg,${m.color}1C,${m.color}07)`,borderBottom:`1.5px solid ${m.color}20`,padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:`linear-gradient(135deg,${m.color},${m.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:`0 3px 10px ${m.color}40`}}>{m.emoji}</div>
              <div style={{flex:1,minWidth:0}}>
                {isE?<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{fontSize:15,fontWeight:700,color:C.text,width:"100%",border:`2px solid ${m.color}`,borderRadius:8,padding:"3px 7px",fontFamily:"DM Sans,sans-serif",background:C.bg}}/>
                    :<div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:"DM Sans,sans-serif"}}>{m.name}</div>}
                <div style={{fontSize:12,color:m.color,fontWeight:600,fontFamily:"DM Sans,sans-serif"}}>{m.role}{m.age?` · Age ${m.age}`:""} · {g.icon} {g.label}</div>
              </div>
              <button onClick={()=>isE?saveEdit(m.id):startEdit(m)} className="press" style={{background:isE?C.sage:C.bg,color:isE?"white":C.mid,border:`1.5px solid ${isE?C.sage:C.bdr}`,borderRadius:10,padding:"7px 11px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"DM Sans,sans-serif",flexShrink:0}}>
                {isE?"💾 Save":"✏️ Edit"}
              </button>
            </div>
            <div style={{padding:"12px 14px",display:"flex",gap:8}}>
              {[{l:"Weight",v:isE?null:m.weight+"kg",c:m.color,edit:isE},{l:"Daily goal",v:pt.daily+"g",c:C.blue},{l:"From dinner",v:"~"+pt.dinner+"g",c:C.sage}].map((x,idx)=>(
                <div key={idx} style={{flex:1,background:x.c+"11",borderRadius:10,padding:"9px 6px",textAlign:"center",border:`1px solid ${x.c}1C`}}>
                  <div style={{fontSize:9,color:C.mid,fontFamily:"DM Sans,sans-serif",marginBottom:2}}>{x.l}</div>
                  {x.edit?<input type="number" value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))} style={{width:"100%",border:`2px solid ${m.color}`,borderRadius:8,padding:"4px 2px",fontSize:19,fontWeight:700,color:m.color,fontFamily:"DM Sans,sans-serif",background:"transparent",textAlign:"center"}}/>
                         :<div style={{fontFamily:"Playfair Display,serif",fontSize:21,fontWeight:700,color:x.c}}>{x.v}</div>}
                </div>
              ))}
            </div>
            <div style={{padding:"0 14px 12px"}}><div style={{background:C.bg,borderRadius:8,padding:"7px 9px",fontSize:12,color:C.mid,fontFamily:"DM Sans,sans-serif",lineHeight:1.5}}>💡 {g.hint} of bodyweight</div></div>
          </div>
        );
      })}
      <div style={{background:`linear-gradient(145deg,${C.deep},#253C28)`,borderRadius:18,padding:17,boxShadow:`0 4px 18px rgba(22,34,16,.20)`}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:600,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10,fontFamily:"DM Sans,sans-serif"}}>Payne family — combined targets</div>
        <div style={{display:"flex",gap:9}}>
          {[{l:"All members / day",v:totals.daily+"g",c:C.goldLt},{l:"From dinners / day",v:totals.dinner+"g",c:"#8DD8A0"}].map(x=>(
            <div key={x.l} style={{flex:1,background:"rgba(255,255,255,.08)",borderRadius:11,padding:"12px 7px",textAlign:"center"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontFamily:"DM Sans,sans-serif",marginBottom:3}}>{x.l}</div>
              <div style={{fontFamily:"Playfair Display,serif",fontSize:25,fontWeight:700,color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────
const HistoryView = ({ history }) => {
  const rated=history.filter(h=>h.rating>0);
  const avg=rated.length?(rated.reduce((s,h)=>s+h.rating,0)/rated.length).toFixed(1):null;
  const favs=[...history].filter(h=>h.rating>=4).sort((a,b)=>b.rating-a.rating).slice(0,5);
  if(!history.length) return (
    <div style={{padding:"58px 20px",textAlign:"center"}}>
      <div style={{fontSize:66,marginBottom:12}}>⭐</div>
      <div style={{fontFamily:"Playfair Display,serif",fontSize:22,color:C.text,marginBottom:7}}>No history yet</div>
      <div style={{fontSize:14,color:C.mid,fontFamily:"DM Sans,sans-serif",lineHeight:1.7,maxWidth:280,margin:"0 auto"}}>Rate meals in the Plan tab and they appear here. Yes Chef learns from every rating.</div>
    </div>
  );
  return (
    <div style={{padding:"16px 14px 28px"}}>
      <h2 style={{fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:C.text,margin:"0 0 4px"}}>Meal History</h2>
      <p style={{fontSize:13,color:C.mid,fontFamily:"DM Sans,sans-serif",margin:"0 0 13px"}}>Your dining diary — and how Yes Chef learns from it.</p>
      <div style={{display:"flex",gap:7,marginBottom:13}}>
        {[{l:"Logged",v:history.length,c:C.sage},{l:"Rated",v:rated.length,c:C.coral},{l:"Avg",v:avg?`${avg}★`:"—",c:C.gold}].map(x=>(
          <div key={x.l} style={{flex:1,background:C.card,borderRadius:12,padding:"11px 6px",textAlign:"center",border:`1px solid ${C.bdr}`,boxShadow:"0 1px 6px rgba(22,34,16,.04)"}}>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700,color:x.c}}>{x.v}</div>
            <div style={{fontSize:10,color:C.mid,fontFamily:"DM Sans,sans-serif",marginTop:1}}>{x.l}</div>
          </div>
        ))}
      </div>
      {favs.length>0&&<div style={{background:`${C.gold}18`,border:`1.5px solid ${C.gold}38`,borderRadius:15,padding:13,marginBottom:13}}>
        <div style={{fontSize:13,fontWeight:700,color:C.gold,fontFamily:"DM Sans,sans-serif",marginBottom:9}}>🏆 Payne Family Favourites</div>
        {favs.map((h,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<favs.length-1?`1px solid ${C.bdr}`:"none"}}>
          <span style={{fontSize:24,lineHeight:1,flexShrink:0}}>{h.meal?.emoji||"🍽️"}</span>
          <span style={{flex:1,fontSize:13,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif"}}>{h.meal?.name}</span>
          <Stars v={h.rating} sz={15}/>
        </div>)}
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {[...history].reverse().map((h,i)=>(
          <div key={h.id||i} style={{background:C.card,borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:10,border:`1px solid ${C.bdr}`}}>
            <span style={{fontSize:26,lineHeight:1,flexShrink:0}}>{h.meal?.emoji||"🍽️"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:"DM Sans,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.meal?.name}</div>
              <div style={{fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>{new Date(h.date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}{h.meal?.totalCost?` · £${f2(h.meal.totalCost)}`:""}</div>
            </div>
            {h.rating>0?<Stars v={h.rating} sz={16}/>:<span style={{fontSize:11,color:C.mid,fontFamily:"DM Sans,sans-serif"}}>Unrated</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function YesChef() {
  const [tab,      setTab]      = useState("plan");
  const [fam,      setFam]      = useState(DEFAULT_FAM);
  const [plan,     setPlan]     = useState({});
  const [pantry,   setPantry]   = useState([]);
  const [history,  setHistory]  = useState([]);
  const [proposed, setProposed] = useState({});
  const [wkOff,    setWkOff]    = useState(new Date().getDay()===0?1:0);
  const [ready,    setReady]    = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const f  = store.get("yc:fam");
    const pl = store.get("yc:plan");
    const pa = store.get("yc:pantry");
    const hi = store.get("yc:history");
    if (f)  setFam(f);
    if (pl) setPlan(pl);
    if (pa) setPantry(pa);
    if (hi) setHistory(hi);
    setReady(true);
  }, []);

  // Persist on change
  useEffect(() => { if (ready) store.set("yc:fam",     fam);     }, [fam,     ready]);
  useEffect(() => { if (ready) store.set("yc:plan",    plan);    }, [plan,    ready]);
  useEffect(() => { if (ready) store.set("yc:pantry",  pantry);  }, [pantry,  ready]);
  useEffect(() => { if (ready) store.set("yc:history", history); }, [history, ready]);

  const onRated = useCallback((dk_, meal, rating) => {
    setHistory(h => {
      const idx = h.findIndex(x => x.meal?.name===meal?.name && dk(new Date(x.date))===dk_);
      if (idx>=0) { const n=[...h]; n[idx]={...n[idx],rating}; return n; }
      return [...h, {id:Date.now().toString(), meal, date:dk_, rating}];
    });
  }, []);

  const shopCount = useMemo(() => Object.values(buildList(plan,pantry)).flat().length, [plan,pantry]);
  const sn = season(); const se = SEA_ICO[sn]||"🌿";

  const NAV = [
    {id:"plan",    icon:"📅", label:"Plan"},
    {id:"pantry",  icon:"🥫", label:"Pantry"},
    {id:"shop",    icon:"🛒", label:"Shop",   badge:shopCount},
    {id:"family",  icon:"👨‍👩‍👧", label:"Family"},
    {id:"history", icon:"⭐", label:"History"},
  ];

  return (
    <div style={{maxWidth:540,margin:"0 auto",background:C.bg,minHeight:"100vh",fontFamily:"DM Sans,sans-serif",position:"relative"}}>
      <div style={{background:`linear-gradient(155deg,${C.deep} 0%,${C.forest} 100%)`,padding:"15px 19px 13px",position:"sticky",top:0,zIndex:200,boxShadow:"0 4px 22px rgba(22,34,16,.32)"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:9,fontWeight:600,color:C.goldLt,letterSpacing:3,textTransform:"uppercase",marginBottom:2,fontFamily:"DM Sans,sans-serif"}}>Payne&apos;s</div>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:26,fontWeight:900,color:"white",lineHeight:1,letterSpacing:-.3}}>Yes Chef 👨‍🍳</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.5)",fontFamily:"DM Sans,sans-serif",marginTop:3,display:"flex",gap:5,alignItems:"center"}}>
              <span>{se} {sn}</span><span style={{opacity:.4}}>·</span><span>{monName()}</span><span style={{opacity:.4}}>·</span><span>Family of {fam.length}</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:8,color:"rgba(255,255,255,.4)",letterSpacing:1,textTransform:"uppercase",marginBottom:2,fontFamily:"DM Sans,sans-serif"}}>Weekly budget</div>
            <div style={{fontFamily:"Playfair Display,serif",fontSize:17,fontWeight:700,color:C.goldLt}}>£100 – £150</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:"DM Sans,sans-serif"}}>Sainsbury&apos;s & Lidl</div>
          </div>
        </div>
      </div>

      <div style={{paddingBottom:76}}>
        {tab==="plan"    && <PlanView    fam={fam} plan={plan} setPlan={setPlan} history={history} pantry={pantry} proposed={proposed} setProposed={setProposed} wkOff={wkOff} setWkOff={setWkOff} onRated={onRated}/>}
        {tab==="pantry"  && <PantryView  pantry={pantry} setPantry={setPantry}/>}
        {tab==="shop"    && <ShopView    plan={plan} pantry={pantry}/>}
        {tab==="family"  && <FamilyView  fam={fam} setFam={setFam}/>}
        {tab==="history" && <HistoryView history={history}/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:540,background:"white",borderTop:`1.5px solid ${C.bdr}`,display:"flex",padding:"6px 0 13px",zIndex:300,boxShadow:"0 -5px 24px rgba(22,34,16,.09)"}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} className="press" style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"3px 0"}}>
            <div style={{position:"relative",lineHeight:1}}>
              <span style={{fontSize:23,display:"block",transition:"transform .2s",transform:tab===n.id?"scale(1.22)":"scale(1)",filter:tab===n.id?"none":"opacity(.5) grayscale(.4)"}}>{n.icon}</span>
              {n.badge>0&&<span style={{position:"absolute",top:-5,right:-8,background:C.coral,color:"white",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"DM Sans,sans-serif"}}>{n.badge>9?"9+":n.badge}</span>}
            </div>
            <span style={{fontSize:10,fontWeight:tab===n.id?700:400,color:tab===n.id?C.coral:C.mid,fontFamily:"DM Sans,sans-serif",transition:"color .2s"}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
