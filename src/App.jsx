import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cloudSave, cloudLoad, cloudSubscribe } from "./firebase.js";

const INCOME_CATS  = ["薪資","獎金","投資收益","副業","其他收入"];
const EXPENSE_CATS = ["飲食","交通","住房","醫療","娛樂","服飾","教育","旅遊","保險","其他支出"];
const ASSET_TYPES  = ["現金","銀行存款","股票/基金","房地產","車輛","其他資產"];
const LIAB_TYPES   = ["房貸","車貸","信用卡","學貸","其他負債"];
const COLORS = ["#e8a0bf","#c084a8","#f0c4d4","#a78bca","#88b4e0","#79c7a8","#f4b98a","#e07b7b","#b8d4a8","#d4a0c8"];

const today = () => new Date().toISOString().slice(0,10);
const fmt   = n  => Number(n).toLocaleString("zh-TW");

// Always safe — ensures arrays exist even if Firebase returns partial data
const safeData = (d) => ({
  transactions: [],
  assets: [],
  liabilities: [],
  updatedAt: 0,
  ...(d || {})
});

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}
function lsGet(k) { try { return localStorage.getItem(k)||""; } catch { return ""; } }
function lsSet(k,v){ try { localStorage.setItem(k,v); } catch {} }

export default function App() {
  const [roomCode,     setRoomCode]     = useState(() => lsGet("cfin_room"));
  const [codeInput,    setCodeInput]    = useState("");
  const [syncMsg,      setSyncMsg]      = useState("");
  const [syncStatus,   setSyncStatus]   = useState("idle");
  const [lastSync,     setLastSync]     = useState(null);
  const [showSync,     setShowSync]     = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [data,         setDataRaw]      = useState(safeData());
  const skipNext = useRef(false);
  const unsubRef = useRef(null);

  const [tab,      setTab]      = useState("records");
  const [person,   setPerson]   = useState(0);
  const [filterM,  setFilterM]  = useState(today().slice(0,7));
  const [showForm, setShowForm] = useState(false);
  const [showAF,   setShowAF]   = useState(false);
  const [showLF,   setShowLF]   = useState(false);
  const [editAId,  setEditAId]  = useState(null);
  const [editLId,  setEditLId]  = useState(null);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState({ type:"expense", person:1, date:today(), category:"飲食", amount:"", note:"" });
  const [aForm,    setAForm]    = useState({ person:1, name:"", category:"銀行存款", amount:"" });
  const [lForm,    setLForm]    = useState({ person:1, name:"", category:"信用卡",   amount:"" });

  function subscribe(code) {
    if (unsubRef.current) { try { unsubRef.current(); } catch {} }
    unsubRef.current = cloudSubscribe(code, (d) => {
      if (skipNext.current) { skipNext.current = false; return; }
      setDataRaw(safeData(d));
      setLastSync(new Date((d||{}).updatedAt || Date.now()));
    });
  }

  useEffect(() => {
    async function init() {
      if (!roomCode) { setInitializing(false); setShowSync(true); return; }
      try {
        const d = await cloudLoad(roomCode);
        if (d) { setDataRaw(safeData(d)); setLastSync(new Date(d.updatedAt)); }
        subscribe(roomCode);
      } catch(e) { console.error(e); }
      setInitializing(false);
    }
    init();
    return () => { if (unsubRef.current) try { unsubRef.current(); } catch {} };
  }, []);

  const setData = useCallback((updater) => {
    setDataRaw(prev => {
      const next = safeData(typeof updater === "function" ? updater(prev) : updater);
      if (roomCode) {
        setSyncStatus("saving");
        skipNext.current = true;
        cloudSave(roomCode, next).then(saved => {
          setLastSync(new Date(saved.updatedAt));
          setSyncStatus("saved");
          setTimeout(() => setSyncStatus("idle"), 2000);
        }).catch(() => { setSyncStatus("error"); skipNext.current = false; });
      }
      return next;
    });
  }, [roomCode]);

  async function createRoom() {
    const code = genCode();
    lsSet("cfin_room", code);
    setRoomCode(code);
    setSyncStatus("saving");
    try {
      const empty = safeData();
      const saved = await cloudSave(code, empty);
      setDataRaw(safeData(empty));
      setLastSync(new Date(saved.updatedAt));
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus("idle"), 2000);
      setSyncMsg(`✅ 房間碼 ${code} 建立成功！把這組碼分享給另一半 💕`);
      subscribe(code);
    } catch(e) { setSyncStatus("error"); setSyncMsg("⚠️ 建立失敗，請重試: "+e.message); }
  }

  async function joinRoom() {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) { setSyncMsg("⚠️ 請輸入正確房間碼"); return; }
    setSyncMsg("🔍 查詢中…");
    try {
      const d = await cloudLoad(code);
      if (!d) { setSyncMsg("⚠️ 找不到此房間，請確認碼是否正確"); return; }
      lsSet("cfin_room", code);
      setRoomCode(code);
      setDataRaw(safeData(d));
      setLastSync(new Date(d.updatedAt));
      subscribe(code);
      setSyncMsg(`✅ 成功加入房間 ${code} 💕`);
      setShowSync(false);
    } catch(e) { setSyncMsg("⚠️ 錯誤: "+e.message); }
  }

  // Derived — all safe because safeData guarantees arrays
  const filteredTx = useMemo(() =>
    data.transactions.filter(t=>(person===0||t.person===person)&&t.date.startsWith(filterM))
      .sort((a,b)=>b.date.localeCompare(a.date)),
    [data.transactions,person,filterM]);

  const income  = filteredTx.filter(t=>t.type==="income" ).reduce((s,t)=>s+Number(t.amount),0);
  const expense = filteredTx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);

  const expByCat = useMemo(()=>{
    const m={};
    filteredTx.filter(t=>t.type==="expense").forEach(t=>{m[t.category]=(m[t.category]||0)+Number(t.amount);});
    return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  },[filteredTx]);

  const monthlyBar = useMemo(()=>{
    const src=person===0?data.transactions:data.transactions.filter(t=>t.person===person);
    const m={};
    src.forEach(t=>{const k=t.date.slice(0,7);if(!m[k])m[k]={month:k,收入:0,支出:0};m[k][t.type==="income"?"收入":"支出"]+=Number(t.amount);});
    return Object.values(m).sort((a,b)=>a.month.localeCompare(b.month)).slice(-6);
  },[data.transactions,person]);

  const fAssets=person===0?data.assets:data.assets.filter(a=>a.person===person);
  const fLiabs =person===0?data.liabilities:data.liabilities.filter(a=>a.person===person);
  const totA=fAssets.reduce((s,a)=>s+Number(a.amount),0);
  const totL=fLiabs .reduce((s,a)=>s+Number(a.amount),0);
  const net=totA-totL;

  function submitTx(){
    if(!form.amount||isNaN(form.amount)||Number(form.amount)<=0)return;
    if(editId!==null){setData(d=>({...d,transactions:d.transactions.map(t=>t.id===editId?{...form,id:editId}:t)}));setEditId(null);}
    else setData(d=>({...d,transactions:[...d.transactions,{...form,id:Date.now()}]}));
    setForm({type:"expense",person:1,date:today(),category:"飲食",amount:"",note:""});setShowForm(false);
  }
  const startEdit=tx=>{setForm({...tx});setEditId(tx.id);setShowForm(true);};
  const delTx   =id=>setData(d=>({...d,transactions:d.transactions.filter(t=>t.id!==id)}));
  function submitAsset(){
    if(!aForm.amount||isNaN(aForm.amount))return;
    if(editAId!==null){setData(d=>({...d,assets:d.assets.map(a=>a.id===editAId?{...aForm,id:editAId}:a)}));setEditAId(null);}
    else setData(d=>({...d,assets:[...d.assets,{...aForm,id:Date.now()}]}));
    setAForm({person:1,name:"",category:"銀行存款",amount:""});setShowAF(false);
  }
  function submitLiab(){
    if(!lForm.amount||isNaN(lForm.amount))return;
    if(editLId!==null){setData(d=>({...d,liabilities:d.liabilities.map(a=>a.id===editLId?{...lForm,id:editLId}:a)}));setEditLId(null);}
    else setData(d=>({...d,liabilities:[...d.liabilities,{...lForm,id:Date.now()}]}));
    setLForm({person:1,name:"",category:"信用卡",amount:""});setShowLF(false);
  }
  const delAsset=id=>setData(d=>({...d,assets:d.assets.filter(a=>a.id!==id)}));
  const delLiab =id=>setData(d=>({...d,liabilities:d.liabilities.filter(a=>a.id!==id)}));
  const pLabel  =p=>p===1?"👨 他":"👩 她";

  const syncColor=syncStatus==="saving"?"#f4b98a":syncStatus==="saved"?"#6abf8a":syncStatus==="error"?"#e07b8a":"rgba(255,255,255,.65)";
  const syncIcon =syncStatus==="saving"?"⏳":syncStatus==="saved"?"✅":syncStatus==="error"?"⚠️":"☁️";

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Playfair+Display:ital@0;1&display=swap');
    :root{--pk:#e8779a;--pk2:#f2a7bf;--pk3:#fce4ec;--pk4:#fff5f8;--rose:#d45f85;--mauve:#9c6b8a;--cream:#fff8fb;--text:#4a2d3a;--sub:#9e7a8a;--border:#f0d0de;--green:#6abf8a;--red:#e07b8a;--blue:#7aabdc;}
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body,#root{height:100%;}
    body{background:var(--cream);font-family:'Noto Sans TC',sans-serif;color:var(--text);-webkit-tap-highlight-color:transparent;}
    input,select,button{font-family:inherit;}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--pk4)}::-webkit-scrollbar-thumb{background:var(--pk2);border-radius:3px}
    .card{background:#fff;border-radius:20px;box-shadow:0 2px 20px rgba(220,100,140,.08);padding:20px;margin-bottom:14px;}
    .inp{width:100%;border:1.5px solid var(--border);border-radius:12px;padding:10px 14px;font-size:15px;background:var(--pk4);color:var(--text);outline:none;transition:border .2s;}
    .inp:focus{border-color:var(--pk);}
    .btnP{cursor:pointer;border:none;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:600;background:linear-gradient(135deg,var(--pk),var(--rose));color:#fff;box-shadow:0 3px 12px rgba(220,100,140,.28);transition:all .2s;}
    .btnP:active{transform:scale(.97);}
    .btnG{cursor:pointer;border:1.5px solid var(--border);border-radius:12px;padding:10px 20px;font-size:14px;font-weight:600;background:#fff;color:var(--sub);transition:all .2s;}
    .tab{padding:9px 18px;border-radius:20px;border:none;font-size:13px;font-weight:600;background:transparent;color:var(--sub);transition:all .2s;cursor:pointer;}
    .tab.on{background:linear-gradient(135deg,var(--pk),var(--rose));color:#fff;box-shadow:0 3px 10px rgba(220,100,140,.25);}
    .pbtn{padding:7px 16px;border-radius:20px;border:1.5px solid var(--border);font-size:13px;background:transparent;color:var(--sub);cursor:pointer;transition:all .2s;}
    .pbtn.on{background:var(--pk3);border-color:var(--pk);color:var(--rose);font-weight:700;}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;background:var(--pk3);color:var(--mauve);}
    .inc{color:var(--green);font-weight:700;}.exp{color:var(--red);font-weight:700;}
    .xbtn{background:none;border:none;color:#ddd;font-size:15px;padding:3px 6px;border-radius:6px;cursor:pointer;}
    .xbtn:hover{color:var(--red);}
    .ebtn{background:none;border:none;color:#ddd;font-size:13px;padding:3px 6px;cursor:pointer;}
    .ebtn:hover{color:var(--pk);}
    .overlay{position:fixed;inset:0;background:rgba(74,45,58,.42);display:flex;align-items:flex-end;justify-content:center;z-index:100;backdrop-filter:blur(5px);}
    .modal{background:#fff;border-radius:24px 24px 0 0;padding:28px 22px 40px;width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(220,100,140,.2);max-height:92vh;overflow-y:auto;}
    .seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
    .sb{padding:10px;border-radius:12px;border:2px solid var(--border);background:#fff;color:var(--sub);font-weight:600;font-size:14px;cursor:pointer;transition:all .2s;}
    .sb.si{border-color:var(--green);background:#edfaf3;color:var(--green);}
    .sb.se{border-color:var(--red);background:#fdf0f0;color:var(--red);}
    .sb.sp{border-color:var(--pk);background:var(--pk3);color:var(--rose);}
    .petal{position:fixed;border-radius:50%;opacity:.12;pointer-events:none;z-index:0;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spinning{animation:spin .8s linear infinite;display:inline-block;}
    .code-box{background:var(--pk3);border-radius:16px;padding:18px;text-align:center;border:1.5px dashed var(--pk2);margin-bottom:16px;}
    .code-big{font-size:32px;font-weight:700;letter-spacing:8px;color:var(--rose);font-family:monospace;}
    .info-box{background:#f8f8f8;border-radius:12px;padding:12px 14px;font-size:13px;color:var(--sub);line-height:1.8;margin-bottom:16px;}
  `;

  if (initializing) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f2789f,#e85c8a)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <style>{CSS}</style>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontStyle:"italic",color:"#fff"}}>💕 夫妻記帳本</div>
      <div style={{color:"rgba(255,255,255,.8)",fontSize:14}}>正在連線 Firebase…</div>
      <div style={{width:36,height:36,border:"3px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%"}} className="spinning"/>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--cream)",position:"relative"}}>
      <style>{CSS}</style>
      <div className="petal" style={{width:300,height:300,background:"var(--pk2)",top:-100,right:-80}}/>
      <div className="petal" style={{width:220,height:220,background:"var(--pk)",bottom:80,left:-80}}/>

      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#f2789f 0%,#e85c8a 55%,#c94d7a 100%)",padding:"max(env(safe-area-inset-top,0px),28px) 20px 22px",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontStyle:"italic",color:"#fff",letterSpacing:1}}>💕 夫妻記帳本</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.78)",marginTop:3,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{color:syncColor}}>{syncIcon}</span>
          <span>{roomCode?`房間 ${roomCode}`:"未連線"}</span>
          {lastSync&&<span style={{opacity:.7}}>· {lastSync.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})} 同步</span>}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {["💑 合併","👨 他","👩 她"].map((l,i)=>(
            <button key={i} className={`pbtn${person===i?" on":""}`}
              style={{background:person===i?"rgba(255,255,255,.92)":"rgba(255,255,255,.2)",borderColor:"rgba(255,255,255,.5)",color:person===i?"var(--rose)":"#fff"}}
              onClick={()=>setPerson(i)}>{l}</button>
          ))}
          <button className="pbtn" style={{background:"rgba(255,255,255,.2)",borderColor:"rgba(255,255,255,.5)",color:"#fff"}} onClick={()=>{setSyncMsg("");setShowSync(true);}}>☁️ 同步</button>
        </div>
      </div>

      {/* SUMMARY */}
      <div style={{padding:"14px 14px 0",position:"relative",zIndex:1}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["收入",income,"var(--green)"],["支出",expense,"var(--red)"],["結餘",income-expense,income-expense>=0?"var(--blue)":"var(--red)"]].map(([l,v,c])=>(
            <div key={l} className="card" style={{textAlign:"center",padding:"14px 6px"}}>
              <div style={{fontSize:11,color:"var(--sub)",marginBottom:4}}>{filterM} {l}</div>
              <div style={{fontSize:15,fontWeight:700,color:c}}>{v<0?"-":""}${fmt(Math.abs(v))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:6,padding:"10px 14px 14px",justifyContent:"center",position:"relative",zIndex:1}}>
        {[["records","📋 記帳"],["chart","📊 統計"],["balance","🏦 資產"]].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{position:"relative",zIndex:1}}>
        {/* RECORDS */}
        {tab==="records"&&(
          <div style={{padding:"0 14px 100px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <input type="month" value={filterM} onChange={e=>setFilterM(e.target.value)} className="inp" style={{width:"auto",fontSize:13}}/>
              <button className="btnP" style={{fontSize:13,padding:"8px 16px"}} onClick={()=>{setEditId(null);setShowForm(true);}}>+ 新增</button>
            </div>
            {filteredTx.length===0&&<div className="card" style={{textAlign:"center",color:"#ccc",padding:40}}><div style={{fontSize:36,marginBottom:10}}>🌸</div>尚無記錄，點「新增」開始記帳</div>}
            {filteredTx.map(tx=>(
              <div key={tx.id} className="card" style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span className="tag">{tx.category}</span>
                    <span style={{fontSize:11,color:"var(--sub)"}}>{pLabel(tx.person)}</span>
                    {tx.note&&<span style={{fontSize:11,color:"#bbb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90}}>{tx.note}</span>}
                  </div>
                  <div style={{fontSize:11,color:"#ccc",marginTop:3}}>{tx.date}</div>
                </div>
                <div className={tx.type==="income"?"inc":"exp"} style={{fontSize:15,whiteSpace:"nowrap"}}>{tx.type==="income"?"+":"-"}${fmt(tx.amount)}</div>
                <button className="ebtn" onClick={()=>startEdit(tx)}>✏️</button>
                <button className="xbtn" onClick={()=>delTx(tx.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* CHART */}
        {tab==="chart"&&(
          <div style={{padding:"0 14px 100px"}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
              <input type="month" value={filterM} onChange={e=>setFilterM(e.target.value)} className="inp" style={{width:"auto",fontSize:13}}/>
            </div>
            <div className="card">
              <div style={{fontWeight:700,marginBottom:14,fontSize:15}}>本月支出分類 🌸</div>
              {expByCat.length===0?<div style={{textAlign:"center",color:"#ccc",padding:30}}>無支出資料</div>:(
                <>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={expByCat} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {expByCat.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={v=>`$${fmt(v)}`}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                    {expByCat.map((e,i)=>(
                      <div key={e.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}>
                        <div style={{width:9,height:9,borderRadius:"50%",background:COLORS[i%COLORS.length]}}/>
                        {e.name}<span style={{color:"#bbb",marginLeft:4}}>${fmt(e.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="card">
              <div style={{fontWeight:700,marginBottom:14,fontSize:15}}>近6個月收支趨勢 📊</div>
              {monthlyBar.length===0?<div style={{textAlign:"center",color:"#ccc",padding:30}}>無資料</div>:(
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={monthlyBar} barGap={3}>
                    <XAxis dataKey="month" tick={{fontSize:11}} tickFormatter={m=>m.slice(5)}/>
                    <YAxis tick={{fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}K`}/>
                    <Tooltip formatter={v=>`$${fmt(v)}`}/>
                    <Legend/>
                    <Bar dataKey="收入" fill="#6abf8a" radius={[4,4,0,0]}/>
                    <Bar dataKey="支出" fill="#e8779a" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* BALANCE */}
        {tab==="balance"&&(
          <div style={{padding:"0 14px 100px"}}>
            <div className="card" style={{background:"linear-gradient(135deg,#f2789f,#e85c8a)",color:"#fff",textAlign:"center"}}>
              <div style={{fontSize:13,opacity:.85,marginBottom:6}}>淨資產（資產－負債）</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontStyle:"italic"}}>${fmt(net)}</div>
              <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:10,fontSize:13,opacity:.9}}>
                <span>資產 ${fmt(totA)}</span><span>負債 ${fmt(totL)}</span>
              </div>
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:15}}>💰 資產明細</div>
                <button className="btnP" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>setShowAF(true)}>+ 新增</button>
              </div>
              {fAssets.length===0&&<div style={{color:"#ccc",textAlign:"center",padding:"14px 0"}}>尚無資產記錄</div>}
              {fAssets.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"center",borderBottom:"1px solid var(--border)",padding:"10px 0"}}>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{a.name||a.category}</div><div style={{fontSize:12,color:"var(--sub)"}}><span className="tag" style={{marginRight:6}}>{a.category}</span>{pLabel(a.person)}</div></div>
                  <div className="inc" style={{fontSize:14}}>${fmt(a.amount)}</div>
                  <button className="ebtn" style={{marginLeft:8}} onClick={()=>{setAForm({...a});setEditAId(a.id);setShowAF(true);}}>✏️</button>
                  <button className="xbtn" onClick={()=>delAsset(a.id)}>✕</button>
                </div>
              ))}
              {fAssets.length>0&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:10,fontWeight:700,color:"var(--green)"}}>合計: ${fmt(totA)}</div>}
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:15}}>📋 負債明細</div>
                <button className="btnP" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>setShowLF(true)}>+ 新增</button>
              </div>
              {fLiabs.length===0&&<div style={{color:"#ccc",textAlign:"center",padding:"14px 0"}}>尚無負債記錄</div>}
              {fLiabs.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"center",borderBottom:"1px solid var(--border)",padding:"10px 0"}}>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{a.name||a.category}</div><div style={{fontSize:12,color:"var(--sub)"}}><span className="tag" style={{marginRight:6}}>{a.category}</span>{pLabel(a.person)}</div></div>
                  <div className="exp" style={{fontSize:14}}>-${fmt(a.amount)}</div>
                  <button className="ebtn" style={{marginLeft:8}} onClick={()=>{setLForm({...a});setEditLId(a.id);setShowLF(true);}}>✏️</button>
                  <button className="xbtn" onClick={()=>delLiab(a.id)}>✕</button>
                </div>
              ))}
              {fLiabs.length>0&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:10,fontWeight:700,color:"var(--red)"}}>合計: ${fmt(totL)}</div>}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 收支 */}
      {showForm&&(
        <div className="overlay" onClick={()=>{setShowForm(false);setEditId(null);}}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#eee",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontSize:20,marginBottom:20,color:"var(--rose)"}}>{editId?"編輯記錄 ✏️":"新增收支 🌸"}</div>
            <div className="seg">
              {[["expense","支出","se"],["income","收入","si"]].map(([v,l,cls])=>(
                <button key={v} className={`sb${form.type===v?" "+cls:""}`} onClick={()=>setForm(f=>({...f,type:v,category:v==="income"?"薪資":"飲食"}))}>{l}</button>
              ))}
            </div>
            <div className="seg">
              {[[1,"👨 他"],[2,"👩 她"]].map(([v,l])=>(
                <button key={v} className={`sb${form.person===v?" sp":""}`} onClick={()=>setForm(f=>({...f,person:v}))}>{l}</button>
              ))}
            </div>
            <div style={{marginBottom:10}}><select className="inp" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{(form.type==="income"?INCOME_CATS:EXPENSE_CATS).map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{marginBottom:10}}><input className="inp" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div style={{marginBottom:10}}><input className="inp" type="number" placeholder="金額（元）" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div>
            <div style={{marginBottom:20}}><input className="inp" placeholder="備註（選填）" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
            <div className="seg">
              <button className="btnG" onClick={()=>{setShowForm(false);setEditId(null);}}>取消</button>
              <button className="btnP" onClick={submitTx}>{editId?"儲存":"新增"}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 資產 */}
      {showAF&&(
        <div className="overlay" onClick={()=>setShowAF(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#eee",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontSize:20,marginBottom:20,color:"var(--rose)"}}>{editAId?"編輯資產 ✏️":"新增資產 💰"}</div>
            <div className="seg">{[[1,"👨 他"],[2,"👩 她"]].map(([v,l])=><button key={v} className={`sb${aForm.person===v?" sp":""}`} onClick={()=>setAForm(f=>({...f,person:v}))}>{l}</button>)}</div>
            <div style={{marginBottom:10}}><select className="inp" value={aForm.category} onChange={e=>setAForm(f=>({...f,category:e.target.value}))}>{ASSET_TYPES.map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{marginBottom:10}}><input className="inp" placeholder="名稱（如：台新帳戶）" value={aForm.name} onChange={e=>setAForm(f=>({...f,name:e.target.value}))}/></div>
            <div style={{marginBottom:20}}><input className="inp" type="number" placeholder="金額（元）" value={aForm.amount} onChange={e=>setAForm(f=>({...f,amount:e.target.value}))}/></div>
            <div className="seg"><button className="btnG" onClick={()=>{setShowAF(false);setEditAId(null);}}>取消</button><button className="btnP" onClick={submitAsset}>{editAId?"儲存":"新增"}</button></div>
          </div>
        </div>
      )}

      {/* MODAL 負債 */}
      {showLF&&(
        <div className="overlay" onClick={()=>setShowLF(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#eee",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontSize:20,marginBottom:20,color:"var(--rose)"}}>{editLId?"編輯負債 ✏️":"新增負債 📋"}</div>
            <div className="seg">{[[1,"👨 他"],[2,"👩 她"]].map(([v,l])=><button key={v} className={`sb${lForm.person===v?" sp":""}`} onClick={()=>setLForm(f=>({...f,person:v}))}>{l}</button>)}</div>
            <div style={{marginBottom:10}}><select className="inp" value={lForm.category} onChange={e=>setLForm(f=>({...f,category:e.target.value}))}>{LIAB_TYPES.map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{marginBottom:10}}><input className="inp" placeholder="名稱（如：房貸）" value={lForm.name} onChange={e=>setLForm(f=>({...f,name:e.target.value}))}/></div>
            <div style={{marginBottom:20}}><input className="inp" type="number" placeholder="金額（元）" value={lForm.amount} onChange={e=>setLForm(f=>({...f,amount:e.target.value}))}/></div>
            <div className="seg"><button className="btnG" onClick={()=>{setShowLF(false);setEditLId(null);}}>取消</button><button className="btnP" onClick={submitLiab}>{editLId?"儲存":"新增"}</button></div>
          </div>
        </div>
      )}

      {/* MODAL 同步 */}
      {showSync&&(
        <div className="overlay" onClick={()=>roomCode&&setShowSync(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#eee",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",fontSize:22,marginBottom:8,color:"var(--rose)"}}>☁️ 雲端同步</div>
            <div className="info-box">資料即時儲存在 Firebase，兩支手機輸入相同房間碼就能同步 💕<br/>資料永久保存，跟 Claude 對話無關。</div>
            {roomCode&&(
              <div className="code-box">
                <div style={{fontSize:12,color:"var(--sub)",marginBottom:6}}>目前房間碼（分享給另一半）</div>
                <div className="code-big">{roomCode}</div>
                <div style={{fontSize:12,color:"var(--sub)",marginTop:8}}>另一半開啟 App → 點「☁️ 同步」→ 輸入此碼 → 加入</div>
              </div>
            )}
            <button className="btnP" style={{width:"100%",marginBottom:10}} onClick={createRoom}>{roomCode?"🔄 建立新房間":"✨ 建立新房間"}</button>
            <div style={{fontSize:12,color:"var(--sub)",marginBottom:8,textAlign:"center"}}>— 或輸入另一半的房間碼 —</div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <input className="inp" placeholder="輸入6位房間碼" value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())} style={{letterSpacing:4,fontFamily:"monospace",fontSize:17,textAlign:"center"}} maxLength={6}/>
              <button className="btnP" style={{whiteSpace:"nowrap",minWidth:64}} onClick={joinRoom}>加入</button>
            </div>
            {syncMsg&&(
              <div style={{background:syncMsg.startsWith("✅")?"#edfaf3":syncMsg.includes("查詢")?"#fffbe6":"#fdf0f0",color:syncMsg.startsWith("✅")?"var(--green)":syncMsg.includes("查詢")?"#b8860b":"var(--red)",borderRadius:12,padding:"10px 14px",fontSize:13,marginBottom:14,textAlign:"center"}}>{syncMsg}</div>
            )}
            {roomCode&&<button className="btnG" style={{width:"100%"}} onClick={()=>setShowSync(false)}>關閉</button>}
          </div>
        </div>
      )}
    </div>
  );
}
