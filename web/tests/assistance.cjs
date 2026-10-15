const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('@playwright/test');
const golden=require('./golden-inputs.json');
const reference=JSON.parse(fs.readFileSync('web/dist/guide-sequence.json','utf8'));
assert.deepEqual(reference,golden,'The guide and external macro must use the same successful sequence');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('web/dist/assistance.js','utf8'),context);
context.reference=reference;
const cues=JSON.parse(vm.runInContext('JSON.stringify(momentGuideCues(reference))',context));
assert.deepEqual(cues.filter(c=>c.lane==='attack').map(c=>[c.frame,c.glyph,c.key]),[[472,'CF','D'],[494,'CM','S'],[502,'SM','X'],[514,'CL','A']]);
assert.deepEqual(cues.filter(c=>c.kind==='parry').map(c=>c.frame),golden.expected_parries.map(f=>f-4));
assert.equal(cues.find(c=>c.ordinal===15).frame,441,'Place the airborne input near the middle of its ten-frame window');
for(const cue of cues.filter(c=>c.kind==='parry')){
 assert.equal(cue.windowEnd-cue.windowStart,10);
 assert.equal(cue.frame-cue.windowStart,5,'Aim near the middle of the valid window');
}
for(let f=0;f<=Math.max(...Object.keys(reference.inputs).map(Number))+1;f++){
 const displayed=cues.filter(c=>c.frame<=f&&f<c.end).reduce((bits,c)=>bits|c.bits,0);
 assert.equal(displayed,golden.inputs[f]||0,`Notes and hold tails must reproduce every input at frame ${f}`);
}

(async()=>{
 const root=path.resolve(__dirname,'../..'),server=spawn('python3',['web/serve.py','--port','3741'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.controlFrames=false;window.controlledFrames=[];
   const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>controlFrames?(controlledFrames.push(callback),0):raf(callback);
  });
  await page.goto('http://127.0.0.1:3741/');await page.waitForFunction(()=>moment37.state.ready&&moment37.assistance.loaded);
  assert.equal(await page.locator('#assistance').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#assistance-panel').isVisible(),false);
  await page.click('#assistance');assert.equal(await page.locator('#assistance-panel').isVisible(),true);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),0,'Enabling assistance must not start or advance the game');
  await page.locator('#evo-volume').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#play');await page.waitForFunction(()=>moment37.state.status===2);
  await page.evaluate(()=>window.controlFrames=true);await page.waitForFunction(()=>controlledFrames.length>0,null,{polling:10});
  await page.evaluate(golden=>{
   window.reference=golden;window.advanceGuideTo=target=>{const e=moment37.engine;while(e._web_value(2)<target&&e._web_status()===2){e._web_step(reference.inputs[e._web_value(2)]||0);assistanceGuide.observe(e);}update();};
   const e=moment37.engine;e._web_reset();e._web_start();assistanceGuide.reset();assistanceGuide.observe(e);advanceGuideTo(149);
  },golden);
  const alignment=await page.evaluate(()=>{
   const cue=document.querySelector('[data-cue="dir-149"]'),box=cue.getBoundingClientRect(),target=document.querySelector('[data-target="forward"]'),goal=target.getBoundingClientRect();
   return {frame:moment37.assistance.displayFrame,due:cue.classList.contains('due'),confirmed:cue.classList.contains('confirmed'),aligned:target.classList.contains('aligned'),
    error:Math.max(Math.abs(box.top+box.height/2-goal.top-goal.height/2),Math.abs(box.left+box.width/2-goal.left-goal.width/2),Math.abs(box.width-goal.width),Math.abs(box.height-goal.height))};
  });
  assert.equal(alignment.frame,149);assert.equal(alignment.due,true);assert.equal(alignment.confirmed,false);assert.equal(alignment.aligned,true);assert.ok(alignment.error<.1);
  assert.equal(await page.locator('#guide-line').count(),0,'The line is replaced by symbol targets');
  const glow=await page.evaluate(()=>{
   const states=[];
   for(let frame=143;frame<=154;frame++){
    assistanceGuide.snapshot={frame,parries:0,status:2};assistanceGuide.stoppedFrame=null;assistanceGuide.render();
    states.push({frame,open:document.querySelector('[data-target="forward"]').classList.contains('window-open')});
   }
   assistanceGuide.observe(moment37.engine);return states;
  });
  for(const state of glow)assert.equal(state.open,state.frame>=144&&state.frame<=153,'Glow for all ten valid input frames, and none outside');
  await page.evaluate(()=>advanceGuideTo(154));assert.equal(await page.locator('[data-cue="dir-149"]').evaluate(el=>el.classList.contains('confirmed')),true);
  await page.evaluate(()=>advanceGuideTo(441));
  assert.equal(await page.locator('[data-cue="dir-441"]').evaluate(el=>el.classList.contains('due')),true);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(5)),14);
  await page.evaluate(()=>advanceGuideTo(442));assert.equal(await page.locator('[data-cue="dir-441"]').evaluate(el=>el.classList.contains('confirmed')),false);
  await page.evaluate(()=>advanceGuideTo(446));assert.equal(await page.locator('[data-cue="dir-441"]').evaluate(el=>el.classList.contains('confirmed')),true);
  assert.equal(await page.evaluate(()=>moment37.assistance.desynced),false);
  await page.evaluate(()=>{setPaused(true);update();});
  const paused=await page.evaluate(()=>({frame:moment37.assistance.displayFrame,positions:[...document.querySelectorAll('.guide-note')].map(el=>el.style.transform)}));
  await page.waitForTimeout(120);
  assert.deepEqual(await page.evaluate(()=>({frame:moment37.assistance.displayFrame,positions:[...document.querySelectorAll('.guide-note')].map(el=>el.style.transform)})),paused);
  assert.equal(await page.locator('#guide-next').innerText(),'Pausado');
  await page.click('#assistance');await page.click('#assistance');assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),446,'Toggling assistance does not alter physics or input clocks');
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>moment37.state.status===2&&moment37.assistance.frame===0,null,{polling:10});
  assert.equal(await page.locator('#assistance').getAttribute('aria-pressed'),'true','Retry preserves the assistance choice');
  assert.equal(await page.evaluate(()=>moment37.assistance.parries),0);
  const failure=await page.evaluate(()=>{
   const e=moment37.engine;e._web_reset();e._web_start();assistanceGuide.reset();let stopped;
   for(let f=0;f<250&&e._web_status()===2;f++){e._web_step(0);assistanceGuide.observe(e);if(assistanceGuide.state.failed&&stopped===undefined)stopped=assistanceGuide.state.displayFrame;}
   update();return{stopped,state:assistanceGuide.state,engineFrame:e._web_value(2)};
  });
  assert.equal(failure.stopped,154);assert.equal(failure.state.displayFrame,154);assert.ok(failure.engineFrame>154);
  assert.equal(await page.locator('#guide-next').innerText(),'Sequência interrompida');
  const targetChecks=await page.evaluate(()=>{
   const e=moment37.engine;e._web_reset();e._web_start();assistanceGuide.reset();assistanceGuide.observe(e);e._web_render(0);const checks=[];
   for(let f=0;f<=Math.max(...Object.keys(reference.inputs).map(Number))+1;f++){
    assistanceGuide.render();
    for(const cue of assistanceGuide.cues.filter(c=>c.frame===f)){
     const id=cue.lane==='attack'?'attack':(cue.bits===1||cue.bits===2)?'updown':cue.bits===6?'diagonal':'forward';
     const note=document.querySelector(`[data-cue="${cue.id}"]`),target=document.querySelector(`[data-target="${id}"]`),a=note.getBoundingClientRect(),b=target.getBoundingClientRect();
     checks.push({frame:f,cue:cue.id,glyph:note.querySelector('.guide-symbol').textContent,targetGlyph:target.querySelector('.guide-symbol').textContent,
      error:Math.max(Math.abs(a.x+a.width/2-b.x-b.width/2),Math.abs(a.y+a.height/2-b.y-b.height/2),Math.abs(a.width-b.width),Math.abs(a.height-b.height)),aligned:target.classList.contains('aligned')});
    }
    e._web_step(reference.inputs[f]||0);assistanceGuide.observe(e);
   }
   e._web_render(1);return checks;
  });
  assert.equal(targetChecks.length,cues.length);
  for(const check of targetChecks){assert.equal(check.glyph,check.targetGlyph,check.cue);assert.equal(check.aligned,true,check.cue);assert.ok(check.error<.1,`${check.cue}: ${check.error}`);}
  const runs=await page.evaluate(()=>{
   const e=moment37.engine,result=[];
   for(const enabled of [false,true]){
    assistanceGuide.setEnabled(enabled);e._web_reset();e._web_start();assistanceGuide.reset();let events=[],parries=0;
    for(let f=0;f<1100&&e._web_status()===2;f++){e._web_step(reference.inputs[f]||0);assistanceGuide.observe(e);const p=e._web_value(5);if(p>parries){events.push(f);parries=p;}}
    update();result.push({enabled,status:e._web_status(),ken:e._web_value(3),chun:e._web_value(4),parries,events,desynced:assistanceGuide.state.desynced});
   }
   return result;
  });
  for(const run of runs){assert.equal(run.status,4);assert.equal(run.ken,1);assert.equal(run.chun,-1);assert.equal(run.parries,15);assert.deepEqual(run.events,golden.expected_parries);assert.equal(run.desynced,false);}
  assert.equal(await page.locator('#guide-next').innerText(),'Desafio concluído');
  const finishFailure=await page.evaluate(()=>{
   const e=moment37.engine,inputs={...reference.inputs};inputs[514]=inputs[515]=4;
   e._web_reset();e._web_start();assistanceGuide.reset();let stopped;
   for(let f=0;f<1100&&e._web_status()===2;f++){
    e._web_step(inputs[f]||0);assistanceGuide.observe(e);
    if(moment37.finish.failed&&stopped===undefined)stopped=moment37.assistance.displayFrame;
   }
   update();return{stopped,state:moment37.assistance,finish:moment37.finish};
  });
  assert.equal(finishFailure.state.finishFailed,true);assert.equal(finishFailure.state.displayFrame,finishFailure.stopped);
  assert.equal(await page.locator('#guide-next').innerText(),'Contra-ataque falhou');
  assert.equal(await page.locator('#overlay').innerText(),'Tentar novamente');
  assert.equal(await page.locator('#overlay-copy').isVisible(),false);
  await page.evaluate(()=>{assistanceGuide.reset();assistanceGuide.observe({_web_value:k=>k===2?150:k===5?1:0,_web_status:()=>2});assistanceGuide.render();});
  assert.equal(await page.locator('#guide-next').innerText(),'O ritmo mudou','Non-reference contact timing must stop misleading future cues');
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>moment37.state.status===2&&moment37.assistance.frame===0,null,{polling:10});
  await page.evaluate(()=>{
   advanceGuideTo(180);
   assistanceGuide.render({controller:true});
  });
  assert.equal(await page.locator('#guide-legend').innerText(),'CF → CM → SM → CL · controle');
  await page.evaluate(()=>assistanceGuide.render({controller:false}));
  const frameBeforeToggle=await page.evaluate(()=>moment37.engine._web_value(2));
  await page.locator('#assistance').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>moment37.assistance.enabled),false);
  assert.equal(await page.evaluate(()=>moment37.state.paused),false,'Space on the focused assistance control must only toggle that control');
  await page.locator('#assistance').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>moment37.assistance.enabled),true);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),frameBeforeToggle);
  const layouts=[];
  for(const [width,height] of [[1440,1100],[1366,900],[1024,768],[768,1024],[390,844],[320,640],[1024,450]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(35);
   for(const enabled of [false,true]){
    await page.evaluate(enabled=>assistanceGuide.setEnabled(enabled),enabled);await page.waitForTimeout(35);
    const layout=await page.evaluate(()=>{
     const root=document.querySelector('#game').getBoundingClientRect(),screen=document.querySelector('#screen').getBoundingClientRect();
     return{width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.documentElement.scrollHeight,viewportHeight:innerHeight,ratio:screen.width/screen.height,
      overflow:[...document.querySelectorAll('.game-top .top-controls > *, .matchup, .parry-progress')].filter(el=>{const r=el.getBoundingClientRect();return r.left<root.left-.5||r.right>root.right+.5;}).map(el=>el.id||el.className)};
    });
    assert.equal(layout.width,width,`Horizontal overflow ${width}x${height}, assistance ${enabled}`);
    assert.ok(layout.height<=height+2,`Vertical overflow ${width}x${height}, assistance ${enabled}: ${layout.height}`);
    assert.ok(Math.abs(layout.ratio-4/3)<.001);assert.deepEqual(layout.overflow,[]);layouts.push({width,height,enabled});
   }
  }
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>assistanceGuide.setEnabled(true));await page.waitForTimeout(40);
  await page.screenshot({path:path.join(root,'web/tests/assistance-preview.png'),fullPage:true});
  await page.evaluate(()=>advanceGuideTo(497));await page.screenshot({path:path.join(root,'web/tests/assistance-combo.png'),fullPage:true});
  await page.click('#fullscreen');await page.waitForFunction(()=>!!document.fullscreenElement,null,{polling:10});
  assert.ok(await page.evaluate(()=>{const note=document.querySelector('#assistance-panel').getBoundingClientRect();return note.left>=0&&note.right<=innerWidth+.5&&note.bottom<=innerHeight+.5;}),'Guide must fit inside fullscreen');
  await page.click('#fullscreen');await page.waitForFunction(()=>!document.fullscreenElement,null,{polling:10});
  const live=await browser.newPage();live.on('pageerror',e=>errors.push(e.message));
  await live.goto('http://127.0.0.1:3741/');await live.waitForFunction(()=>moment37.state.ready&&moment37.assistance.loaded);
  await live.click('#assistance');await live.locator('#evo-volume').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await live.click('#play');
  await live.waitForFunction(()=>moment37.engine._web_value(2)>=125&&moment37.engine._web_value(2)<145);
  const liveFrames=await live.evaluate(()=>({guide:moment37.assistance.frame,engine:moment37.engine._web_value(2)}));
  assert.equal(liveFrames.guide,liveFrames.engine,'The real browser loop must drive the guide from native frames');
  await live.waitForFunction(()=>moment37.assistance.failed);
  assert.equal(await live.evaluate(()=>moment37.assistance.displayFrame),154);
  await live.waitForFunction(()=>moment37.state.status===3).catch(async error=>{throw new Error(error.message+' '+JSON.stringify(await live.evaluate(()=>({state:moment37.state,guide:moment37.assistance,pauseNote:document.querySelector('#pause-note').textContent,copy:document.querySelector('#overlay-copy').textContent}))));});assert.equal(await live.evaluate(()=>moment37.assistance.displayFrame),154);
  await live.keyboard.press('KeyR');await live.waitForFunction(()=>moment37.assistance.frame<30&&!moment37.assistance.failed);
  assert.equal(await live.evaluate(()=>moment37.assistance.enabled),true);await live.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,cues:cues.length,alignment,targetChecks,pausedFrame:paused.frame,failure,runs,layouts},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
