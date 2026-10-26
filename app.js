
const { createClient } = supabase;
const cfg = window.APP_CONFIG || {};
const content = document.getElementById('content');
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginError = document.getElementById('loginError');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
let sb = null;
let currentPage = 'dashboard';

function configured(){
  return cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
    !cfg.SUPABASE_URL.includes('PEGA_AQUI') &&
    !cfg.SUPABASE_KEY.includes('PEGA_AQUI');
}
function initClient(){
  if(!configured()) return false;
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  return true;
}
function esc(v){
  if(v===null || v===undefined) return '';
  return String(v).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function n(v){ return v===null || v===undefined ? '—' : v; }
function pct(v){ return v===null || v===undefined ? '—' : `${v}%`; }
function fmtDate(v){
  if(!v) return '—';
  const [y,m,d]=v.split('-'); return `${d}/${m}/${y}`;
}
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg;t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),2500);
}
async function query(view, select='*', filters=[]){
  let q=sb.from(view).select(select);
  for(const [op,col,val] of filters) q=q[op](col,val);
  const {data,error}=await q;
  if(error) throw error;
  return data||[];
}
function setPageMeta(title, subtitle=''){
  pageTitle.textContent=title; pageSubtitle.textContent=subtitle;
}
function loading(){ content.innerHTML='<div class="card empty">Cargando datos…</div>'; }
function fail(err){
  console.error(err);
  content.innerHTML=`<div class="card"><strong>Error al consultar Supabase</strong><p class="error">${esc(err.message||err)}</p><p class="muted">Revisa permisos RLS, nombres de vistas y configuración.</p></div>`;
}
function statCard(label,value){ return `<div class="card kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }

async function showDashboard(){
  currentPage='dashboard'; setPageMeta('Resumen','Visión general de los datos cargados'); loading();
  try{
    const [matches, ranking]=await Promise.all([
      query('v_partidos_resumen'),
      query('v_ranking_general')
    ]);
    const totalGoals=ranking.reduce((a,r)=>a+(Number(r.goles)||0),0);
    const totalShots=ranking.reduce((a,r)=>a+(Number(r.lanzamientos)||0),0);
    const accuracy=totalShots ? (100*totalGoals/totalShots).toFixed(1)+'%' : '—';
    const leader=[...ranking].sort((a,b)=>(b.goles||0)-(a.goles||0))[0];

    content.innerHTML=`
      <div class="grid cards">
        ${statCard('Partidos',matches.length)}
        ${statCard('Goles',totalGoals)}
        ${statCard('Lanzamientos',totalShots)}
        ${statCard('% tiro equipo',accuracy)}
      </div>
      <div class="two-col">
        <div>
          <div class="section-title"><h3>Últimos partidos</h3></div>
          ${renderMatches(matches.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).slice(0,5))}
        </div>
        <div>
          <div class="section-title"><h3>Goleadoras</h3></div>
          ${renderBars(ranking,'goles')}
        </div>
      </div>`;
  }catch(e){fail(e)}
}
function renderMatches(rows){
  if(!rows.length) return '<div class="card empty">No hay partidos.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Resultado</th><th>Cuartos</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="clickable" onclick="showMatch(${Number(r.partido_id)})">
      <td>${fmtDate(r.fecha)}</td><td>${esc(r.equipo)} - ${esc(r.rival)}</td>
      <td>${n(r.resultado_equipo)} - ${n(r.resultado_rival)}</td><td>${n(r.cuartos_registrados)}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function renderBars(rows,key){
  const sorted=[...rows].sort((a,b)=>(Number(b[key])||0)-(Number(a[key])||0)).slice(0,7);
  const max=Math.max(1,...sorted.map(r=>Number(r[key])||0));
  return `<div class="card bar-list">${sorted.map(r=>`
    <div class="bar-row"><span>${esc(r.jugadora)}</span>
      <div class="bar"><i style="width:${100*(Number(r[key])||0)/max}%"></i></div>
      <strong>${n(r[key])}</strong>
    </div>`).join('')}</div>`;
}
async function showMatches(){
  currentPage='partidos'; setPageMeta('Partidos','Consulta y detalle por partido'); loading();
  try{
    const rows=await query('v_partidos_resumen');
    rows.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
    content.innerHTML=`<div class="section-title"><h3>${rows.length} partidos</h3></div>${renderMatches(rows)}`;
  }catch(e){fail(e)}
}
async function showMatch(id){
  setPageMeta('Detalle del partido','Estadísticas individuales y evolución por cuartos'); loading();
  try{
    const [m,totals,detail,tramos]=await Promise.all([
      query('v_partidos_resumen','*',[['eq','partido_id',id]]),
      query('v_totales_jugadora_partido','*',[['eq','partido_id',id]]),
      query('v_estadisticas_partido_detalle','*',[['eq','partido_id',id]]),
      query('v_goles_tramos_partido','*',[['eq','partido_id',id]])
    ]);
    if(!m.length){content.innerHTML='<div class="card empty">Partido no encontrado.</div>';return}
    const p=m[0];
    totals.sort((a,b)=>(b.goles||0)-(a.goles||0));
    content.innerHTML=`
      <button class="secondary back" onclick="showMatches()">← Volver a partidos</button>
      <div class="grid cards">
        ${statCard('Fecha',fmtDate(p.fecha))}
        ${statCard('Partido',`${p.equipo} - ${p.rival}`)}
        ${statCard('Resultado',`${n(p.resultado_equipo)} - ${n(p.resultado_rival)}`)}
        ${statCard('Pabellón',p.pabellon||'—')}
      </div>
      <div class="section-title"><h3>Totales por jugadora</h3></div>
      ${renderPlayerTotals(totals)}
      <div class="section-title"><h3>Detalle por cuarto</h3></div>
      ${renderDetail(detail)}
      <div class="section-title"><h3>Goles por tramos</h3></div>
      ${renderSegments(tramos)}
    `;
  }catch(e){fail(e)}
}
function renderPlayerTotals(rows){
  return `<div class="table-wrap"><table><thead><tr>
    <th>Jugadora</th><th>Cuartos</th><th>Goles</th><th>Fallados</th><th>Lanz.</th><th>%</th><th>Robos</th><th>Pérdidas</th><th>Paradas</th>
  </tr></thead><tbody>${rows.map(r=>`<tr>
    <td>${esc(r.jugadora)}</td><td>${n(r.cuartos_jugados)}</td><td>${n(r.goles)}</td><td>${n(r.tiros_fallados)}</td>
    <td>${n(r.lanzamientos)}</td><td>${pct(r.porcentaje_tiro)}</td><td>${n(r.rob)}</td><td>${n(r.perdidas)}</td><td>${n(r.par)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}
function renderDetail(rows){
  rows.sort((a,b)=>(a.cuarto-b.cuarto)||a.jugadora.localeCompare(b.jugadora));
  return `<div class="table-wrap"><table><thead><tr>
    <th>Cuarto</th><th>Jugadora</th><th>PE</th><th>ROB</th><th>DOB</th><th>PAS</th><th>Fallados</th><th>Goles</th><th>Lanz.</th><th>%</th><th>PAR</th>
  </tr></thead><tbody>${rows.map(r=>`<tr>
    <td>${n(r.cuarto)}</td><td>${esc(r.jugadora)}</td><td>${n(r.pe)}</td><td>${n(r.rob)}</td><td>${n(r.dob)}</td>
    <td>${n(r.pas)}</td><td>${n(r.tiros_fallados)}</td><td>${n(r.goles)}</td><td>${n(r.lanzamientos)}</td>
    <td>${pct(r.porcentaje_tiro)}</td><td>${n(r.par)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}
function renderSegments(rows){
  rows.sort((a,b)=>a.cuarto-b.cuarto);
  return `<div class="table-wrap"><table><thead><tr>
    <th>Cuarto</th><th>Equipo 0-3</th><th>Rival 0-3</th><th>Equipo 3-6</th><th>Rival 3-6</th><th>Equipo 6-10</th><th>Rival 6-10</th><th>Dato</th>
  </tr></thead><tbody>${rows.map(r=>`<tr>
    <td>${r.cuarto}</td><td>${n(r.equipo_0_3)}</td><td>${n(r.rival_0_3)}</td><td>${n(r.equipo_3_6)}</td>
    <td>${n(r.rival_3_6)}</td><td>${n(r.equipo_6_10)}</td><td>${n(r.rival_6_10)}</td>
    <td><span class="badge ${r.estimado?'bad':'good'}">${r.estimado?'Estimado':'Real'}</span></td>
  </tr>`).join('')}</tbody></table></div>`;
}
async function showPlayers(){
  currentPage='jugadoras'; setPageMeta('Jugadoras','Acumulados de todos los partidos cargados'); loading();
  try{
    const rows=await query('v_totales_jugadora_general');
    rows.sort((a,b)=>a.jugadora.localeCompare(b.jugadora));
    content.innerHTML=`<div class="table-wrap"><table><thead><tr>
      <th>Jugadora</th><th>Partidos</th><th>Cuartos</th><th>Goles</th><th>Lanz.</th><th>% tiro</th><th>Robos</th><th>Pérdidas</th><th>Paradas</th>
    </tr></thead><tbody>${rows.map(r=>`<tr class="clickable" onclick="showPlayer(${Number(r.jugadora_id)})">
      <td>${esc(r.jugadora)}</td><td>${n(r.partidos_jugados)}</td><td>${n(r.cuartos_jugados)}</td><td>${n(r.goles)}</td>
      <td>${n(r.lanzamientos)}</td><td>${pct(r.porcentaje_tiro)}</td><td>${n(r.rob)}</td><td>${n(r.perdidas)}</td><td>${n(r.par)}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }catch(e){fail(e)}
}
async function showPlayer(id){
  setPageMeta('Ficha de jugadora','Evolución partido a partido'); loading();
  try{
    const [general, games]=await Promise.all([
      query('v_totales_jugadora_general','*',[['eq','jugadora_id',id]]),
      query('v_totales_jugadora_partido','*',[['eq','jugadora_id',id]])
    ]);
    if(!general.length){content.innerHTML='<div class="card empty">Jugadora no encontrada.</div>';return}
    const r=general[0];
    games.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
    content.innerHTML=`
      <button class="secondary back" onclick="showPlayers()">← Volver a jugadoras</button>
      <div class="section-title"><h3>${esc(r.jugadora)}</h3></div>
      <div class="grid cards">
        ${statCard('Partidos',n(r.partidos_jugados))}
        ${statCard('Goles',n(r.goles))}
        ${statCard('Lanzamientos',n(r.lanzamientos))}
        ${statCard('% tiro',pct(r.porcentaje_tiro))}
        ${statCard('Robos',n(r.rob))}
        ${statCard('Pérdidas',n(r.perdidas))}
        ${statCard('Paradas',n(r.par))}
        ${statCard('Cuartos',n(r.cuartos_jugados))}
      </div>
      <div class="section-title"><h3>Partido a partido</h3></div>
      <div class="table-wrap"><table><thead><tr>
        <th>Fecha</th><th>Rival</th><th>Cuartos</th><th>Goles</th><th>Fallados</th><th>Lanz.</th><th>%</th><th>Robos</th><th>Pérdidas</th>
      </tr></thead><tbody>${games.map(g=>`<tr class="clickable" onclick="showMatch(${Number(g.partido_id)})">
        <td>${fmtDate(g.fecha)}</td><td>${esc(g.rival)}</td><td>${n(g.cuartos_jugados)}</td><td>${n(g.goles)}</td>
        <td>${n(g.tiros_fallados)}</td><td>${n(g.lanzamientos)}</td><td>${pct(g.porcentaje_tiro)}</td>
        <td>${n(g.rob)}</td><td>${n(g.perdidas)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }catch(e){fail(e)}
}
async function showRankings(){
  currentPage='rankings'; setPageMeta('Rankings','Comparativas acumuladas'); loading();
  try{
    const rows=await query('v_ranking_general');
    content.innerHTML=`
      <div class="two-col">
        <div><div class="section-title"><h3>Máximas goleadoras</h3></div>${rankingTable(rows,'ranking_goles','goles','Goles')}</div>
        <div><div class="section-title"><h3>Máximas lanzadoras</h3></div>${rankingTable(rows,'ranking_lanzamientos','lanzamientos','Lanzamientos')}</div>
        <div><div class="section-title"><h3>Mejor % tiro</h3></div>${rankingTable(rows,'ranking_porcentaje_tiro','porcentaje_tiro','% tiro',true)}</div>
        <div><div class="section-title"><h3>Más robos</h3></div>${rankingTable(rows,'ranking_robos','rob','Robos')}</div>
        <div><div class="section-title"><h3>Menos pérdidas</h3></div>${rankingTable(rows,'ranking_menos_perdidas','perdidas','Pérdidas')}</div>
        <div><div class="section-title"><h3>Más pérdidas</h3></div>${rankingTable(rows,'ranking_mas_perdidas','perdidas','Pérdidas')}</div>
      </div>`;
  }catch(e){fail(e)}
}
function rankingTable(rows,rankKey,valueKey,label,isPct=false){
  const sorted=[...rows].sort((a,b)=>(a[rankKey]??999)-(b[rankKey]??999)||a.jugadora.localeCompare(b.jugadora));
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Jugadora</th><th>${label}</th></tr></thead><tbody>
  ${sorted.map(r=>`<tr><td class="rank-number">${n(r[rankKey])}</td><td>${esc(r.jugadora)}</td><td>${isPct?pct(r[valueKey]):n(r[valueKey])}</td></tr>`).join('')}
  </tbody></table></div>`;
}
async function route(page){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='dashboard') return showDashboard();
  if(page==='partidos') return showMatches();
  if(page==='jugadoras') return showPlayers();
  if(page==='rankings') return showRankings();
}
async function setSessionUI(session){
  if(session){
    loginView.classList.add('hidden'); appView.classList.remove('hidden');
    document.getElementById('userEmail').textContent=session.user.email||'';
    await route(currentPage);
  }else{
    appView.classList.add('hidden'); loginView.classList.remove('hidden');
  }
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>route(b.dataset.page)));
document.getElementById('refreshBtn').addEventListener('click',()=>route(currentPage));
document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); loginError.textContent='';
  if(!sb){loginError.textContent='Falta configurar config.js';return}
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error) loginError.textContent=error.message;
});
document.getElementById('logoutBtn').addEventListener('click',()=>sb.auth.signOut());

(async function start(){
  if(!initClient()){
    loginError.textContent='Primero configura SUPABASE_URL y SUPABASE_KEY en config.js.';
    return;
  }
  const {data:{session}}=await sb.auth.getSession();
  await setSessionUI(session);
  sb.auth.onAuthStateChange((_event,session)=>setSessionUI(session));
})();
