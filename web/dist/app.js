/* The browser schedules frames and supplies buttons. The game owns all combat decisions. */
const $ = id => document.getElementById(id);
const canvas=$('canvas'),overlay=$('overlay'),play=$('play'),helpDialog=$('help-dialog'),mobileMenu=$('mobile-menu');
let resumeAfterHelp=false,resumeAfterMenu=false,helpReturnsToMenu=false,menuResumeAfterHelp=false,startPending=false,resumePending=false;
const audioMixer=new MomentAudio({volume:$('game-volume'),volumeValue:$('game-volume-value'),evoVolume:$('evo-volume'),evoValue:$('evo-volume-value')});
const assistanceGuide=new MomentAssistance({root:$('game'),button:$('assistance'),panel:$('assistance-panel'),track:$('guide-track'),targets:$('guide-targets'),title:$('guide-next'),hint:$('guide-hint'),legend:$('guide-legend')});
assistanceGuide.load().then(()=>{$('assistance').disabled=!ready;}).catch(error=>{$('assistance').title=error.message;console.error(error);});
const keys=new Set(),mapping={ArrowUp:1,ArrowDown:2,ArrowLeft:4,ArrowRight:8,KeyZ:16,KeyX:32,KeyC:64,KeyA:256,KeyS:512,KeyD:1024};
let engine,ready=false,paused=false,attempt=1,lastStatus=-1,lastParries=-1,padRetry=false,padPause=false,padBits=0,originalGame=false;
function updateCharacterNames(){
 for(const label of document.querySelectorAll('[data-fighter]'))label.textContent=label.dataset.fighter==='0'?(originalGame?'Ken':'Luiz'):(originalGame?'Chun-Li':'Flávio');
}
function setSoundOpen(open){$('sound-panel').hidden=!open;$('sound-toggle').setAttribute('aria-expanded',String(open));}
const frameClock=new MomentFrameClock(),keyboardHistory=new MomentButtonHistory(),padHistory=new MomentButtonHistory(),touchHistory=new MomentButtonHistory();
const touchControls=new MomentTouchControls({root:$('game'),controls:$('touch-controls'),pad:$('touch-pad'),rotate:$('mobile-rotate'),history:touchHistory,onBlocked:()=>{if(helpDialog.open)helpDialog.close();closeMobileMenu(false);resumeAfterHelp=helpReturnsToMenu=menuResumeAfterHelp=false;if(ready&&engine._web_status()===2)setPaused(true);}});
if(touchControls.mobile){
 $('mobile-settings').append(document.querySelector('.top-controls'));
 $('mobile-actions').append(document.querySelector('.game-actions'));
 const standalone=navigator.standalone||matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches;
 $('mobile-install').hidden=!!standalone;
 if(!/iPhone|iPad|iPod/.test(navigator.userAgent)&&!(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))
  $('mobile-install').innerHTML='Use <b>Tela cheia</b> para ocultar os controles do navegador ou adicione o jogo à tela inicial e abra pelo ícone.';
}
for(let i=0;i<15;i++)$('parry-markers').append(document.createElement('i'));
window.moment37={get engine(){return engine;},get state(){return {ready,paused,attempt,status:engine?engine._web_status():0,frameRate:MomentTiming.FPS,originalGame}},get audio(){return audioMixer.state;},get assistance(){return assistanceGuide.state;},get finish(){return engine?{stage:engine._web_value(59),failed:!!engine._web_value(60),hits:engine._web_value(61),cancels:engine._web_value(62),airParry:!!engine._web_value(63)}:null;}};
function keyboardBits(){let bits=0;for(const key of keys)bits|=mapping[key]||0;return bits;}
function resetInputClock(clearKeyboard=true,origin=performance.now()){if(clearKeyboard)keys.clear();touchControls.release();keyboardHistory.reset(keyboardBits(),origin);padHistory.reset(padBits,origin);touchHistory.reset(0,origin);frameClock.reset(origin);frameClock.last=performance.now();}
function input(now){
 let bits=0,pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);
 if(pad){
  $('controller').textContent='CONTROLE CONECTADO';
  const down=i=>!!pad.buttons[i]?.pressed;
  if(down(12)||pad.axes[1]<-.45)bits|=1;if(down(13)||pad.axes[1]>.45)bits|=2;
  if(down(14)||pad.axes[0]<-.45)bits|=4;if(down(15)||pad.axes[0]>.45)bits|=8;
  for(const [idx,mask] of [[2,16],[3,32],[5,64],[0,256],[1,512],[7,1024]])if(down(idx))bits|=mask;
  padHistory.record(bits,momentInputTime(pad.timestamp,now));padBits=bits;
  if(!helpDialog.open&&!mobileMenu.open&&!touchControls.blocked){if(down(8)&&!padRetry)retry();if(down(9)&&!padPause){if(engine?._web_status()===1)start();else togglePause();}}
  padRetry=down(8);padPause=down(9);
 }else{$('controller').textContent=touchControls.mobile?'CONTROLES DE TOQUE PRONTOS':'TECLADO PRONTO';padRetry=padPause=false;padBits=0;padHistory.record(0,now);}
}
async function start(origin){
 if(!ready||startPending||touchControls.blocked)return;
 startPending=true;play.disabled=true;
 try{
  const warm=audioMixer.context.state==='running'&&(!audioMixer.enabled||!!audioMixer.buffer);
  if(!warm)await audioMixer.arm();
  if(touchControls.blocked)return;
  setSoundOpen(false);audioMixer.reset();assistanceGuide.reset();engine._web_start();assistanceGuide.observe(engine);overlay.hidden=true;paused=false;$('pause-overlay').hidden=true;$('pause-note').hidden=true;$('pause').innerHTML='Ⅱ <span>Pausar</span>';$('pause').setAttribute('aria-label','Pausar');
  const now=performance.now();resetInputClock(true,warm&&Number.isFinite(origin)&&now-origin<4*MomentTiming.FRAME_MS?origin:now);canvas.focus();
 }
 catch(error){$('overlay-copy').hidden=false;$('overlay-copy').textContent=error.message;}
 finally{startPending=false;play.disabled=false;}
}
function retry(origin){if(!ready||startPending||touchControls.blocked)return;closeMobileMenu(false);audioMixer.reset();attempt++;$('attempts').textContent=`TENTATIVA ${String(attempt).padStart(2,'0')}`;$('mobile-attempts').textContent=`TENTATIVA ${String(attempt).padStart(2,'0')}`;engine._web_reset();assistanceGuide.reset();lastParries=-1;lastStatus=-1;start(origin);}
function setPaused(value,note=''){
 if(!value&&touchControls.blocked)return;
 if(!value&&audioMixer.context.state!=='running'){
  if(resumePending)return;
  resumePending=true;const resumeAttempt=attempt;
  audioMixer.unlock().then(()=>{if(attempt===resumeAttempt&&!helpDialog.open&&!mobileMenu.open&&engine?._web_status()===2)setPaused(false);})
   .catch(error=>{$('pause-note').textContent=error.message;$('pause-note').hidden=false;})
   .finally(()=>{resumePending=false;});
  return;
 }
 paused=value;touchControls.setInteractive(!paused&&!helpDialog.open&&!mobileMenu.open&&engine._web_status()===2);if(paused)audioMixer.pause(engine);else audioMixer.resume(engine);$('pause-overlay').hidden=!paused||helpDialog.open||mobileMenu.open;
 $('pause').innerHTML=paused?'▶ <span>Continuar</span>':'Ⅱ <span>Pausar</span>';
 $('pause').setAttribute('aria-label',paused?'Continuar':'Pausar');
 $('pause-note').textContent=note;$('pause-note').hidden=!note;resetInputClock(false);
}
function togglePause(){if(ready&&!touchControls.blocked&&engine._web_status()===2)setPaused(!paused);}
function openMobileMenu(){
 if(!touchControls.mobile||touchControls.blocked||mobileMenu.open||startPending)return;
 resumeAfterMenu=!!(ready&&engine._web_status()===2&&!paused);
 mobileMenu.showModal();
 if(resumeAfterMenu)setPaused(true);
 $('pause-overlay').hidden=true;keys.clear();touchControls.release();
}
function closeMobileMenu(resume=true){
 if(!mobileMenu.open)return;
 setSoundOpen(false);
 mobileMenu.close();const shouldResume=resume&&resumeAfterMenu;resumeAfterMenu=false;
 $('pause-overlay').hidden=!paused||helpDialog.open;
 if(shouldResume&&ready&&engine._web_status()===2&&!touchControls.blocked&&!document.hidden)setPaused(false);
 if(!touchControls.blocked)canvas.focus({preventScroll:true});
}
function openHelp(){
 if(helpDialog.open)return;
 setSoundOpen(false);
 helpReturnsToMenu=mobileMenu.open;menuResumeAfterHelp=resumeAfterMenu;
 if(helpReturnsToMenu)closeMobileMenu(false);
 resumeAfterHelp=!!(ready&&engine._web_status()===2&&!paused);
 helpDialog.showModal();
 if(resumeAfterHelp)setPaused(true);
 keys.clear();
}
function closeHelp(){
 if(!helpDialog.open)return;
 helpDialog.close();
 if(helpReturnsToMenu&&!touchControls.blocked){openMobileMenu();resumeAfterMenu=menuResumeAfterHelp;helpReturnsToMenu=menuResumeAfterHelp=false;resumeAfterHelp=false;return;}
 if(resumeAfterHelp&&ready&&engine._web_status()===2)setPaused(false);
 else $('pause-overlay').hidden=!paused;
 resumeAfterHelp=false;
 if(ready&&engine._web_status()===2)canvas.focus();else $('help').focus();
}
function update(){
 const status=engine._web_status(),count=engine._web_value(5);
 touchControls.setInteractive(status===2&&!paused&&!helpDialog.open&&!mobileMenu.open);
 assistanceGuide.render({paused,touch:touchControls.mobile,controller:touchControls.mobile||!!padBits||$('controller').textContent==='CONTROLE CONECTADO'});
 if(count!==lastParries){
  lastParries=count;$('parries').textContent=String(count).padStart(2,'0');$('mobile-parries').textContent=`${String(count).padStart(2,'0')} / 15`;
  Array.from($('parry-markers').children).forEach((el,i)=>el.classList.toggle('done',i<count));
  $('parry-progress').setAttribute('aria-valuenow',count);$('parry-progress').setAttribute('aria-valuetext',`${count} de 15 defesas precisas`);
 }
 if(status===lastStatus)return;
 lastStatus=status;overlay.classList.toggle('is-win',status===4);overlay.classList.toggle('is-loss',status===3);
 if(status===1){
  document.title='Lula Moment #37';
  $('evo-volume').disabled=false;$('assistance').disabled=!assistanceGuide.loaded;canvas.style.visibility='visible';ready=true;
  play.disabled=false;play.innerHTML='Jogar <span>↗</span>';$('overlay-title').hidden=false;$('overlay-title').textContent='Lula Moment #37';
  $('overlay-copy').hidden=true;$('overlay-copy').textContent='';$('load-track').hidden=true;$('load-note').hidden=true;
  $('retry').disabled=false;$('pause').disabled=false;
 }
 if(status===3||status===4){
  overlay.hidden=false;$('overlay-title').hidden=status===3;$('overlay-title').textContent=status===4?'Parabéns. Não esqueça de votar dia 25.':'';
  $('overlay-copy').hidden=true;$('overlay-copy').textContent='';play.textContent=status===4?'Jogar novamente':'Tentar novamente';
 }
}
function tick(presentationTime){
 requestAnimationFrame(tick);if(!engine)return;
 try{
  touchControls.refresh();
  const now=performance.now();input(now);
  if(!ready){for(let i=0;i<8&&engine._web_status()===0;i++)engine._web_step(0);$('load-note').textContent='Preparando o cenário…';assistanceGuide.observe(engine);update();return;}
  if(!paused&&engine._web_status()===2){
   const frames=frameClock.pending(presentationTime,now);
   if(frames<0){setPaused(true,touchControls.mobile?'O navegador ficou lento. Toque em Continuar quando estiver pronto.':'O navegador ficou lento. Feche abas pesadas e pressione Espaço para continuar.');return;}
   for(let i=0;i<frames&&engine._web_status()===2;i++){
    const at=frameClock.next(),bits=momentCombineButtons(keyboardHistory.sample(at),padHistory.sample(at),touchHistory.sample(at));
    // Present the newest state; intermediate catch-up frames still run all game logic.
    engine._web_render(i===frames-1||engine._web_value(40)?1:0);engine._web_step(bits);audioMixer.frame(engine);assistanceGuide.observe(engine);
   }
   engine._web_render(1);
  }
  update();
 }catch(err){failure(err);engine=null;}
}
function failure(err){console.error(err);overlay.hidden=false;overlay.classList.remove('is-win','is-loss');$('overlay-title').hidden=false;$('overlay-title').textContent='Não foi possível carregar o jogo';$('overlay-copy').hidden=false;$('overlay-copy').textContent='Recarregue a página para tentar novamente.';$('load-track').hidden=true;$('load-note').hidden=true;play.disabled=false;play.textContent='Recarregar';play.onclick=()=>location.reload();}
function unlockAudioFromGesture(event){
 if(event.isTrusted&&ready&&!touchControls.blocked&&audioMixer.context.state!=='running')audioMixer.unlock().catch(error=>console.debug(error));
}
for(const type of ['pointerup','touchend','keydown'])document.addEventListener(type,unlockAudioFromGesture,true);
document.addEventListener('keydown',e=>{
 if(touchControls.blocked)return;
 if(e.code==='Escape'&&!$('sound-panel').hidden){e.preventDefault();setSoundOpen(false);$('sound-toggle').focus();return;}
 if(helpDialog.open){e.stopPropagation();if(e.code==='Escape'){e.preventDefault();closeHelp();}return;}
 if(mobileMenu.open){e.stopPropagation();if(e.code==='Escape'){e.preventDefault();closeMobileMenu();}return;}
 if(e.target instanceof HTMLInputElement&&e.code!=='Escape'){e.stopPropagation();return;}
 if((e.target===$('assistance')||e.target===$('original-game')||e.target===$('sound-toggle'))&&(e.code==='Space'||e.code==='Enter')){e.preventDefault();if(!e.repeat)e.target.click();return;}
 if(e.code==='Space'&&ready&&engine._web_status()===2){e.preventDefault();if(!e.repeat)togglePause();return;}
 if(mapping[e.code]){e.preventDefault();keys.add(e.code);keyboardHistory.record(keyboardBits(),momentInputTime(e.timeStamp));}
 if(e.repeat)return;
 if(e.code==='KeyH'){e.preventDefault();openHelp();return;}
 if(e.code==='KeyR')retry(momentInputTime(e.timeStamp));
 if(e.code==='Escape')togglePause();
 if(e.code==='Enter'&&ready){if(engine._web_status()>=3)retry();else if(engine._web_status()===1)start();else togglePause();}
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(mapping[e.code])keyboardHistory.record(keyboardBits(),momentInputTime(e.timeStamp));});window.addEventListener('blur',()=>{resumeAfterHelp=resumeAfterMenu=menuResumeAfterHelp=false;resetInputClock();if(ready&&!paused&&engine._web_status()===2)togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)resumeAfterHelp=resumeAfterMenu=menuResumeAfterHelp=false;if(document.hidden&&ready&&!paused&&engine._web_status()===2)togglePause();});
play.onclick=()=>{if(engine._web_status()>=3)retry();else start();};$('retry').onclick=()=>retry();$('pause').onclick=()=>{closeMobileMenu(false);togglePause();};$('resume').onclick=togglePause;
$('fullscreen').hidden=!document.fullscreenEnabled||!$('game').requestFullscreen;
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else {await $('game').requestFullscreen();if(touchControls.mobile)await screen.orientation?.lock?.('landscape').catch(()=>{});}}catch(error){$('fullscreen').title='Tela cheia indisponível neste navegador.';}};
if(touchControls.mobile)$('fullscreen').textContent='Tela cheia';
document.addEventListener('fullscreenchange',()=>{if(touchControls.mobile)$('fullscreen').textContent=document.fullscreenElement?'Sair da tela cheia':'Tela cheia';});
$('sound-toggle').onclick=()=>setSoundOpen($('sound-panel').hidden);
document.addEventListener('click',event=>{if(!event.target.closest('.sound-control'))setSoundOpen(false);});
$('assistance').onclick=()=>{assistanceGuide.setEnabled(!assistanceGuide.enabled);if(ready&&!mobileMenu.open)canvas.focus({preventScroll:true});};
$('original-game').onclick=()=>{
 if(!ready)return;
 originalGame=!!engine._web_original(!originalGame);
 updateCharacterNames();lastStatus=-1;update();
 $('original-game').setAttribute('aria-pressed',String(originalGame));
 if(!mobileMenu.open)canvas.focus({preventScroll:true});
};
$('evo-volume').addEventListener('input',async()=>{
 if(!ready)return;
 audioMixer.setEvoVolume($('evo-volume').value);
 const wasRunning=engine._web_status()===2&&!paused,volumeAttempt=attempt;
 const needsLoad=audioMixer.enabled&&!audioMixer.buffer&&!audioMixer.complete;
 if(needsLoad&&wasRunning)setPaused(true);
 try{if(audioMixer.enabled)await audioMixer.arm();}
 catch(error){console.error(error);$('evo-volume').title=error.message;}
 if(needsLoad&&wasRunning&&attempt===volumeAttempt&&!helpDialog.open&&!mobileMenu.open)setPaused(false);
 if(engine._web_status()===2&&!paused)audioMixer.frame(engine);
});
$('mobile-menu-open').onclick=openMobileMenu;$('mobile-menu-close').onclick=()=>closeMobileMenu();$('mobile-menu-back').onclick=()=>closeMobileMenu();
mobileMenu.addEventListener('cancel',event=>{event.preventDefault();closeMobileMenu();});
mobileMenu.addEventListener('click',event=>{if(event.target===mobileMenu){const rect=mobileMenu.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeMobileMenu();}});
$('help').onclick=openHelp;$('help-close').onclick=closeHelp;
helpDialog.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog){const rect=helpDialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeHelp();}});
requestAnimationFrame(tick);
(async()=>{try{
 engine=await createMoment37({canvas,locateFile:(name,prefix)=>prefix+name+(/\.(wasm|data)$/.test(name)?'?v=20261015-native-idle':''),print:console.log,printErr:message=>console.debug(message),setStatus:message=>{const match=message.match(/(\d+)\/(\d+)/);if(match)$('load-bar').style.width=`${Math.round(Number(match[1])/Number(match[2])*100)}%`;},onAbort:message=>failure(new Error(message))});
 // SDL reads CSS dimensions once when creating its window. Give mobile a
 // stable backing resolution even if the page initially loads in portrait.
 const size=[canvas.style.width,canvas.style.height];
 if(touchControls.mobile){canvas.style.width='768px';canvas.style.height='576px';}
 let initialized;try{initialized=engine._web_init();}finally{[canvas.style.width,canvas.style.height]=size;}
 if(!initialized)throw new Error('Não foi possível iniciar o WebGL 2 ou carregar os recursos do jogo.');
 $('original-game').disabled=false;
 audioMixer.init(engine);
 audioMixer.context.addEventListener('statechange',()=>{
  if(ready&&!paused&&engine?._web_status()===2&&audioMixer.context.state!=='running')
   setPaused(true,touchControls.mobile?'O áudio foi interrompido. Toque em Continuar.':'O áudio foi interrompido. Pressione Espaço para continuar.');
 });
}catch(err){failure(err);engine=null;}})();
