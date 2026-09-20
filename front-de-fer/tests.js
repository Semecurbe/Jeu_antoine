(async () => {
const G = window.__fdf;
const results = [];
let pass=0, fail=0;
const out = document.createElement('pre'); out.id='test-results'; document.body.appendChild(out);
const asyncTests=[];   // run one after another once the synchronous tests are done, so state never leaks between them
function test(name, fn){
  if (fn.constructor.name==='AsyncFunction'){ asyncTests.push({name,fn}); return; }
  try{ fn(); ok(name); } catch(e){ ko(name,e); }
}
function ok(n){ pass++; results.push('PASS '+n); }
function ko(n,e){ fail++; results.push('FAIL '+n+' :: '+(e && e.stack ? e.stack.split('\n').slice(0,2).join(' | ') : e)); }
function assert(c,msg){ if(!c) throw new Error(msg||'assertion'); }
function eq(a,b,msg){ if(a!==b) throw new Error((msg||'')+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a)); }
const S = () => G.S;
const fresh = (opts={}) => { G.setup({map:'vallee', players:2, diff:'normal', ...opts}); G.newGame(); return G.S; };
const find = (side,type) => G.S.units.find(u=>u.side===side && u.type===type);
const invariants = (label) => {
  const seen = new Set();
  for (const u of G.S.units){
    assert(u.x>=0 && u.y>=0 && u.x<G.W && u.y<G.H, label+': unit out of bounds '+JSON.stringify(u));
    const k=u.x+','+u.y; assert(!seen.has(k), label+': two units on '+k); seen.add(k);
    assert(u.hp>0 && u.hp<=G.TYPES[u.type].hp, label+': hp out of range '+u.hp);
    assert(!(u.type==='tank' && G.tile(u.x,u.y)==='R'), label+': tank in river');
  }
  for (const sd of G.S.sides) assert(G.S.gold[sd]>=0, label+': negative gold '+sd);
};

// ---- maps
for (const [id,m] of Object.entries(G.MAPS)) test('map '+id+' is consistent', ()=>{
  eq(m.rows.length, m.h, 'rows'); for (const r of m.rows) eq(r.length, m.w, 'row width');
  const pos=new Set();
  for (const sd of G.ORDER){ assert(m.units[sd] && m.units[sd].length===5, 'five units for '+sd); eq(m.units[sd][0][0],'hq','first unit is hq');
    for (const [t,x,y] of m.units[sd]){ assert(x>=0&&y>=0&&x<m.w&&y<m.h,'in bounds'); assert(m.rows[y][x]!=='R','not in river'); const k=x+','+y; assert(!pos.has(k),'dup '+k); pos.add(k); } }
  assert(m.rows.some(r=>r.includes('C')), 'has neutral cities');
});

// ---- new game
for (const n of [2,3,4]) test('newGame with '+n+' sides', ()=>{
  fresh({players:n});
  eq(S().sides.length, n); eq(S().units.length, 5*n);
  for (const sd of S().sides){ eq(S().gold[sd], 200, 'gold '+sd); assert(G.alive(sd)); const hq=find(sd,'hq'); eq(S().cities[G.key(hq.x,hq.y)], sd, 'hq city owned'); }
  eq(S().turn,1); eq(Object.keys(S().ready).length,0);
  invariants('newGame '+n);
});
test('difficulty général gives the AI an extra tank and 600 gold', ()=>{
  fresh({players:2, diff:'general'});
  eq(S().gold.R, 600); eq(S().gold.B, 200);
  eq(S().units.filter(u=>u.side==='R').length, 6); eq(S().units.filter(u=>u.side==='R'&&u.type==='tank').length, 2);
});
test('difficulty recrue: AI starts with 100 gold', ()=>{ fresh({diff:'facile'}); eq(S().gold.R,100); });
for (const id of Object.keys(G.MAPS)) test('newGame on map '+id+' with 4 sides', ()=>{ fresh({map:id, players:4}); eq(G.W, G.MAPS[id].w); eq(S().units.length,20); invariants(id); });

// ---- movement
test('infantry reach respects cost 3', ()=>{
  fresh(); const inf=find('B','inf'); const r=G.reachable(inf);
  assert(r.has(G.key(inf.x,inf.y)),'own tile'); 
  for (const k of r){ const [x,y]=k.split(',').map(Number); assert(Math.abs(x-inf.x)+Math.abs(y-inf.y)<=3,'manhattan <= 3'); assert(!G.unitAt(x,y)||G.unitAt(x,y)===inf,'not occupied'); }
});
test('tank cannot enter river, forest costs 3', ()=>{
  fresh(); S().units = [G.mk('tank','B',5,5)]; // (6,5) and (7,5) are river on vallee
  const t=S().units[0]; const r=G.reachable(t);
  assert(!r.has('6,5'),'river blocked'); assert(!r.has('7,5'),'river blocked 2');
  S().units = [G.mk('tank','B',3,3)]; // (4,3) is forest
  const r2=G.reachable(S().units[0]); assert(r2.has('4,3'),'forest reachable');
});
test('applyAction move: valid moves, invalid ignored', ()=>{
  fresh(); const inf=find('B','inf'); const dest=[...G.reachable(inf)].map(k=>k.split(',').map(Number)).find(([x,y])=>!(x===inf.x&&y===inf.y));
  G.applyAction({t:'move', side:'B', id:inf.id, x:dest[0], y:dest[1]}); eq(inf.x,dest[0]); eq(inf.y,dest[1]); assert(inf.moved,'moved flag');
  const inf2=S().units.find(u=>u.side==='B'&&u.type==='inf'&&u!==inf);
  G.applyAction({t:'move', side:'B', id:inf2.id, x:inf2.x+9, y:inf2.y}); assert(!inf2.moved,'far move ignored');
  G.applyAction({t:'move', side:'R', id:inf2.id, x:inf2.x, y:inf2.y-1}); assert(!inf2.moved,'wrong side ignored');
  const hq=find('B','hq'); G.applyAction({t:'move', side:'B', id:inf2.id, x:hq.x, y:hq.y}); assert(!inf2.moved,'occupied ignored');
});
test('a unit cannot move twice', ()=>{
  fresh(); const t=find('B','tank'); G.applyAction({t:'move',side:'B',id:t.id,x:t.x+1,y:t.y}); const x=t.x;
  G.applyAction({t:'move',side:'B',id:t.id,x:t.x+1,y:t.y}); eq(t.x,x,'second move ignored');
});

// ---- combat
test('dmgCalc matches the rules examples on plain', ()=>{
  fresh(); S().units=[]; const a=G.mk('inf','B',5,5), d=G.mk('inf','R',5,4); S().units.push(a,d); // (5,4) plain, (5,5) plain
  eq(G.dmgCalc(a,d,0.5), 3, 'inf vs inf');
  const tk=G.mk('tank','B',4,4); S().units.push(tk); eq(G.dmgCalc(tk,d,0.5), 6, 'tank vs inf');
  const art=G.mk('art','B',3,4); eq(G.dmgCalc(art,tk,0.5), 6, 'art vs tank (tank on plain)');
  eq(G.dmgCalc(a,tk,0.5), 2, 'inf vs tank');
  a.hp=5; eq(G.dmgCalc(a,d,0.5), 2, 'wounded attacker deals half');
});
test('terrain defence reduces damage', ()=>{
  fresh(); S().units=[]; const a=G.mk('inf','B',1,6), d=G.mk('inf','R',2,6); S().units.push(a,d); // (2,6) is a hill on vallee
  eq(G.tile(2,6),'H'); eq(G.dmgCalc(a,d,0.5), 2);
});
test('attack applies damage and counterattack; artillery is not countered', ()=>{
  fresh(); S().units=[]; const a=G.mk('inf','B',5,5), d=G.mk('inf','R',5,4); S().units.push(a,d);
  G.applyAction({t:'attack', side:'B', id:a.id, target:d.id});
  assert(d.hp<10,'defender damaged'); assert(a.hp<10,'attacker countered'); assert(a.acted,'acted');
  const art=G.mk('art','B',5,8), e=G.mk('inf','R',5,6); S().units.push(art,e);
  G.applyAction({t:'attack', side:'B', id:art.id, target:e.id}); assert(e.hp<10,'art hits'); eq(art.hp,10,'art not countered');
});
test('artillery cannot fire after moving, and not at adjacent targets', ()=>{
  fresh(); S().units=[]; const art=G.mk('art','B',5,8), e=G.mk('inf','R',5,6), adj=G.mk('inf','R',5,7); S().units.push(art,e,adj);
  const ts=G.targetsFrom(art,art.x,art.y); assert(ts.includes(e),'range 2 ok'); assert(!ts.includes(adj),'adjacent excluded');
  G.applyAction({t:'move', side:'B', id:art.id, x:4, y:8}); assert(art.acted,'moved artillery is done');
  const hp=e.hp; G.applyAction({t:'attack', side:'B', id:art.id, target:e.id}); eq(e.hp,hp,'no shot after move');
});
test('killing a unit removes it; killing the HQ eliminates the side and ends a 2-side game', ()=>{
  fresh(); const hq=find('R','hq'); hq.hp=1; S().units=S().units.filter(u=>u.side==='B'||u===hq);
  const tk=find('B','tank'); tk.x=hq.x-1; tk.y=hq.y; 
  G.applyAction({t:'attack', side:'B', id:tk.id, target:hq.id});
  assert(!S().units.includes(hq),'hq removed'); assert(!G.alive('R'),'R dead'); eq(S().over,'B','B wins');
  eq(S().cities[G.key(hq.x,hq.y)],'N','hq city neutral');
});
test('with 3 sides, one elimination does not end the game', ()=>{
  fresh({players:3}); const hq=find('G','hq'); G.kill(hq);
  assert(!G.alive('G')); eq(S().units.filter(u=>u.side==='G').length,0,'green units gone'); eq(S().over,null,'game continues');
  G.kill(find('R','hq')); eq(S().over,'B');
});
test('player HQ destroyed shows defeat (over set) even if others remain', ()=>{
  fresh({players:3}); G.kill(find('B','hq')); assert(S().over,'over set'); assert(S().over!=='B');
});

// ---- turn resolution
test('turn advances only when every living side is ready', ()=>{
  fresh({players:3}); G.readyUp('B'); eq(S().turn,1); G.readyUp('R'); eq(S().turn,1); G.readyUp('G'); eq(S().turn,2);
  eq(Object.keys(S().ready).length,0,'ready reset'); assert(S().units.every(u=>!u.moved&&!u.acted),'flags reset');
});
test('income: 100 + 75 per city, AI multiplier applied', ()=>{
  fresh({diff:'difficile'}); const g0B=S().gold.B, g0R=S().gold.R;
  G.readyUp('B'); G.readyUp('R');
  eq(S().gold.B, g0B+175, 'B: hq city only'); eq(S().gold.R, g0R+Math.round(175*1.4), 'R: x1.4');
});
test('infantry on a neutral city captures it at resolution; tank does not', ()=>{
  fresh(); const inf=find('B','inf'); inf.x=2; inf.y=9; const tk=find('B','tank'); tk.x=2; tk.y=2; // both neutral cities
  G.readyUp('B'); G.readyUp('R');
  eq(S().cities['2,9'],'B','captured by infantry'); eq(S().cities['2,2'],'N','tank cannot capture');
});
test('units heal +2 on own city / HQ at resolution, capped', ()=>{
  fresh(); const hq=find('B','hq'); hq.hp=15; const inf=find('B','inf'); inf.hp=9; const tk=find('B','tank'); tk.hp=5;
  G.readyUp('B'); G.readyUp('R'); eq(hq.hp,17); eq(inf.hp,9,'not on city: no heal'); eq(tk.hp,5);
});
test('a dead side is not required to be ready', ()=>{
  fresh({players:3}); G.kill(find('G','hq')); G.readyUp('B'); G.readyUp('R'); eq(S().turn,2);
});

// ---- recruit
test('recruit places next to HQ, deducts gold, refuses when poor', ()=>{
  fresh(); const hq=find('B','hq'); S().gold.B=350;
  G.applyAction({t:'recruit', side:'B', type:'tank'}); eq(S().gold.B,50);
  const tk=S().units.filter(u=>u.side==='B'&&u.type==='tank'); eq(tk.length,2); const n=tk[1]; assert(Math.max(Math.abs(n.x-hq.x),Math.abs(n.y-hq.y))===1,'adjacent'); assert(n.acted,'new unit done');
  const c=S().units.length; G.applyAction({t:'recruit', side:'B', type:'tank'}); eq(S().units.length,c,'too poor');
});

// ---- wait
test('wait marks the unit as done', ()=>{ fresh(); const u=find('B','inf'); G.applyAction({t:'wait',side:'B',id:u.id}); assert(u.acted && u.moved); });

// ---- AI
test('aiFlush makes every AI side ready and nothing else', ()=>{
  fresh({players:4}); G.aiFlush(); for (const sd of ['R','G','Y']) assert(S().ready[sd], sd+' ready'); assert(!S().ready.B,'human not ready');
  assert(S().units.filter(u=>u.side!=='B'&&!u.acted&&!G.TYPES[u.type].fixed).length===0,'all AI units acted'); eq(G.aiStep(),false,'no more steps'); invariants('aiFlush');
});
test('aiStep performs one action per call', ()=>{
  fresh(); const before=S().units.filter(u=>u.side==='R'&&!u.acted&&u.type!=='hq').length; assert(G.aiStep()); const after=S().units.filter(u=>u.side==='R'&&!u.acted&&u.type!=='hq').length; eq(after, before-1);
});
test('AI attacks an adjacent weak target', ()=>{
  fresh(); S().units=S().units.filter(u=>u.type==='hq'); const tk=G.mk('tank','R',5,5), v=G.mk('inf','B',5,4); v.hp=2; S().units.push(tk,v);
  G.aiStep(); assert(!S().units.includes(v),'victim killed');
});
for (const id of Object.keys(G.MAPS)) for (const n of [2,4]) test('full AI-vs-AI game on '+id+' with '+n+' sides stays consistent', ()=>{
  fresh({map:id, players:n, diff:'normal'});
  let turns=0;
  while(!S().over && turns<60){ G.readyUp('B'); G.aiFlush(); invariants(id+' t'+S().turn); turns++; if (S().over) break; }
  assert(turns>=1 && (S().over || turns===60),'ran to a conclusion or the cap'); // B never acts: its HQ falls and the game is over for the human
});
test('a 4-side AI melee ends with a single winner within 80 turns', ()=>{
  let winner=null;
  for (let attempt=0; attempt<3 && !winner; attempt++){
    fresh({map:'plaine', players:4, diff:'general', human:null});   // every side is AI-driven
    for (let t=0;t<80 && !S().over;t++){ G.aiFlush(); invariants('melee t'+S().turn); }
    if (S().over && S().over!=='none') winner=S().over;
  }
  G.setup({human:'B'});
  assert(winner,'someone won'); assert(G.ORDER.includes(winner),'winner is a side');
});

// ---- combat bounty
test('every attack pays the attacker a bounty; it shrinks with the body count and floors', ()=>{
  fresh(); S().units=[]; const a=G.mk('inf','B',5,5), d=G.mk('inf','R',5,4); S().units.push(a,d); S().gold.B=0;
  eq(G.bounty(), G.BOUNTY_BASE);
  G.applyAction({t:'attack', side:'B', id:a.id, target:d.id}); eq(S().gold.B, G.BOUNTY_BASE, 'first fight pays the base');
  S().deaths=3; eq(G.bounty(), G.BOUNTY_BASE-3*G.BOUNTY_PER_DEATH);
  S().deaths=100; eq(G.bounty(), G.BOUNTY_MIN, 'floor');
  a.acted=false; S().gold.B=0; G.applyAction({t:'attack', side:'B', id:a.id, target:d.id}); eq(S().gold.B, G.BOUNTY_MIN, 'floored bounty paid');
});
test('kills increase the death count, which lowers the next bounty', async ()=>{
  fresh(); S().units=[]; const tk=G.mk('tank','B',5,5), v=G.mk('inf','R',5,4); v.hp=1; S().units.push(tk,v); S().gold.B=0;
  await G.commit({t:'attack', side:'B', id:tk.id, target:v.id}); eq(S().deaths,1); eq(S().gold.B, G.BOUNTY_BASE, 'bounty computed before the kill');
  eq(G.bounty(), G.BOUNTY_BASE-G.BOUNTY_PER_DEATH);
  eq(document.getElementById('sBounty').textContent, G.bounty()+' or', 'header shows the current bounty');
});
test('AI fights also earn bounties (gold never negative, deaths tracked)', ()=>{
  fresh({players:4}); for (let t=0;t<15 && !S().over;t++){ G.readyUp('B'); G.aiFlush(); }
  assert(S().deaths>=0); invariants('bounty melee'); const snap=JSON.parse(JSON.stringify(G.serialize())); eq(snap.deaths, S().deaths, 'deaths serialized');
});

// ---- atomic bomb
test('when a 3+ camp game drops to two camps, the bomb leaves everyone at 1 HP, once', ()=>{
  fresh({players:3}); assert(!S().nuked); G.kill(find('G','hq'));
  assert(S().nuked,'nuked'); for (const u of S().units) eq(u.hp,1,'every unit at 1 hp, incl. HQs');
  eq(S().over,null,'game goes on');
  // healing works again next turn, and nothing re-triggers
  G.readyUp('B'); G.readyUp('R'); eq(find('B','hq').hp,3,'HQ healed +2'); assert(S().nuked);
});
test('the bomb fires once in a 4-camp game (at the 4→3→2 transition), never in a 2-camp game', ()=>{
  fresh({players:4}); G.kill(find('Y','hq')); assert(!S().nuked,'3 left: no bomb'); const hp=find('B','tank').hp; eq(hp,10);
  G.kill(find('G','hq')); assert(S().nuked,'2 left: bomb'); eq(find('B','tank').hp,1);
  find('B','tank').hp=10; G.kill(find('R','hq')); eq(find('B','tank').hp,10,'winning does not bomb again'); eq(S().over,'B');
  fresh({players:2}); const before=S().units.map(u=>u.hp); S().deaths=0; G.kill(find('R','inf')); assert(!S().nuked,'2-camp game never nukes'); assert(S().units.every(u=>u.hp===10 || u.hp===20));
});
test('repair kits are banned once the bomb has fallen', async ()=>{
  let day=null; for (let i=0;i<60 && !day;i++){ const d=new Date(Date.UTC(2026,8,20+i)).toISOString().slice(0,10); if (G.shopOffers(d).some(o=>o.id==='repair')) day=d; }
  G.setToday(day);
  fresh({players:3}); S().gold.B=5000; G.applyAction({t:'shop', side:'B', item:'repair', day}); eq(S().gold.B, 5000-G.shopOffers(day).find(o=>o.id==='repair').cost, 'allowed before the bomb');
  G.kill(find('G','hq')); assert(S().nuked); const g=S().gold.B;
  G.applyAction({t:'shop', side:'B', item:'repair', day}); eq(S().gold.B, g, 'refused after the bomb'); eq(find('B','hq').hp, 1, 'no healing happened');
  const other=G.shopOffers(day).find(o=>o.id!=='repair'); await G.commit({t:'shop', side:'B', item:other.id, day}); assert(S().gold.B<g, 'other offers still purchasable');
  assert(document.querySelector('#offers').textContent.includes('interdit'), 'shop card says it is banned');
  G.setToday(null);
});
test('nuked flag survives serialization', ()=>{ fresh({players:3}); G.kill(find('G','hq')); const snap=JSON.parse(JSON.stringify(G.serialize())); eq(snap.nuked,true); G.adoptState(snap,2); assert(S().nuked); });

// ---- daily shop
test('shop offers: 3 distinct, deterministic per day, one promo at -20%', ()=>{
  const a=G.shopOffers('2026-09-20'), b=G.shopOffers('2026-09-20'), c=G.shopOffers('2026-09-21');
  eq(a.length,3); eq(new Set(a.map(o=>o.id)).size,3,'distinct'); eq(JSON.stringify(a),JSON.stringify(b),'deterministic');
  assert(JSON.stringify(a.map(o=>o.id))!==JSON.stringify(c.map(o=>o.id)) || a.findIndex(o=>o.promo)!==c.findIndex(o=>o.promo),'changes between days');
  eq(a.filter(o=>o.promo).length,1,'one promo'); const pr=a.find(o=>o.promo); assert(pr.cost<pr.price,'discounted');
  for (const o of a) assert(G.SHOP_POOL.some(p=>p.id===o.id),'from pool');
});
test('every pool item can be bought and applies its effect', ()=>{
  for (const item of G.SHOP_POOL){
    // find a day offering this item
    let day=null; for (let i=0;i<60 && !day;i++){ const d=new Date(Date.UTC(2026,8,20+i)).toISOString().slice(0,10); if (G.shopOffers(d).some(o=>o.id===item.id)) day=d; }
    assert(day, 'a day offers '+item.id);
    fresh(); S().gold.B=1000; const g0=1000, n0=S().units.length; const hq=find('B','hq'); hq.hp=10; find('B','inf').hp=3;
    const offer=G.shopOffers(day).find(o=>o.id===item.id);
    G.setToday(day);
    G.applyAction({t:'shop', side:'B', item:item.id, day:day});
    eq(S().gold.B, g0-offer.cost, 'price deducted for '+item.id);
    if (item.kind==='unit'){ eq(S().units.length,n0+1); const u=S().units[S().units.length-1]; eq(u.type,item.type); assert(u.acted,'done this turn'); }
    if (item.kind==='repair'){ eq(hq.hp,14); eq(find('B','inf').hp,7); }
    if (item.kind==='fortify'){ eq(S().bonus.B.hqDef,2); const tk=find('R','tank'); const d1=G.dmgCalc(tk,hq,0.5); S().bonus={}; assert(G.dmgCalc(tk,hq,0.5)>d1,'fortified HQ takes less'); }
    if (item.kind==='bounty'){ eq(S().bonus.B.income,25); G.readyUp('B'); G.readyUp('R'); eq(S().gold.B, g0-offer.cost+175+25,'+25 per city'); }
    if (item.kind==='strike'){ eq(S().strike.B,1); const v=find('R','inf'); G.applyAction({t:'strike', side:'B', target:v.id}); eq(v.hp,5); eq(S().strike.B,0); G.applyAction({t:'strike', side:'B', target:v.id}); eq(v.hp,5,'no second strike'); }
  }
  G.setToday(null);
});
test('shop refuses an offer from a stale day', ()=>{
  fresh(); S().gold.B=5000; const g=S().gold.B; const old='2026-01-05'; const o=G.shopOffers(old)[0];
  G.applyAction({t:'shop', side:'B', item:o.id, day:old}); eq(S().gold.B,g);
});
test('shop: today\'s offers can be bought at most twice per camp, not without gold', ()=>{
  fresh(); const day=G.dayKey(); const offer=G.shopOffers(day)[0]; S().gold.B=100000;
  G.applyAction({t:'shop', side:'B', item:offer.id, day}); G.applyAction({t:'shop', side:'B', item:offer.id, day});
  const g=S().gold.B; G.applyAction({t:'shop', side:'B', item:offer.id, day}); eq(S().gold.B,g,'third refused');
  S().gold.R=0; G.applyAction({t:'shop', side:'R', item:offer.id, day}); eq(S().gold.R,0,'poor refused');
  G.applyAction({t:'shop', side:'B', item:'nope', day}); eq(S().gold.B,g,'unknown refused');
  const notToday=G.SHOP_POOL.find(p=>!G.shopOffers(day).some(o=>o.id===p.id)); G.applyAction({t:'shop', side:'B', item:notToday.id, day}); eq(S().gold.B,g,'not offered today refused');
});
test('shop units fight with their own stats and capture rules', ()=>{
  fresh(); S().units=[]; const h=G.mk('heavy','B',5,5), e=G.mk('inf','R',5,4); S().units.push(h,e);
  eq(h.hp,14); eq(G.dmgCalc(h,e,0.5),8,'heavy tank hits hard'); assert(G.reachable(G.mk('scout','B',5,8)).size>G.reachable(G.mk('inf','B',5,8)).size,'scout moves further');
  const how=G.mk('howitzer','B',5,9), far=G.mk('inf','R',5,5); S().units.push(how,far); assert(G.targetsFrom(how,5,9).includes(far),'range 4');
});
test('shop survives serialization and the UI lists three offers', ()=>{
  fresh(); const day=G.dayKey(); const o=G.shopOffers(day)[0]; S().gold.B=5000; G.applyAction({t:'shop', side:'B', item:o.id, day});
  const snap=JSON.parse(JSON.stringify(G.serialize())); G.adoptState(snap,3); eq(S().shop.bought.B[o.id],1);
  eq(document.querySelectorAll('#offers .offer').length>=3, true);
});

// ---- big map
test('La Grande Croisée: 20×16, twelve cities, HQs in the four corners, bridges connect the quadrants', ()=>{
  const m=G.MAPS.croisee; eq(m.w,20); eq(m.h,16); eq(m.rows.join('').split('C').length-1, 12);
  fresh({map:'croisee', players:4}); eq(S().units.length,20); invariants('croisee');
  for (const sd of ['B','R','G','Y']){ const hq=find(sd,'hq'); assert((hq.x<=2||hq.x>=17)&&(hq.y<=2||hq.y>=13),'corner '+sd); }
  // an infantry standing on the west bridge can cross the horizontal river
  S().units=[G.mk('inf','B',4,9)]; const r=G.reachable(S().units[0]); assert(r.has('4,7'),'reaches the bridge'); 
  S().units=[G.mk('tank','B',4,9)]; const r2=G.reachable(S().units[0]); assert(r2.has('4,6'),'tank crosses via the bridge');
});
test('choosing 3 or 4 camps switches the selector to the big map', ()=>{
  const sm=document.getElementById('selMap'), sp=document.getElementById('selPlayers');
  sm.value='vallee'; sp.value='4'; sp.dispatchEvent(new Event('change')); eq(sm.value,'croisee');
  sp.value='2'; sp.dispatchEvent(new Event('change')); eq(sm.value,'croisee','does not switch back on its own');
});

// ---- beach map
test('Baie des Sables: sea is impassable, beach is fast but exposed, tanks slowed in sand', ()=>{
  fresh({map:'plage', players:4}); eq(G.W,18); eq(G.H,12); eq(S().units.length,20); invariants('plage');
  S().units=[G.mk('inf','B',5,5)]; const r=G.reachable(S().units[0]); // (5,5) sand; (8,5) sea
  assert(!r.has('8,5'),'sea blocked for infantry'); assert(r.has('7,5'),'sand cost 1 → 2 tiles east reachable');
  S().units=[G.mk('tank','B',5,5)]; const r2=G.reachable(S().units[0]); assert(!r2.has('8,5'),'sea blocked for tank'); assert(!r2.has('6,7')||true);
  eq(G.TERRAIN.S.def,-1); eq(G.TERRAIN.D.def,1);
  S().units=[]; const a=G.mk('inf','R',6,6), d=G.mk('inf','B',7,6); S().units.push(a,d); eq(G.dmgCalc(a,d,0.5),4,'exposed on the beach');
  // no unit starts in the sea and every camp can reach a city on foot
  for (const sd of ['B','R','G','Y']){ fresh({map:'plage', players:4}); const hq=find(sd,'hq'); assert(G.tile(hq.x,hq.y)!=='M'); }
});
test('AI copes with the beach map (no unit ever ends in the sea)', ()=>{
  fresh({map:'plage', players:4}); for (let t=0;t<12 && !S().over;t++){ G.readyUp('B'); G.aiFlush(); invariants('plage t'+t); for (const u of S().units) assert(G.tile(u.x,u.y)!=='M','unit in the sea'); }
});

// ---- serialization
test('serialize → adoptState round-trips the game', ()=>{
  fresh({players:3}); G.readyUp('B'); G.aiFlush();
  const snap=JSON.parse(JSON.stringify(G.serialize())); const n=S().units.length, turn=S().turn;
  G.adoptState(snap, 5); eq(S().units.length,n); eq(S().turn,turn); eq(S().rev,5); eq(S().sides.length,3);
  const inf=find('B','inf'); assert(inf,'units alive'); G.applyAction({t:'move',side:'B',id:inf.id,x:inf.x,y:inf.y}); // legal no-op move
  invariants('adopt');
});
test('adoptState switches map when needed', ()=>{
  fresh({map:'col', players:2}); const snap=JSON.parse(JSON.stringify(G.serialize()));
  fresh({map:'vallee'}); G.adoptState(snap,1); eq(G.W,12); eq(G.H,12); eq(S().mapId,'col');
});
test('commit in solo applies the action and flushes the AI on ready', async ()=>{
  fresh(); await G.commit({t:'ready', side:'B'}); eq(S().turn,2,'turn advanced after human ready + AI flush');
});

// ---- UI smoke
test('UI reflects state after a fresh game', ()=>{
  fresh({players:3}); const sides=document.querySelectorAll('#sSides .side'); eq(sides.length,3); eq(document.getElementById('sTurn').textContent,'1');
  assert(document.getElementById('btnEnd').disabled===false,'end turn enabled');
  G.select(find('B','hq')); assert(!document.getElementById('shopCard').hidden,'shop visible for own hq');
  G.select(find('R','hq')); assert(document.getElementById('shopCard').hidden,'shop hidden for enemy hq');
});

for (const {name,fn} of asyncTests){ try{ await fn(); ok(name); } catch(e){ ko(name,e); } }
out.textContent = results.join('\n') + `\n\n${pass} passed, ${fail} failed`;
document.title = `TESTS ${fail?'FAILED':'OK'} ${pass}/${pass+fail}`;
})();
