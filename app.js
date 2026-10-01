/* PARK/LOG — บันทึกเวลาเข้า-ออกลานจอด และคำนวณค่าบริการ (vanilla JS + Supabase) */
(() => {
'use strict';
const $app = document.getElementById('app');
const cfg = window.PARKLOG_CONFIG || {};
if (!window.supabase || !cfg.supabaseUrl || /YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey)) {
  $app.innerHTML = `<div class="setup stack"><h2>ยังไม่ได้ตั้งค่า</h2><p>เปิดไฟล์ <b>config.js</b> แล้วใส่ Supabase URL และ anon key ตามขั้นตอนใน DEPLOY.md</p></div>`;
  return;
}
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { db: { schema: 'parklog' } });

/* ---------- helpers ---------- */
const TH_M=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_MS=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_D=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const TH_DF=['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์'];
const pad=n=>String(n).padStart(2,'0');
const dkey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const mkOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const mkShift=(mk,n)=>{const[y,m]=mk.split('-').map(Number);return mkOf(new Date(y,m-1+n,1))};
const mkLabel=mk=>{const[y,m]=mk.split('-').map(Number);return `${TH_M[m-1]} ${y+543}`};
const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};
const at=(k,h,m)=>{const[Y,M,D]=k.split('-').map(Number);return new Date(Y,M-1,D,h,m).getTime()};
const parseHM=(k,t)=>{const[h,m]=t.split(':').map(Number);return at(k,h,m)};
const money=n=>Number(n).toLocaleString('th-TH');
const durTxt=min=>{min=Math.max(0,Math.floor(min));return min<60?`${min} นาที`:`${Math.floor(min/60)} ชม. ${pad(min%60)} น.`};
const dayLbl=k=>{const d=new Date(at(k,0,0));return `${TH_D[d.getDay()]} ${d.getDate()} ${TH_MS[d.getMonth()]}`};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}};

const ic=(p,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const P={
  in:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  list:'<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  chart:'<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  car:'<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pen:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/>',
  copy:'<rect width="14" height="14" x="8" y="8"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  lock:'<rect width="18" height="11" x="3" y="11"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  book:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  logo:'<rect x="3" y="3" width="18" height="18"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>'
};
const C='<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';

/* ---------- fee rules (หลักเกณฑ์ข้อ ๗) ---------- */
function sessCalc(s,now,mode){
  const out=s.out??now, durMin=(out-s.in)/60000;
  const cut=new Date(s.in);cut.setHours(16,30,0,0);
  let chg=Math.max(0,(Math.min(out,cut.getTime())-s.in)/60000);
  if(durMin<=15) return {durMin,chg:0,hours:0};
  if(mode==='deduct') chg=Math.max(0,chg-15);
  return {durMin,chg,hours:Math.ceil(chg/60-1e-9)};
}
function dayCalc(list,vehicles,now,mode){
  const byV={};list.forEach(s=>(byV[s.v]=byV[s.v]||[]).push(s));
  let fee=0,raw=0,durMin=0,capped=false;
  Object.keys(byV).forEach(v=>{
    const type=(vehicles.find(x=>x.id===v)||{}).type||'car';
    const cs=byV[v].map(s=>sessCalc(s,now,mode));
    cs.forEach(c=>durMin+=c.durMin);
    if(type==='moto'){const f=cs.some(c=>c.chg>0)?20:0;fee+=f;raw+=f;}
    else{const r=cs.reduce((a,c)=>a+c.hours*10,0);raw+=r;if(r>80)capped=true;fee+=Math.min(80,r);}
  });
  return {fee,raw,capped,durMin};
}

/* ---------- state ---------- */
const now0=new Date();
const S={
  loading:true,user:null,profile:null,vehicles:[],sessions:[],statements:{},
  tab:'home',sheet:null,form:{},vform:{},toast:null,busy:false,authError:LS.get('parklog-auth-error'),
  logMonth:mkOf(now0),checkMonth:mkShift(mkOf(now0),-1),statsMode:'month',statsMonth:mkOf(now0),statsYear:now0.getFullYear(),
  active:LS.get('parklog-active'),theme:LS.get('parklog-theme')||'auto',now:Date.now()
};
LS.set('parklog-auth-error',null);
const mapRow=r=>({id:r.id,v:r.vehicle_id,date:r.park_date,in:Date.parse(r.time_in),out:r.time_out?Date.parse(r.time_out):null,src:r.source,edited:!!r.edited_at,note:r.note||''});
const mode=()=>S.profile?.free_rule==='deduct'?'deduct':'whole';
const veh=id=>S.vehicles.find(v=>v.id===id)||S.vehicles[0]||null;
const mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
const themeMode=()=>S.theme==='auto'?(mq&&mq.matches?'dark':'light'):S.theme;
mq&&mq.addEventListener&&mq.addEventListener('change',()=>render());

let toastT;
function toast(msg){clearTimeout(toastT);S.toast=msg;render();toastT=setTimeout(()=>{S.toast=null;render()},2800)}
function fail(e,fallback){console.error(e);toast(friendly(e)||fallback||'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')}
function friendly(e){
  const m=(e&&(e.message||e.details))||'';
  if(/one_open_session/.test(m))return 'มีรายการที่กำลังจอดอยู่แล้ว — กด "ออก" ก่อน';
  if(/Max 2 vehicles/.test(m))return 'ลงทะเบียนได้สูงสุด 2 คันต่อประเภท';
  if(/foreign key|violates.*vehicle/i.test(m))return 'มีประวัติการจอดของรถคันนี้ จึงลบไม่ได้';
  if(/duplicate key.*plate|vehicles_user_id_plate/i.test(m))return 'มีทะเบียนนี้อยู่แล้ว';
  if(/Failed to fetch|NetworkError/i.test(m))return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้';
  if(/Invalid schema|schema must be one of/i.test(m))return 'ยังไม่ได้เพิ่ม schema "parklog" ใน Exposed schemas (ดู DEPLOY.md ขั้นที่ 2)';
  return m;
}

/* ---------- data ---------- */
async function fetchAll(build){
  let out=[],from=0;
  for(;;){const{data,error}=await build().range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000;}
  return out;
}
async function loadAll(silent){
  if(!silent){S.loading=true;render();}
  try{
    const u=S.user;
    const [prof,vs,ss,st]=await Promise.all([
      sb.from('profiles').select('*').eq('id',u.id).maybeSingle(),
      sb.from('vehicles').select('*').order('created_at'),
      fetchAll(()=>sb.from('parking_sessions').select('*').order('time_in')),
      sb.from('statements').select('*')
    ]);
    if(prof.error)throw prof.error;if(vs.error)throw vs.error;if(st.error)throw st.error;
    let profile=prof.data;
    if(!profile){
      const ins=await sb.from('profiles').insert({id:u.id,email:u.email,full_name:u.user_metadata?.full_name||''}).select().single();
      if(ins.error)throw ins.error;profile=ins.data;
    }
    S.profile=profile;S.vehicles=vs.data;S.sessions=ss.map(mapRow);
    S.statements={};st.data.forEach(r=>S.statements[r.month.slice(0,7)]=r.office_amount==null?'':String(Number(r.office_amount)));
    if(!S.vehicles.find(v=>v.id===S.active))S.active=S.vehicles[0]?.id||null;
  }catch(e){fail(e,'โหลดข้อมูลไม่สำเร็จ')}
  S.loading=false;render();
}

/* ---------- actions ---------- */
const A={
  async login(){
    const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{prompt:'select_account'}}});
    if(error)fail(error);
  },
  async logout(){await sb.auth.signOut();},
  tab(d){S.tab=d.tab;window.scrollTo(0,0);render()},
  theme(){S.theme=themeMode()==='dark'?'light':'dark';LS.set('parklog-theme',S.theme);render()},
  setTheme(d){S.theme=d.v;LS.set('parklog-theme',d.v==='auto'?null:d.v);render()},
  cycleVehicle(){
    if(!S.vehicles.length)return A.openVehicle();
    const i=S.vehicles.findIndex(v=>v.id===S.active),n=S.vehicles[(i+1)%S.vehicles.length];
    S.active=n.id;LS.set('parklog-active',n.id);toast(`ใช้รถ ${n.plate} (${n.type==='moto'?'จักรยานยนต์':'รถยนต์'})`);
  },
  setActive(d){S.active=d.id;LS.set('parklog-active',d.id);render()},
  async tapIn(){
    if(S.busy)return;if(!S.active)return A.openVehicle();
    S.busy=true;render();
    const{data,error}=await sb.rpc('tap_in',{p_vehicle:S.active});
    S.busy=false;
    if(error)return fail(error);
    S.sessions.push(mapRow(data));if(navigator.vibrate)navigator.vibrate(30);
    toast(`บันทึกเวลาเข้า ${hm(Date.parse(data.time_in))} น.`);
  },
  async tapOut(){
    if(S.busy)return;S.busy=true;render();
    const{data,error}=await sb.rpc('tap_out');
    S.busy=false;
    if(error)return fail(error);
    if(!data||!data.id){await loadAll();return toast('ไม่พบรายการที่กำลังจอด');}
    S.sessions=S.sessions.map(x=>x.id===data.id?mapRow(data):x);if(navigator.vibrate)navigator.vibrate(30);
    toast(`บันทึกเวลาออก ${hm(Date.parse(data.time_out))} น.`);
  },
  openAdd(){S.form={date:dkey(new Date()),tin:'08:00',tout:'17:00',note:''};S.sheet='entry';render()},
  openEdit(d){
    const s=S.sessions.find(x=>String(x.id)===d.id);if(!s)return;
    S.form={id:s.id,date:s.date,tin:hm(s.in),tout:s.out?hm(s.out):'',note:s.note,src:s.src,edited:s.edited};S.sheet='entry';render();
  },
  async saveEntry(){
    const f=S.form;
    if(!f.date||!f.tin){f.err='กรุณากรอกวันที่และเวลาเข้า';return render();}
    const tin=parseHM(f.date,f.tin),tout=f.tout?parseHM(f.date,f.tout):null;
    if(tout&&tout<=tin){f.err='เวลาออกต้องหลังเวลาเข้า';return render();}
    if(!f.id&&!S.active){f.err='กรุณาเพิ่มรถก่อน';return render();}
    const p={park_date:f.date,time_in:new Date(tin).toISOString(),time_out:tout?new Date(tout).toISOString():null,note:f.note||null};
    S.busy=true;render();
    const q=f.id?sb.from('parking_sessions').update(p).eq('id',f.id):sb.from('parking_sessions').insert({...p,vehicle_id:S.active,source:'manual'});
    const{data,error}=await q.select().single();
    S.busy=false;
    if(error){f.err=friendly(error);return render();}
    const row=mapRow(data);
    S.sessions=f.id?S.sessions.map(x=>x.id===row.id?row:x):[...S.sessions,row];
    S.sheet=null;S.logMonth=f.date.slice(0,7);
    toast(f.id?'แก้ไขแล้ว — ระบบเก็บเวลาเดิมไว้เป็นประวัติ':'เพิ่มรายการย้อนหลังแล้ว');
  },
  async delEntry(){
    const id=S.form.id;if(!id||!confirm('ลบรายการนี้?'))return;
    const{error}=await sb.from('parking_sessions').delete().eq('id',id);
    if(error)return fail(error);
    S.sessions=S.sessions.filter(x=>x.id!==id);S.sheet=null;toast('ลบรายการแล้ว');
  },
  openVehicle(){S.vform={type:'car',reg:true,plate:'',province:'',brand:'',color:''};S.sheet='vehicle';render()},
  vType(d){S.vform.type=d.v;S.vform.err=null;render()},
  async saveVehicle(){
    const f=S.vform;
    if(!f.plate.trim()||!f.province.trim()){f.err='กรุณากรอกทะเบียนและจังหวัด';return render();}
    if(S.vehicles.filter(v=>v.type===f.type).length>=2){f.err='ลงทะเบียนได้สูงสุด 2 คันต่อประเภท';return render();}
    S.busy=true;render();
    const{data,error}=await sb.from('vehicles').insert({type:f.type,plate:f.plate.trim(),province:f.province.trim(),brand:f.brand.trim()||null,color:f.color.trim()||null,registered:!!f.reg}).select().single();
    S.busy=false;
    if(error){f.err=friendly(error);return render();}
    S.vehicles.push(data);if(!S.active){S.active=data.id;LS.set('parklog-active',data.id);}
    S.sheet=null;toast('เพิ่มรถแล้ว');
  },
  async delVehicle(d){
    const v=S.vehicles.find(x=>x.id===d.id);if(!v||!confirm(`ลบรถ ${v.plate}?`))return;
    const{error}=await sb.from('vehicles').delete().eq('id',v.id);
    if(error)return fail(error);
    S.vehicles=S.vehicles.filter(x=>x.id!==v.id);if(S.active===v.id)S.active=S.vehicles[0]?.id||null;toast('ลบรถแล้ว');
  },
  async setRule(d){
    const{error}=await sb.from('profiles').update({free_rule:d.v}).eq('id',S.user.id);
    if(error)return fail(error);S.profile.free_rule=d.v;render();
  },
  logPrev(){S.logMonth=mkShift(S.logMonth,-1);render()},logNext(){S.logMonth=mkShift(S.logMonth,1);render()},
  chkPrev(){S.checkMonth=mkShift(S.checkMonth,-1);render()},chkNext(){S.checkMonth=mkShift(S.checkMonth,1);render()},
  stMode(d){S.statsMode=d.v;render()},
  stPrev(){S.statsMode==='month'?S.statsMonth=mkShift(S.statsMonth,-1):S.statsYear--;render()},
  stNext(){S.statsMode==='month'?S.statsMonth=mkShift(S.statsMonth,1):S.statsYear++;render()},
  openEvidence(){S.sheet='evidence';render()},
  copyEvidence(){copy(evidenceText(),'คัดลอกสรุปแล้ว')},
  copyInvite(){copy(location.origin,'คัดลอกลิงก์แล้ว')},
  close(){S.sheet=null;render()}
};
async function saveOffice(val){
  const mk=S.checkMonth;S.statements[mk]=val;render();
  const{error}=await sb.from('statements').upsert({user_id:S.user.id,month:mk+'-01',office_amount:val===''?null:Number(val),updated_at:new Date().toISOString()});
  if(error)fail(error);
}
function copy(text,msg){
  (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast(msg),()=>{
    const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(e){}t.remove();toast(msg);
  });
}

/* ---------- derived ---------- */
function data(){
  const map={};[...S.sessions].sort((a,b)=>a.in-b.in).forEach(x=>(map[x.date]=map[x.date]||[]).push(x));
  const dc=k=>dayCalc(map[k]||[],S.vehicles,S.now,mode());
  const keys=mk=>Object.keys(map).filter(k=>k.startsWith(mk)).sort();
  const total=mk=>keys(mk).reduce((a,k)=>a+dc(k).fee,0);
  return {map,dc,keys,total};
}
function rowHtml(x){
  const c=sessCalc(x,S.now,mode()),moto=veh(x.v)?.type==='moto';
  const t=x.edited?['แก้ไข','tag-outline']:x.src==='manual'?['เพิ่มย้อนหลัง','tag-accent']:['กดปุ่มสด','tag-neutral'];
  const hrs=moto?'จักรยานยนต์':c.durMin<=15?'ฟรี 15 นาที':`คิด ${c.hours} ชม. · ${c.hours*10} ฿`;
  return `<button class="item" data-act="openEdit" data-id="${x.id}">
    <span class="l"><span class="t">${hm(x.in)} – ${x.out?hm(x.out):'กำลังจอด'}</span><span class="s">${durTxt(c.durMin)} · ${hrs}${x.note?' · '+esc(x.note):''}</span></span>
    <span class="r"><span class="tag ${t[1]}">${t[0]}</span>${ic(P.pen,14)}</span></button>`;
}
function evidenceText(){
  const{map,dc,keys}=data(),mk=S.checkMonth,ks=keys(mk),app=ks.reduce((a,k)=>a+dc(k).fee,0);
  const off=S.statements[mk]??'',flagged=S.sessions.filter(x=>x.date.startsWith(mk)&&(x.src==='manual'||x.edited)).length;
  const name=S.user.user_metadata?.full_name||'';
  const L=[`สรุปการใช้ลานจอดรถ เดือน${mkLabel(mk)}`,`ผู้ใช้: ${name} (${S.user.email})`,`ทะเบียน: ${S.vehicles.map(v=>v.plate+' '+v.province).join(', ')}`,'',
    `ยอดจากบันทึก: ${money(app)} บาท (${ks.length} วัน)`];
  if(off!==''){L.push(`ยอดที่หัก: ${money(off)} บาท`,`ส่วนต่าง: ${money(Number(off)-app)} บาท`);}
  L.push('','รายละเอียดรายวัน');
  ks.forEach(k=>L.push(`${dayLbl(k)}  ${map[k].map(x=>hm(x.in)+'-'+(x.out?hm(x.out):'?')).join(', ')}  = ${dc(k).fee} บาท${map[k].some(x=>x.edited||x.src==='manual')?' *':''}`));
  L.push('',`* รายการที่เพิ่ม/แก้ไขย้อนหลัง ${flagged} รายการ`,`คำนวณตามหลักเกณฑ์ข้อ ๗: ฟรี 15 นาทีแรก ชม.ละ 10 บาท สูงสุด 80 บาท/วัน คิดถึง 16:30 น.`);
  return L.join('\n');
}

/* ---------- views ---------- */
function vLogin(){
  return `<div class="login">
    <div class="hero">
      <div class="mark blueprint">${C}${ic(P.logo,34)}</div>
      <h1>PARK/LOG</h1>
      <div class="sub">บันทึกเวลาจอด<br>คำนวณค่าบริการ ตรวจยอดหักเงิน</div>
      <p class="muted" style="margin:0">กดเข้า-กดออก แล้วระบบคำนวณให้ตามหลักเกณฑ์ลานจอดสำนักงาน ข้อมูลของคุณเห็นได้เฉพาะคุณ</p>
    </div>
    <div class="stack" style="gap:10px">
      ${S.authError?`<div class="banner">${ic(P.alert,18)}<span>${esc(S.authError)}</span></div>`:''}
      <button class="btn btn-primary blueprint" data-act="login" style="height:54px;font-size:18px;gap:10px">${C}<span class="g">G</span>เข้าสู่ระบบด้วย Google</button>
      <div class="small muted" style="text-align:center">ใช้บัญชี @gmail.com ของคุณ · <a href="manual.html">คู่มือการใช้งาน</a></div>
    </div></div>`;
}
function vHome(D){
  const nd=new Date(S.now),today=dkey(nd),cm=mkOf(nd),act=veh(S.active);
  const open=S.sessions.find(x=>!x.out),tc=D.dc(today);
  let timer='--:--:--',line='กดปุ่ม "เข้า" เมื่อนำรถผ่านไม้กั้น',since='';
  if(open){
    const el=Math.max(0,Math.floor((S.now-open.in)/1000));timer=`${pad(Math.floor(el/3600))}:${pad(Math.floor(el/60)%60)}:${pad(el%60)}`;
    since=`เข้า ${hm(open.in)} น.`;
    const c=sessCalc(open,S.now,mode()),cut=new Date(open.in);cut.setHours(16,30,0,0);
    if(veh(open.v)?.type==='moto')line='จักรยานยนต์ เหมาจ่าย 20 บาท/วัน';
    else if(tc.raw>=80)line='ถึงเพดาน 80 บาทของวันนี้แล้ว — ไม่คิดเพิ่ม';
    else if(S.now>=cut.getTime())line='หลัง 16:30 น. ไม่คิดค่าบริการเพิ่ม';
    else if(c.durMin<=15)line=`ช่วงฟรี เหลืออีก ${Math.ceil(15-c.durMin)} นาที`;
    else{const next=open.in+(c.hours*60+(mode()==='deduct'?15:0))*60000;line=next<cut.getTime()?`ชั่วโมงถัดไปเริ่ม ${hm(next)} น. (+10 บาท)`:'ชั่วโมงนี้เป็นชั่วโมงสุดท้ายก่อน 16:30 น.';}
  }
  const nm=nd.getHours()*60+nd.getMinutes(),gate=(nm<330||nm>=1140)?'นอกเวลา 05:30–19:00 น. ให้ใช้ประตูพิษณุโลก 1':'';
  const rows=(D.map[today]||[]).slice().reverse();
  const dis=S.busy?' disabled':'';
  return `<div class="stack">
    <div class="head"><div><div class="card-kicker">${TH_DF[nd.getDay()]}ที่ ${nd.getDate()} ${TH_M[nd.getMonth()]} ${nd.getFullYear()+543}</div><h2>วันนี้</h2></div>
      <div class="row">
        <button class="btn btn-secondary btn-icon" data-act="theme" aria-label="สลับโหมดมืด/สว่าง">${ic(themeMode()==='dark'?P.sun:P.moon,18)}</button>
        <button class="btn btn-secondary" data-act="cycleVehicle" style="gap:8px;padding:8px 10px">${ic(P.car,18)}<span style="font-size:15px">${act?esc(act.plate):'เพิ่มรถ'}</span></button>
      </div></div>
    ${!S.vehicles.length?`<button class="banner" data-act="openVehicle" style="border:0;cursor:pointer;text-align:left;font:inherit">${ic(P.car,18)}<span>เริ่มต้น: เพิ่มข้อมูลรถของคุณก่อนกดเข้า-ออก</span></button>`:''}
    <div class="card blueprint status">${C}
      <div class="status-top"><span class="tag ${open?'tag-accent':'tag-neutral'}">${open?'กำลังจอด':'ไม่ได้จอด'}</span><span class="small muted" style="white-space:nowrap">${since}</span></div>
      <div class="timer" id="timer">${timer}</div>
      <div class="status-line">${line}</div>
      <div class="split"><div><div class="label">ค่าจอดวันนี้</div><div class="num">${tc.fee} <small>บาท</small></div></div>
        <div><div class="label">สะสมเดือนนี้</div><div class="num">${money(D.total(cm))} <small>บาท</small></div></div></div>
    </div>
    <div class="tap-grid">
      <button class="btn ${open?'btn-secondary':'btn-primary'} blueprint tap" data-act="tapIn"${open?' disabled':dis}>${C}${ic(P.in,30)}<b>เข้า</b><span>บันทึกเวลาเข้า</span></button>
      <button class="btn ${open?'btn-primary':'btn-secondary'} blueprint tap" data-act="tapOut"${open?dis:' disabled'}>${C}${ic(P.out,30)}<b>ออก</b><span>บันทึกเวลาออก</span></button>
    </div>
    ${gate?`<div class="small muted" style="text-align:center">${gate}</div>`:''}
    <div><div class="list-head"><h4>รายการวันนี้</h4><span class="small muted">${rows.length?rows.length+' ครั้ง':''}</span></div>
      ${rows.length?rows.map(rowHtml).join(''):`<div class="empty" style="text-align:left">ยังไม่มีรายการ — กด "เข้า" เมื่อนำรถผ่านไม้กั้น</div>`}</div>
  </div>`;
}
function vLog(D){
  const ks=D.keys(S.logMonth).reverse();
  return `<div class="stack" style="gap:14px">
    <div class="head"><div><div class="card-kicker">ประวัติการจอด</div><h2>บันทึก</h2></div>
      <button class="btn btn-secondary" data-act="openAdd">${ic(P.plus,16)}เพิ่มย้อนหลัง</button></div>
    <div class="pager"><button class="btn btn-ghost btn-icon" data-act="logPrev" aria-label="เดือนก่อน">${ic(P.left,18)}</button>
      <div class="c">${mkLabel(S.logMonth)}<small>${ks.length?`${ks.length} วัน · ${money(D.total(S.logMonth))} บาท`:'—'}</small></div>
      <button class="btn btn-ghost btn-icon" data-act="logNext" aria-label="เดือนถัดไป">${ic(P.right,18)}</button></div>
    ${ks.map(k=>{const c=D.dc(k);return `<div><div class="list-head"><b>${dayLbl(k)}</b><span class="row">${c.capped?'<span class="tag tag-neutral">เพดาน</span>':''}<b>${c.fee} บาท</b></span></div>${D.map[k].map(rowHtml).join('')}</div>`}).join('')}
    ${ks.length?'':'<div class="empty">ไม่มีรายการในเดือนนี้</div>'}
  </div>`;
}
function vCheck(D){
  const mk=S.checkMonth,ks=D.keys(mk),app=ks.reduce((a,k)=>a+D.dc(k).fee,0),cm=mkOf(new Date(S.now));
  const ov=S.statements[mk]??'',off=ov===''?null:Number(ov);
  const flagged=S.sessions.filter(x=>x.date.startsWith(mk)&&(x.src==='manual'||x.edited)).length;
  let r;
  if(off===null)r={i:P.receipt,t:'กรอกยอดจากหนังสือหักเงิน',s:'ใส่ยอดที่สำนักงานแจ้งหักเพื่อเทียบกับบันทึกของคุณ'};
  else if(off===app)r={i:P.shield,t:'ยอดตรงกัน',s:`สำนักงานหัก ${money(off)} บาท เท่ากับบันทึกในแอพ`,ok:1};
  else{const d=off-app;r={i:P.alert,t:d>0?`สำนักงานหักเกิน ${money(d)} บาท`:`สำนักงานหักน้อยกว่า ${money(-d)} บาท`,s:d>0?'ตรวจรายวันด้านล่าง แล้วสรุปเป็นหลักฐานยื่นโต้แย้ง':'ยอดหักต่ำกว่าบันทึก — ตรวจว่ามีรายการที่ไม่ได้ใช้จริงหรือไม่'};}
  const[y,m]=mk.split('-').map(Number),dl=new Date(y,m,3,23,59),left=Math.ceil((dl-S.now)/86400000);
  const dlt=mk>=cm?'เดือนนี้ยังไม่ปิดยอด — สำนักงานสรุปยอดสิ้นเดือน':left<0?`เลยกำหนดโต้แย้งแล้ว (ถึง 3 ${TH_MS[dl.getMonth()]} ${dl.getFullYear()+543})`:`โต้แย้งได้ถึง 3 ${TH_MS[dl.getMonth()]} ${dl.getFullYear()+543} · <span class="nowrap">เหลือ ${left} วัน</span>`;
  return `<div class="stack" style="gap:16px">
    <div class="head"><div><div class="card-kicker">เทียบกับหนังสือหักเงิน</div><h2>ตรวจยอด</h2></div></div>
    <div class="pager"><button class="btn btn-ghost btn-icon" data-act="chkPrev" aria-label="เดือนก่อน">${ic(P.left,18)}</button><div class="c">${mkLabel(mk)}</div><button class="btn btn-ghost btn-icon" data-act="chkNext" aria-label="เดือนถัดไป">${ic(P.right,18)}</button></div>
    <div class="banner">${ic(P.clock,18)}<span>${dlt}</span></div>
    <div class="compare">
      <div><span class="label">ยอดจากบันทึกในแอพ</span><span style="font:600 32px/1.1 var(--font-heading)">${money(app)}</span><span class="label">${ks.length} วัน${flagged?` · แก้/เพิ่มเอง ${flagged}`:''}</span></div>
      <div><label class="label" for="office">ยอดที่สำนักงานหัก</label><input id="office" class="input" type="number" inputmode="decimal" placeholder="0" value="${esc(ov)}"><span class="label">จากหนังสือแจ้งหักเงินเดือน</span></div>
    </div>
    <div class="card blueprint result">${C}<span style="flex:none;color:${r.ok?'var(--color-accent)':'currentColor'}">${ic(r.i,34)}</span><div style="flex:1"><div class="title">${r.t}</div><div class="small muted">${r.s}</div></div></div>
    <div class="grid2"><button class="btn btn-primary blueprint h44" data-act="openEvidence">${C}${ic(P.file,16)}สรุปเป็นหลักฐาน</button><button class="btn btn-secondary h44" data-act="tab" data-tab="log">ดูบันทึกทั้งหมด</button></div>
    <div class="ctable"><div class="tr th"><span>วันที่</span><span>เข้า–ออก</span><span>บาท</span></div>
      ${ks.map(k=>{const l=D.map[k],c=D.dc(k),f=l.some(x=>x.edited)?['แก้ไข','tag-outline']:l.some(x=>x.src==='manual')?['เพิ่มเอง','tag-accent']:null;const last=l[l.length-1];
        return `<div class="tr"><span style="font-weight:500">${dayLbl(k).replace(/^\S+ /,'')}</span><span class="span">${hm(l[0].in)}–${last.out?hm(last.out):'…'}${l.length>1?` (${l.length} ครั้ง)`:''}${f?`<span class="tag ${f[1]}">${f[0]}</span>`:''}</span><span class="fee" style="font-size:15px;text-align:right">${c.fee}</span></div>`}).join('')}
      ${ks.length?'':'<div class="empty">ไม่มีรายการในเดือนนี้</div>'}
    </div></div>`;
}
function vStats(D){
  let bars=[],metrics=[],label,total,scale,gap;
  if(S.statsMode==='month'){
    const[y,m]=S.statsMonth.split('-').map(Number),n=new Date(y,m,0).getDate();let days=0,mins=0,cap=0,tot=0;
    for(let i=1;i<=n;i++){const k=`${S.statsMonth}-${pad(i)}`,c=D.map[k]?D.dc(k):null;if(c){days++;mins+=c.durMin;tot+=c.fee;if(c.raw>=80)cap++;}
      bars.push({h:c?Math.max(3,c.fee/80*100):0,hi:c&&c.fee>=80,l:(i===1||i%5===0)?i:'',tip:`${i} ${TH_MS[m-1]}: ${c?c.fee:0} บาท`});}
    label=mkLabel(S.statsMonth);total=money(tot);scale='สเกล 0–80 บาท/วัน';gap=2;
    metrics=[['วันที่จอด',`${days} วัน`],['ชั่วโมงจอดรวม',`${Math.round(mins/60)} ชม.`],['เฉลี่ยต่อวัน',`${days?Math.round(tot/days):0} บาท`],['วันที่ชนเพดาน 80',`${cap} วัน`]];
  }else{
    const y=S.statsYear,t=[];for(let i=0;i<12;i++)t.push(D.total(`${y}-${pad(i+1)}`));
    const mx=Math.max(1,...t),sum=t.reduce((a,b)=>a+b,0),used=t.filter(x=>x>0).length,best=t.indexOf(Math.max(...t));
    const days=Object.keys(D.map).filter(k=>k.startsWith(y+'-')).length;
    bars=t.map((v,i)=>({h:v?Math.max(3,v/mx*100):0,hi:i===best&&v,l:TH_MS[i].replace(/\./g,'').slice(0,3),tip:`${TH_M[i]}: ${money(v)} บาท`}));
    label=`ปี ${y+543}`;total=money(sum);scale=`สูงสุด ${money(mx)} บาท/เดือน`;gap=6;
    metrics=[['เฉลี่ยต่อเดือน',`${money(used?Math.round(sum/used):0)} บาท`],['วันที่จอดทั้งปี',`${days} วัน`],['เดือนที่สูงสุด',t[best]?TH_M[best]:'—'],['เดือนที่มีข้อมูล',`${used} เดือน`]];
  }
  const sm=S.statsMode;
  return `<div class="stack" style="gap:16px">
    <div class="head"><div><div class="card-kicker">ภาพรวมค่าจอด</div><h2>สถิติ</h2></div>
      <div class="seg-btns"><button class="btn ${sm==='month'?'btn-primary':'btn-secondary'}" data-act="stMode" data-v="month">รายเดือน</button><button class="btn ${sm==='year'?'btn-primary':'btn-secondary'}" data-act="stMode" data-v="year">รายปี</button></div></div>
    <div class="pager"><button class="btn btn-ghost btn-icon" data-act="stPrev" aria-label="ก่อนหน้า">${ic(P.left,18)}</button><div class="c">${label}</div><button class="btn btn-ghost btn-icon" data-act="stNext" aria-label="ถัดไป">${ic(P.right,18)}</button></div>
    <div class="card blueprint chart-card">${C}
      <div class="row" style="justify-content:space-between"><span class="label">ยอดรวม</span><span class="label" style="white-space:nowrap">${scale}</span></div>
      <div style="font:600 44px/1 var(--font-heading)">${total} <span style="font-size:18px">บาท</span></div>
      <div class="chart" style="gap:${gap}px">${bars.map(b=>`<i class="${b.hi?'hi':''}" style="height:${b.h}%" title="${b.tip}"></i>`).join('')}</div>
      <div class="axis" style="gap:${gap}px">${bars.map(b=>`<span>${b.l}</span>`).join('')}</div>
    </div>
    <div class="cells">${metrics.map(([k,v])=>`<div><div class="label">${k}</div><div class="num" style="font-size:26px">${v}</div></div>`).join('')}</div>
  </div>`;
}
function vProfile(){
  const u=S.user,name=u.user_metadata?.full_name||u.email,pic=u.user_metadata?.avatar_url,th=S.theme,fr=mode();
  const b=(on,act,v,t)=>`<button class="btn ${on?'btn-primary':'btn-secondary'}" data-act="${act}" data-v="${v}">${t}</button>`;
  return `<div class="stack">
    <div class="head"><div><div class="card-kicker">บัญชีและรถ</div><h2>โปรไฟล์</h2></div></div>
    <div class="me"><div class="avatar">${pic?`<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">`:esc(name.charAt(0))}</div>
      <div style="flex:1;min-width:0"><div style="font:600 18px var(--font-heading)">${esc(name)}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email)}</div></div>
      <button class="btn btn-secondary" data-act="logout">ออกจากระบบ</button></div>
    <div class="row" style="justify-content:space-between"><h4 style="margin:0">รถของฉัน</h4><button class="btn btn-ghost" data-act="openVehicle">+ เพิ่มรถ</button></div>
    ${S.vehicles.map(v=>`<div class="card blueprint vcard${v.id===S.active?' on':''}" data-act="setActive" data-id="${v.id}" role="button" tabindex="0">${C}
      <div class="plate"><b>${esc(v.plate)}</b><span>${esc(v.province)}</span></div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
        <span style="font:600 16px var(--font-heading)">${esc(v.brand||(v.type==='moto'?'จักรยานยนต์':'รถยนต์'))}</span>
        <span class="small muted">${v.type==='moto'?'จักรยานยนต์':'รถยนต์'}${v.color?' · สี'+esc(v.color):''}</span>
        <span class="row" style="flex-wrap:wrap;gap:6px"><span class="tag tag-neutral">${v.registered?'ลงทะเบียน · กล้องอ่านป้าย':'ใช้บัตร RFID'}</span>${v.id===S.active?'<span class="tag tag-accent">ใช้อยู่</span>':''}</span>
      </div>
      <button class="btn btn-ghost btn-icon" data-act="delVehicle" data-id="${v.id}" aria-label="ลบรถ">${ic(P.x,16)}</button></div>`).join('')}
    ${S.vehicles.length?'':'<div class="empty" style="text-align:left">ยังไม่มีรถ — กด "+ เพิ่มรถ"</div>'}
    <div class="small muted">ลงทะเบียนได้สูงสุด ๒ คัน ต่อ ๑ ประเภทยานพาหนะ · แตะการ์ดเพื่อเลือกรถที่ใช้วันนี้</div>
    <div style="border-top:1px solid var(--color-divider)">
      <div class="setting"><span>อัตรารถยนต์</span><span class="muted">ฟรี 15 นาที · 10 บาท/ชม. · ≤ 80/วัน</span></div>
      <div class="setting"><span>ตัดรอบคิดเงิน</span><span class="muted">00:00–16:30 น.</span></div>
      <div class="setting"><span>วิธีนับ 15 นาที</span><span class="seg-btns">${b(fr==='whole','setRule','whole','เกินแล้วคิดเต็ม')}${b(fr==='deduct','setRule','deduct','หักออกก่อน')}</span></div>
      <div class="setting"><span>ธีม</span><span class="seg-btns">${b(th==='light','setTheme','light','สว่าง')}${b(th==='dark','setTheme','dark','มืด')}${b(th==='auto','setTheme','auto','ตามระบบ')}</span></div>
      <div class="setting"><span>คู่มือการใช้งาน</span><a href="manual.html">เปิดคู่มือ</a></div>
    </div>
    <div class="card blueprint" style="padding:16px;gap:10px">${C}
      <div class="row" style="gap:10px"><span style="color:var(--color-accent)">${ic(P.lock,22)}</span><div class="card-title">ชวนน้องในทีมมาใช้</div></div>
      <p class="card-body">แต่ละคนล็อคอินด้วย Gmail ของตัวเอง ข้อมูลแยกกันด้วย Row Level Security — ไม่มีใครเห็นข้อมูลของคนอื่น</p>
      <div class="row"><div class="input" style="display:flex;align-items:center;font-size:13px;flex:1;min-width:0;overflow:hidden">${esc(location.host)}</div><button class="btn btn-secondary" data-act="copyInvite">คัดลอกลิงก์</button></div>
    </div></div>`;
}
function vSheet(){
  if(!S.sheet)return '';
  const busy=S.busy?' disabled':'';let title='',body='';
  if(S.sheet==='entry'){
    const f=S.form;title=f.id?'แก้ไขรายการ':'เพิ่มรายการย้อนหลัง';
    const audit=f.id?(f.edited?'รายการนี้เคยถูกแก้ไขแล้ว — เวลาเดิมถูกเก็บไว้':f.src==='manual'?'รายการที่เพิ่มย้อนหลัง':'บันทึกจากการกดปุ่มสด — หากแก้ไขจะติดป้าย "แก้ไข"'):'รายการย้อนหลังจะติดป้าย "เพิ่มย้อนหลัง" เพื่อความโปร่งใส';
    body=`<div class="field"><label for="f-date">วันที่</label><input id="f-date" class="input" type="date" data-bind="form.date" value="${esc(f.date)}"></div>
      <div class="grid2"><div class="field"><label for="f-in">เวลาเข้า</label><input id="f-in" class="input" type="time" data-bind="form.tin" value="${esc(f.tin)}"></div>
      <div class="field"><label for="f-out">เวลาออก</label><input id="f-out" class="input" type="time" data-bind="form.tout" value="${esc(f.tout)}"></div></div>
      <div class="field"><label for="f-note">หมายเหตุ (เช่น ลืมกด, ประชุมนอกสถานที่)</label><input id="f-note" class="input" type="text" data-bind="form.note" value="${esc(f.note)}"></div>
      <div class="small" id="f-preview" style="color:var(--color-accent-700);min-height:18px">${preview()}</div>
      ${f.err?`<div class="err">${esc(f.err)}</div>`:''}
      <div class="small muted">${audit}</div>
      <div class="row" style="gap:10px">${f.id?'<button class="btn btn-secondary h44" data-act="delEntry">ลบรายการ</button>':''}<button class="btn btn-primary blueprint h44" data-act="saveEntry" style="flex:1"${busy}>${C}บันทึก</button></div>`;
  }else if(S.sheet==='vehicle'){
    const f=S.vform;title='เพิ่มรถ';
    body=`<div class="seg-btns"><button class="btn ${f.type==='car'?'btn-primary':'btn-secondary'}" data-act="vType" data-v="car" style="flex:1">รถยนต์</button><button class="btn ${f.type==='moto'?'btn-primary':'btn-secondary'}" data-act="vType" data-v="moto" style="flex:1">จักรยานยนต์</button></div>
      <div class="grid2"><div class="field"><label for="v-plate">ทะเบียน</label><input id="v-plate" class="input" data-bind="vform.plate" value="${esc(f.plate)}" placeholder="1กข 1234"></div>
      <div class="field"><label for="v-prov">จังหวัด</label><input id="v-prov" class="input" data-bind="vform.province" value="${esc(f.province)}" placeholder="กรุงเทพมหานคร"></div></div>
      <div class="grid2"><div class="field"><label for="v-brand">ยี่ห้อ / รุ่น</label><input id="v-brand" class="input" data-bind="vform.brand" value="${esc(f.brand)}" placeholder="Toyota Yaris"></div>
      <div class="field"><label for="v-color">สี</label><input id="v-color" class="input" data-bind="vform.color" value="${esc(f.color)}" placeholder="ขาว"></div></div>
      <label class="radio"><input type="checkbox" data-bind="vform.reg"${f.reg?' checked':''}><span class="dot"></span>ลงทะเบียนกับสำนักงานแล้ว (กล้องอ่านป้าย)</label>
      ${f.err?`<div class="err">${esc(f.err)}</div>`:''}
      <button class="btn btn-primary blueprint h44" data-act="saveVehicle"${busy}>${C}บันทึกรถ</button>`;
  }else if(S.sheet==='evidence'){
    title='สรุปเพื่อโต้แย้ง';
    body=`<div class="small muted">ยื่นที่กองบริการสำนักงาน สำนักงานธุรการ ภายในวันที่ ๓ ของเดือนถัดไป</div>
      <pre class="evidence">${esc(evidenceText())}</pre>
      <button class="btn btn-primary blueprint h44" data-act="copyEvidence">${C}${ic(P.copy,16)}คัดลอกข้อความ</button>`;
  }
  return `<div class="sheet-wrap"><div class="sheet-bg" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="sheet-head"><h3>${title}</h3><button class="btn btn-ghost btn-icon" data-act="close" aria-label="ปิด">${ic(P.x,18)}</button></div>${body}</div></div>`;
}
function preview(){
  const f=S.form;if(!f.date||!f.tin||!f.tout)return '';
  const a=parseHM(f.date,f.tin),b=parseHM(f.date,f.tout);if(!(b>a))return '';
  const c=sessCalc({in:a,out:b},Date.now(),mode());return `ระยะเวลา ${durTxt(c.durMin)} · คิด ${c.hours} ชม. = ${c.hours*10} บาท`;
}
function vTabs(){
  const t=(id,icon,label)=>`<button data-act="tab" data-tab="${id}"${S.tab===id?' aria-current="page"':''}>${ic(icon,22)}${label}</button>`;
  return `<div class="tabbar"><nav>${t('home',P.clock,'วันนี้')}${t('log',P.list,'บันทึก')}${t('check',P.receipt,'ตรวจยอด')}${t('stats',P.chart,'สถิติ')}${t('profile',P.user,'โปรไฟล์')}</nav></div>`;
}

let lastHtml='';
function render(){
  document.documentElement.dataset.theme=themeMode();
  let html;
  if(S.loading)html='<div class="loading">กำลังโหลด…</div>';
  else if(!S.user)html=vLogin();
  else{
    const D=data(),v={home:vHome,log:vLog,check:vCheck,stats:vStats,profile:vProfile}[S.tab](D);
    html=`<div class="shell"><main class="main">${v}</main></div>${vTabs()}${vSheet()}`;
  }
  if(S.toast)html+=`<div class="toast" role="status">${esc(S.toast)}</div>`;
  if(html===lastHtml)return;
  // keep focus & scroll inside sheets when re-rendering
  const fid=document.activeElement&&document.activeElement.id,sheetScroll=document.querySelector('.sheet')?.scrollTop;
  $app.innerHTML=html;lastHtml=html;
  if(fid){const el=document.getElementById(fid);if(el){el.focus();try{if(el.setSelectionRange&&el.type==='text')el.setSelectionRange(el.value.length,el.value.length)}catch(e){}}}
  const sh=document.querySelector('.sheet');if(sh&&sheetScroll)sh.scrollTop=sheetScroll;
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
  const fn=A[el.dataset.act];if(!fn)return;
  e.stopPropagation();
  if(el.dataset.act==='setActive'&&e.target.closest('[data-act="delVehicle"]'))return;
  fn({...el.dataset});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&S.sheet)A.close();
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role=button][data-act]')){e.preventDefault();e.target.click();}
});
const bind=e=>{
  const b=e.target.dataset&&e.target.dataset.bind;if(!b)return;
  const[o,k]=b.split('.');S[o][k]=e.target.type==='checkbox'?e.target.checked:e.target.value;S[o].err=null;
  if(o==='form'){const p=document.getElementById('f-preview');if(p)p.textContent=preview();}
};
document.addEventListener('input',bind);
document.addEventListener('change',e=>{bind(e);if(e.target.id==='office')saveOffice(e.target.value.trim());});

setInterval(()=>{S.now=Date.now();if(S.user&&!S.loading&&!S.sheet&&S.tab==='home')render();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user&&!S.sheet)loadAll(true);});

/* ---------- auth ---------- */
async function onSession(session){
  const u=session?.user||null;
  if(u&&!/@gmail\.com$/i.test(u.email||'')){
    LS.set('parklog-auth-error','ใช้ได้เฉพาะบัญชี @gmail.com');await sb.auth.signOut();S.authError='ใช้ได้เฉพาะบัญชี @gmail.com';S.user=null;S.loading=false;return render();
  }
  if(u&&S.user&&u.id===S.user.id)return;
  S.user=u;
  if(u){S.authError=null;await loadAll();}else{S.loading=false;S.vehicles=[];S.sessions=[];render();}
}
const qp=new URLSearchParams(location.hash.slice(1)+'&'+location.search.slice(1));
if(qp.get('error_description')){S.authError=/Database error/i.test(qp.get('error_description'))?'ใช้ได้เฉพาะบัญชี @gmail.com':qp.get('error_description');history.replaceState(null,'',location.pathname);}
sb.auth.onAuthStateChange((_ev,session)=>{setTimeout(()=>onSession(session),0)});
sb.auth.getSession().then(({data})=>onSession(data.session));
})();
