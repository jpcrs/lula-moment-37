/* Art switching must not advance or change the native fight. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium,devices}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const golden=require('./golden-inputs.json');

(async()=>{
 const root=path.resolve(__dirname,'../..');
 const output=path.join(root,'outputs/character-study');fs.mkdirSync(output,{recursive:true});
 const server=spawn('python3',['web/serve.py','--port','3748'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];
  await page.route(/cloudflareinsights\.com/,route=>route.abort());
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.freezeFrames=false;window.frozenCallbacks=[];
   const raf=requestAnimationFrame.bind(window);
   window.requestAnimationFrame=callback=>freezeFrames?(frozenCallbacks.push(callback),0):raf(callback);
  });
  await page.goto('http://127.0.0.1:3748');
  await page.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  assert.equal(await page.locator('#original-game').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>moment37.state.originalGame),false);
  await page.evaluate(()=>window.freezeFrames=true);
  await page.waitForFunction(()=>frozenCallbacks.length>0,null,{polling:10});
  await page.evaluate(()=>{
   window.readFight=()=>Array.from({length:66},(_,key)=>moment37.engine._web_value(key));
   window.readPixels=()=>{
    const canvas=document.querySelector('#canvas'),gl=canvas.getContext('webgl2');
    const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let hash=2166136261;for(const byte of pixels)hash=Math.imul(hash^byte,16777619);
    return hash>>>0;
   };
   document.querySelector('#original-game').addEventListener('click',()=>{
    window.artClick={fight:readFight(),pixels:readPixels(),attempt:moment37.state.attempt};
   });
  });
  const before=await page.evaluate(()=>{moment37.engine._web_original(0);return{fight:readFight(),pixels:readPixels(),attempt:moment37.state.attempt}});
  await page.click('#original-game');
  const original=await page.evaluate(()=>artClick);
  assert.deepEqual(original.fight,before.fight);assert.equal(original.attempt,before.attempt);
  assert.notEqual(original.pixels,before.pixels,'Original mode must visibly restore the original fighters');
  await page.click('#original-game');
  assert.equal(await page.evaluate(()=>artClick.pixels),before.pixels,'Turning Original game off must restore the same new artwork');
  assert.match(await page.locator('.help-intro').textContent(),/Você é Luiz.*especial de Flávio/);
  const hud=await page.evaluate(async()=>{
   const e=moment37.engine,canvas=document.querySelector('#canvas'),gl=canvas.getContext('webgl2');
   const embedded=Array.from(e.FS.readFile('/characters/hud.png'));
   const bitmap=await createImageBitmap(new Blob([new Uint8Array(embedded)],{type:'image/png'}));
   const target=new OffscreenCanvas(128,32),context=target.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
   const atlas=context.getImageData(0,0,128,32).data;
   const parts=[{name:'Luiz portrait',x:0,y:24,sx:0,sy:0,h:24},{name:'Flávio portrait',x:344,y:24,sx:40,sy:0,h:24},
    {name:'LUIZ name',x:48,y:24,sx:80,sy:0,h:8},{name:'FLÁVIO name',x:296,y:24,sx:80,sy:8,h:8}];
   function sample(original){
    e._web_original(original);const bytes=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
   }
   const custom=sample(0),original=sample(1);e._web_original(0);
   const stats=parts.map(p=>{
    let matched=0,opaque=0,changed=0;
    for(let y=0;y<p.h;y++)for(let x=0;x<40;x++){
     const at=((p.sy+y)*128+p.sx+x)*4;if(atlas[at+3]!==255)continue;
     const px=Math.floor((p.x+x+.5)*canvas.width/384),py=canvas.height-1-Math.floor((p.y+y+.5)*canvas.height/224);
     const dest=(py*canvas.width+px)*4;opaque++;
     if([0,1,2].every(c=>custom[dest+c]===atlas[at+c]))matched++;
     if([0,1,2].some(c=>custom[dest+c]!==original[dest+c]))changed++;
    }
    return{name:p.name,matched,opaque,changed};
   });return{embedded,stats};
  });
  assert.equal(createHash('sha256').update(Buffer.from(hud.embedded)).digest('hex'),createHash('sha256').update(fs.readFileSync(path.join(root,'web/dist/characters/hud.png'))).digest('hex'),'The embedded HUD must match the current export');
  for(const part of hud.stats){assert(part.opaque>50);assert.equal(part.matched,part.opaque,`${part.name}: every opaque artwork pixel must reach its native HUD slot`);assert(part.changed>50,`${part.name} must restore different original artwork`);}
  await page.click('#original-game');
  assert.match(await page.locator('.help-intro').textContent(),/Você é Ken.*especial de Chun-Li/);
  await page.click('#original-game');
  const runs=await page.evaluate(golden=>{
   const e=moment37.engine;
   function run(original,switchDuringFight){
    e._web_original(original);e._web_render(0);e._web_reset();e._web_start();
    const trace=[],poses=new Set();
    for(let frame=0;frame<1100&&e._web_status()===2;frame++){
     if(switchDuringFight&&frame%37===0)e._web_original(frame%74===0);
     e._web_step(golden.inputs[frame]||0);trace.push(readFight());poses.add(`${e._web_value(64)},${e._web_value(65)}`);
    }
    return{trace,status:e._web_status(),poses:poses.size};
   }
   const custom=run(false,false),original=run(true,false),switched=run(false,true);
   e._web_render(1);e._web_original(0);e._web_reset();e._web_start();e._web_step(0);paused=true;
   document.querySelector('#overlay').hidden=true;
   return{custom,original,switched};
  },golden);
  assert.equal(runs.custom.status,4);assert.equal(runs.original.status,4);assert.equal(runs.switched.status,4);
  assert.deepEqual(runs.custom.trace,runs.original.trace,'Every exposed native fight value must match in both modes');
  assert.deepEqual(runs.custom.trace,runs.switched.trace,'Switching during the fight must not change any combat frame');
  const paused=await page.evaluate(()=>{moment37.engine._web_original(0);return{fight:readFight(),pixels:readPixels()}});
  await page.click('#original-game');
  assert.deepEqual(await page.evaluate(()=>readFight()),paused.fight);
  assert.notEqual(await page.evaluate(()=>artClick.pixels),paused.pixels,'The artwork must switch immediately while paused');
  // Keyboard activation must toggle artwork instead of starting or pausing play.
  await page.locator('#original-game').focus();await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(()=>readFight()),paused.fight);
  assert.equal(await page.evaluate(()=>moment37.state.paused),true);
  assert.equal(await page.evaluate(()=>artClick.pixels),paused.pixels);
  const snapshots=[1,120,154,194,301,413,446,473,495,503,515,530,560,600];
  const frames=[];
  for(const frame of snapshots){
   const state=await page.evaluate(({frame,golden})=>{
    const e=moment37.engine;e._web_render(0);e._web_reset();e._web_start();
    for(let f=0;f<frame-1;f++)e._web_step(golden.inputs[f]||0);
    e._web_render(1);e._web_step(golden.inputs[frame-1]||0);e._web_original(0);
    return{frame,cg:[e._web_value(64),e._web_value(65)],custom:readPixels()};
   },{frame,golden});
   await page.locator('#canvas').screenshot({path:path.join(output,`fight-${frame}.png`)});
   state.original=await page.evaluate(()=>{moment37.engine._web_original(1);return readPixels()});
   assert.notEqual(state.original,state.custom,`The new artwork must be visible at frame ${frame}`);
   frames.push(state);
  }
  await page.evaluate(()=>moment37.engine._web_original(0));
  fs.mkdirSync(path.join(root,'outputs/character-hud'),{recursive:true});
  await page.evaluate(()=>{const e=moment37.engine;e._web_reset();e._web_start();e._web_step(0);paused=true;document.querySelector('#overlay').hidden=true;});
  await page.locator('#canvas').screenshot({path:path.join(root,'outputs/character-hud/luiz-flavio.png')});
  await page.close();
  // The same toggle is reachable in the existing mobile settings menu.
  const mobile=await browser.newContext({...devices['iPhone 13'],viewport:{width:844,height:390}});
  const phone=await mobile.newPage();phone.on('pageerror',error=>errors.push(error.message));await phone.route(/cloudflareinsights\.com/,route=>route.abort());
  await phone.goto('http://127.0.0.1:3748');await phone.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  await phone.tap('#mobile-menu-open');await phone.locator('#original-game').waitFor({state:'visible'});
  const phoneFrame=await phone.evaluate(()=>moment37.engine._web_value(2));
  await phone.tap('#original-game');assert.equal(await phone.locator('#original-game').getAttribute('aria-pressed'),'true');
  assert.equal(await phone.evaluate(()=>moment37.engine._web_value(2)),phoneFrame);
  await phone.tap('#original-game');assert.equal(await phone.locator('#original-game').getAttribute('aria-pressed'),'false');
  await phone.screenshot({path:path.join(output,'mobile-original-toggle.png')});
  await mobile.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({frames,hud:hud.stats,traceFrames:runs.custom.trace.length,poses:runs.custom.poses},null,2)+'\n');
  console.log(JSON.stringify({passed:true,traceFrames:runs.custom.trace.length,poses:runs.custom.poses,statesCompared:66,win:'15 parries and 12-hit knockout match in both modes and during live switches',screenshots:frames},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1});
