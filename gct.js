import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const sb=createClient('https://krgbagjignvbnrgybdos.supabase.co','sb_publishable_qNga415U3UwHSNF1DF5RiQ_5MzhIFFq');
const M={top:20,right:165,bottom:50,left:100},MAXDEV=3,tip=d3.select('#tooltip');

async function fetchGCT(days){
  let q=sb.from('gct_balance_view').select('run_date,activity_name,distance_m,gct_left_pct').order('run_date',{ascending:true});
  if(days!=='all') q=q.gte('run_date',new Date(Date.now()-days*86400000).toISOString().slice(0,10));
  const {data,error}=await q;
  if(error){console.error(error);return[];}
  return data;
}

function linReg(data){
  const n=data.length,xm=(n-1)/2,ym=d3.mean(data,d=>d.dev);
  const num=d3.sum(data,(d,i)=>(i-xm)*(d.dev-ym));
  const den=d3.sum(data,(_,i)=>(i-xm)**2);
  const s=den===0?0:num/den;
  return{slope:s,intercept:ym-s*xm};
}

function toQuarters(data){
  const b={};
  data.forEach(d=>{
    const dt=new Date(d.run_date),y=dt.getFullYear(),q=Math.floor(dt.getMonth()/3),k=y+'-'+q;
    if(!b[k]) b[k]={label:['Jan','Apr','Jul','Oct'][q]+' '+y,y,q,devs:[],runs:0,km:0};
    b[k].devs.push(d.dev); b[k].runs++; b[k].km+=d.dist_km;
  });
  return Object.values(b).sort((a,c)=>a.y!==c.y?a.y-c.y:a.q-c.q).map(b=>{
    b.dev=d3.median(b.devs);
    b.left=(50+b.dev).toFixed(1);
    b.right=(50-b.dev).toFixed(1);
    b.km=b.km.toFixed(0);
    return b;
  });
}


async function drawRuns(days){
  const raw=await fetchGCT(days);
  if(!raw.length){d3.select('#chart').html('<p style="color:#64748b">No data found.</p>');return;}
  const data=raw.map(d=>({date:new Date(d.run_date),name:d.activity_name||'Run',dist_km:(d.distance_m/1000).toFixed(1),left:+d.gct_left_pct,right:100-+d.gct_left_pct,dev:+d.gct_left_pct-50}));
  const svgW=Math.min(820,window.innerWidth-40),innerW=svgW-M.left-M.right,innerH=data.length*23;
  const {svg,g,x,height}=mkSvg(innerW,innerH);
  const y=d3.scaleBand().domain(data.map(d=>d.date.toISOString())).range([0,innerH]).padding(0.15);
  g.selectAll('.bar').data(data).join('rect')
    .attr('class','bar').attr('x',d=>d.dev<0?x(d.dev):x(0)).attr('y',d=>y(d.date.toISOString()))
    .attr('width',d=>Math.abs(x(d.dev)-x(0))).attr('height',y.bandwidth()).attr('rx',3)
    .attr('fill',d=>d.dev<0?'#f97316':'#3b82f6').attr('opacity',0.85)
    .on('mousemove',(event,d)=>{
      tip.style('opacity',1).style('left',(event.pageX+14)+'px').style('top',(event.pageY-40)+'px')
        .html('<strong>'+d.name+'</strong><br>'+d.date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'<br>'+d.dist_km+' km<br>Left: <strong>'+d.left.toFixed(1)+'%</strong> Right: <strong>'+d.right.toFixed(1)+'%</strong><br>Dev: <strong>'+(d.dev>0?'+':'')+d.dev.toFixed(2)+'%</strong>');
    }).on('mouseleave',()=>tip.style('opacity',0));
  const roll=data.map((d,i)=>{const sl=data.slice(Math.max(0,i-6),i+1);return{date:d.date,avg:d3.mean(sl,s=>s.dev)};});
  g.append('path').datum(roll)
    .attr('d',d3.line().x(d=>x(d.avg)).y(d=>y(d.date.toISOString())+y.bandwidth()/2).curve(d3.curveMonotoneY).defined(d=>d.avg!=null))
    .attr('fill','none').attr('stroke','#94a3b8').attr('stroke-width',1.5).attr('stroke-dasharray','4 3').attr('opacity',0.6);
  const {slope,intercept}=linReg(data),ts=intercept,te=slope*(data.length-1)+intercept,drift=te-ts;
  const fy=y(data[0].date.toISOString())+y.bandwidth()/2,ly=y(data[data.length-1].date.toISOString())+y.bandwidth()/2;
  g.append('line').attr('x1',x(ts)).attr('y1',fy).attr('x2',x(te)).attr('y2',ly).attr('stroke','#facc15').attr('stroke-width',2).attr('stroke-linecap','round');
  const ang=Math.atan2(ly-fy,x(te)-x(ts))*180/Math.PI;
  g.append('polygon').attr('points','0,-4 8,0 0,4').attr('fill','#facc15').attr('transform','translate('+x(te)+','+ly+') rotate('+ang+')');
  mkAxes(g,x,y,innerH,iso=>new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
  mkLegend(g,innerW,[{c:'#3b82f6',t:'rect',label:'Left dominant'},{c:'#f97316',t:'rect',label:'Right dominant'},{c:'#94a3b8',t:'dash',label:'7-day avg'},{c:'#facc15',t:'line',label:'Trend line'}]);
  const dir=Math.abs(drift)<0.05?'Stable':drift>0?'Shifting left (+'+drift.toFixed(2)+'%)':'Shifting right ('+drift.toFixed(2)+'%)';
  svg.append('text').attr('x',M.left).attr('y',height-8).attr('fill',Math.abs(drift)<0.05?'#64748b':drift>0?'#3b82f6':'#f97316').style('font-size','0.75rem').style('font-weight','500').text('Trend: '+dir);
}

async function drawAll(){
  const raw=await fetchGCT('all');
  if(!raw.length){d3.select('#chart').html('<p style="color:#64748b">No data found.</p>');return;}
  const mapped=raw.map(d=>({run_date:d.run_date,dev:+d.gct_left_pct-50,dist_km:+(d.distance_m/1000)}));
  const quarters=toQuarters(mapped);
  const svgW=Math.min(820,window.innerWidth-40),innerW=svgW-M.left-M.right,innerH=quarters.length*34;
  const {svg,g,x,height}=mkSvg(innerW,innerH);
  const y=d3.scaleBand().domain(quarters.map(d=>d.label)).range([0,innerH]).padding(0.2);
  g.selectAll('.bar').data(quarters).join('rect')
    .attr('class','bar').attr('x',d=>d.dev<0?x(d.dev):x(0)).attr('y',d=>y(d.label))
    .attr('width',d=>Math.abs(x(d.dev)-x(0))).attr('height',y.bandwidth()).attr('rx',3)
    .attr('fill',d=>d.dev<0?'#f97316':'#3b82f6').attr('opacity',0.85)
    .on('mousemove',(event,d)=>{
      tip.style('opacity',1).style('left',(event.pageX+14)+'px').style('top',(event.pageY-40)+'px')
        .html('<strong>'+d.label+'</strong><br>Runs: '+d.runs+'<br>Distance: '+d.km+' km<br>Left: <strong>'+d.left+'%</strong> Right: <strong>'+d.right+'%</strong><br>Median dev: <strong>'+(d.dev>0?'+':'')+d.dev.toFixed(2)+'%</strong>');
    }).on('mouseleave',()=>tip.style('opacity',0));
  const smooth=quarters.map((d,i)=>{const sl=quarters.slice(Math.max(0,i-1),i+2);return{label:d.label,avg:d3.mean(sl,s=>s.dev)};});
  g.append('path').datum(smooth)
    .attr('d',d3.line().x(d=>x(d.avg)).y(d=>y(d.label)+y.bandwidth()/2).curve(d3.curveCatmullRom).defined(d=>d.avg!=null))
    .attr('fill','none').attr('stroke','#a78bfa').attr('stroke-width',2.5).attr('opacity',0.8);
  g.append('circle').attr('cx',x(smooth[0].avg)).attr('cy',y(smooth[0].label)+y.bandwidth()/2).attr('r',4).attr('fill','#a78bfa');
  g.append('circle').attr('cx',x(smooth[smooth.length-1].avg)).attr('cy',y(smooth[smooth.length-1].label)+y.bandwidth()/2).attr('r',4).attr('fill','#a78bfa');
  mkAxes(g,x,y,innerH,d=>d);
  mkLegend(g,innerW,[{c:'#3b82f6',t:'rect',label:'Left dominant'},{c:'#f97316',t:'rect',label:'Right dominant'},{c:'#a78bfa',t:'line',label:'Smoothed avg'}]);
  const drift=quarters[quarters.length-1].dev-quarters[0].dev;
  const dir=Math.abs(drift)<0.05?'Stable':drift>0?'Shifting left (+'+drift.toFixed(2)+'%)':'Shifting right ('+drift.toFixed(2)+'%)';
  svg.append('text').attr('x',M.left).attr('y',height-8).attr('fill',Math.abs(drift)<0.05?'#64748b':drift>0?'#3b82f6':'#f97316').style('font-size','0.75rem').style('font-weight','500').text('All-time trend: '+dir+' · '+quarters.length+' quarters');
}

function draw(days){
  if(days==='all') drawAll(); else drawRuns(+days);
}

document.querySelectorAll('.period-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    draw(btn.dataset.days);
  });
});

draw('30');
function mkSvg(innerW,innerH){
  const svgW=Math.min(820,window.innerWidth-40),height=innerH+M.top+M.bottom;
  d3.select('#chart').selectAll('*').remove();
  const svg=d3.select('#chart').append('svg').attr('width',svgW).attr('height',height).style('overflow','visible');
  const g=svg.append('g').attr('transform','translate('+M.left+','+M.top+')');
  const x=d3.scaleLinear().domain([-MAXDEV,MAXDEV]).range([0,innerW]).clamp(true);
  g.append('rect').attr('x',x(-0.5)).attr('width',x(0.5)-x(-0.5)).attr('height',innerH).attr('fill','#1e293b').attr('opacity',0.7);
  g.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',0).attr('y2',innerH).attr('stroke','#cbd5e1').attr('stroke-width',1.5);
  return{svg,g,x,height,svgW};
}

function mkAxes(g,x,y,innerH,fmt){
  g.append('g').call(d3.axisLeft(y).tickFormat(fmt))
    .call(a=>{a.select('.domain').remove();a.selectAll('line').attr('stroke','#334155');a.selectAll('text').attr('fill','#94a3b8').style('font-size','0.72rem');});
  g.append('g').attr('transform','translate(0,'+innerH+')')
    .call(d3.axisBottom(x).tickValues([-2,-1,-0.5,0,0.5,1,2]).tickFormat(d=>(50+d).toFixed(1)+'%'))
    .call(a=>{a.select('.domain').attr('stroke','#334155');a.selectAll('line').attr('stroke','#334155');a.selectAll('text').attr('fill','#94a3b8').style('font-size','0.72rem');});
}

function mkLegend(g,innerW,items){
  const lg=g.append('g').attr('transform','translate('+(innerW+16)+',10)');
  items.forEach((item,i)=>{
    const row=lg.append('g').attr('transform','translate(0,'+(i*22)+')');
    if(item.t==='rect') row.append('rect').attr('width',12).attr('height',12).attr('rx',2).attr('fill',item.c).attr('opacity',0.85);
    else if(item.t==='dash') row.append('line').attr('x1',0).attr('y1',6).attr('x2',12).attr('y2',6).attr('stroke',item.c).attr('stroke-width',1.5).attr('stroke-dasharray','4 3').attr('opacity',0.6);
    else row.append('line').attr('x1',0).attr('y1',6).attr('x2',12).attr('y2',6).attr('stroke',item.c).attr('stroke-width',2);
    row.append('text').attr('x',16).attr('y',10).attr('fill','#94a3b8').style('font-size','0.72rem').text(item.label);
  });
}
