'use strict';

/* === 사실 데이터: 로제타의 경유 순서와 연도를 한 곳에서 관리함 === */
const ROSETTA_EVENTS = Object.freeze([
  { date:'2004-03-02', year:'2004', name:'지구', kind:'earth', detail:'출발' },
  { date:'2005-03-04', year:'2005', name:'지구', kind:'earth', detail:'첫 번째 중력 도움' },
  { date:'2007-02-25', year:'2007', name:'화성', kind:'mars', detail:'화성 중력 도움' },
  { date:'2007-11-13', year:'2007', name:'지구', kind:'earth', detail:'두 번째 지구 통과' },
  { date:'2009-11-13', year:'2009', name:'지구', kind:'earth', detail:'세 번째 지구 통과' },
  { date:'2014-08-06', year:'2014', name:'혜성 67P', kind:'comet', detail:'도착' }
]);

/* === 물리 장면: v2의 중력 적분을 참고한 제한 2체 계산 === */
const FlybyModel = (() => {
  // 거리 10만 km, 시간 1만 s를 한 단위로 사용함. 화면에 수치는 표시하지 않음.
  // 행성은 큰 질량 근사로 일정 속도 이동. 태양 중력과 미세한 반작용은 생략함.
  const MU=12.6686534, DT=.004, RADIUS=.69911;

  /** 행성 이동 속도와 접근 조건을 정하여 무추진 중력 통과 계산. */
  function create(planetVy=1.3,{speed=2,impact=-6}={}) {
    let s={t:0,x:-14,y:impact,vx:speed,vy:planetVy,px:0,py:0};
    const states=[s],startDistance=Math.hypot(s.x,s.y);let closest=startDistance;
    /** 현재 행성 위치에서 뉴턴 중력 가속도 계산. */
    function acceleration(state) {
      const dx=state.x-state.px,dy=state.y-state.py,r=Math.hypot(dx,dy);
      if(r<=RADIUS) throw new Error('중력 개념도의 초기 조건에서 충돌 발생');
      const k=-MU/(r*r*r);return {x:k*dx,y:k*dy};
    }
    // 최대 100 단위 시간까지만 적분하여 종료 조건 누락을 감지함.
    for(let i=0;i<25000;i++) {
      const a=acceleration(s),n={t:s.t+DT,x:s.x+s.vx*DT+.5*a.x*DT*DT,y:s.y+s.vy*DT+.5*a.y*DT*DT,vx:s.vx,vy:s.vy,px:0,py:planetVy*(s.t+DT)};
      const b=acceleration(n);n.vx+=(a.x+b.x)*DT*.5;n.vy+=(a.y+b.y)*DT*.5;
      s=n;states.push(s);
      const r=Math.hypot(s.x-s.px,s.y-s.py);closest=Math.min(closest,r);
      const radial=(s.x-s.px)*s.vx+(s.y-s.py)*(s.vy-planetVy);
      if(radial>0 && r>=startDistance) return {states,duration:s.t,closest,planetVy};
    }
    throw new Error('중력 개념도의 이탈 조건에 도달하지 못함');
  }

  /** 고정 간격 계산 결과에서 현재 시간의 위치와 속도 보간. */
  function sample(flight,fraction) {
    const t=Math.max(0,Math.min(1,fraction))*flight.duration;
    const i=Math.min(flight.states.length-2,Math.floor(t/DT)),a=flight.states[i],b=flight.states[i+1],u=(t-a.t)/DT,result={};
    for(const key of Object.keys(a)) result[key]=a[key]+(b[key]-a[key])*u;
    return result;
  }
  return {create,sample,mu:MU,radius:RADIUS};
})();

/* === 발사 초기의 수직 운동. 장식 진동과 실제 상승 위치를 분리함 === */
const LaunchModel = (() => {
  // SI 단위 사용. 특정 발사체가 아닌 낮은 초기 추력비의 교육용 예시임.
  const DT=.02, TIME=55, R=6371000, GM=3.986004418e14, G0=9.80665;
  const INITIAL_MASS=300000, DRY_MASS=140000, ISP=290;
  const MAX_THRUST=1.04*INITIAL_MASS*G0;

  /** 점화 초기 추력을 올린 뒤 일정하게 유지함. */
  function thrust(time,mass) {return mass<=DRY_MASS?0:MAX_THRUST*(.78+.22*Math.min(time/4,1));}

  /** 순간 질량·중력·항력을 반영한 고도, 속도, 질량의 변화율. */
  function derivative(time,s,gravityFactor) {
    const force=thrust(time,s.m),gravity=gravityFactor*GM/(R+Math.max(0,s.h))**2;
    const drag=.5*1.225*Math.exp(-Math.max(0,s.h)/8500)*.35*10*s.v*Math.abs(s.v);
    const a=force/s.m-gravity-drag/s.m;
    return {h:s.v,v:s.h<=0&&s.v<=0&&a<0?0:a,m:-force/(ISP*G0)};
  }

  /** 중간 적분 상태 생성. */
  function shifted(s,k,dt) {return {h:s.h+k.h*dt,v:s.v+k.v*dt,m:s.m+k.m*dt};}

  /** 고정 시간 간격 RK4 적분. 발사대는 음의 고도 이동을 막음. */
  function create(gravityFactor=1) {
    let state={h:0,v:0,m:INITIAL_MASS};const states=[{...state,t:0}];
    for(let i=0;i<Math.round(TIME/DT);i++) {
      const t=i*DT,a=derivative(t,state,gravityFactor),b=derivative(t+DT/2,shifted(state,a,DT/2),gravityFactor);
      const c=derivative(t+DT/2,shifted(state,b,DT/2),gravityFactor),d=derivative(t+DT,shifted(state,c,DT),gravityFactor);
      state={h:Math.max(0,state.h+DT*(a.h+2*b.h+2*c.h+d.h)/6),v:Math.max(0,state.v+DT*(a.v+2*b.v+2*c.v+d.v)/6),m:state.m+DT*(a.m+2*b.m+2*c.m+d.m)/6};
      states.push({...state,t:(i+1)*DT});
    }
    return {states,duration:TIME,dt:DT};
  }

  /** 적분 결과를 표시 시각에 보간함. */
  function sample(model,fraction) {
    const position=Math.max(0,Math.min(1,fraction))*(model.states.length-1),i=Math.min(model.states.length-2,Math.floor(position)),u=position-i;
    const a=model.states[i],b=model.states[i+1];return {h:a.h+(b.h-a.h)*u,v:a.v+(b.v-a.v)*u,m:a.m+(b.m-a.m)*u,t:a.t+(b.t-a.t)*u};
  }
  return {create,sample,derivative,thrust,initialMass:INITIAL_MASS};
})();

(() => {
  /* === 10장 발표 상태. 한 단계만 재생한 뒤 결과를 유지함 === */
  const slides = [...document.querySelectorAll('.slide')];
  const contentSlides = slides.filter(slide=>!slide.classList.contains('blank'));
  const deck = document.getElementById('deck');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const C = { blue:'#427eb6', ink:'#20344f', muted:'#899aaf', orange:'#cf913c', line:'#dce5ef' };
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  // 두 관측 기준은 이 한 번의 통과 계산을 공유함. 별도 경로·임의 속력 조정 없음.
  const flight = FlybyModel.create(1.3, { speed:2, impact:-6 });
  const launch = LaunchModel.create();
  const directionFlight = FlybyModel.create(0, { speed:2, impact:-6 });
  const mirroredFlight = FlybyModel.create(0, { speed:2, impact:6 });
  const nearFlight = FlybyModel.create(0, { speed:2, impact:-4 });
  const farFlight = FlybyModel.create(0, { speed:2, impact:-9 });
  const layoutCache = new Map();
  // 같은 물리 통과는 장면마다 임의로 늘이거나 줄이지 않고 같은 시간 배율로 재생함.
  const flybyTimeScale=flight.duration/8;
  const durations = {
    departure:[9,0], assist:[8,0], frames:[8,0,0,8,0],
    conditions:[Math.max(directionFlight.duration,mirroredFlight.duration)/flybyTimeScale,Math.max(nearFlight.duration,farFlight.duration)/flybyTimeScale,8]
  };
  // 원본 이미지 픽셀을 한 번만 변환함. 행성 강조·근접 통과·이미지 자르기의 좌표계를 공유함.
  const journeyView={sourceWidth:4135,sourceHeight:5906,width:1132,height:437,top:.13};
  // 원본 그림의 구면 중심을 맞춘 표시 좌표임. 실제 천체력이 아님.
  const earthInImage=journeyPoint(1470,1585),marsInImage=journeyPoint(1488,1779),sunInImage=journeyPoint(915,1512);
  const imageClearances={earth:20,mars:18};
  // 사진 위의 공통 속도 환산. 구간별 소요 시간 정규화 대신 적분 속력 × 같은 배율을 사용함.
  const IMAGE_SPEED_SCALE=70, DEPARTURE_FRACTION=.14;
  // 설명용 장거리 곡선은 통과 속력에서 순항 속력으로 이 거리 동안 부드럽게 연결함.
  const SPEED_BLEND_DISTANCE=220;
  const imageRoutes=buildImageRoutes();
  const historyColors=['#a9dfff','#74c8d1','#e6be80','#b9a3eb','#99dbb8'];
  const imageRouteCache=new Map();
  let index = 0, step = 0, elapsed = 0, rafId = 0, lastTime = null;
  let canvases = [], touchX = null;
  let motionStep=0, motionTimes=new Map(), speedBoost=false, journeyAuto=false;
  const heldShifts=new Set();
  // 문구가 모두 나온 뒤의 320ms 이내 전진 입력 두 번만 건너뛰기로 구분함.
  const DOUBLE_TAP_MS=320;
  let pendingForward=false,lastForwardPress=-Infinity,lastForwardSlide=-1,lastForwardMotion=-1;
  const visits = new Map();
  let slideAnimations=[],leavingSlide=null;

  /** 이전 전환을 정리함. 빠른 이동과 되돌리기에서 과거 화면이 남는 것을 방지함. */
  function clearSlideTransition() {
    const oldAnimations=slideAnimations;slideAnimations=[];
    oldAnimations.forEach(animation=>animation.cancel());
    if(leavingSlide)leavingSlide.classList.toggle('leaving',false);
    leavingSlide=null;
  }

  /** 장이 바뀔 때만 짧게 궤도 이동·확대·페이드함. 내용 애니메이션은 그대로 재생함. */
  function transitionSlides(from,to,back) {
    clearSlideTransition();
    if(from===to||reduced.matches||document.hidden||typeof to.animate!=='function')return;
    const direction=back?-1:1;
    const blank=from.classList.contains('blank')||to.classList.contains('blank');
    const dark=from.classList.contains('dark')||to.classList.contains('dark');
    const journey=to.dataset.scene==='journey'||from.dataset.scene==='journey';
    // 빈 화면은 0.36초 페이드, 표지·결론은 0.52초 초점 이동, 본문은 0.46초 짧은 호 이동임.
    const options={duration:blank?360:dark?520:460,easing:'cubic-bezier(.22,.7,.25,1)'};
    const distance=journey?150:100;
    // 들어오는 화면은 불투명하게 유지함. 위쪽의 이전 화면만 페이드하여 바탕의 흰색 번쩍임을 막음.
    const incoming=blank?[{opacity:1},{opacity:1}]:dark?
      [{opacity:1,transform:'translateY(18px) scale(1.035)'},{opacity:1,transform:'none'}]:
      [{opacity:1,transform:`translate(${distance*direction}px, 28px) rotate(${.45*direction}deg) scale(1.015)`},
       {opacity:1,transform:'none'}];
    const outgoing=blank?[{opacity:1},{opacity:0}]:dark?
      [{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-10px) scale(.985)'}]:
      [{opacity:1,transform:'none'},
       {opacity:0,transform:`translate(${-65*direction}px, -18px) rotate(${- .3*direction}deg) scale(.99)`}];
    leavingSlide=from;from.classList.toggle('leaving',true);
    const animations=[from.animate(outgoing,options),to.animate(incoming,options)];
    slideAnimations=animations;
    Promise.all(animations.map(animation=>animation.finished)).then(()=>{
      if(slideAnimations===animations)clearSlideTransition();
    }).catch(()=>{}); // 빠른 이동·탭 숨김·모션 감소로 취소된 전환은 이미 정리됨.
  }

  /** 값을 0~1 구간으로 제한함. */
  function clamp(value) { return Math.max(0, Math.min(1, value)); }

  /** 원본 픽셀을 이미지와 Canvas가 공유하는 자르기 좌표로 변환함. */
  function journeyPoint(x,y) {
    const scale=journeyView.width/journeyView.sourceWidth;
    return [x*scale,(y-journeyView.sourceHeight*journeyView.top)*scale];
  }

  /** 좌우 Shift를 따로 기록함. 한쪽은 2배, 양쪽은 4배속이며 반복 입력으로 중복되지 않음. */
  function setShift(event,pressed) {
    const code=['ShiftLeft','ShiftRight'].includes(event.code)?event.code:event.location===1?'ShiftLeft':event.location===2?'ShiftRight':'Shift';
    if(pressed)heldShifts.add(code);
    else if(code==='Shift')heldShifts.clear();
    else heldShifts.delete(code);
    speedBoost=heldShifts.size>0;
  }

  /** 포커스 이탈 등으로 놓기 이벤트를 받지 못해도 배속이 남지 않게 초기화함. */
  function clearShifts() {heldShifts.clear();speedBoost=false;}

  /** 실제로 누르고 있는 Shift 개수에 따른 재생 시간 배율 반환. */
  function playbackRate() {return heldShifts.size>=2?4:speedBoost?2:1;}

  /** 현재 설명 단계의 재생 시간을 초 단위로 반환함. */
  function duration(at=motionStep) {
    if(slides[index].dataset.scene==='journey') {
      const total=imageRoute(Math.max(1,at)).duration;
      return at===0?total*DEPARTURE_FRACTION:at===1?total*(1-DEPARTURE_FRACTION):total;
    }
    return durations[slides[index].dataset.scene]?.[at] || 0;
  }

  /** 문구 공개와 무관하게 각 운동 단계의 재생 위치를 반환함. */
  function phaseFor(at) {
    if(reduced.matches&&journeyAuto)return 1;
    const total=duration(at);return total?clamp((at===motionStep?elapsed:(motionTimes.get(at)||0))/total):1;
  }

  /** 궤적 강조와 설명용 순항 속력 연결에 사용하는 보간. 재생 시간에는 적용하지 않음. */
  function easeMotion(phase) {const t=clamp(phase);return t*t*t*(t*(t*6-15)+10);}

  /** 여러 점을 잇는 선 또는 점선 렌더링. */
  function line(ctx, points, color=C.blue, dashed=false, thickness=3) {
    if (points.length < 2) return;
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=thickness; ctx.lineCap='round'; ctx.lineJoin='round';
    if(dashed) ctx.setLineDash([7,10]);
    ctx.beginPath(); points.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.stroke(); ctx.restore();
  }

  /** 설명용 짧은 문구를 지정 위치에 표시함. */
  function text(ctx, message, x, y, size=25, color=C.muted, align='center') {
    ctx.save(); ctx.font=`${size}px ${FONT}`; ctx.fillStyle=color; ctx.textAlign=align; ctx.fillText(message,x,y); ctx.restore();
  }

  /** 속력 또는 중력 방향을 표시하는 화살표. 길이는 호출부에서 정함. */
  function arrow(ctx, a, b, color=C.orange) {
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    line(ctx,[a,b],color,false,3);
    ctx.save();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(b.x,b.y);
    ctx.lineTo(b.x-12*Math.cos(angle-.4),b.y-12*Math.sin(angle-.4));
    ctx.lineTo(b.x-12*Math.cos(angle+.4),b.y-12*Math.sin(angle+.4));ctx.closePath();ctx.fill();ctx.restore();
  }

  /** 가독성을 위해 확대한 행성 기호. 실제 반지름 비례가 아님. */
  function planet(ctx, x, y, radius=35, kind='planet', caption='') {
    const fill=kind==='earth'?'#d5e8f5':kind==='mars'?'#f3d9cb':'#f0dfbd';
    ctx.save();ctx.fillStyle=fill;ctx.strokeStyle=kind==='earth'?'#6a9ac4':kind==='mars'?'#ba8b72':'#bc9d65';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.clip();
    if(kind==='earth') {
      ctx.fillStyle='#95bda4';ctx.beginPath();ctx.moveTo(x-radius*.7,y-radius*.5);
      ctx.bezierCurveTo(x+radius*.7,y-radius*.9,x-radius*.4,y+radius*.1,x+radius*.3,y+radius*.3);
      ctx.bezierCurveTo(x,y+radius*.8,x-radius*.6,y+radius*.1,x-radius*.7,y-radius*.5);ctx.fill();
    } else {
      for(const dy of [-.4,.1,.5]) line(ctx,[{x:x-radius,y:y+radius*dy},{x:x+radius,y:y+radius*dy}],'#d2b68b',false,5);
    }
    // 고정 광원의 구면 명암. 궤도 좌표나 반지름 계산과 별개인 그림 표현임.
    const shade=ctx.createRadialGradient(x-radius*.4,y-radius*.4,radius*.12,x+radius*.35,y+radius*.25,radius*1.35);
    shade.addColorStop(0,'#ffffff40');shade.addColorStop(.5,'#00000000');shade.addColorStop(1,'#07101fd0');
    ctx.fillStyle=shade;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    ctx.restore(); if(caption) text(ctx,caption,x,y+radius+34,24,C.ink);
  }

  /** 탐사선과 출발 장면의 엔진 분사 표시. */
  function probe(ctx, p, angle=0, thrust=false, color=C.blue, size=1) {
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.scale(size,size);
    if(thrust) {ctx.fillStyle='#edb965';ctx.beginPath();ctx.moveTo(-14,-6);ctx.lineTo(-47,0);ctx.lineTo(-14,6);ctx.fill();}
    ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;
    ctx.fillRect(-7,-25,14,15);ctx.fillRect(-7,10,14,15);
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,10);ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillRect(-12,-8,24,16);ctx.strokeRect(-12,-8,24,16);
    ctx.beginPath();ctx.moveTo(13,-8);ctx.lineTo(20,0);ctx.lineTo(13,8);ctx.stroke();ctx.restore();
  }

  /** 동일한 물리 상태를 행성 기준 또는 태양 기준 좌표로 변환함. */
  function coordinates(s, frame, body=false) {
    const p=frame==='planet'?(body?{x:0,y:0}:{x:s.x-s.px,y:s.y-s.py}):(body?{x:s.px,y:s.py}:{x:s.x,y:s.y});
    return rotate(p.x,p.y);
  }

  /** 두 관측 기준에 같은 카메라 회전 적용. 거리와 속력의 크기는 유지됨. */
  function rotate(x,y) {const angle=.6;return {x:Math.cos(angle)*x+Math.sin(angle)*y,y:-Math.sin(angle)*x+Math.cos(angle)*y};}

  /** 비교 경로 전체에서 공통 거리 축척 계산. 재생 중 확대나 추적 없음. */
  function layout(model, frame, w, h, group=[model], bothFrames=false) {
    const signature=group.map(f=>`${f.planetVy}/${f.states[0].vx}/${f.states[0].y}`).join('|');
    const key=`${signature}/${model.states[0].y}/${frame}/${w}/${h}/${bothFrames}`;
    if(layoutCache.has(key)) return layoutCache.get(key);
    const bounds=[];
    for(const candidate of group) {
      for(const view of bothFrames ? ['planet','sun'] : [frame]) {
        const points=[];
        for(let i=0;i<candidate.states.length;i+=12) {
          points.push(coordinates(candidate.states[i],view),coordinates(candidate.states[i],view,true));
        }
        const last=candidate.states.at(-1);points.push(coordinates(last,view),coordinates(last,view,true));
        bounds.push({candidate,view,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))});
      }
    }
    // 속력 화살표와 문구를 위한 고정 여백 확보.
    const spans=(bothFrames?['planet','sun']:[frame]).map(view=>{const peers=bounds.filter(b=>b.view===view);return {x:Math.max(...peers.map(b=>b.maxX))-Math.min(...peers.map(b=>b.minX)),y:Math.max(...peers.map(b=>b.maxY))-Math.min(...peers.map(b=>b.minY))};});
    const scale=Math.min((w-230)/Math.max(...spans.map(s=>s.x)),(h-180)/Math.max(...spans.map(s=>s.y)));
    const peers=bounds.filter(item=>item.view===frame);
    const center={x:(Math.min(...peers.map(p=>p.minX))+Math.max(...peers.map(p=>p.maxX)))/2,y:(Math.min(...peers.map(p=>p.minY))+Math.max(...peers.map(p=>p.maxY)))/2};
    /** 물리 좌표를 고정 화면 좌표로 투영함. */
    function project(s, body=false) {const p=coordinates(s,frame,body);return {x:w/2+(p.x-center.x)*scale,y:h*.46-(p.y-center.y)*scale};}
    const result={scale,project};layoutCache.set(key,result);return result;
  }

  /** 적분한 동일 통과를 물리 시간에 따라 그림. 화살표도 실제 속도로 계산함. */
  function pass(ctx,w,h,model,frame,fraction,{endpoints=false,color=C.blue,ghost=false,group=[model],bothFrames=false}={}) {
    const view=layout(model,frame,w,h,group,bothFrames),s=FlybyModel.sample(model,fraction);
    const count=Math.floor(clamp(fraction)*(model.states.length-1));
    const all=[],trail=[];
    for(let i=0;i<model.states.length;i+=10) {
      const p=view.project(model.states[i]);all.push(p);if(i<=count)trail.push(p);
    }
    all.push(view.project(model.states.at(-1)));trail.push(view.project(s));
    const dark=['assist','frames'].includes(slides[index].dataset.scene),ink=dark?'#c2d7e6':C.ink,pathColor=dark?'#72c7ef':color;
    line(ctx,all,dark?'#7297b54d':C.line,true,2);line(ctx,trail,pathColor,false,3.5);
    if(frame==='sun' && model.planetVy) {
      const origin=view.project(model.states[0],true),body=view.project(s,true);
      line(ctx,[origin,body],C.orange,false,3);
      const v=rotate(0,model.planetVy);
      if(fraction>0) arrow(ctx,{x:body.x+45,y:body.y+35},{x:body.x+45+v.x*38,y:body.y+35-v.y*38},'#e6b76a');
      text(ctx,'행성의 이동',w/2,h-16,23,'#e6b76a');
    }
    const body=view.project(s,true),radius=Math.min(35,model.closest*view.scale*.53);
    if(!ghost) planet(ctx,body.x,body.y,radius,'planet');
    if(dark)text(ctx,'행성',body.x,Math.min(h-38,body.y+radius+28),22,ink);
    const p=view.project(s),v=rotate(s.vx,s.vy-(frame==='planet'?model.planetVy:0));
    probe(ctx,p,Math.atan2(-v.y,v.x),false,dark?'#83d2f2':color);
    // 점은 같은 물리 시간 간격임. 최근접 구간에서 실제로 간격이 넓어짐.
    const interval=Math.max(1,Math.round(model.states.length/22));
    for(let i=0;i<=count;i+=interval) {
      const q=view.project(model.states[i]);ctx.fillStyle=dark?'#8ab7ce':color;ctx.beginPath();ctx.arc(q.x,q.y,2.3,0,Math.PI*2);ctx.fill();
    }
    if(endpoints) {
    // 두 패널의 화살표 배율 통일. 행성 기준 전후 길이는 거의 같음.
      const velocityScale=27;
      for(const [j,state] of [model.states[0],model.states.at(-1)].entries()) {
        const q=view.project(state),v=rotate(state.vx,state.vy-(frame==='planet'?model.planetVy:0)),dx=v.x*velocityScale,dy=-v.y*velocityScale;
        arrow(ctx,q,{x:q.x+dx,y:q.y+dy},j===0?'#a5b8cb':'#e9c17e');
        text(ctx,j===0?'통과 전':'통과 후',q.x,q.y+49,22,ink);
      }
    }
    return {state:s,point:p,body,view};
  }

  /* === 추력과 중력이 거의 맞서는 힘겨운 이륙 === */

  /** 로켓의 형태와 작은 진동·땀 표시. 진동은 실제 고도 적분에 더하지 않음. */
  function rocket(ctx,p,time,effort) {
    const wobble=reduced.matches?0:Math.sin(time*49)*.024*effort;
    ctx.save();ctx.translate(p.x+(reduced.matches?0:Math.sin(time*67)*2.4*effort),p.y);ctx.rotate(wobble);
    const plume=48+(reduced.matches?0:9*Math.sin(time*79));
    ctx.fillStyle='#efad4d';ctx.beginPath();ctx.moveTo(-15,45);ctx.quadraticCurveTo(-24,65,0,45+plume);ctx.quadraticCurveTo(24,65,15,45);ctx.fill();
    ctx.fillStyle='#ffe3a2';ctx.beginPath();ctx.moveTo(-8,45);ctx.lineTo(0,70+plume*.35);ctx.lineTo(8,45);ctx.fill();
    ctx.fillStyle='#427eb6';ctx.beginPath();ctx.moveTo(-20,10);ctx.lineTo(-43,53);ctx.lineTo(-17,43);ctx.fill();
    ctx.beginPath();ctx.moveTo(20,10);ctx.lineTo(43,53);ctx.lineTo(17,43);ctx.fill();
    const shell=ctx.createLinearGradient(-22,0,22,0);shell.addColorStop(0,'#b1bdca');shell.addColorStop(.45,'#ffffff');shell.addColorStop(1,'#d4dde7');
    ctx.fillStyle=shell;ctx.strokeStyle='#60768d';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-22,42);ctx.lineTo(-22,-35);ctx.quadraticCurveTo(-18,-57,0,-78);ctx.quadraticCurveTo(18,-57,22,-35);ctx.lineTo(22,42);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#d1dee9';ctx.fillRect(-21,23,42,12);
    ctx.fillStyle='#294b68';ctx.beginPath();ctx.arc(0,-22,9,0,Math.PI*2);ctx.fill();
    if(effort>.08) {
      for(let i=0;i<3;i++) {
        const drop=(time*25+i*17)%48,x=40+i*9,y=-56+drop;
        ctx.save();ctx.globalAlpha=effort*(1-drop/55);ctx.fillStyle='#5aafd8';
        ctx.beginPath();ctx.moveTo(x,y-9);ctx.bezierCurveTo(x-10,y+2,x-3,y+11,x+3,y+5);ctx.bezierCurveTo(x+7,y,x+3,y-3,x,y-9);ctx.fill();ctx.restore();
      }
    }
    ctx.restore();
  }

  /** RK4 고도에 따라 실제로 천천히 상승함. 지면·추력·중력으로 어려움을 설명함. */
  function departure(ctx,w,h,phase) {
    const s=LaunchModel.sample(launch,phase),final=launch.states.at(-1),p={x:w*.49,y:515-s.h/final.h*345};
    const effort=(1-clamp(s.v/final.v))*(phase===0?.6:1);
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#e8f3fc');sky.addColorStop(1,'#fff');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#d9e9dc';ctx.beginPath();ctx.ellipse(w/2,h+600,1000,675,0,0,Math.PI*2);ctx.fill();
    line(ctx,[{x:w*.49-65,y:568},{x:w*.49+65,y:568}],'#7c8b98',false,6);
    if(s.h<final.h*.4) {
      ctx.save();ctx.globalAlpha=.28*(1-s.h/(final.h*.4));ctx.fillStyle='#a9b7c5';
      for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(w*.49+(i-2.5)*31,568+(i%2)*9,27+phase*15,13+phase*5,0,0,Math.PI*2);ctx.fill();}ctx.restore();
    }
    rocket(ctx,p,s.t,effort);
    arrow(ctx,{x:p.x-110,y:p.y+30},{x:p.x-110,y:p.y-75},C.blue);
    text(ctx,'추력',p.x-160,p.y-13,29,C.blue);
    arrow(ctx,{x:p.x+120,y:p.y-25},{x:p.x+120,y:Math.min(h-70,p.y+90)},C.orange);
    text(ctx,'중력',p.x+174,p.y+38,29,C.orange);
    text(ctx,'추력이 중력보다 커져야 떠오른다',w/2,45,29,C.ink);
    text(ctx,phase<.55?'강하게 분사해도 처음에는 천천히':'올라가는 동안에도 계속 필요한 추진제',w/2,h-24,27,C.ink);
  }

  /* === 접근 조건. 방향·거리 비교의 진입 속력 유지 === */

  /** 같은 행성과 진입 속력을 유지하고 접근 방향 또는 거리 비교. */
  function conditions(ctx,w,h,phase,focus=motionStep) {
    if(focus<2) {
      const pair=focus===0?[directionFlight,mirroredFlight]:[nearFlight,farFlight];
      const clock=phase*Math.max(...pair.map(f=>f.duration));
      pass(ctx,w,h,pair[1],'planet',clamp(clock/pair[1].duration),{color:C.muted,ghost:true,group:pair});
      pass(ctx,w,h,pair[0],'planet',clamp(clock/pair[0].duration),{color:C.blue,group:pair});
      text(ctx,focus===0?'다른 쪽으로 접근하면 나가는 방향도 달라짐':'가까운 통과가 더 크게 휘는 예',w/2,h-36,28,C.ink);
      text(ctx,'진입 속력 고정',w/2,42,24,C.muted);
      return;
    }
    // 태양 기준의 동일 통과 계산으로 안전한 접근 시각 표시.
    const view=layout(flight,'sun',w,h,[flight],true),initial=view.project(flight.states[0],true);
    ctx.save();ctx.strokeStyle=C.muted;ctx.lineWidth=2;ctx.setLineDash([5,8]);
    ctx.beginPath();ctx.arc(initial.x,initial.y,31,0,Math.PI*2);ctx.stroke();ctx.restore();
    text(ctx,'출발할 때의 행성 위치',initial.x,initial.y+67,23,C.muted);
    const {state,point,body}=pass(ctx,w,h,flight,'sun',phase,{bothFrames:true});
    const dx=point.x-body.x,dy=point.y-body.y;
    if(Math.hypot(state.x-state.px,state.y-state.py)<flight.closest*1.4) {
      line(ctx,[body,point],C.orange,true,2);
      text(ctx,'계획한 통과 거리',body.x+dx*.5+70,body.y+dy*.5,23,C.orange);
    }
    text(ctx,'도착할 시각의 행성 위치에 맞춰 접근',w/2,h-50,28,C.ink);
  }

  /* === 원본 ESA 전체 궤도 그림 위에 로제타의 여정을 재생함 === */

  /** 중력 적분 경로의 최근접 전후를 사진 위의 안전한 근접 통과로 배치함. */
  function imageFlyby(target,side=1,clearance=imageClearances.earth) {
    let closest=directionFlight.states[0];
    for(const s of directionFlight.states)if(Math.hypot(s.x,s.y)<Math.hypot(closest.x,closest.y))closest=s;
    const angle=Math.atan2(closest.y,closest.x)-Math.PI/2,scale=clearance/directionFlight.closest,c=Math.cos(angle),sn=Math.sin(angle);
    const samples=[];
    for(let i=0;i<=160;i++) {
      const s=FlybyModel.sample(directionFlight,.3+.4*i/160);
      const x=(c*s.x+sn*s.y)*scale,y=(-sn*s.x+c*s.y)*scale;
      const vx=(c*s.vx+sn*s.vy)*scale,vy=(-sn*s.vx+c*s.vy)*scale;
      const r=Math.hypot(s.x,s.y),ax=-FlybyModel.mu*s.x/r**3,ay=-FlybyModel.mu*s.y/r**3;
      const displayAy=-side*(-sn*ax+c*ay)*scale,displayAx=(c*ax+sn*ay)*scale,displayVy=-side*vy;
      const v=Math.hypot(s.vx,s.vy),curvature=(vx*displayAy-displayVy*displayAx)/Math.hypot(vx,displayVy)**3;
      const speedSlope=IMAGE_SPEED_SCALE/scale*(s.vx*ax+s.vy*ay)/(v*v);
      samples.push({x:target[0]+x,y:target[1]-side*y,angle:Math.atan2(displayVy,vx),speed:v*IMAGE_SPEED_SCALE,curvature,speedSlope});
    }
    return {samples,target,clearance};
  }

  /** 태양 주위 설명용 여정에 실제 적분을 축척한 접근→최근접→이탈 구간을 연결함. */
  function buildImageRoutes() {
    const routes=[[]];let origin={x:earthInImage[0]-18,y:earthInImage[1]-8,angle:2.7,curvature:0};
    for(let segment=1;segment<=4;segment++) {
      const isMars=segment===2;
      const local=imageFlyby(isMars?marsInImage:earthInImage,1,isMars?imageClearances.mars:imageClearances.earth);
      const entry=local.samples[0],exit=local.samples.at(-1);
      // 넓은 공전 호의 접선·곡률 사용. 화성 이탈을 아래쪽 점으로 강제하여 되꺾지 않음.
      const a=220+segment*10;
      const left={x:sunInImage[0]-a+45,y:205,angle:-Math.PI/2,curvature:.012};
      const top={x:sunInImage[0],y:105-segment*5,angle:0,curvature:.002};
      const right={x:650+segment*10,y:210,angle:Math.PI/2,curvature:.009};
      // 지구 진입 접선의 뒤쪽에 충분한 회전 반경을 둠. 가까운 점에서 방향을 강제로 뒤집지 않음.
      const lower={x:560+segment*5,y:isMars?345:330,angle:Math.PI,curvature:.003};
      const knots=[origin,left,top,right,lower,entry];
      routes.push([...orbitalGuide(knots),local]);
      origin=exit;
    }
    routes.push(orbitalGuide([origin,{x:65,y:205,angle:-Math.PI/2,curvature:.012},{x:400,y:65,angle:0,curvature:.0017},{x:1040,y:230,angle:Math.PI/2,curvature:.005},{x:830,y:345,angle:Math.PI,curvature:.002},{x:587,y:60,angle:-Math.PI/2,curvature:0}]));
    return routes;
  }

  /** 진행 방향과 곡률을 공유하는 5차 곡선 생성. 경유점에서 법선 가속도가 튀지 않게 함. */
  function orbitalGuide(waypoints) {
    const knots=waypoints.map((p,i)=>{
      if(i===0||i===waypoints.length-1||p.angle!==undefined)return p;
      const a=waypoints[i-1],b=waypoints[i+1],ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y;
      const incoming=Math.hypot(ux,uy),outgoing=Math.hypot(vx,vy);
      return {...p,angle:Math.atan2(uy/incoming+vy/outgoing,ux/incoming+vx/outgoing),curvature:2*(ux*vy-uy*vx)/(incoming*outgoing*Math.hypot(b.x-a.x,b.y-a.y))};
    });
    return knots.slice(1).map((b,i)=>guideControls(knots[i],b,Math.hypot(b.x-knots[i].x,b.y-knots[i].y)));
  }

  /** 위치·단위 접선·곡률이 양 끝에서 일치하는 5차 Bezier 제어점 생성. */
  function guideControls(a,b,length) {
    /** 끝점의 접선과 곡률을 제어점으로 변환함. */
    function boundary(p,sign) {
      const tx=Math.cos(p.angle),ty=Math.sin(p.angle),k=p.curvature??0;
      const first=[p.x+sign*length*tx/5,p.y+sign*length*ty/5];
      return [first,[2*first[0]-p.x-k*length*length*ty/20,2*first[1]-p.y+k*length*length*tx/20]];
    }
    const start=boundary(a,1),end=boundary(b,-1);
    return [[a.x,a.y],...start,end[1],end[0],[b.x,b.y]];
  }

  /** Bezier의 위치와 1·2차 미분으로 방향 및 곡률 계산함. */
  function sampleGuide(controls,t) {
    /** de Casteljau 알고리즘으로 위치 또는 미분값 계산함. */
    function evaluate(points) {
      const p=points.map(point=>[...point]);
      for(let remaining=p.length-1;remaining>0;remaining--)for(let i=0;i<remaining;i++)p[i]=[p[i][0]*(1-t)+p[i+1][0]*t,p[i][1]*(1-t)+p[i+1][1]*t];
      return p[0];
    }
    const degree=controls.length-1,first=controls.slice(1).map((p,i)=>[(p[0]-controls[i][0])*degree,(p[1]-controls[i][1])*degree]);
    const second=first.slice(1).map((p,i)=>[(p[0]-first[i][0])*(degree-1),(p[1]-first[i][1])*(degree-1)]);
    const p=evaluate(controls),v=evaluate(first),a=evaluate(second);
    return {x:p[0],y:p[1],angle:Math.atan2(v[1],v[0]),curvature:(v[0]*a[1]-v[1]*a[0])/Math.hypot(...v)**3};
  }

  /** 사진 경로의 누적 길이·속력·소요 시간 계산. 근접 통과는 적분한 속력을 보존함. */
  function imageRoute(segment) {
    if(imageRouteCache.has(segment))return imageRouteCache.get(segment);
    const points=[],lengths=[];let length=0;
    for(const controls of imageRoutes[segment]) {
      if(controls.samples) {
        if(points.length)Object.assign(points.at(-1),controls.samples[0]);
        for(const p of controls.samples.slice(points.length?1:0)) {
          if(points.length)length+=Math.hypot(p.x-points.at(-1).x,p.y-points.at(-1).y);
          points.push({...p});lengths.push(length);
        }
        continue;
      }
      // 240 표본으로 위치 보간의 작은 모서리도 줄임. 해상도와 물리 계산 간격은 별개임.
      for(let i=points.length?1:0;i<=240;i++) {
        const p=sampleGuide(controls,i/240);
        if(points.length)length+=Math.hypot(p.x-points.at(-1).x,p.y-points.at(-1).y);
        points.push(p);lengths.push(length);
      }
    }
    const flyby=imageRoutes[segment].find(item=>item.samples),previous=imageRoutes[segment-1]?.find(item=>item.samples);
    const cruise=directionFlight.states[0].vx*IMAGE_SPEED_SCALE;
    const startSpeed=previous?.samples.at(-1).speed??cruise,endSpeed=flyby?.samples[0].speed??cruise;
    const startSlope=previous?.samples.at(-1).speedSlope??0,endSlope=flyby?.samples[0].speedSlope??0;
    const entry=points.findIndex(p=>p.speed!==undefined),guideLength=entry<0?length:lengths[entry];
    const times=[0];
    for(let i=0;i<points.length;i++) {
      const p=points[i],s=lengths[i];
      if(p.speed===undefined) {
        const leaving=clamp(s/SPEED_BLEND_DISTANCE),entering=clamp((s-guideLength+SPEED_BLEND_DISTANCE)/SPEED_BLEND_DISTANCE);
        // 중력 적분의 접선 가속도도 연결함. 경계에서 감속·가속 기울기가 갑자기 0이 되지 않음.
        p.speed=cruise+(startSpeed-cruise)*(2*leaving**3-3*leaving**2+1)+startSlope*SPEED_BLEND_DISTANCE*(leaving**3-2*leaving**2+leaving)
          +(endSpeed-cruise)*(-2*entering**3+3*entering**2)+endSlope*SPEED_BLEND_DISTANCE*(entering**3-entering**2);
      }
      if(i)times.push(times[i-1]+2*(s-lengths[i-1])/(p.speed+points[i-1].speed));
    }
    // 표본 사이의 이동도 접선·곡률을 보존하여 작은 직선 모서리가 생기지 않게 함.
    const pieces=points.slice(1).map((b,i)=>guideControls(points[i],b,lengths[i+1]-lengths[i]));
    const route={points,lengths,length,flyby,times,pieces,duration:times.at(-1)};imageRouteCache.set(segment,route);return route;
  }

  /** 사진 좌표의 곡선을 호 길이로 진행하여 제어점 주변에서 이동이 튀지 않게 함. */
  function imageRouteAt(route,phase) {
    const target=clamp(phase)*route.length;let lo=0,hi=route.lengths.length-1;
    while(lo<hi) {const middle=Math.floor((lo+hi)/2);if(route.lengths[middle]<target)lo=middle+1;else hi=middle;}
    const i=Math.max(1,lo);
    const span=route.lengths[i]-route.lengths[i-1],t=span?(target-route.lengths[i-1])/span:0;
    return {...sampleGuide(route.pieces[i-1],t),index:i};
  }

  /** 시간으로 위치를 조회함. 표본 사이의 일정 가속도 보간으로 속력의 불연속을 막음. */
  function imageRouteTimeAt(route,time) {
    const target=Math.max(0,Math.min(route.duration,time));let lo=0,hi=route.times.length-1;
    while(lo<hi) {const middle=Math.floor((lo+hi)/2);if(route.times[middle]<target)lo=middle+1;else hi=middle;}
    const i=Math.max(1,lo),a=route.points[i-1],b=route.points[i],dt=target-route.times[i-1];
    const span=route.times[i]-route.times[i-1],acceleration=span?(b.speed-a.speed)/span:0;
    const distance=route.lengths[i-1]+a.speed*dt+.5*acceleration*dt*dt;
    return {...imageRouteAt(route,distance/route.length),speed:a.speed+acceleration*dt};
  }

  /** 출발과 첫 경유를 하나의 시각표로 나누어 같은 위치·속력에서 이어감. */
  function journeyPosition(at,phase) {
    const route=imageRoute(Math.max(1,at));
    const fraction=at===0?phase*DEPARTURE_FRACTION:at===1?DEPARTURE_FRACTION+(1-DEPARTURE_FRACTION)*phase:phase;
    return imageRouteTimeAt(route,fraction*route.duration);
  }

  /** 원본 전체 그림을 유지하며 탐사선과 지나온 경로를 같은 이미지 좌표에 겹침. */
  function journey(ctx,w,h,phase) {
    ctx.save();ctx.scale(w/journeyView.width,h/journeyView.height);
    const current=motionStep;
    // 장면에 들어오면 출발을 짧게 재생하고, 다음 단계에서 그 위치부터 이어감.
    if(current===0) {
      const route=imageRoute(1),p=journeyPosition(0,phase);
      ctx.save();ctx.globalAlpha=.9;line(ctx,[...route.points.slice(0,p.index),p],'#9fe4ff',false,2.7);ctx.restore();
    }
    for(let segment=1;segment<=current;segment++) {
      const route=imageRoute(segment),p=segment===current?journeyPosition(current,phase):imageRouteTimeAt(route,route.duration);
      // 완료한 경로는 구간별 색과 점선으로 계속 남김. 새 이동만 밝게 표시함.
      const fade=1-easeMotion(clamp(elapsed/.45));
      ctx.save();ctx.globalAlpha=segment===current?.95:segment===current-1?.72+.23*fade:.72;
      const thickness=segment===current?3.2:2.2;
      line(ctx,[...route.points.slice(0,p.index),p],historyColors[segment-1],segment<current,thickness);ctx.restore();
    }
    const p=journeyPosition(current,phase);
    ctx.save();ctx.globalAlpha=.2;ctx.fillStyle='#8ee0ff';ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();ctx.restore();
    // 원본 행성보다 컸던 기체를 줄여 표면을 덮지 않고 가까이 스쳐 지나가게 함.
    probe(ctx,p,p.angle,false,'#b9edff',.4);
    // 경계에 있는 탐사선도 이름이 잘리지 않게 그림 안쪽에 표시함.
    text(ctx,'로제타',Math.max(42,Math.min(1090,p.x)),Math.max(24,Math.min(420,p.y-33)),20,'#d6f3ff');
    ctx.restore();
    if(current===5)return;
    // 동일한 행성 좌표를 경로와 강조에 사용함. 별도의 비율 좌표를 다시 만들지 않음.
    const target=current===2?marsInImage:earthInImage;
    const highlight={x:target[0]*w/journeyView.width,y:target[1]*h/journeyView.height};
    const radius=current===2?10:11;
    ctx.save();ctx.strokeStyle=current===2?'#ffd08a':'#8ee0ff';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(highlight.x,highlight.y,radius,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=.25;ctx.lineWidth=10;ctx.beginPath();ctx.arc(highlight.x,highlight.y,radius+5,0,Math.PI*2);ctx.stroke();ctx.restore();
  }

  /* === 현재 단계만 그리고 필요한 동안만 프레임 예약 === */

  /** 현재 장의 모든 Canvas를 설명 단계에 맞춰 그림. */
  function render() {
    const scene=slides[index].dataset.scene,phase=phaseFor(motionStep);
    for(const entry of canvases) {
      const {ctx,w,h,node}=entry;ctx.clearRect(0,0,w,h);
      if(scene==='departure') departure(ctx,w,h,phaseFor(0));
      else if(scene==='assist') pass(ctx,w,h,flight,'planet',phaseFor(0));
      else if(scene==='frames') {
        const frame=node.dataset.frame;
        const progress=phaseFor(frame==='planet'?0:3);
        pass(ctx,w,h,flight,frame,progress,{endpoints:progress===1&&(frame==='planet'?step>=1:step>=4),bothFrames:true});
      }
      else if(scene==='conditions')conditions(ctx,w,h,phase);
      else if(scene==='journey')journey(ctx,w,h,phase);
    }
  }

  /** 예약한 프레임 취소. 경과 시간은 유지함. */
  function stop() {if(rafId)cancelAnimationFrame(rafId);rafId=0;lastTime=null;}

  /** 현재 움직임을 마친 뒤, 이미 공개한 문구에 대응하는 다음 움직임을 선택함. */
  function selectQueuedMotion() {
    if(elapsed<duration())return false;
    motionTimes.set(motionStep,duration());
    for(let at=motionStep+1;at<=step;at++) {
      if(duration(at)>0 && (motionTimes.get(at)||0)<duration(at)) {
        motionStep=at;elapsed=motionTimes.get(at)||0;return true;
      }
    }
    return false;
  }

  /** 모션 감소 설정과 인쇄에서 공개된 단계의 최종 상태를 준비함. */
  function finishRequestedMotion() {
    motionStep=0;
    for(let at=0;at<=step;at++) {
      motionTimes.set(at,duration(at));if(duration(at)>0)motionStep=at;
    }
    elapsed=duration();
  }

  /** 재생 시간을 진행함. 자동 여정에서는 구간 완료마다 다음 문구와 운동을 함께 전환함. */
  function frame(now) {
    rafId=0;
    let remaining=lastTime===null?0:Math.min(.1,(now-lastTime)/1000)*playbackRate();lastTime=now;
    while(true) {
      const advance=Math.min(Math.max(0,duration()-elapsed),remaining);
      elapsed+=advance;remaining-=advance;
      if(elapsed<duration())break;
      if(journeyAuto)advanceJourney(true);
      else if(!selectQueuedMotion())break;
      if(remaining<=0)break;
    }
    if(elapsed>=duration()&&pendingForward) {pendingForward=false;advanceStep();return;}
    render();
    if(elapsed<duration() && !document.hidden)rafId=requestAnimationFrame(frame);else lastTime=null;
  }

  /** 기존 재생은 유지하고 필요한 다음 움직임만 예약함. */
  function start() {
    if(reduced.matches&&!journeyAuto) {stop();finishRequestedMotion();render();return;}
    selectQueuedMotion();render();
    if(!rafId && !document.hidden && elapsed<duration()) {lastTime=null;rafId=requestAnimationFrame(frame);}
  }

  /** 소수 기기 픽셀 비율에서도 논리 크기를 보존하고 해상도만 조정함. */
  function prepareCanvases() {
    if(slides[index].dataset.scene==='journey') {
      const picture=slides[index].querySelector('img');
      picture.style.width=`${journeyView.width}px`;
      picture.style.top=`${-journeyView.sourceHeight*journeyView.top*journeyView.width/journeyView.sourceWidth}px`;
    }
    canvases=[...slides[index].querySelectorAll('canvas')].map(node=>{
      const w=Number(node.dataset.baseWidth||node.getAttribute('width')),h=Number(node.dataset.baseHeight||node.getAttribute('height'));
      node.dataset.baseWidth=String(w);node.dataset.baseHeight=String(h);
      const dpr=Math.min(devicePixelRatio||1,2);node.width=Math.round(w*dpr);node.height=Math.round(h*dpr);
      const ctx=node.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {node,ctx,w,h};
    });
  }

  /** 단계별 문구 공개와 강조 및 보조 읽기 안내 갱신. */
  function reveal() {
    const slide=slides[index];slide.dataset.currentStep=String(step);
    const eventLabel=slide.querySelector('[data-event-label]');
    if(eventLabel) {const event=ROSETTA_EVENTS[step];eventLabel.textContent=`${event.date.slice(0,7).replace('-','.')} · ${event.name} ${event.detail}`;}
    slide.querySelectorAll('[data-step],[data-until]').forEach(el=>{
      const visible=step>=Number(el.dataset.step||0) && step<=Number(el.dataset.until??Infinity);
      el.classList.toggle('step-visible',visible);el.setAttribute('aria-hidden',String(!visible));
    });
    slide.querySelectorAll('[data-focus]').forEach(el=>{
      el.classList.toggle('focused',Number(el.dataset.focus)===step);
      el.classList.toggle('completed',slide.dataset.scene==='journey' && Number(el.dataset.focus)<step);
    });
    document.getElementById('announcement').textContent=slide.classList.contains('blank')?
      slide.getAttribute('aria-label'):
      `${contentSlides.indexOf(slide)+1} / ${contentSlides.length}, ${step+1} / ${slide.dataset.steps}: ${slide.querySelector('h1').textContent}`;
  }

  /** 이전 단계의 재생 위치를 기억하여 불필요한 재시작 방지. */
  function remember() {visits.set(`${index}/${step}`,{motionStep,elapsed,times:[...motionTimes]});}

  /** 장 또는 같은 그림 안의 단계를 선택함. 뒤로 가면 이전 상태 복원. */
  function show(target,targetStep=0,back=false) {
    const previousSlide=slides[index];
    remember();stop();pendingForward=false;lastForwardPress=-Infinity;
    if(target!==index)journeyAuto=false;
    index=Math.max(0,Math.min(slides.length-1,target));
    step=Math.max(0,Math.min(Number(slides[index].dataset.steps)-1,targetStep));
    const saved=back?visits.get(`${index}/${step}`):null;
    motionTimes=new Map(saved?.times||[]);motionStep=saved?.motionStep??0;elapsed=saved?.elapsed??0;
    if(back&&!saved)finishRequestedMotion();
    slides.forEach((slide,i)=>{const active=i===index;slide.classList.toggle('active',active);slide.setAttribute('aria-hidden',String(!active));slide.inert=!active;});
    reveal();prepareCanvases();start();
    transitionSlides(previousSlide,slides[index],back);
  }

  /** 현재 장면의 다음 공개 상태로 이동함. 새로운 운동은 해당 문구와 함께 시작함. */
  function advanceStep() {
    if(step<Number(slides[index].dataset.steps)-1) {remember();step++;reveal();start();}
    else if(elapsed>=duration() && index<slides.length-1)show(index+1);
  }

  /** 자동 여정은 프레임 시계와 남은 시간을 유지한 채 다음 구간으로 이어감. 마지막에는 출발 반복. */
  function advanceJourney(inFrame=false) {
    pendingForward=false;lastForwardPress=-Infinity;remember();motionTimes.set(motionStep,duration());
    if(step<Number(slides[index].dataset.steps)-1)step++;
    else {step=0;motionTimes=new Map();}
    motionStep=step;elapsed=0;reveal();
    if(!inFrame)start();
  }

  /** 06 전체 여정에서 Ctrl로 자동 진행을 켜고 끔. 끄면 현재 재생은 끝까지 유지함. */
  function toggleJourneyAuto() {
    if(slides[index].dataset.scene!=='journey')return;
    journeyAuto=!journeyAuto;pendingForward=false;lastForwardPress=-Infinity;reveal();
    if(journeyAuto&&elapsed>=duration())advanceJourney();
    else start();
  }

  /** 운동이 달라지는 단계는 현재 재생이 끝난 뒤 한 번 진행함. 문구만 바뀌면 즉시 공개함. */
  function next() {
    const changesMotion=step>=Number(slides[index].dataset.steps)-1 || duration(step+1)>0;
    if(elapsed<duration()&&changesMotion) {pendingForward=true;return;}
    advanceStep();
  }

  /** 현재 운동에 붙은 문구를 모두 공개하고 다음 운동 또는 장 전환만 남았는지 판단함. */
  function canSkipMotion() {
    const nextIsMotion=step>=Number(slides[index].dataset.steps)-1 || duration(step+1)>0;
    return nextIsMotion && elapsed<duration();
  }

  /** 문구 공개가 끝난 경우에만 남은 움직임을 완료하고 다음 상태로 진행함. */
  function skipAndNext() {
    if(!canSkipMotion())return;
    pendingForward=false;stop();elapsed=duration();motionTimes.set(motionStep,elapsed);render();
    if(journeyAuto)advanceJourney();else advanceStep();
  }

  /** Space와 전진 키를 동일하게 처리함. 첫 입력 후 재생만 남았다면 두 번째 입력으로 다음 장면 진행. */
  function forwardKey(event) {
    const now=Number.isFinite(event.timeStamp)?event.timeStamp:Date.now();
    const pressedSlide=index,pressedMotion=motionStep;
    if(canSkipMotion()&&lastForwardSlide===index&&lastForwardMotion===motionStep&&now-lastForwardPress<=DOUBLE_TAP_MS) {
      lastForwardPress=-Infinity;skipAndNext();return;
    }
    next();
    if(canSkipMotion()&&index===pressedSlide&&motionStep===pressedMotion) {lastForwardPress=now;lastForwardSlide=index;lastForwardMotion=motionStep;}
    else lastForwardPress=-Infinity;
  }

  /** 같은 장의 이전 단계 또는 앞 장의 마지막 단계로 이동함. */
  function previous() {
    if(step>0)show(index,step-1,true);
    else if(index>0)show(index-1,Number(slides[index-1].dataset.steps)-1,true);
  }

  /** 1920×1080 무대 전체를 비율 유지 확대·축소함. 내부 배치 유지. */
  function resize() {
    const scale=Math.min(innerWidth/1920,innerHeight/1080);
    deck.style.transform=`translate(${(innerWidth-1920*scale)/2}px,${(innerHeight-1080*scale)/2}px) scale(${scale})`;
    prepareCanvases();render();
  }

  /** 길게 누르기와 편집 단축키를 제외하고 발표 키 입력 처리. */
  function keydown(event) {
    if(event.metaKey||event.altKey||event.target?.isContentEditable||/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target?.tagName||''))return;
    // 두 번째 Shift도 repeat=true로 전달될 수 있음. Set으로 중복을 막고 반복 입력 차단보다 먼저 기록함.
    if(event.key==='Shift') {setShift(event,true);return;}
    if(event.repeat)return;
    if(event.key==='Control') {if(slides[index].dataset.scene==='journey'){event.preventDefault();toggleJourneyAuto();}return;}
    if(event.ctrlKey)return;
    if(['ArrowRight','ArrowDown','PageDown'].includes(event.key)||event.code==='Space'){event.preventDefault();forwardKey(event);}
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();previous();}
    else if(event.key==='Home'){event.preventDefault();show(0);}
    else if(event.key==='End'){event.preventDefault();show(slides.length-1,Number(slides.at(-1).dataset.steps)-1);}
  }

  /** 모든 Shift를 놓은 이벤트에서는 좌우 기록을 함께 비움. 한쪽 해제 이벤트가 생략돼도 배속이 남지 않음. */
  function keyup(event) {
    if(event.key!=='Shift')return;
    if(event.shiftKey)setShift(event,false);
    else clearShifts();
  }

  /** 인쇄 시 모든 장의 최종 상태를 그리고 종료 후 발표 위치 복원. */
  function printFrames() {
    const saved={index,step,elapsed,motionStep,motionTimes};clearSlideTransition();stop();
    for(let i=0;i<slides.length;i++) {index=i;step=Number(slides[i].dataset.steps)-1;motionTimes=new Map();finishRequestedMotion();prepareCanvases();render();}
    index=saved.index;step=saved.step;elapsed=saved.elapsed;motionStep=saved.motionStep;motionTimes=saved.motionTimes;
  }

  /* === 초기화. 통신·재생 버튼 없음. 자동 반복은 06에서 Ctrl로 선택함 === */
  addEventListener('keydown',keydown);addEventListener('resize',resize);
  addEventListener('keyup',keyup);
  addEventListener('blur',()=>{clearShifts();lastForwardPress=-Infinity;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearShifts();clearSlideTransition();stop();}else start();});
  reduced.addEventListener('change',()=>{clearSlideTransition();start();});
  addEventListener('touchstart',event=>{if(event.touches.length===1)touchX=event.touches[0].clientX;},{passive:true});
  addEventListener('touchend',event=>{
    if(touchX===null)return;const dx=event.changedTouches[0].clientX-touchX;touchX=null;
    if(Math.abs(dx)>60){if(dx<0)next();else previous();}
  },{passive:true});
  addEventListener('beforeprint',printFrames);
  addEventListener('afterprint',()=>{prepareCanvases();start();});
  show(0);resize();
})();
