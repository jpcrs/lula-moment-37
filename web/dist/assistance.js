/* A visual reference only. It never supplies inputs or changes the native engine. */
function momentGuideCues(sequence) {
  const directions={1:'↑',2:'↓',4:'←',8:'→',6:'↙',10:'↘',5:'↖',9:'↗'};
  const frames=Object.keys(sequence.inputs).map(Number),last=Math.max(...frames),cues=[];
  const shoryukenMotion=sequence.finish.shoryuken_motion,superMotion=sequence.finish.super_motion;
  const motionStart=frames.find(f=>(sequence.inputs[f]&512)&&(sequence.inputs[f]&15)===2);
  const finisher=frames.find(f=>(sequence.inputs[f]&256)&&(sequence.inputs[f]&15)===4);
  let previousDir=0,previousAttack=0,parry=0;
  for(let frame=0;frame<=last+1;frame++){
    const bits=sequence.inputs[frame]||0,dir=bits&15,attack=bits&1904;
    if(dir&&dir!==previousDir){
      let end=frame+1;while(end<=last&&(sequence.inputs[end]&15)===dir)end++;
      const isParry=dir===4&&frame<motionStart,isMotion=frame>=motionStart;
      const ordinal=isParry?++parry:0;
      cues.push({id:`dir-${frame}`,frame,end,bits:dir,lane:'direction',glyph:directions[dir]||'↔',kind:isParry?'parry':isMotion?'motion':'jump',ordinal,
        windowStart:isParry?sequence.expected_parries[ordinal-1]-sequence.parry_window+1:null,
        windowEnd:isParry?sequence.expected_parries[ordinal-1]+1:null,
        name:isParry?(ordinal===15?'Defesa aérea':'Defesa '+String(ordinal).padStart(2,'0')):frame===motionStart?'Chute médio agachado':frame===finisher?'Shippu Jinraikyaku':isMotion?(frame>=shoryukenMotion&&frame<superMotion?'Comando do Shoryuken':'Comando do especial'):'Pulo',
        hint:isParry?'Toque para a frente enquanto o alvo brilha e solte':frame===motionStart?'Segure ↓ e toque CM':frame===finisher?'← + CL':isMotion?'Segure até a próxima direção':'Toque para cima'});
    }
    if(attack&&attack!==previousAttack){
      let end=frame+1;while(end<=last&&(sequence.inputs[end]&1904)===attack)end++;
      const rank=attack===1024?'HK':attack===512?'MK':attack===32?'MP':'LK';
      const label={HK:'CF',MK:'CM',MP:'SM',LK:'CL'}[rank];
      cues.push({id:`attack-${frame}`,frame,end,bits:attack,lane:'attack',glyph:label,kind:rank==='MP'?'punch':'kick',key:rank==='HK'?'D':rank==='MK'?'S':rank==='MP'?'X':'A',
        name:rank==='HK'?'Chute forte no ar':rank==='MK'?'Chute médio agachado':rank==='MP'?'Shoryuken médio':'Shippu Jinraikyaku',hint:rank==='MP'?'← ↓ ↙ + SM e cancele o primeiro acerto em Shippu':rank==='LK'?'Finish ↓ ↙ ← ↓ ↙ ← + CL':'Toque '+label});
    }
    previousDir=dir;previousAttack=attack;
  }
  return cues.sort((a,b)=>a.frame-b.frame);
}

function momentGuideX(cue) {return cue.lane==='attack'?0.87:(cue.bits===2||cue.bits===1)?0.18:cue.bits===6?0.36:0.54;}

class MomentAssistance {
  constructor({root,button,panel,track,targets,title,hint,legend}) {
    Object.assign(this,{root,button,panel,track,targets,title,hint,legend});
    this.enabled=false;this.loaded=false;this.cues=[];this.nodes=[];this.width=this.height=0;
    this.snapshot={frame:0,parries:0,status:0};this.stoppedFrame=null;this.flashFrame=-100;this.previousParries=0;this.desynced=false;
    this.keyboard=true;this.paused=false;
    this.resizeObserver=new ResizeObserver(()=>{this.measure();this.render();});this.resizeObserver.observe(track);
  }
  async load() {
    const response=await fetch('guide-sequence.json?v=20261009-daigo-finish');if(!response.ok)throw new Error('Não foi possível carregar o guia de comandos.');
    const sequence=await response.json();
    if(Math.abs(sequence.fps-MomentTiming.FPS)>1e-6)throw new Error('A taxa de quadros do guia não corresponde à do jogo.');
    this.contacts=sequence.expected_parries;
    this.cues=momentGuideCues(sequence);
    this.motionStart=this.cues.find(c=>c.kind==='motion').frame;
    this.receptors=['updown','diagonal','forward','attack'].map(id=>{
      const node=document.createElement('div');node.className='guide-receptor';node.dataset.target=id;
      const symbol=document.createElement('span');symbol.className='guide-symbol';node.append(symbol);
      const key=document.createElement('small');key.className='guide-key';node.append(key);
      this.targets.append(node);return node;
    });
    this.nodes=this.cues.map(cue=>{
      const node=document.createElement('div');node.className=`guide-note ${cue.kind}`;node.dataset.inputFrame=cue.frame;node.dataset.cue=cue.id;
      node.setAttribute('aria-hidden','true');node.hidden=true;
      const tail=document.createElement('i');tail.className='guide-hold';node.append(tail);
      if(cue.kind==='parry'){const window=document.createElement('i');window.className='guide-window';node.append(window);node.dataset.windowStart=cue.windowStart;node.dataset.windowEnd=cue.windowEnd;}
      const symbol=document.createElement('span');symbol.className='guide-symbol';symbol.textContent=cue.glyph;node.append(symbol);
      if(cue.ordinal){const number=document.createElement('small');number.className='guide-number';number.textContent=cue.ordinal;node.append(number);}
      if(cue.key){const key=document.createElement('small');key.className='guide-key';key.textContent=cue.key;node.append(key);}
      this.track.append(node);return node;
    });
    this.loaded=true;this.render();
  }
  setEnabled(enabled) {
    this.enabled=enabled;this.panel.hidden=!enabled;this.root.classList.toggle('has-assistance',enabled);
    this.button.setAttribute('aria-pressed',enabled);this.button.setAttribute('aria-expanded',enabled);
    this.measure();this.render();
  }
  reset() {
    this.snapshot={frame:0,parries:0,status:1};this.stoppedFrame=null;this.flashFrame=-100;this.previousParries=0;this.desynced=false;
    this.render();
  }
  observe(engine) {
    const frame=engine._web_value(2),parries=engine._web_value(5),status=engine._web_status();
    const finishFailed=!!engine._web_value(60),failed=finishFailed||!!engine._web_value(54)||engine._web_value(40)===3||status===3;
    if(failed&&this.stoppedFrame===null)this.stoppedFrame=frame;
    if(parries>this.previousParries){
      this.flashFrame=frame;
      // Movement can alter contact timing. Stop the reference rather than show false future cues.
      if(this.contacts?.[parries-1]!==undefined&&frame-1!==this.contacts[parries-1]){
        this.desynced=true;if(this.stoppedFrame===null)this.stoppedFrame=frame;
      }
    }
    this.previousParries=parries;this.snapshot={frame,parries,status,failed,finishFailed,desynced:this.desynced};
  }
  measure() {
    if(!this.enabled)return;
    this.width=this.track.clientWidth;this.height=this.track.clientHeight;
    this.strikeY=this.height*.78;this.pixelsPerFrame=Math.max(1.8,this.strikeY/90);
    this.targets.style.top=`${this.strikeY}px`;
  }
  render({paused=this.paused,controller=!this.keyboard,touch=this.touch}={}) {
    this.paused=paused;this.keyboard=!controller;this.touch=touch;
    if(!this.enabled||!this.loaded||!this.width)return;
    const state=this.snapshot,frame=this.stoppedFrame??state.frame;
    const renderKey=[frame,state.status,state.parries,!!state.failed,!!state.desynced,paused,controller,touch,this.width,this.height,this.flashFrame].join(':');
    if(renderKey===this.lastRenderKey)return;this.lastRenderKey=renderKey;
    this.track.dataset.frame=frame;this.targets.dataset.frame=frame;
    const parryConfirmed=state.parries>0&&frame>=this.flashFrame&&frame-this.flashFrame<=8&&!state.failed&&!state.desynced;
    this.panel.classList.toggle('guide-paused',paused);this.panel.classList.toggle('guide-failed',!!state.failed);
    this.panel.classList.toggle('guide-complete',state.status===4);
    this.panel.classList.toggle('guide-desynced',!!state.desynced);
    const openWindow=this.cues.find(c=>c.kind==='parry'&&c.ordinal>state.parries&&frame>=c.windowStart&&frame<c.windowEnd);
    const next=openWindow||this.cues.find(cue=>cue.frame>=frame),motionPhase=(next?.frame??frame)>=this.motionStart;
    const choose=filter=>{const matches=this.cues.filter(filter);return matches.find(c=>c.end>frame)||matches.at(-1);};
    const targetCues=[
      motionPhase?choose(c=>c.kind==='motion'&&c.bits===2):choose(c=>c.kind==='jump'),
      motionPhase?choose(c=>c.kind==='motion'&&c.bits===6):null,
      motionPhase?choose(c=>c.kind==='motion'&&c.bits===4):choose(c=>c.kind==='parry'),
      choose(c=>c.lane==='attack')
    ];
    this.receptors.forEach((node,i)=>{
      const cue=targetCues[i];node.hidden=!cue;if(!cue)return;
      node.className=`guide-receptor ${cue.kind}`;
      node.style.transform=`translate3d(${momentGuideX(cue)*this.width}px,0,0) translate(-50%,-50%)`;
      node.querySelector('.guide-symbol').textContent=cue.glyph;
      node.querySelector('.guide-key').textContent=controller?'':cue.key||'';
      node.classList.toggle('aligned',this.cues.some(c=>c.frame===frame&&momentGuideX(c)===momentGuideX(cue)));
      node.classList.toggle('window-open',i===2&&!!openWindow&&!state.failed&&!state.desynced);
      node.classList.toggle('confirmed',i===2&&parryConfirmed);
    });
    this.cues.forEach((cue,i)=>{
      const y=this.strikeY-(cue.frame-frame)*this.pixelsPerFrame,node=this.nodes[i];
      const visible=y>=-24&&y<=this.height+24&&frame<=cue.end+14;
      node.hidden=!visible;if(!visible)return;
      const motion=cue.kind==='motion';
      const x=momentGuideX(cue);
      node.style.transform=`translate3d(${x*this.width}px,${y}px,0) translate(-50%,-50%)`;
      node.style.setProperty('--hold-length',`${(cue.end-cue.frame)*this.pixelsPerFrame}px`);
      if(cue.kind==='parry'){
        node.style.setProperty('--window-length',`${(cue.windowEnd-cue.windowStart)*this.pixelsPerFrame}px`);
        node.style.setProperty('--window-after',`${(cue.windowEnd-1-cue.frame+.5)*this.pixelsPerFrame}px`);
      }
      node.classList.toggle('due',cue.frame===frame);node.classList.toggle('past',frame>cue.frame);
      node.classList.toggle('confirmed',cue.ordinal>0&&cue.ordinal<=state.parries);
      node.classList.toggle('missed',!!state.failed&&cue.ordinal===state.parries+1);
      if(cue.key)node.querySelector('.guide-key').textContent=controller?'':cue.key;
      if(motion)node.title=cue.glyph+' — segure até a próxima direção';
    });
    this.title.textContent=paused?'Pausado':state.status===4?'Desafio concluído':state.failed?(state.finishFailed?'Contra-ataque falhou':'Sequência interrompida'):state.desynced?'O ritmo mudou':state.status===1?'Pronto':next?.name||'Vire a luta';
    this.hint.textContent=state.failed?(touch?'Toque em Reiniciar':'Pressione R para reiniciar'):state.desynced?(touch?'Toque em Reiniciar para realinhar o guia':'Pressione R para realinhar o guia'):paused?'Retome o jogo para continuar':state.status===1?'Inicie o jogo para acompanhar o guia':next?.hint||'Vença a luta';
    this.legend.textContent=touch?'CF → CM → SM → CL · toque':controller?'CF → CM → SM → CL · controle':'CF = D · CM = S · SM = X · CL = A';
  }
  get state() {return{enabled:this.enabled,loaded:this.loaded,...this.snapshot,displayFrame:this.stoppedFrame??this.snapshot.frame,paused:this.paused};}
}
