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

(() => {
  /* === 고정 무대와 단일 애니메이션 루프 상태 === */
  const slides=[...document.querySelectorAll('.slide')],deck=document.getElementById('deck');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const COLORS={mint:'#b4e9ce',amber:'#e7b788',muted:'#829aa5',ink:'#e8efed',bad:'#c99286'};
  const FONT='"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  // 11장은 낮은 접근 속력으로 가감속 차이를 키우되 중력 계산과 같은 거리의 비교 유지.
  const flights={gain:FlybyModel.create(1.3),loss:FlybyModel.create(-1.3),turn:FlybyModel.create(0),stationary:FlybyModel.create(0,{speed:1.35,impact:-8})};
  // 11장은 8초 동안 한 번 움직인 뒤 전후 비교 그림을 유지함.
  const STATIONARY_MOVE=8;
  const textures=new Map(),frames=new Map(),paths=new Map();
  let index=0,step=0,elapsed=0,lastTime=null,rafId=0,context=null,canvas=null,width=0,height=0;
  // 움직임은 03·07·11·12장에만 사용함. duration=0인 장은 대표 정지 그림을 그림.
  // still은 정지 그림에 사용할 개념 장면의 시점이며 시간에 따라 진행하지 않음.
  const SCENES=Object.freeze({
    mission:{duration:0,still:11,chapter:'질문'},why:{duration:0,chapter:'질문'},direct:{duration:5,chapter:'출발'},
    gravity:{duration:0,still:6,chapter:'중력'},well:{duration:0,still:8,chapter:'중력 웅덩이'},rethink:{duration:0,chapter:'관점 전환'},
    assist:{duration:6,chapter:'중력 이용'},definition:{duration:0,chapter:'플라이바이'},
    effects:{duration:0,still:9,chapter:'가속 · 감속 · 방향 전환'},question:{duration:0,chapter:'원리'},
    stationary:{duration:STATIONARY_MOVE,chapter:'행성에서 볼 때'},moving:{duration:7,chapter:'태양에서 볼 때'},
    routes:{duration:0,still:8,chapter:'다른 길'},direction:{duration:0,still:6,chapter:'접근 조건'},planning:{duration:0,still:12,chapter:'궤도 설계'},
    rosetta:{duration:0,chapter:'로제타'},itinerary:{duration:0,still:3.6,chapter:'반복 경유'},stations:{duration:0,still:12,chapter:'우주의 환승역'},
    conclusion:{duration:0,chapter:'결론'},ending:{duration:0,chapter:'FLYBY'}
  });

  /** 값을 구간 안으로 제한함. */
  function clamp(value,low=0,high=1) {return Math.max(low,Math.min(high,value));}

  /** 경계에서 밝기가 갑자기 변하지 않도록 페이드에만 적용함. */
  function smooth(value) {const t=clamp(value);return t*t*(3-2*t);}

  /** 두 점 사이 선형 보간. */
  function mix(a,b,t) {return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}

  /** Canvas 텍스트의 기본 글꼴과 색상을 통일함. */
  function label(ctx,text,x,y,color=COLORS.muted,size=25,align='left') {
    ctx.save();ctx.font=`${size}px ${FONT}`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y);ctx.restore();
  }

  /** 여러 점을 잇는 선 렌더링. 비교 경로는 색과 점선으로 함께 구별함. */
  function polyline(ctx,points,color=COLORS.mint,dashed=false,lineWidth=2) {
    if(points.length<2) return;
    ctx.save();ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';
    if(dashed)ctx.setLineDash([8,11]);
    points.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();ctx.restore();
  }

  /** 곡선 경로를 선분으로 표본화하고 실제 누적 길이를 함께 계산함. */
  function curve(key,points) {
    if(paths.has(key))return paths.get(key);
    const samples=[],lengths=[0];let length=0;
    for(let i=0;i<=180;i++) {
      const t=i/180,u=1-t;
      const p={x:u*u*u*points[0].x+3*u*u*t*points[1].x+3*u*t*t*points[2].x+t*t*t*points[3].x,
        y:u*u*u*points[0].y+3*u*u*t*points[1].y+3*u*t*t*points[2].y+t*t*t*points[3].y};
      if(i>0){length+=Math.hypot(p.x-samples[i-1].x,p.y-samples[i-1].y);lengths.push(length);}
      samples.push(p);
    }
    const value={samples,lengths,length};paths.set(key,value);return value;
  }

  /** 호 길이 비율로 이동 위치를 찾아 제어점 배치에 따른 가짜 가감속을 피함. */
  function along(path,fraction) {
    const target=clamp(fraction)*path.length;let low=0,high=path.lengths.length-1;
    while(low<high){const mid=Math.floor((low+high)/2);if(path.lengths[mid]<target)low=mid+1;else high=mid;}
    const i=Math.max(1,low),span=path.lengths[i]-path.lengths[i-1],u=span>0?(target-path.lengths[i-1])/span:0;
    const p=mix(path.samples[i-1],path.samples[i],u);
    return {...p,angle:Math.atan2(path.samples[i].y-path.samples[i-1].y,path.samples[i].x-path.samples[i-1].x),index:i};
  }

  /** 곡선에서 지나간 부분만 궤적으로 표시함. */
  function trace(ctx,path,fraction,color=COLORS.mint,dashed=false) {
    const p=along(path,fraction);polyline(ctx,[...path.samples.slice(0,p.index),p],color,dashed,2.3);return p;
  }

  /** 외부 이미지 없이 행성별 색·대륙·줄무늬와 명암 생성. */
  function texture(kind) {
    if(textures.has(kind))return textures.get(kind);
    const image=document.createElement('canvas');image.width=320;image.height=320;const ctx=image.getContext('2d');
    ctx.save();ctx.beginPath();ctx.arc(160,160,153,0,Math.PI*2);ctx.clip();
    ctx.fillStyle=kind==='earth'?'#427e94':kind==='mars'?'#bb8065':'#b8a58b';ctx.fillRect(0,0,320,320);
    if(kind==='earth') {
      ctx.fillStyle='#83a68c';
      ctx.beginPath();ctx.moveTo(70,40);ctx.bezierCurveTo(200,10,145,100,215,105);ctx.bezierCurveTo(255,140,170,151,190,195);ctx.bezierCurveTo(130,240,150,152,110,155);ctx.bezierCurveTo(45,165,90,100,40,105);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.ellipse(222,248,42,24,-.3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#e9f0e665';ctx.lineWidth=8;
      for(let y=65;y<280;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(150,y-20,170,y+30,320,y+4);ctx.stroke();}
    } else {
      const bands=kind==='mars'?['#a66d57','#cf9677','#b17a61']:['#c6b695','#93806b','#cfbea3','#aa927b'];
      for(let y=0;y<320;y+=5){ctx.globalAlpha=.5;ctx.fillStyle=bands[Math.floor((y+5*Math.sin(y*.1))/18)%bands.length];ctx.fillRect(0,y,320,7);}
      ctx.globalAlpha=1;
    }
    const shade=ctx.createRadialGradient(90,80,10,170,165,185);shade.addColorStop(0,'#e6fff02a');shade.addColorStop(.47,'#06151d10');shade.addColorStop(.82,'#06111bc2');shade.addColorStop(1,'#040c14ff');ctx.fillStyle=shade;ctx.fillRect(0,0,320,320);ctx.restore();
    textures.set(kind,image);return image;
  }

  /** 행성 또는 두 엽으로 단순화한 67P 혜성 그림. 크기는 설명용 확대임. */
  function planet(ctx,x,y,r,kind='jupiter',name='') {
    ctx.save();
    if(kind==='comet') {
      const glow=ctx.createRadialGradient(x,y,0,x,y,r*2.5);glow.addColorStop(0,'#b4e9ce16');glow.addColorStop(1,'#b4e9ce00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*2.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#949d98';ctx.beginPath();ctx.ellipse(x-r*.25,y+r*.15,r*.8,r*.57,-.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a9b1a7';ctx.beginPath();ctx.ellipse(x+r*.45,y-r*.38,r*.55,r*.45,.3,0,Math.PI*2);ctx.fill();
    } else {
      const glow=ctx.createRadialGradient(x,y,r*.8,x,y,r*1.45);glow.addColorStop(0,'#a5d8d81a');glow.addColorStop(1,'#a5d8d800');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.45,0,Math.PI*2);ctx.fill();
      ctx.drawImage(texture(kind),x-r*1.046,y-r*1.046,r*2.092,r*2.092);ctx.strokeStyle='#d2ded32b';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    }
    if(name)label(ctx,name,x,y+r+35,COLORS.ink,25,'center');ctx.restore();
  }

  /** 작은 탐사선과 필요한 출발 장면에 한해서 엔진 분사 표시. */
  function probe(ctx,p,angle=0,flame=false,color=COLORS.mint,scale=1) {
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.scale(scale,scale);
    if(flame){const power=typeof flame==='number'?flame:1;ctx.fillStyle='#e7b788aa';ctx.beginPath();ctx.moveTo(-8,-5);ctx.lineTo(-22-13*power,0);ctx.lineTo(-8,5);ctx.fill();}
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.fillStyle='#3b6072';ctx.fillRect(-5,-21,10,13);ctx.strokeRect(-5,-21,10,13);ctx.fillRect(-5,8,10,13);ctx.strokeRect(-5,8,10,13);
    ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(0,8);ctx.stroke();ctx.fillStyle='#d7e2dc';ctx.fillRect(-7,-5,14,10);
    ctx.fillStyle='#ece3c9';ctx.beginPath();ctx.ellipse(9,0,2,7,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  /** 중력 방향이나 목표 지점에만 사용하는 간단한 화살표. 벡터 패널은 아님. */
  function arrow(ctx,a,b,color=COLORS.amber) {
    polyline(ctx,[a,b],color,false,2);const angle=Math.atan2(b.y-a.y,b.x-a.x);
    ctx.save();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-13*Math.cos(angle-.4),b.y-13*Math.sin(angle-.4));ctx.lineTo(b.x-13*Math.cos(angle+.4),b.y-13*Math.sin(angle+.4));ctx.closePath();ctx.fill();ctx.restore();
  }

  /** 중력 통과 장면의 관측 방향 회전. */
  function rotate(x,y,a=1.15) {return {x:Math.cos(a)*x+Math.sin(a)*y,y:-Math.sin(a)*x+Math.cos(a)*y};}

  /** 행성 기준 또는 태양 기준에서 여정 전체가 들어오는 고정 구도 계산. */
  function flightFrame(flight,frame,w,h,angle=1.15) {
    const first=flight.states[0];
    const key=`${flight.planetVy}/${first.vx}/${first.y}/${frame}/${w}/${h}/${angle}`;if(frames.has(key))return frames.get(key);
    const points=[];
    /** 관측 기준에 맞는 위치 반환. */
    function coordinates(s,isPlanet=false) {
      if(frame==='planet')return isPlanet?{x:0,y:0}:rotate(s.x-s.px,s.y-s.py,angle);
      return isPlanet?rotate(s.px,s.py,angle):rotate(s.x,s.y,angle);
    }
    for(let i=0;i<flight.states.length;i+=16){const s=flight.states[i];points.push(coordinates(s),coordinates(s,true));}
    const last=flight.states[flight.states.length-1];points.push(coordinates(last),coordinates(last,true));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const scale=Math.min((w-230)/(maxX-minX),(h-260)/(maxY-minY)),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    /** 표시 좌표를 고정 Canvas 영역에 투영함. */
    function project(s,isPlanet=false) {const p=coordinates(s,isPlanet);return {x:w/2+(p.x-cx)*scale,y:h*.43-(p.y-cy)*scale};}
    const value={project,scale,radius:Math.min(65,flight.closest*scale*.61)};frames.set(key,value);return value;
  }

  /** 실제 적분 경로를 그리며 두 관측 기준에서 속력 설명을 구분함. */
  function flyby(ctx,w,h,time,{frame='sun',effect='gain',loop=false,duration=9,endpoints=false,markers=false,planetTrail=false,angle=1.15}={}) {
    const flight=flights[effect],layout=flightFrame(flight,frame,w,h,angle),local=loop && !reduced.matches?time%12:time;
    const fraction=clamp(local/duration),s=FlybyModel.sample(flight,fraction),p=layout.project(s),body=layout.project(s,true);
    const alpha=loop && !reduced.matches?Math.min(smooth(local/.5),1-smooth((local-11)/1)):1;
    ctx.save();ctx.globalAlpha*=alpha;
    const points=[];const count=Math.floor(fraction*(flight.states.length-1));
    for(let i=0;i<=count;i+=9)points.push(layout.project(flight.states[i]));points.push(p);
    if(planetTrail) {
      const origin=layout.project(flight.states[0],true),destination=layout.project(flight.states[flight.states.length-1],true);
      polyline(ctx,[origin,destination],'#e7b78845',true);
      polyline(ctx,[origin,body],COLORS.amber,false,2);
      label(ctx,'행성의 공전 방향',w*.5,h-35,COLORS.amber,24,'center');
      for(let i=0;i<count;i+=Math.max(1,Math.floor(flight.states.length/10))) {
        const q=layout.project(flight.states[i],true);ctx.fillStyle='#e7b78870';ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.fill();
      }
    }
    polyline(ctx,points,COLORS.mint,false,2.5);
    if(markers) {
      // 일정한 물리 시간 간격의 점. 간격의 넓고 좁음이 실제 속력 변화를 드러냄.
      const interval=Math.max(1,Math.round(flight.states.length/24));
      for(let i=0;i<=count;i+=interval) {
        const q=layout.project(flight.states[i]);ctx.fillStyle=COLORS.mint;ctx.beginPath();ctx.arc(q.x,q.y,3.7,0,Math.PI*2);ctx.fill();
      }
    }
    planet(ctx,body.x,body.y,layout.radius,'jupiter','행성');
    const v=frame==='planet'?rotate(s.vx,s.vy-flight.planetVy,angle):rotate(s.vx,s.vy,angle);
    probe(ctx,p,Math.atan2(-v.y,v.x),false,COLORS.mint,markers?1.5:1.12);
    label(ctx,'탐사선',p.x,p.y-40,COLORS.mint,22,'center');
    if(endpoints && fraction===1) {
      const first=layout.project(flight.states[0]),last=layout.project(flight.states[flight.states.length-1]);
      for(const point of [first,last]) {ctx.strokeStyle=COLORS.amber;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(point.x,point.y,20,0,Math.PI*2);ctx.stroke();}
      label(ctx,'접근 전',first.x,first.y+55,COLORS.amber,22,'center');label(ctx,'이탈 후',last.x,last.y+55,COLORS.amber,22,'center');
    }
    ctx.restore();
  }

  /** 09장의 같은 시간 동안 이동한 거리를 정지된 전후 그림으로 비교함. */
  function speedComparison(ctx,w,h,time,effect) {
    const flight=flights[effect],first=flight.states[0],last=flight.states[flight.states.length-1];
    const before=Math.hypot(first.vx,first.vy),after=Math.hypot(last.vx,last.vy);
    const fastest=Math.hypot(flights.gain.states[flights.gain.states.length-1].vx,flights.gain.states[flights.gain.states.length-1].vy);
    // 같은 5.5초 동안 이동한 결과를 고정함. 양쪽의 시간과 픽셀 축척은 동일함.
    const move=5.5,t=move,scale=(w-245)/(fastest*move),x0=110;
    ctx.save();
    const lanes=[{y:h*.32,speed:before,name:'통과 전',color:COLORS.muted},{y:h*.65,speed:after,name:'통과 후',color:COLORS.mint}];
    for(const lane of lanes) {
      const p={x:x0+lane.speed*t*scale,y:lane.y};
      label(ctx,lane.name,x0,lane.y-65,lane.color,29);
      polyline(ctx,[{x:x0,y:lane.y},{x:w-100,y:lane.y}],'#829aa535',true);
      polyline(ctx,[{x:x0,y:lane.y},p],lane.color,false,2.5);
      // 같은 0.7초 간격의 위치 흔적. 감속 후에는 점과 실제 이동량이 함께 좁아짐.
      for(let mark=0;mark<=t;mark+=.7) {ctx.fillStyle=lane.color;ctx.beginPath();ctx.arc(x0+lane.speed*mark*scale,lane.y,3.5,0,Math.PI*2);ctx.fill();}
      probe(ctx,p,0,false,lane.color,1.7);
    }
    ctx.restore();label(ctx,'같은 시간 동안 이동한 거리',w*.5,h-70,COLORS.ink,27,'center');
  }

  /** 09장의 방향 전환은 원래 진행선과 실제 휘어진 경로를 겹쳐 구별함. */
  function turning(ctx,w,h,time) {
    const flight=flights.turn,angle=.45,layout=flightFrame(flight,'sun',w,h,angle);
    const start=flight.states[0],origin=layout.project(start),v=rotate(start.vx,start.vy,angle);
    polyline(ctx,[origin,{x:origin.x+v.x*layout.scale*flight.duration,y:origin.y-v.y*layout.scale*flight.duration}],'#829aa54d',true);
    flyby(ctx,w,h,time,{effect:'turn',angle,markers:true});
    label(ctx,'원래 방향에서 휘어지는 경로',w*.5,h-65,COLORS.mint,26,'center');
  }

  /** 11장의 접근·최근접·이탈을 넓은 구도와 동일 시간 흔적으로 보여줌. */
  function stationary(ctx,w,h,time) {
    const flight=flights.stationary,fraction=clamp(time/STATIONARY_MOVE),s=FlybyModel.sample(flight,fraction);
    const distance=Math.hypot(s.x,s.y),radial=s.x*s.vx+s.y*s.vy;
    const message=fraction===1?'같은 거리로 돌아오면 처음과 비슷한 속력':distance<flight.closest*1.25?'가장 가까운 곳에서 가장 빠르게':radial<0?'가까워지면서 빨라짐':'멀어지면서 다시 느려짐';
    flyby(ctx,w,h,time,{effect:'stationary',frame:'planet',duration:STATIONARY_MOVE,endpoints:true,markers:true});
    label(ctx,message,w*.5,h-40,COLORS.amber,26,'center');
    label(ctx,'점은 같은 시간 간격의 위치',w*.5,26,COLORS.muted,20,'center');
  }

  /** 정의 전환 장은 행성 그림을 반복하지 않고 여정선과 제목에 집중함. */
  function definitionArt(ctx,w,h,time) {
    const route=curve(`definition-${w}`,[{x:35,y:h*.8},{x:w*.42,y:h*.8},{x:w*.27,y:h*.3},{x:w-60,y:h*.16}]);
    polyline(ctx,route.samples,'#b4e9ce35',false,2);
    const p=trace(ctx,route,clamp(time/8));probe(ctx,p,p.angle,false,COLORS.mint,1.6);
  }

  /* === 도입 · 탈출 · 웅덩이 비유 === */

  /** 목성에 머무는 임무와 더 멀리 향하는 임무의 도착 조건 차이를 개념적으로 비교. */
  function mission(ctx,w,h,t) {
    const earth={x:125,y:h*.58},jupiter={x:w*.58,y:h*.55};
    const a=curve(`mission-a-${w}`, [{x:earth.x+75,y:earth.y+20},{x:w*.3,y:h*.89},{x:jupiter.x-210,y:h*.9},{x:jupiter.x-120,y:jupiter.y}]);
    const b=curve(`mission-b-${w}`, [{x:earth.x+75,y:earth.y-20},{x:w*.36,y:h*.05},{x:w*.62,y:h*.08},{x:w-85,y:h*.19}]);
    polyline(ctx,a.samples,'#70858c80',true);polyline(ctx,b.samples,'#b4e9ce55');
    const pa=trace(ctx,a,clamp(t/9),COLORS.muted,true),pb=trace(ctx,b,clamp(t/7),COLORS.mint);
    planet(ctx,earth.x,earth.y,57,'earth','지구');planet(ctx,jupiter.x,jupiter.y,71,'jupiter','목성');
    if(t>=9) {
      const angle=Math.PI+(t-9)*.7;ctx.save();ctx.strokeStyle='#829aa544';ctx.setLineDash([5,8]);ctx.beginPath();ctx.ellipse(jupiter.x,jupiter.y,120,76,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      probe(ctx,{x:jupiter.x+120*Math.cos(angle),y:jupiter.y+76*Math.sin(angle)},angle+Math.PI/2,false,COLORS.muted);
    } else probe(ctx,pa,pa.angle,false,COLORS.muted);
    probe(ctx,pb,pb.angle,false,COLORS.mint);
    label(ctx,'A  목성에 머무는 임무',w*.23,h-36,COLORS.muted,25);
    label(ctx,'B  목성을 지나 더 멀리',w*.52,35,COLORS.mint,25);
  }

  /** 지구 탈출을 처음 생각하는 직선 안내도와 엔진 분사. */
  function direct(ctx,w,h,t) {
    const earth={x:160,y:h*.5},end={x:w-160,y:h*.5},fraction=clamp(t/7)*.57;
    polyline(ctx,[{x:earth.x+95,y:earth.y},end],'#829aa55e',true);
    const p=mix({x:earth.x+125,y:earth.y},end,fraction);
    planet(ctx,earth.x,earth.y,100,'earth','지구');planet(ctx,end.x,end.y,49,'mars','목적지');
    probe(ctx,p,0,1+clamp(t/7)*1.5,COLORS.mint,1.7);label(ctx,'탐사선',p.x,p.y-55,COLORS.mint,25,'center');
    polyline(ctx,[{x:earth.x+110,y:earth.y},p],COLORS.mint);
  }

  /** 중력에 맞서 떠나는 탐사선과 지구를 향하는 인력 표현. */
  function gravity(ctx,w,h,t) {
    const earth={x:w*.32,y:h*.62},p={x:w*.58+Math.min(t,6)*20,y:h*.35-Math.min(t,6)*6};
    planet(ctx,earth.x,earth.y,117,'earth','지구');probe(ctx,p,-.34,true,COLORS.mint,1.8);
    arrow(ctx,{x:p.x-28,y:p.y+30},{x:earth.x+100,y:earth.y-100});
    label(ctx,'중력',(p.x+earth.x)/2+5,(p.y+earth.y)/2+20,COLORS.amber,28);
  }

  /** 중력 웅덩이의 에너지 비유를 경사진 격자로 투영함. */
  function well(ctx,w,h,t) {
    /** 평면 좌표와 에너지 높이를 화면에 투영함. */
    function project(x,z) {
      const depth=185*smooth(t/1.5)*Math.exp(-(x*x+z*z)/35000);
      return {x:w*.5+x+z*.46,y:h*.25+z*.23+depth};
    }
    for(let z=-220;z<=220;z+=35){const line=[];for(let x=-340;x<=340;x+=12)line.push(project(x,z));polyline(ctx,line,'#7bb9af46',false,1);}
    for(let x=-340;x<=340;x+=35){const line=[];for(let z=-220;z<=220;z+=12)line.push(project(x,z));polyline(ctx,line,'#7bb9af46',false,1);}
    const center=project(0,0);planet(ctx,center.x,center.y+17,48,'earth','지구');
    const progress=clamp(t/8),x=55+progress*260,p=project(x,0),near=project(x+2,0);
    probe(ctx,{x:p.x,y:p.y-24},Math.atan2(near.y-p.y,near.x-p.x),true,COLORS.mint,1.4);
    label(ctx,'밖으로 나가려면 에너지가 필요함',w*.5,h-70,COLORS.muted,25,'center');
  }

  /* === 조건과 경로 선택의 설명용 곡선. 실제 임무 궤도가 아님 === */

  /** 직접 이동과 행성 경유의 시간 관계를 수치 없이 표현함. */
  function routes(ctx,w,h,t,conclusion=false) {
    const start={x:125,y:h*.25},end={x:w-120,y:h*.25},body={x:w*.49,y:h*.76};
    const route=curve(`routes-${w}`, [start,{x:w*.3,y:h},{x:w*.62,y:h*.4},end]);
    ctx.save();ctx.globalAlpha=conclusion ? .3 : 1;polyline(ctx,[start,end],COLORS.muted,true);ctx.restore();
    polyline(ctx,route.samples,'#b4e9ce50');
    const a=mix(start,end,clamp(t/11));
    // 설명용 경유 경로는 만남 이후 같은 시간에 이동하는 거리가 더 커지도록 설정함.
    const progress=t<5?clamp(t/5)*.48:.48+clamp((t-5)/3)*.52;
    const p=trace(ctx,route,progress,COLORS.mint);planet(ctx,body.x,body.y,45,'jupiter','경유 행성');
    ctx.save();ctx.globalAlpha=conclusion ? .25 : 1;probe(ctx,a,0,false,COLORS.muted);ctx.restore();probe(ctx,p,p.angle,false,COLORS.mint,1.2);
    planet(ctx,start.x,start.y,36,'earth');planet(ctx,end.x,end.y,32,'mars');
    label(ctx,'직접 이동',w*.3,h*.16,COLORS.muted,25);label(ctx,'행성 경유',w*.62,h*.77,COLORS.mint,25);
  }

  /** 목표를 벗어난 경로와 목표로 향하는 경로를 별도 곡선으로 구성함. */
  function direction(ctx,w,h,t,correct) {
    const body={x:w*.5,y:h*.5},start={x:90,y:h*.72},goal={x:w-100,y:105};
    const wrong=curve(`direction-wrong-${w}`, [start,{x:w*.4,y:h*.27},{x:w*.64,y:h*.95},{x:w-100,y:h*.76}]);
    const right=curve(`direction-right-${w}`, [start,{x:w*.4,y:h*.95},{x:w*.85,y:h*.47},goal]);
    planet(ctx,body.x,body.y,55,'jupiter','행성');
    ctx.save();ctx.strokeStyle=COLORS.amber;ctx.setLineDash([5,7]);ctx.beginPath();ctx.arc(goal.x,goal.y,28,0,Math.PI*2);ctx.stroke();ctx.restore();label(ctx,'목표 방향',goal.x,goal.y-47,COLORS.amber,23,'center');
    if(correct)polyline(ctx,wrong.samples,'#c992863d',true);
    const path=correct?right:wrong,p=trace(ctx,path,clamp(t/5.5),correct?COLORS.mint:COLORS.bad,!correct);
    probe(ctx,p,p.angle,false,correct?COLORS.mint:COLORS.bad,1.2);
  }

  /** 거리 차이에 따른 경로 굽힘 차이를 두 개의 개념 곡선으로 표시함. */
  function distance(ctx,w,h,t) {
    const body={x:w*.48,y:h*.6};planet(ctx,body.x,body.y,60,'jupiter','행성');
    const near=curve(`distance-near-${w}`,[{x:80,y:h*.5},{x:w*.3,y:h*.55},{x:w*.5,y:h*.11},{x:w-90,y:90}]);
    const far=curve(`distance-far-${w}`,[{x:80,y:h*.2},{x:w*.4,y:h*.18},{x:w*.6,y:h*.14},{x:w-90,y:h*.2}]);
    polyline(ctx,far.samples,COLORS.muted,true);const p=trace(ctx,near,clamp(t/6));probe(ctx,p,p.angle,false,COLORS.mint,1.2);
    label(ctx,'지나는 거리에 따라 경로도 달라짐',w*.5,h-75,COLORS.muted,25,'center');
  }

  /** 행성이 먼저 지나간 경우와 시각을 맞춘 근접 통과를 순서대로 표현함. */
  function timing(ctx,w,h,t) {
    const corrected=t>=6,local=corrected?t-6:t,phase=clamp(local/4.5);
    // 두 시간 조건을 비교하는 경계에서 장면을 흐리게 전환하여 위치 점프를 감춤.
    ctx.save();ctx.globalAlpha=corrected?smooth((t-6)/.6):1-smooth((t-5)/1);
    const body={x:w*(corrected?.25+phase*.4:.56+phase*.25),y:h*.37};
    const route=curve(`timing-${w}`,[{x:80,y:h*.83},{x:w*.35,y:h*.77},{x:w*.47,y:h*.46},{x:w-110,y:h*.18}]);
    polyline(ctx,[{x:100,y:body.y},{x:w-90,y:body.y}],'#e7b78840',true);
    planet(ctx,body.x,body.y,48,'jupiter','행성');const p=trace(ctx,route,phase);probe(ctx,p,p.angle,false,COLORS.mint,1.2);
    ctx.restore();label(ctx,corrected?'도착 시각을 맞추면':'행성은 이미 지나간 뒤',w*.5,h-65,corrected?COLORS.mint:COLORS.muted,27,'center');
  }

  /** 조건 설명은 정지 도식으로 유지하고 다음 키로 강조할 조건만 바꿈. */
  function planningStill(ctx,w,h,focus) {
    if(focus===0){direction(ctx,w,h,6,true);return;}
    if(focus===1){distance(ctx,w,h,6);return;}
    timing(ctx,w,h,9);
    // 같은 접근 시점에 이미 멀리 있는 행성 위치를 점선으로 대비함.
    const ghost={x:w*.84,y:h*.37};ctx.save();ctx.strokeStyle=COLORS.muted;ctx.setLineDash([5,8]);ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(ghost.x,ghost.y,48,0,Math.PI*2);ctx.stroke();ctx.restore();
    label(ctx,'먼저 지나간 경우',ghost.x,ghost.y-75,COLORS.muted,23,'center');
  }

  /* === 로제타와 환승역 === */

  /** 태양·지구·혜성을 배치하고 아직 전체 여정을 보여주지 않는 도입 장면. */
  function rosetta(ctx,w,h,t) {
    const sun={x:w*.38,y:h*.45};
    ctx.save();ctx.strokeStyle='#b4e9ce22';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(sun.x,sun.y,w*.29,h*.29,-.15,0,Math.PI*2);ctx.stroke();ctx.restore();
    const glow=ctx.createRadialGradient(sun.x,sun.y,4,sun.x,sun.y,100);glow.addColorStop(0,'#f3d4a855');glow.addColorStop(1,'#e7b78800');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sun.x,sun.y,100,0,Math.PI*2);ctx.fill();ctx.fillStyle=COLORS.amber;ctx.beginPath();ctx.arc(sun.x,sun.y,24,0,Math.PI*2);ctx.fill();
    const earth={x:w*.28,y:h*.69};planet(ctx,earth.x,earth.y,44,'earth','지구');planet(ctx,w*.85,h*.19,46,'comet','67P');
    const path=curve(`rosetta-${w}`,[{x:earth.x+55,y:earth.y-10},{x:w*.51,y:h*.62},{x:w*.59,y:h*.38},{x:w*.66,y:h*.35}]);
    const p=trace(ctx,path,clamp(t/7));probe(ctx,p,p.angle,false,COLORS.mint,1.25);
  }

  /** 경유 순서를 위한 위치. 실제 태양계 좌표가 아닌 시간 순서상의 배치임. */
  function eventPoints(w,h) {
    return [.1,.255,.41,.565,.72,.9].map((x,i)=>({x:w*x,y:h*[.52,.3,.64,.36,.57,.23][i]}));
  }

  /** 단일 경유 구간이 행성 표면을 지나지 않도록 상단을 경유하는 곡선 생성. */
  function eventPath(points,i) {
    const a={x:points[i-1].x+42,y:points[i-1].y-62},b={x:points[i].x+42,y:points[i].y-62};
    return curve(`event-${width}-${height}-${i}`,[a,{x:a.x+60,y:a.y-90},{x:b.x-80,y:b.y-80},b]);
  }

  /** 다음 키마다 경유 사건 하나와 해당 연도만 공개함. */
  function itinerary(ctx,w,h,t,current) {
    const points=eventPoints(w,h),progress=clamp(t/2.8);
    for(let i=1;i<=current;i++) {
      const path=eventPath(points,i);trace(ctx,path,i<current?1:progress,COLORS.mint);
    }
    for(let i=0;i<=current;i++) {
      const event=ROSETTA_EVENTS[i],p=points[i];planet(ctx,p.x,p.y,30,event.kind,event.name);
      if(i===0)label(ctx,'출발',p.x,p.y+95,COLORS.muted,20,'center');
      if(i===current){label(ctx,event.year,p.x,p.y-76,COLORS.amber,32,'center');label(ctx,event.detail,p.x,p.y+115,COLORS.mint,21,'center');}
    }
    const p=current===0?{x:points[0].x+42,y:points[0].y-62,angle:-.35}:along(eventPath(points,current),progress);
    probe(ctx,p,p.angle,false,COLORS.mint,1.12);
  }

  /** 행성 이름을 역처럼 사용하되 탐사선은 각 지점에서 멈추지 않고 통과함. */
  function stations(ctx,w,h,t) {
    const y=h*.46,first=140,last=w-140,pct=clamp(t/12),x=first+(last-first)*pct;
    polyline(ctx,[{x:first,y},{x:last,y}],'#56777e',false,4);polyline(ctx,[{x:first,y},{x,y}],COLORS.mint,false,4);
    ROSETTA_EVENTS.forEach((event,i)=>{
      const px=first+(last-first)*i/5;ctx.fillStyle='#0b1921';ctx.strokeStyle=i===2?COLORS.amber:COLORS.mint;ctx.lineWidth=3;ctx.beginPath();ctx.arc(px,y,12,0,Math.PI*2);ctx.fill();ctx.stroke();
      label(ctx,event.name,px,y+70,i===2?COLORS.amber:COLORS.ink,29,'center');if(i===0)label(ctx,'출발',px,y+107,COLORS.muted,21,'center');
    });
    probe(ctx,{x,y:y-40},0,false,COLORS.mint,1.35);label(ctx,'로제타',x,y-90,COLORS.mint,23,'center');
  }

  /* === 장면 선택. 현재 장의 Canvas에만 그림을 생성함 === */

  /** 장면별 시간과 단계에 맞는 시각 요소 렌더링. 슬라이드는 자동 이동하지 않음. */
  function render(time) {
    if(!context)return;
    const ctx=context,w=width,h=height,name=slides[index].dataset.scene;ctx.clearRect(0,0,w,h);
    const config=SCENES[name];if(config.duration===0)time=config.still||0;
    slides[index].classList.toggle('scene-complete',name==='stationary' && time>=STATIONARY_MOVE);
    switch(name) {
      case 'mission':mission(ctx,w,h,time);break;
      case 'direct':direct(ctx,w,h,step===0?clamp(time/5)*7:7);break;
      case 'gravity':gravity(ctx,w,h,time);break;
      case 'well':well(ctx,w,h,time);break;
      case 'assist':flyby(ctx,w,h,time,{duration:6});break;
      case 'effects':if(step<2)speedComparison(ctx,w,h,time,['gain','loss'][step]);else turning(ctx,w,h,time);break;
      case 'stationary':stationary(ctx,w,h,time);break;
      case 'moving':flyby(ctx,w,h,time,{duration:7,angle:Math.PI/2,markers:true,planetTrail:true});break;
      case 'routes':routes(ctx,w,h,time);break;
      case 'direction':direction(ctx,w,h,time,step>0);break;
      case 'planning':planningStill(ctx,w,h,step);break;
      case 'itinerary':itinerary(ctx,w,h,time,step);break;
      case 'stations':stations(ctx,w,h,time);break;
      // 질문·정의·전환·결론 장은 도식을 반복하지 않고 문구에 집중함.
      case 'why':case 'rethink':case 'definition':case 'question':case 'rosetta':case 'conclusion':case 'ending':break;
    }
  }

  /** 예약된 그리기 취소. 장면 이탈 시 이전 루프가 남지 않게 함. */
  function stop() {if(rafId)cancelAnimationFrame(rafId);rafId=0;lastTime=null;}

  /** 핵심 장면을 한 번 진행하고 마지막 그림에서 그리기 요청 종료. */
  function frame(now) {
    rafId=0;if(lastTime!==null)elapsed+=Math.min((now-lastTime)/1000,.1);lastTime=now;
    const config=SCENES[slides[index].dataset.scene];render(Math.min(elapsed,config.duration));
    if(elapsed<config.duration)rafId=requestAnimationFrame(frame);else lastTime=null;
  }

  /** 현재 단계를 그리고 필요한 경우에만 단일 애니메이션 루프 시작. */
  function start() {
    stop();const config=SCENES[slides[index].dataset.scene];
    if(reduced.matches){render(config.duration);return;}
    render(elapsed);
    // 03장의 '그런데…' 공개는 출발 애니메이션을 다시 시작하지 않음.
    if(slides[index].dataset.scene==='direct' && step>0)return;
    if(!document.hidden && config.duration>0 && elapsed<config.duration)rafId=requestAnimationFrame(frame);
  }

  /** 화면 비율과 현재 Canvas 해상도 조정. 내부 레이아웃은 유지함. */
  function resize() {
    const scale=Math.min(innerWidth/1920,innerHeight/1080);deck.style.transform=`translate(${(innerWidth-1920*scale)/2}px,${(innerHeight-1080*scale)/2}px) scale(${scale})`;
    canvas=slides[index].querySelector('canvas');
    // 정수가 아닌 기기 픽셀 비율에서도 반복 반올림으로 논리 크기가 변하지 않도록 원본 보관.
    width=Number(canvas.dataset.baseWidth||canvas.getAttribute('width'));height=Number(canvas.dataset.baseHeight||canvas.getAttribute('height'));
    canvas.dataset.baseWidth=String(width);canvas.dataset.baseHeight=String(height);
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.dataset.dpr=String(dpr);context=canvas.getContext('2d');context.setTransform(dpr,0,0,dpr,0,0);
    render(reduced.matches?SCENES[slides[index].dataset.scene].duration:elapsed);
  }

  /** 단계 공개 문구와 강조 단어를 현재 단계에 맞춤. */
  function reveal() {
    const slide=slides[index];
    slide.querySelectorAll('[data-step],[data-until]').forEach(el=>{
      const min=Number(el.dataset.step||0),max=el.dataset.until===undefined?Infinity:Number(el.dataset.until);el.classList.toggle('step-visible',step>=min && step<=max);
    });
    slide.querySelectorAll('[data-focus]').forEach(el=>el.classList.toggle('focused',Number(el.dataset.focus)===step));
    document.getElementById('announcement').textContent=`${index+1} / ${slides.length}: ${slide.querySelector('h1')?.textContent||slide.querySelector('.eyebrow').textContent}`;
  }

  /** 지정 슬라이드를 열고 시간·단계·이전 장면 루프 초기화. */
  function show(target) {
    stop();index=Math.max(0,Math.min(slides.length-1,target));step=0;elapsed=0;
    slides.forEach((slide,i)=>{const active=i===index;slide.classList.toggle('active',active);slide.setAttribute('aria-hidden',String(!active));slide.inert=!active;slide.classList.remove('scene-complete');});
    document.getElementById('slide-number').textContent=String(index+1).padStart(2,'0');document.getElementById('chapter-label').textContent=SCENES[slides[index].dataset.scene].chapter;
    reveal();resize();start();
  }

  /** 다음 단계가 있으면 공개하고 없으면 다음 장으로 이동. 마지막 장 유지. */
  function next() {
    if(step<Number(slides[index].dataset.steps)-1){
      step++;
      // 문구만 공개하는 장에서는 진행 중인 여정을 처음으로 되돌리지 않음.
      if(!['definition','conclusion'].includes(slides[index].dataset.scene))elapsed=0;
      reveal();start();
    }
    else if(index<slides.length-1)show(index+1);
  }

  /** 이전 슬라이드로 이동. 첫 장보다 앞으로는 이동하지 않음. */
  function previous() {if(index>0)show(index-1);}

  /** 키 반복과 단축키 조합으로 인한 의도하지 않은 연속 이동 방지. */
  function keydown(event) {
    if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target?.tagName||''))return;
    if(event.key==='ArrowRight'||event.code==='Space'||event.key==='PageDown'){event.preventDefault();next();}
    else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();previous();}
  }

  /* === 초기화. 네트워크 통신·타이머·자동 슬라이드 이동 없음 === */
  addEventListener('keydown',keydown);addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
  reduced.addEventListener('change',start);show(0);
})();
