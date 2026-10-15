/* Check the actual Swift key schedule through the game's input sampler and
 * native engine. This test never posts macOS keyboard events. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..');
const golden=require('../../web/tests/golden-inputs.json');

(async()=>{
 const launcher=path.join(__dirname,'Run Evo 37 Macro.command');
 const exported=spawnSync(launcher,['--export-plan'],{encoding:'utf8'});
 assert.equal(exported.status,0,exported.stderr);
 const plan=JSON.parse(exported.stdout);
 assert.equal(plan.fps,golden.fps);assert.deepEqual(plan.finish,golden.finish);
 const bundled=JSON.parse(fs.readFileSync(path.join(__dirname,'build/Evo 37 Macro.app/Contents/Resources/sequence.json'),'utf8'));
 assert.deepEqual(bundled,golden,'The built app must contain the current challenge fixture');
 assert.deepEqual(plan.events.slice(0,2).map(e=>[e.frame,e.key.code,e.down,e.nanoseconds]),[[-1,15,true,0],[-1,15,false,6000000]]);
 const server=spawn('python3',['web/serve.py','--port','3753'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error(`Test server exited: ${c}`)));});
  browser=await chromium.launch();const page=await browser.newPage();
  await page.route(/cloudflareinsights\.com/,r=>r.abort());
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.freeze=false;window.frozen=false;window.requestAnimationFrame=cb=>freeze?(frozen=true,0):raf(cb);});
  await page.goto('http://127.0.0.1:3753/');
  await page.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  await page.evaluate(()=>freeze=true);await page.waitForFunction(()=>frozen,null,{polling:10});
  const result=await page.evaluate(({plan,golden})=>{
   if(plan.fps!==MomentTiming.FPS)throw Error('Macro and browser frame rates differ');
   const codes={126:'ArrowUp',125:'ArrowDown',123:'ArrowLeft',124:'ArrowRight',6:'KeyZ',7:'KeyX',8:'KeyC',0:'KeyA',1:'KeyS',2:'KeyD'};
   const events=plan.events.filter(e=>e.frame>=0),held=new Set(),history=new MomentButtonHistory();
   const e=moment37.engine;e._web_render(0);e._web_reset();e._web_start();
   let cursor=0,parries=0;const contacts=[],mismatches=[];
   for(let frame=0;frame<1100&&e._web_status()===2;frame++){
    const at=(frame+1)*MomentTiming.FRAME_MS;
    while(cursor<events.length&&events[cursor].nanoseconds/1e6<=at){
     const event=events[cursor++],code=codes[event.key.code];
     if(!code||mapping[code]!==event.key.mask)throw Error(`Wrong macOS/browser binding: ${event.key.name}`);
     if(event.down)held.add(code);else held.delete(code);
     let bits=0;for(const code of held)bits|=mapping[code];history.record(bits,event.nanoseconds/1e6);
    }
    let bits=0;for(const code of held)bits|=mapping[code];
    if(bits!==(golden.inputs[frame]||0))mismatches.push(frame);
    e._web_step(momentCombineButtons(history.sample(at)));
    const count=e._web_value(5);if(count>parries){parries=count;contacts.push(frame);}
   }
   return {status:e._web_status(),parries,contacts,mismatches,remainingKeys:[...held],consumed:cursor,total:events.length,
    finish:moment37.finish,trace:Array.from({length:e._web_value(100)},(_,i)=>Array.from({length:8},(_,j)=>e._web_value(101+i*8+j)))};
  },{plan,golden});
  assert.deepEqual(result.mismatches,[],'Macro key states must match every challenge input frame');
  assert.equal(result.status,4,'The actual macro schedule must win the challenge');
  assert.equal(result.parries,15);assert.deepEqual(result.contacts,golden.expected_parries);
  assert.deepEqual(result.finish,{stage:4,failed:false,hits:12,cancels:3,airParry:true});
  assert.deepEqual(result.trace.map(hit=>hit[0]),golden.finish.expected_hits);
  assert.deepEqual(result.trace.map(hit=>hit[1]),[5,3,10,...Array(9).fill(37)]);
  assert.deepEqual(result.trace.map(hit=>hit[2]),[3,0,17,...Array(9).fill(21)]);
  assert.deepEqual(result.trace.map(hit=>hit[5]),Array.from({length:12},(_,i)=>i+1));
  assert.deepEqual(result.remainingKeys,[]);assert.equal(result.consumed,result.total);
  console.log(JSON.stringify({passed:true,keyEvents:plan.events.length,inputFrames:Math.max(...Object.keys(golden.inputs).map(Number))+2,
   parries:result.parries,comboHits:result.finish.hits,bothCancelsConfirmed:result.finish.cancels===3,win:result.status===4,
   macOSKeysPosted:false},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
