import {buildDecisionMap,projectPoint} from './decision-map-core.mjs';
const ns='http://www.w3.org/2000/svg';
const tones={evidence:'#a6dda7',entry:'#e1c98b',stop:'#d59c9c',target:'#9bc9df',blocked:'#89999d'};
const $=id=>document.getElementById(id);

export function createDecisionMap(){
  let model=buildDecisionMap(null),selected='entry',flat=false,code=false,yaw=.18,pitch=-.12,drag=null,suppressClick=false;
  const svg=$('decision-map'),choices=$('map-node-list');
  const add=(parent,tag,attrs={},text)=>{
    const el=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
    if(text!==undefined)el.textContent=text;parent.append(el);return el;
  };
  function detail(){
    const node=model.nodes.find(n=>n.id===selected);
    $('map-detail-title').textContent=node?.label||'Decision path';
    $('map-detail-text').textContent=node?.detail||model.summary;
    $('map-detail-code').textContent=node?.code||'Existing scanner → paper reference → outcome functions';
    for(const button of choices.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.node===selected));
    for(const group of svg.querySelectorAll('[data-node]'))group.setAttribute('opacity',group.dataset.node===selected?'1':'.8');
  }
  function select(id){selected=id;detail();}
  function draw(){
    svg.replaceChildren();
    const points=new Map(model.nodes.map(n=>[n.id,projectPoint(n.position,{yaw,pitch,flat})]));
    for(const [from,to] of model.edges){
      const a=points.get(from),b=points.get(to);if(!a||!b)continue;
      add(svg,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#547079','stroke-width':1.5});
    }
    const sorted=[...model.nodes].sort((a,b)=>points.get(b.id).depth-points.get(a.id).depth);
    for(const node of sorted){
      const p=points.get(node.id),g=add(svg,'g',{'data-node':node.id,transform:'translate('+p.x+' '+p.y+')',class:'map-node'});
      add(g,'title',{},node.label+' · '+node.value+' · '+node.code);
      add(g,'rect',{x:-76,y:-27,width:152,height:54,rx:10,fill:'#102c32',stroke:tones[node.tone],'stroke-width':1.6});
      const label=code?node.code.split(' · ')[1]:node.label;
      add(g,'text',{x:0,y:-6,'text-anchor':'middle',fill:'#e5eddf','font-size':code?10:12},label);
      const value=code?node.code.split(' · ')[0].split('/').at(-1):node.value;
      add(g,'text',{x:0,y:13,'text-anchor':'middle',fill:tones[node.tone],'font-size':value.length>25?8:10},value);
    }
    detail();
  }
  svg.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const id=event.target.closest('[data-node]')?.dataset.node;if(id)select(id);});
  svg.addEventListener('pointerdown',event=>{
    if(flat||event.button!==0)return;
    suppressClick=false;drag={x:event.clientX,y:event.clientY,yaw,pitch,moved:false,node:event.target.closest('[data-node]')?.dataset.node};svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove',event=>{
    if(!drag||!svg.hasPointerCapture(event.pointerId))return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)<5)return;
    drag.moved=true;yaw=Math.max(-.6,Math.min(.6,drag.yaw+dx*.003));pitch=Math.max(-.35,Math.min(.35,drag.pitch+dy*.003));draw();
  });
  svg.addEventListener('pointerup',()=>{if(drag&&!drag.moved&&drag.node)select(drag.node);suppressClick=!!drag;drag=null;});
  svg.addEventListener('pointercancel',()=>{drag=null;suppressClick=false;});
  const rotate=step=>{yaw=Math.max(-.6,Math.min(.6,yaw+step));draw();};
  svg.addEventListener('keydown',event=>{
    if(flat)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){
      event.preventDefault();
      if(event.key==='Home'){yaw=.18;pitch=-.12;}
      else if(event.key==='ArrowLeft')yaw=Math.max(-.6,yaw-.08);
      else if(event.key==='ArrowRight')yaw=Math.min(.6,yaw+.08);
      else pitch=Math.max(-.35,Math.min(.35,pitch+(event.key==='ArrowUp'?-.06:.06)));
      draw();
    }
  });
  $('map-left').addEventListener('click',()=>rotate(-.12));
  $('map-right').addEventListener('click',()=>rotate(.12));
  $('map-reset').addEventListener('click',()=>{yaw=.18;pitch=-.12;draw();});
  $('map-flat').addEventListener('click',()=>{
    flat=!flat;drag=null;suppressClick=false;$('map-flat').setAttribute('aria-pressed',String(flat));$('map-flat').textContent=flat?'Switch to 3D':'Flat view';
    for(const id of ['map-left','map-right','map-reset'])$(id).disabled=flat;
    svg.classList.toggle('map-flat-view',flat);draw();
  });
  $('map-code').addEventListener('click',()=>{code=!code;$('map-code').setAttribute('aria-pressed',String(code));draw();});
  return {
    update(scan,ticket){
      model=buildDecisionMap(scan,ticket);choices.replaceChildren();
      $('map-summary').textContent=model.summary;
      for(const node of model.nodes){
        const button=document.createElement('button');button.type='button';button.className='map-choice';
        button.dataset.node=node.id;button.textContent=node.label;button.addEventListener('click',()=>select(node.id));choices.append(button);
      }
      draw();return model;
    }
  };
}
