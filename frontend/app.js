// 闲时达 · Leisure Done  —  v3 UI
// 四页 SPA：对话规划 / 路线地图 / 灵感发现 / 历史行程
// -------------------------------------------------------

// ===== 全局状态 =====
const S = {
  sessionId: null,
  scene: 'family',
  plans: [],
  currentPlan: null,
  currentIntent: null,
  extras: [],
  mapInstance: null,
  mapLayers: [],
  planSummary: '',
};

// ===== DOM 引用 =====
const $ = id => document.getElementById(id);
const chat        = $('chat');
const inputEl     = $('input');
const sendBtn     = $('send');
const relayMask   = $('relayMask');
const relayCard   = $('relayCard');
const askMask     = $('askMask');
const askChat     = $('askChat');
const askInput    = $('askInput');
const askSend     = $('askSend');
const askClose    = $('askClose');
const mapTitle    = $('mapTitle');
const mapMeta     = $('mapMeta');
const mapSteps    = $('mapSteps');
const discoverList = $('discoverList');
const historyList  = $('historyList');
const acEmpty     = $('acEmpty');
const acContent   = $('acContent');

// ===== 工具 =====
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function scrollDown(){ chat.scrollTop = chat.scrollHeight; }
function node(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

// 带 Leo 头像的 bot 消息
function msgBot(html){
  const n = node(`<div class="msg bot">
    <div class="leo-av-msg">L</div>
    <div class="bubble">${html}</div>
  </div>`);
  chat.appendChild(n); scrollDown(); return n;
}
function msgUser(text){
  chat.appendChild(node(`<div class="msg user"><div class="bubble">${esc(text)}</div></div>`));
  scrollDown();
}

let thinkNode = null;
function showThink(text){
  thinkNode = node(`<div class="msg bot">
    <div class="leo-av-msg">L</div>
    <div class="bubble">
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">${text}</div>
      <div class="thinking"><span></span><span></span><span></span></div>
    </div>
  </div>`);
  chat.appendChild(thinkNode); scrollDown();
}
function hideThink(){ if(thinkNode){ thinkNode.remove(); thinkNode=null; } }

// ===== 导航（侧边栏 + 底部 Tab 统一处理）=====
function switchPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab, .sb-item').forEach(t => t.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll(`[data-page="${name}"]`).forEach(el => el.classList.add('active'));

  if(name === 'map')      initMapPage();
  if(name === 'discover') initDiscoverPage();
  if(name === 'history')  renderHistoryPage();
}

document.querySelectorAll('.tab, .sb-item').forEach(btn => {
  btn.onclick = () => switchPage(btn.dataset.page);
});

// ===== 对话流 =====
async function doPlan(text){
  msgUser(text);
  $('examples')?.remove();
  showThink('Leo 正在理解你的需求，推断隐藏偏好…');

  let data;
  try {
    const r = await fetch('/api/plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text}),
    });
    data = await r.json();
  } catch(e){ hideThink(); msgBot('网络出错了，请重试。'); return; }
  hideThink();

  S.sessionId     = data.session_id;
  S.scene         = data.intent.scene;
  S.plans         = data.plans;
  S.currentIntent = data.intent;

  // 渲染右侧分析面板（桌面）
  renderAnalysisPanel(data.intent);
  // 聊天流里给个简短确认
  msgBot(`好的！Leo 已识别关键信息（右侧面板可查看）。<br>以下是为「${sceneLabel(data.intent)}」量身定制的方案：`);
  data.plans.forEach(p => renderPlan(p, p.id === data.recommended_plan_id));
}

function sceneLabel(intent){
  if(intent.scene==='family'){
    return intent.members?.some(m=>m.role==='child') ? `全家 ${intent.party_size} 人` : '二人出行';
  }
  return `朋友局 ${intent.party_size} 人`;
}

// ===== 右侧分析面板（桌面专用）=====
const consMap = {
  max_travel_minutes:'出行距离', kid_friendly:'亲子友好',
  need_kid_seat:'儿童餐椅', low_cal_diet:'饮食偏好',
  need_private_room:'聚会包厢', group_activity:'活动类型',
};
const consIcon = {
  max_travel_minutes:'📍', kid_friendly:'🧒', need_kid_seat:'🪑',
  low_cal_diet:'🥗', need_private_room:'🚪', group_activity:'🎯',
};

function renderAnalysisPanel(intent){
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  if(!inferred.length) return;

  acEmpty.hidden = true;
  acContent.hidden = false;

  const rows = inferred.map(c=>`
    <div class="con-row">
      <div class="con-check">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#22c98a" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <span class="con-key">${esc(consIcon[c.key]||'')} ${esc(consMap[c.key]||c.key)}</span>
      <span class="con-val">${esc(c.reason)}</span>
    </div>`).join('');

  // 出行信息摘要
  const members = intent.members||[];
  const hasChild = members.some(m=>m.role==='child');
  const child = members.find(m=>m.role==='child');
  const spouse = members.find(m=>m.role==='spouse');

  const infoRows = [
    `<div class="con-row"><span class="con-key">👥 出行人数</span><span class="con-val">${intent.party_size} 人</span></div>`,
    hasChild ? `<div class="con-row"><span class="con-key">🧒 儿童年龄</span><span class="con-val">${child?.age||5} 岁</span></div>` : '',
    spouse?.note ? `<div class="con-row"><span class="con-key">💪 健康需求</span><span class="con-val">${esc(spouse.note)}</span></div>` : '',
    `<div class="con-row"><span class="con-key">⏱ 目标时长</span><span class="con-val">约 ${intent.duration_hours} 小时</span></div>`,
  ].filter(Boolean).join('');

  acContent.innerHTML = `
    <div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">出行信息</div></div>
      ${infoRows}
    </div>
    <div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">Leo 推断的关键需求</div></div>
      ${rows}
    </div>`;
}

// ===== 约束卡（聊天流移动端显示）=====
function renderIntent(intent){
  // 桌面端不在聊天流里重复显示，移动端显示简化卡片
  if(window.innerWidth > 768) return;
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  if(!inferred.length) return;
  const lines = inferred.map(c=>`
    <div class="con-row" style="border-bottom:1px solid var(--border);padding:7px 0;">
      <div class="con-check">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#22c98a" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <span class="con-key">${esc(consMap[c.key]||c.key)}</span>
      <span class="con-val">${esc(c.reason)}</span>
    </div>`).join('');
  const n = node(`<div class="msg bot" style="max-width:100%;width:100%">
    <div class="leo-av-msg" style="margin-top:2px">L</div>
    <div class="intent-card" style="flex:1">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">Leo 推断的关键需求</div></div>
      ${lines}
    </div></div>`);
  chat.appendChild(n); scrollDown();
}

// ===== 方案卡 =====
function renderPlan(plan, recommended){
  const steps = plan.steps.map((s,i)=>`
    <div class="step">
      <div class="step-time">${esc(s.time_range.split('-')[0]||'')}</div>
      <div class="dot">${slotIcon(s.slot)}</div>
      <div class="sbody">
        <div class="sslot">${esc(s.slot)}</div>
        <div class="sname">${esc(s.venue.name)}</div>
        <div class="swhy">${esc(s.why)}</div>
        ${s.venue.address ? `<div class="saddr" onclick="openMapForVenue('${s.venue.id}')">📍 ${esc(s.venue.address)}</div>` : ''}
      </div>
    </div>`).join('');
  const tags = plan.highlights.map(h=>`<span class="t">${esc(h)}</span>`).join('');
  const aud  = S.scene==='friends'?'friends':'spouse';
  const audLabel = S.scene==='friends'?'朋友':'老婆';

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-card ${recommended?'recommended':''}">
      <div class="plan-head">
        <span class="pt">${esc(plan.title)}</span>
        ${recommended?'<span class="badge">推荐</span>':''}
      </div>
      <div class="plan-meta">约 ${Math.round(plan.total_minutes/60)} 小时 · 预估总花费 ¥${plan.total_cost}</div>
      <div class="plan-steps">${steps}</div>
      <div class="plan-tags">${tags}</div>
      <div class="relay-trigger">
        <button class="rt">📲 递给${audLabel}一起看</button>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-map">🗺️ 看路线</button>
        <button class="btn btn-primary js-choose">确认这个方案 →</button>
      </div>
    </div></div>`);

  n.querySelector('.rt').onclick    = () => openRelay(plan, aud);
  n.querySelector('.js-map').onclick = () => loadPlanToMap(plan);
  n.querySelector('.js-choose').onclick = () => choosePlan(plan);
  chat.appendChild(n); scrollDown();
}
function slotIcon(slot){ return ({'活动':'🎯','正餐':'🍽','附加活动':'✨'})[slot]||'📍'; }

// ===== 地图页入口 =====
function loadPlanToMap(plan){
  S.currentPlan = plan;
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');
  switchPage('map');
}

function openMapForVenue(venueId){
  const allVenues = S.plans.flatMap(p=>p.steps.map(s=>s.venue));
  const v = allVenues.find(v=>v.id===venueId);
  if(!v) return;
  S.currentPlan = { steps:[{slot:'场所',time_range:'',venue:v,why:'',order:1}], title:v.name, total_minutes:0, total_cost:0 };
  switchPage('map');
}
window.openMapForVenue = openMapForVenue;

// ===== 地图页 =====
function initMapPage(){
  if(!S.mapInstance){
    S.mapInstance = L.map('map').setView([40.0000,116.4700],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap', maxZoom:19
    }).addTo(S.mapInstance);
  }
  S.mapLayers.forEach(l=>S.mapInstance.removeLayer(l));
  S.mapLayers = [];

  const plan = S.currentPlan;
  if(!plan || !plan.steps.length){
    mapTitle.textContent='路线地图';
    mapMeta.textContent='选好方案后查看路线';
    mapSteps.innerHTML=`<div class="map-empty"><div class="map-empty-icon">🗺️</div><div>在规划页选择方案后<br>点击「看路线」即可显示全程</div></div>`;
    setTimeout(()=>S.mapInstance.invalidateSize(),50);
    return;
  }

  mapTitle.textContent = plan.title || '路线地图';

  const home = {lat:40.0000, lng:116.4700};
  const homeIcon = L.divIcon({
    html:'<div style="background:#22c98a;color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:14px;box-shadow:0 2px 8px rgba(34,201,138,.4)">🏠</div>',
    iconSize:[30,30], className:'', iconAnchor:[15,30]
  });
  S.mapLayers.push(L.marker([home.lat,home.lng],{icon:homeIcon})
    .bindPopup('<div class="map-popup"><strong>出发点</strong><br>📍 望京</div>')
    .addTo(S.mapInstance));

  const points = [[home.lat,home.lng]];
  const stepCards = [];

  plan.steps.forEach((step,i)=>{
    const v = step.venue;
    if(!v.lat||!v.lng) return;
    const icon = L.divIcon({
      html:`<div style="background:${i===0?'#22c98a':'#ff8c42'};color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-weight:700;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)">${i+1}</div>`,
      iconSize:[30,30], className:'', iconAnchor:[15,30]
    });
    S.mapLayers.push(L.marker([v.lat,v.lng],{icon})
      .bindPopup(`<div class="map-popup"><strong>${esc(v.name)}</strong><br>${esc(step.slot)} · ${esc(step.time_range)}<br>📍 ${esc(v.address||'')}<br>⭐ ${v.rating} · 人均 ¥${v.price_per_person}</div>`)
      .addTo(S.mapInstance));
    points.push([v.lat,v.lng]);

    const prev = points[points.length-2];
    const dist = calcDist(prev[0],prev[1],v.lat,v.lng);
    const walkMin = Math.round(dist/80);
    stepCards.push(`<div class="map-step-card">
      <div class="ms-num">${i+1}</div>
      <div class="ms-body">
        <div class="ms-name">${esc(step.slot)} · ${esc(v.name)}</div>
        <div class="ms-addr">📍 ${esc(v.address||'')}</div>
        <div class="ms-dist">🚶 距上一点 ${dist<1000?dist+'m':(dist/1000).toFixed(1)+'km'}，步行约 ${walkMin} 分钟</div>
      </div>
    </div>`);
  });

  if(points.length>1){
    const poly = L.polyline(points,{color:'#22c98a',weight:3,opacity:.85,dashArray:'8,5'}).addTo(S.mapInstance);
    S.mapLayers.push(poly);
    S.mapInstance.fitBounds(poly.getBounds(),{padding:[24,24]});
  }

  mapMeta.textContent=`${plan.steps.length} 个站点 · 全程约 ${plan.total_minutes} 分钟`;
  mapSteps.innerHTML = stepCards.join('')+`
    <div style="padding:6px 2px 2px">
      <button class="btn btn-primary" style="width:100%" onclick="openAskFromMap()">💬 问 Leo 路线建议</button>
    </div>`;

  setTimeout(()=>S.mapInstance.invalidateSize(),50);
}

window.openAskFromMap = ()=>openAsk();

function calcDist(lat1,lng1,lat2,lng2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

// ===== 发现页 =====
async function initDiscoverPage(){
  if(discoverList.dataset.loaded) return;
  discoverList.dataset.loaded='1';
  try {
    const r = await fetch('/api/discover');
    const data = await r.json();
    renderDiscover(data.spots);
  } catch(e){
    discoverList.innerHTML='<div class="disc-loading" style="color:var(--red)">加载失败，请重试</div>';
  }
}

function renderDiscover(spots){
  discoverList.innerHTML = spots.map(s=>`
    <div class="disc-card" onclick="discoverSpotDetail(${JSON.stringify(s).replace(/"/g,'&quot;')})">
      <div class="disc-top">
        <div class="disc-emoji">${s.img_emoji}</div>
        <div class="disc-body">
          <div class="disc-name">${esc(s.name)}</div>
          <div class="disc-cat">${esc(s.category)}</div>
          <div class="disc-heat">${s.heat} 热度</div>
        </div>
      </div>
      <div class="disc-tip">💡 ${esc(s.tip)}</div>
      <div class="disc-footer">
        <div class="disc-price">${s.price===0?'🆓 免费':`人均 ¥${s.price}`}</div>
        <div class="disc-add"><button onclick="event.stopPropagation();addDiscoverToChat('${esc(s.name)}')">加入计划 +</button></div>
      </div>
    </div>`).join('');
}

window.discoverSpotDetail = (s)=>{
  S.currentPlan = {
    title:s.name, total_minutes:s.duration_min, total_cost:s.price,
    steps:[{slot:'发现',time_range:'',order:1,why:s.tip,
            venue:{id:'d'+s.id,name:s.name,lat:s.lat,lng:s.lng,
                   address:`${s.category} · ${s.name}`,rating:4.5,
                   price_per_person:s.price,category:s.category,tags:[]}}]
  };
  switchPage('map');
};

window.addDiscoverToChat = (name)=>{
  switchPage('chat');
  setTimeout(()=>{ inputEl.value=`我想去${name}，帮我规划一下下午`; inputEl.focus(); },100);
};

// ===== 历史页 =====
const HIST_KEY = 'leisureDoneHistory';

function saveHistory(plan, summary){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  hist.unshift({
    id:Date.now(), planId:plan.id, title:plan.title, summary,
    steps:plan.steps.map(s=>`${s.slot}：${s.venue.name}`),
    plan,
    date:new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),
  });
  localStorage.setItem(HIST_KEY,JSON.stringify(hist.slice(0,20)));
}

function renderHistoryPage(){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  if(!hist.length){
    historyList.innerHTML=`<div class="hist-empty"><div class="hist-empty-icon">📭</div>还没有历史行程<br><span style="font-size:12px">规划并执行一次方案后，记录会出现在这里</span></div>`;
    return;
  }
  historyList.innerHTML = hist.map(h=>`
    <div class="hist-card">
      <div class="hist-head">
        <span class="hist-title">${esc(h.title)}</span>
        <span class="hist-time">${esc(h.date)}</span>
      </div>
      <div class="hist-steps">${h.steps.map(s=>`• ${esc(s)}`).join('<br>')}</div>
      <div class="hist-actions">
        <button class="hist-btn ghost" onclick="histView(${h.id})">🗺️ 查看路线</button>
        <button class="hist-btn primary" onclick="histRerun(${h.id})">🔄 重新安排</button>
      </div>
    </div>`).join('');
}

window.histView = (id)=>{
  const h = JSON.parse(localStorage.getItem(HIST_KEY)||'[]').find(x=>x.id===id);
  if(h){ S.currentPlan=h.plan; switchPage('map'); }
};
window.histRerun = (id)=>{
  const h = JSON.parse(localStorage.getItem(HIST_KEY)||'[]').find(x=>x.id===id);
  if(h){ choosePlan(h.plan); switchPage('chat'); }
};

// ===== 接力浮层 =====
async function openRelay(plan, audience){
  S.currentPlan = plan;
  try {
    const r = await fetch('/api/relay',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({plan,audience,scene:S.scene}),
    });
    const card = await r.json();
    const focus = card.focus_points.map(f=>`<div class="rfocus">${esc(f)}</div>`).join('');
    const actions = card.quick_actions.map((a,i)=>
      `<button class="ra ${i===0?'primary':'sec'}" data-i="${i}">${esc(a)}</button>`).join('');
    relayCard.innerHTML=`
      <div class="rh">${esc(card.headline)}</div>
      ${focus}
      <div class="ractions">${actions}</div>
      <div class="relay-hint">把手机递给${audience==='friends'?'朋友':'TA'}，一键拍板 ✓</div>`;
    relayCard.querySelectorAll('.ra').forEach(btn=>{
      btn.onclick=()=>{
        relayMask.hidden=true;
        if(+btn.dataset.i===0){
          msgBot(`✅ ${audience==='friends'?'朋友':'老婆'}同意了！那就按「${esc(card.quick_actions[0])}」执行。`);
          choosePlan(plan);
        } else {
          msgBot(`收到！「${esc(card.quick_actions[+btn.dataset.i])}」—— 告诉 Leo 新的要求，重新规划一版。`);
          inputEl.focus();
        }
      };
    });
  } catch(e){
    relayCard.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-3)">加载失败，请重试</div>';
  }
  relayMask.hidden=false;
}
relayMask.onclick = e=>{ if(e.target===relayMask) relayMask.hidden=true; };

// ===== 确认方案 → 额外选项 → 执行 =====
function choosePlan(plan){
  S.currentPlan=plan; S.extras=[];
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-card">
      <div class="plan-head"><span class="pt">确认「${esc(plan.title)}」</span></div>
      <div class="extras">
        <div class="el">顺手安排点小惊喜？（送到餐厅）</div>
        <div class="opts">
          <span class="opt" data-x="蛋糕">🎂 蛋糕</span>
          <span class="opt" data-x="鲜花">💐 鲜花</span>
          <span class="opt" data-x="买菜">🛒 宵夜食材</span>
        </div>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-ask2">💬 问 Leo</button>
        <button class="btn btn-primary js-exec">🚀 一键执行所有</button>
      </div>
    </div></div>`);

  n.querySelectorAll('.opt').forEach(o=>{
    o.onclick=()=>{
      o.classList.toggle('on');
      const x=o.dataset.x;
      S.extras=o.classList.contains('on')?[...S.extras,x]:S.extras.filter(v=>v!==x);
    };
  });
  n.querySelector('.js-exec').onclick=()=>doExecute(plan);
  n.querySelector('.js-ask2').onclick=()=>openAsk();
  chat.appendChild(n); scrollDown();
}

async function doExecute(plan){
  showThink('Leo 正在并行下单：预约餐厅、购票、安排惊喜…');
  let res;
  try {
    const r = await fetch('/api/execute',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:S.sessionId,plan,extras:S.extras}),
    });
    res = await r.json();
  } catch(e){ hideThink(); msgBot('执行出错，请重试。'); return; }
  hideThink();
  renderExecResult(res, plan);
}

function renderExecResult(res, plan){
  const items = res.items.map(it=>{
    const icon = it.status==='success'?'✅':it.status==='fallback'?'🔄':'⚠️';
    const note = it.fallback_note?`<div class="enote">↳ ${esc(it.fallback_note)}</div>`:'';
    return `<div class="exec-item ${it.status==='failed'?'failed':''}">
      <span class="ei">${icon}</span>
      <div class="ed"><b>${esc(it.action)}</b>　${esc(it.detail)}${note}</div>
    </div>`;
  }).join('');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="exec-card">
      <div class="eh">${res.all_success?'🎉 全部搞定！':'已尽力安排，部分需确认'}</div>
      ${items}
      <div class="share-box">${esc(res.itinerary.share_text)}</div>
      <button class="share-btn js-share">📤 复制行程，转发给家人 / 朋友</button>
      <button class="ask-btn js-ask">💬 问 Leo：路线怎么走 / 有什么建议</button>
    </div></div>`);

  n.querySelector('.js-share').onclick=()=>{
    navigator.clipboard?.writeText(res.itinerary.share_text);
    msgBot('✅ 行程文案已复制，去粘贴给家人吧！');
    saveHistory(plan, res.itinerary.summary);
  };
  n.querySelector('.js-ask').onclick=()=>openAsk();
  chat.appendChild(n); scrollDown();

  S.currentPlan = plan;
  setTimeout(()=>msgBot('路线已就绪 🗺️　切换到「路线地图」页可查看全程和步行距离。'),700);
}

// ===== 追问 Leo =====
let askContext='';
function openAsk(){
  askContext = S.planSummary;
  askMask.hidden=false;
  askInput.focus();
}
askClose.onclick=()=>{ askMask.hidden=true; };
askMask.onclick=e=>{ if(e.target===askMask) askMask.hidden=true; };

async function sendAsk(){
  const msg = askInput.value.trim();
  if(!msg) return;
  askInput.value='';
  askChat.appendChild(node(`<div class="ask-bubble user">${esc(msg)}</div>`));
  const loading = node(`<div class="ask-bubble bot"><span style="opacity:.4">Leo 思考中…</span></div>`);
  askChat.appendChild(loading);
  askChat.scrollTop=askChat.scrollHeight;
  try {
    const r = await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,context:askContext}),
    });
    loading.textContent=(await r.json()).reply;
  } catch(e){ loading.textContent='暂时无法回答，请稍后重试。'; }
  askChat.scrollTop=askChat.scrollHeight;
}
askSend.onclick=sendAsk;
askInput.onkeydown=e=>{ if(e.key==='Enter') sendAsk(); };

// ===== 主输入 =====
function submit(){
  const t=inputEl.value.trim(); if(!t) return;
  inputEl.value=''; doPlan(t);
}
sendBtn.onclick=submit;
inputEl.onkeydown=e=>{ if(e.key==='Enter') submit(); };
document.querySelectorAll('.chip').forEach(c=>{ c.onclick=()=>doPlan(c.dataset.text); });

// ===== 初始化地图 =====
setTimeout(()=>{
  if(typeof L==='undefined') return;
  S.mapInstance=L.map('map').setView([40.0000,116.4700],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(S.mapInstance);
  L.marker([40.0000,116.4700],{icon:L.divIcon({html:'<div style="background:#22c98a;color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:14px;box-shadow:0 2px 8px rgba(34,201,138,.4)">🏠</div>',iconSize:[30,30],className:'',iconAnchor:[15,30]})})
    .bindPopup('<div class="map-popup"><strong>出发点</strong><br>📍 望京</div>')
    .addTo(S.mapInstance);
  fetch('/api/discover').then(r=>r.json()).then(({spots})=>{
    spots.forEach(s=>{
      L.circleMarker([s.lat,s.lng],{radius:6,color:'#22c98a',fillColor:'#22c98a',fillOpacity:.4,weight:2})
        .bindPopup(`<div class="map-popup"><strong>${esc(s.name)}</strong><br>${s.img_emoji} ${esc(s.tip)}</div>`)
        .addTo(S.mapInstance);
    });
  }).catch(()=>{});
},300);
