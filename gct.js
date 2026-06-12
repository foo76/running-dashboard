import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const sb=createClient('https://krgbagjignvbnrgybdos.supabase.co','sb_publishable_qNga415U3UwHSNF1DF5RiQ_5MzhIFFq');
const M={top:20,right:165,bottom:50,left:100},MAXDEV=3,MAXBARS=20,tip=d3.select('#tooltip');

async function fetchGCT(days){
  let q=sb.from('gct_balance_view').select('run_date,activity_name,distance_m,gct_left_pct').order('run_date',{ascending:true});
  if(days!=='all') q=q.gte('run_date',new Date(Date.now()-days*86400000).toISOString().slice(0,10));
  const {data,error}=await q;
  if(error){console.error(error);return[];}
  return data;
}

function toBuckets(data,n){
  if(!data.length) return[];
  const times=data.map(d=>new Date(d.run_date).getTime());
  const tMin=Math.min(...times),tMax=Math.max(...times);
  const span=tMax-tMin||1;
  const buckets=Array.from({length:n},(_,i)=>({devs:[],runs:0,km:0,tStart:new Date(tMin+i*span/n),tEnd:new Date(tMin+(i+1)*span/n)}));
  data.forEach(d=>{
    const t=new Date(d.run_date).getTime();
    const i=Math.min(n-1,Math.floor((t-tMin)/span*n));
    buckets[i].devs.push(+d.gct_left_pct-50);
    buckets[i].runs++;
    buckets[i].km+=d.distance_m/1000;
  });
  return buckets.filter(b=>b.runs>0).map(b=>{
    const fmt=o=>new Date(o).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'});
    const fmtShort=o=>new Date(o).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    b.label=fmtShort(b.tStart)+' - '+fmt(b.tEnd);
    b.shortLabel=fmtShort(b.tStart);
    b.dev=d3.median(b.devs);
    b.left=(50+b.dev).toFixed(1);
    b.right=(50-b.dev).toFixed(1);
    b.km=b.km.toFixed(0);
    b.bucketDays=Math.round((b.tEnd-b.tStart)/(1000*60*60*24));
    return b;
  });
}

function linReg(data){
  const n=data.length,xm=(n-1)/2,ym=d3.mean(data,d=>d.dev);
  const num=d3.sum(data,(d,i)=>(i-xm)*(d.dev-ym));
  const den=d3.sum(data,(_,i)=>(i-xm)**2);
  const s=den===0?0:num/den;
  return{slope:s,intercept:ym-s*xm};
}

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

function mkAxes(g,x,y,innerH){
  g.append('g').call(d3.axisLeft(y))
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

async function draw(days){
  const raw=await fetchGCT(days);
  if(!raw.length){d3.select('#chart').html('<p style="color:#64748b">No data found.</p>');return;}
  const isAll=days==='all';
  const buckets=toBuckets(raw,MAXBARS);
  if(!buckets.length){d3.select('#chart').html('<p style="color:#64748b">No data found.</p>');return;}
  const svgW=Math.min(820,window.innerWidth-40),innerW=svgW-M.left-M.right,innerH=buckets.length*34;
  const {svg,g,x,height}=mkSvg(innerW,innerH);
  const y=d3.scaleBand().domain(buckets.map(d=>d.shortLabel)).range([0,innerH]).padding(0.2);
  mkAxes(g,x,y,innerH);
  mkLegend(g,innerW,isAll
    ?[{c:'#3b82f6',t:'rect',label:'Left dominant'},{c:'#f97316',t:'rect',label:'Right dominant'},{c:'#a78bfa',t:'line',label:'Smoothed avg'}]
    :[{c:'#3b82f6',t:'rect',label:'Left dominant'},{c:'#f97316',t:'rect',label:'Right dominant'},{c:'#94a3b8',t:'dash',label:'Rolling avg'},{c:'#facc15',t:'line',label:'Trend line'}]);
  g.selectAll('.bar').data(buckets).join('rect')
    .attr('class','bar').attr('x',d=>d.dev<0?x(d.dev):x(0)).attr('y',d=>y(d.shortLabel))
    .attr('width',d=>Math.abs(x(d.dev)-x(0))).attr('height',y.bandwidth()).attr('rx',3)
    .attr('fill',d=>d.dev<0?'#f97316':'#3b82f6').attr('opacity',0.85)
    .on('mousemove',(event,d)=>{
      tip.style('opacity',1).style('left',(event.pageX+14)+'px').style('top',(event.pageY-40)+'px')
        .html('<strong>'+d.label+'</strong><br>Runs: <strong>'+d.runs+'</strong> &nbsp; Distance: <strong>'+d.km+' km</strong><br>Left: <strong>'+d.left+'%</strong> &nbsp; Right: <strong>'+d.right+'%</strong><br>Median dev: <strong>'+(d.dev>0?'+':'')+d.dev.toFixed(2)+'%</strong>');
    }).on('mouseleave',()=>tip.style('opacity',0));
  const smooth=buckets.map((d,i)=>{const sl=buckets.slice(Math.max(0,i-1),i+2);return{label:d.shortLabel,avg:d3.mean(sl,s=>s.dev)};});
  g.append('path').datum(smooth)
    .attr('d',d3.line().x(d=>x(d.avg)).y(d=>y(d.label)+y.bandwidth()/2).curve(d3.curveCatmullRom).defined(d=>d.avg!=null))
    .attr('fill','none').attr('stroke',isAll?'#a78bfa':'#94a3b8').attr('stroke-width',isAll?2.5:1.5).attr('stroke-dasharray',isAll?null:'4 3').attr('opacity',0.7);
  if(!isAll){
    const {slope,intercept}=linReg(buckets);
    const ts=intercept,te=slope*(buckets.length-1)+intercept;
    const fy=y(buckets[0].shortLabel)+y.bandwidth()/2,ly=y(buckets[buckets.length-1].shortLabel)+y.bandwidth()/2;
    g.append('line').attr('x1',x(ts)).attr('y1',fy).attr('x2',x(te)).attr('y2',ly).attr('stroke','#facc15').attr('stroke-width',2).attr('stroke-linecap','round');
    const ang=Math.atan2(ly-fy,x(te)-x(ts))*180/Math.PI;
    g.append('polygon').attr('points','0,-4 8,0 0,4').attr('fill','#facc15').attr('transform','translate('+x(te)+','+ly+') rotate('+ang+')');
  }
  const drift=buckets[buckets.length-1].dev-buckets[0].dev;
  const dir=Math.abs(drift)<0.05?'Stable':drift>0?'Shifting left (+'+drift.toFixed(2)+'%)':'Shifting right ('+drift.toFixed(2)+'%)';
  const tc=Math.abs(drift)<0.05?'#64748b':drift>0?'#3b82f6':'#f97316';
  svg.append('text').attr('x',M.left).attr('y',height-8).attr('fill',tc).style('font-size','0.75rem').style('font-weight','500')
    .text((isAll?'All-time trend: ':'Trend: ')+dir+' · '+buckets.length+' bars · ~'+buckets[0].bucketDays+' days/bar');
}

document.querySelectorAll('.period-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    draw(btn.dataset.days);
  });
});

draw('30');
