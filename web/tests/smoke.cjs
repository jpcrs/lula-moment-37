/* Browser integration tests use only actual pad inputs; no combat-state cheats. */
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const golden=require('./golden-inputs.json');
(async()=>{
 const root=path.resolve(__dirname,'../..');
 const server=spawn('python3',['web/serve.py','--port','3738'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(new Error(`Test server exited: ${c}`)));});
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.testPad=null;Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]});
  });
  await page.goto('http://127.0.0.1:3738');
  await page.waitForFunction(()=>window.moment37?.state.ready,{},{timeout:30000});
  const setup=await page.evaluate(()=>[3,4,19,20,21,22,23,24,25].map(k=>moment37.engine._web_value(k)));
  assert.deepEqual(setup,[1,60,11,15,2,1,11,5,0]);
  const layout=await page.evaluate(()=>[0,6,7,17,18,46,47,48,50].map(k=>moment37.engine._web_value(k)));
  assert.ok(layout[0]<60,'Direct initialization must not run title or selection frames');
  assert.equal(layout[3],0);assert.equal(layout[4],1);
  assert.ok(layout[6]>310&&layout[6]<325&&layout[7]>68&&layout[7]<82,'Footage-relative character spacing');
  assert.equal(layout[8],2,'Only the stage background is enabled initially');
  const pixels=await page.evaluate(()=>{
   const e=moment37.engine,canvas=document.querySelector('#canvas'),gl=canvas.getContext('webgl2');
   function shot(){e._web_reset();e._web_start();e._web_step(0);const bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let hash=2166136261,nonzero=0;for(const n of bytes){hash=Math.imul(hash^n,16777619);nonzero+=n!==0;}return{hash:hash>>>0,nonzero,screen:e._web_value(50),bytes};}
   const before=shot();for(let i=0;i<1000&&e._web_status()===2;i++)e._web_step(0);
   const loss=e._web_status(),duringKO=e._web_value(50),after=shot();const identical=before.bytes.length===after.bytes.length&&before.bytes.every((n,i)=>n===after.bytes[i]);
   const zoomRetries=[102,110,120,130].map(frame=>{
    e._web_reset();e._web_start();for(let f=0;f<frame;f++)e._web_step(0);
    const activation=e._web_value(52),restored=shot();
    return{frame,activation,hash:restored.hash,identical:before.bytes.every((n,i)=>n===restored.bytes[i])};
   });
   delete before.bytes;delete after.bytes;e._web_reset();return{before,after,loss,duringKO,identical,zoomRetries};
  });
  assert.equal(pixels.loss,3);assert.equal(pixels.identical,true);assert.ok(pixels.before.nonzero>100000);
  assert.deepEqual(pixels.after,pixels.before,'Retry must restore the rendered scene, without KO layers or sprites');
  for(const retry of pixels.zoomRetries){assert.equal(retry.activation,100);assert.equal(retry.identical,true,`Retry during Chun-Li's super at frame ${retry.frame} must restore the camera and rendered scene`);}
  const runs=await page.evaluate(golden=>{
   const e=moment37.engine;e._web_render(0);
   function run(inputs){e._web_reset();e._web_start();let events=[],parry=0,minChunHP=60,arts=[];
    for(let f=0;f<1100&&e._web_status()===2;f++){
     e._web_step(inputs[f]||0);let count=e._web_value(5);
     if(count>parry){events.push({frame:f,count,y:e._web_value(13)});parry=count;}
     minChunHP=Math.min(minChunHP,e._web_value(4));let art=e._web_value(44);if(arts.at(-1)!==art)arts.push(art);
    }
    return{status:e._web_status(),hp:e._web_value(3),enemyHP:e._web_value(4),frame:e._web_value(2),parry,events,arts,minChunHP};
   }
   const lose=run({}),win=run(golden.inputs),repeat=run(golden.inputs);
   // Surviving by running away cannot count as completing fifteen parries.
   const escape=run(Object.fromEntries(Array.from({length:80},(_,f)=>[f,8])));
   e._web_render(1);e._web_reset();return{lose,win,repeat,escape};
  },golden);
  assert.equal(runs.lose.status,3);assert.ok(runs.lose.hp<0);assert.equal(runs.lose.parry,0);
  assert.equal(runs.win.status,4);assert.equal(runs.win.hp,1);assert.ok(runs.win.enemyHP<0);
  assert.equal(runs.win.parry,15);assert.ok(runs.win.events.at(-1).y>0,'Final parry must be airborne');
  assert.ok(runs.win.arts.includes(37),'Shippu Jinraikyaku must execute');
  assert.deepEqual(runs.win.events.map(e=>e.frame),golden.expected_parries);
  assert.deepEqual(runs.repeat,runs.win,'Retry must reproduce the complete comeback');
  assert.equal(runs.escape.status,3);assert.ok(runs.escape.parry<15);
  // The real browser input loop receives a keyboard direction and pauses cleanly.
  await page.evaluate(()=>{
   const node=moment37.engine.SDL3.audio_playback.scriptProcessorNode,original=node.onaudioprocess;
   window.audioPeak=0;node.onaudioprocess=event=>{original(event);for(const value of event.outputBuffer.getChannelData(0))window.audioPeak=Math.max(audioPeak,Math.abs(value));};
  });
  await page.click('#play');
  await page.waitForFunction(()=>moment37.state.status===2&&document.querySelector('#overlay').hidden);
  await page.waitForFunction(()=>moment37.engine.SDL3.audioContext.state==='running'&&audioPeak>0,{},{timeout:5000});
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(31)&4),4);
  await page.keyboard.up('ArrowLeft');await page.locator('#pause').focus();await page.keyboard.down('Space');
  await page.waitForFunction(()=>moment37.state.paused);
  await page.keyboard.down('Space'); // Holding Space must not toggle again on key repeat.
  const pausedFrame=await page.evaluate(()=>moment37.engine._web_value(2));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),pausedFrame);
  await page.keyboard.up('Space');assert.equal(await page.evaluate(()=>moment37.state.paused),true);
  await page.keyboard.press('Space');await page.waitForFunction(()=>!moment37.state.paused);
  await page.waitForFunction(frame=>moment37.engine._web_value(2)>frame,pausedFrame);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>moment37.state.paused);
  await page.keyboard.press('KeyR');
  await page.evaluate(()=>{window.testPad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===14,value:i===14?1:0}))};});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(31)&4),4);
  assert.equal(await page.locator('#controller').innerText(),'CONTROLE CONECTADO');
  await page.evaluate(()=>{testPad.buttons[14].pressed=false;testPad.buttons[9].pressed=true;});
  await page.waitForFunction(()=>moment37.state.paused);
  await page.evaluate(()=>testPad.buttons[9].pressed=false);await page.waitForTimeout(50);
  await page.evaluate(()=>testPad.buttons[8].pressed=true);
  await page.waitForFunction(()=>!moment37.state.paused&&moment37.state.attempt>=3);
  await page.evaluate(()=>window.testPad=null);
  // Capture the rendered end state, including the browser's win/retry overlay.
  await page.evaluate(golden=>{const e=moment37.engine;e._web_reset();e._web_start();for(let f=0;f<1100&&e._web_status()===2;f++)e._web_step(golden.inputs[f]||0);},golden);
  await page.waitForFunction(()=>document.querySelector('#overlay-title').textContent==='Parabéns. Não esqueça de votar dia 25.');
  await page.screenshot({path:path.join(root,'web/tests/win.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,setup,layout,pixels,lose:runs.lose,win:runs.win,controller:'Standard gamepad direction, pause and retry passed',audio:'AudioContext running; nonzero original-engine PCM verified'},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
