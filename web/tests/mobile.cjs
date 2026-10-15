/* Mobile controls feed the real engine through the normal timestamped input loop. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium,webkit,devices}=require('@playwright/test');
const golden=require('./golden-inputs.json');

(async()=>{
 const root=path.resolve(__dirname,'../..');
 const server=spawn('python3',['web/serve.py','--port','3744'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const browsers=[];
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
  const browser=await chromium.launch({headless:true});browsers.push(browser);
  const desktop=await browser.newPage({viewport:{width:568,height:320}});
  await desktop.goto('http://127.0.0.1:3744/');
  assert.equal(await desktop.locator('#mobile-rotate').isVisible(),false);
  assert.equal(await desktop.locator('#touch-controls').isVisible(),false);
  assert.equal(await desktop.evaluate(()=>document.documentElement.classList.contains('touch-mode')),false);
  await desktop.close();
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});
  await context.route(/cloudflareinsights\.com/,route=>route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const waitFor=(predicate,arg,options={})=>page.waitForFunction(predicate,arg,{polling:10,...options});
  await page.addInitScript(()=>{
   window.controlledFrames=[];window.controlFrames=false;
   const raf=requestAnimationFrame.bind(window);window.nativeRaf=raf;window.requestAnimationFrame=callback=>controlFrames?(controlledFrames.push(callback),0):raf(callback);
  });
  await page.goto('http://127.0.0.1:3744/');await waitFor(()=>window.moment37?.state.ready,null,{timeout:60000});
  assert.deepEqual(await page.evaluate(()=>[canvas.width,canvas.height]),[768,576],'Portrait initialization must keep a valid game backing buffer');
  assert.equal(await page.locator('#mobile-rotate').isVisible(),true);
  await page.evaluate(()=>start());assert.equal(await page.evaluate(()=>moment37.state.status),1,'Portrait must not start an attempt');
  await page.screenshot({path:path.join(root,'web/tests/mobile-portrait.png')});
  await page.setViewportSize({width:844,height:390});await waitFor(()=>!touchControls.blocked);
  await page.locator('#evo-volume').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.tap('#play');await waitFor(()=>moment37.state.status===2);
  await page.evaluate(()=>window.controlFrames=true);await waitFor(()=>controlledFrames.length>0,null,{polling:10});
  assert.equal(await page.locator('#touch-controls').isVisible(),true);
  assert.equal(await page.locator('.game-top').isVisible(),false);
  assert.equal(await page.locator('.game-bottom').isVisible(),false);
  assert.equal(await page.locator('#game-volume').isVisible(),false);
  const menuFrame=await page.evaluate(()=>moment37.engine._web_value(2));
  await page.tap('#mobile-menu-open');
  assert.equal(await page.evaluate(()=>moment37.state.paused),true);
  assert.equal(await page.locator('#touch-controls').isVisible(),false);
  assert.equal(await page.locator('#game-volume').isVisible(),false);
  await page.tap('#sound-toggle');
  assert.equal(await page.locator('#game-volume').isVisible(),true);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),menuFrame,'Opening menu freezes the native game');
  await page.tap('#help');await page.tap('#help-close');
  assert.equal(await page.evaluate(()=>mobileMenu.open&&moment37.state.paused),true,'Closing Help returns to the paused menu');
  await page.tap('#mobile-menu-back');
  assert.equal(await page.evaluate(()=>moment37.state.paused),false);
  await page.tap('#mobile-menu-open');
  if(await page.locator('#fullscreen').isVisible()){
   await page.tap('#fullscreen');await waitFor(()=>document.fullscreenElement===$('game'));
   assert.equal(await page.evaluate(()=>mobileMenu.open&&moment37.state.paused),true,'Fullscreen keeps menu controls accessible and the game paused');
   await page.tap('#fullscreen');await waitFor(()=>!document.fullscreenElement);
  }
  await page.tap('#pause');assert.equal(await page.evaluate(()=>moment37.state.paused),false);
  const manifest=await page.evaluate(async()=>await (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  for(const icon of manifest.icons)assert.equal((await page.request.get('http://127.0.0.1:3744/'+icon.src)).status(),200);
  const session=await context.newCDPSession(page);
  await page.evaluate(()=>{window.touchTrace=[];for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])$('touch-controls').addEventListener(type,event=>touchTrace.push({type,id:event.pointerId,bits:touchHistory.latest}));});
  async function point(bits,id){const box=await page.locator(`[data-touch-input="${bits}"]`).boundingBox();return{x:box.x+box.width/2,y:box.y+box.height/2,id};}
  const left=await point(4,1),mk=await point(512,2),down=await point(2,1),diagonal=await point(6,1);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,mk]});
  await waitFor(()=>touchHistory.latest===(4|512));
  assert.equal(await page.locator('[data-touch-input="4"]').getAttribute('aria-pressed'),'true');
  const slide=[];
  for(const [position,bits] of [[down,514],[diagonal,518],[left,516],[down,514],[diagonal,518],[left,516]]){
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[position,mk]});
   // Let the compositor deliver coalesced pointer moves while the game clock
   // stays under test control.
   await page.evaluate(()=>new Promise(resolve=>nativeRaf(resolve)));
   await waitFor(expected=>touchHistory.latest===expected,bits);
   slide.push(await page.evaluate(()=>touchHistory.latest));
  }
  assert.deepEqual(slide,[514,518,516,514,518,516],'Slide two quarter circles while another finger holds a kick');
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[left]});
  await page.evaluate(()=>new Promise(resolve=>nativeRaf(resolve)));
  await waitFor(()=>touchHistory.latest===512,null,{timeout:2000}).catch(async error=>{throw new Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({bits:touchHistory.latest,trace:touchTrace,pointers:[...touchControls.pointers]}))));});
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await waitFor(()=>touchHistory.latest===0&&touchControls.pointers.size===0);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await waitFor(()=>touchHistory.latest===4);
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...left,x:left.x+1}]});
  await page.evaluate(()=>new Promise(resolve=>nativeRaf(resolve)));
  await page.evaluate(()=>{const id=[...touchControls.pointers.keys()][0];$('touch-controls').releasePointerCapture(id);});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[left]});
  await page.evaluate(()=>new Promise(resolve=>nativeRaf(resolve)));
  await waitFor(()=>touchHistory.latest===0&&touchControls.pointers.size===0);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await waitFor(()=>touchHistory.latest===4);
  await page.evaluate(()=>$('pause').click());
  assert.equal(await page.evaluate(()=>moment37.state.paused),true);
  assert.equal(await page.evaluate(()=>touchHistory.latest),0);
  assert.equal(await page.locator('#touch-controls').isVisible(),false);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.tap('#resume');assert.equal(await page.evaluate(()=>moment37.state.paused),false);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await waitFor(()=>touchHistory.latest===4);
  const beforeRotate=await page.evaluate(()=>moment37.engine._web_value(2));
  await page.setViewportSize({width:390,height:844});await waitFor(()=>touchControls.blocked&&moment37.state.paused,null,{timeout:5000}).catch(async error=>{throw new Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({state:moment37.state,blocked:touchControls.blocked,mobile:touchControls.mobile,landscape:touchControls.landscape.matches,viewport:[innerWidth,innerHeight],rotate:$('mobile-rotate').hidden,trace:touchTrace}))));});
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),beforeRotate);
  assert.equal(await page.evaluate(()=>touchHistory.latest),0);
  assert.equal(await page.locator('#mobile-rotate').isVisible(),true);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.setViewportSize({width:844,height:390});await waitFor(()=>!touchControls.blocked);
  assert.equal(await page.evaluate(()=>moment37.state.paused),true,'Returning to landscape waits for an intentional resume');
  await page.tap('#resume');await page.tap('#mobile-menu-open');await page.tap('#help');assert.equal(await page.evaluate(()=>moment37.state.paused),true);
  assert.equal(await page.locator('.touch-help').isVisible(),true);
  await page.setViewportSize({width:390,height:844});await waitFor(()=>touchControls.blocked);
  assert.equal(await page.evaluate(()=>helpDialog.open),false,'Portrait prompt must remain visible even when Help was open');
  await page.setViewportSize({width:844,height:390});await waitFor(()=>!touchControls.blocked);
  await page.tap('#resume');await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await waitFor(()=>touchHistory.latest===4);await page.evaluate(()=>$('retry').click());
  assert.equal(await page.evaluate(()=>touchHistory.latest),0);
  assert.equal(await page.evaluate(()=>touchControls.pointers.size),0);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('#evo-volume').inputValue(),'0');
  const layouts=[];
  for(const [width,height] of [[568,320],[667,375],[844,390],[932,430],[1024,768]]){
   await page.setViewportSize({width,height});await waitFor(()=>!touchControls.blocked);
   await waitFor(({width,height})=>parseInt(document.documentElement.style.getPropertyValue('--mobile-width'))===width&&parseInt(document.documentElement.style.getPropertyValue('--mobile-height'))===height,{width,height},{timeout:5000}).catch(async error=>{throw new Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({inner:[innerWidth,innerHeight],visual:[visualViewport.width,visualViewport.height,visualViewport.scale],layout:[touchControls.width,touchControls.height]}))));});
   for(const assistance of [false,true]){
    await page.evaluate(enabled=>assistanceGuide.setEnabled(enabled),assistance);
    const layout=await page.evaluate(()=>{
     const rect=element=>{const b=element.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
     return{screen:rect(canvas),shell:rect($('game')),pad:rect($('touch-pad')),attacks:rect(document.querySelector('.touch-attacks')),buttons:[...$('touch-controls').querySelectorAll('button')].map(rect),header:[...document.querySelectorAll('.mobile-hud button,.mobile-score')].map(rect),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],guideHeight:$('guide-track').clientHeight};
    });
    assert.ok(Math.abs(layout.screen.width/layout.screen.height-4/3)<.01,'Keep the original game aspect ratio');
    assert.ok(Math.abs(layout.screen.height-Math.min(height,(width-200)*.75))<1,'Reserve the original side-control space without adding game bars');
    assert.ok(layout.pad.x<layout.screen.x&&layout.attacks.right>layout.screen.right,'The D-pad and attacks sit at the sides of the centered game');
    for(const box of [...layout.buttons,...layout.header])assert.ok(box.x>=-.1&&box.y>=-.1&&box.right<=width+.1&&box.bottom<=height+.1,`Controls must fit ${width}×${height}: ${JSON.stringify(box)}`);
    for(const box of layout.buttons)assert.ok(box.width>=44&&box.height>=44,'Touch buttons must remain finger-sized');
    assert.ok(layout.scroll[0]<=width&&layout.scroll[1]<=height);
    if(assistance)assert.ok(layout.guideHeight>60);
    layouts.push({width,height,assistance,screen:layout.screen,guideHeight:layout.guideHeight});
   }
  }
  await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{retry();assistanceGuide.setEnabled(true);moment37.engine._web_render(1);moment37.engine._web_step(0);assistanceGuide.observe(moment37.engine);update();});
  const pixels=await page.evaluate(()=>{const e=moment37.engine;e._web_step(0);const gl=canvas.getContext('webgl2'),bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return{size:[canvas.width,canvas.height],nonzero:bytes.reduce((count,value)=>count+(value!==0),0)};});
  assert.deepEqual(pixels.size,[768,576]);assert.ok(pixels.nonzero>100000,'A mobile retry after rotation must render the actual fight');
  await page.screenshot({path:path.join(root,'web/tests/mobile-landscape.png')});
  await page.evaluate(()=>assistanceGuide.setEnabled(false));
  await page.screenshot({path:path.join(root,'web/tests/mobile-side-controls.png')});
  await page.tap('#mobile-menu-open');await page.screenshot({path:path.join(root,'web/tests/mobile-menu.png')});
  await page.tap('#retry');
  assert.equal(await page.evaluate(()=>mobileMenu.open),false);
  assert.equal(await page.evaluate(()=>moment37.state.paused),false);
  assert.equal(await page.locator('#mobile-attempts').textContent(),`TENTATIVA ${String(await page.evaluate(()=>moment37.state.attempt)).padStart(2,'0')}`);
  const touchRun=await page.evaluate(g=>{
   // Trusted multi-touch/capture was checked above. For a repeatable frame
   // replay, dispatch timestamped pointer transitions at the actual buttons.
   // Synthetic pointers have no OS capture, so only capture is stubbed here.
   const controls=$('touch-controls'),capture=controls.setPointerCapture;controls.setPointerCapture=()=>{};
   function event(type,bits,id,time){const button=bits?controls.querySelector(`[data-touch-input="${bits}"]`):controls;const box=button.getBoundingClientRect();const e=new PointerEvent(type,{pointerType:'touch',pointerId:id,bubbles:true,cancelable:true,clientX:box.x+box.width/2,clientY:box.y+box.height/2});Object.defineProperty(e,'timeStamp',{value:time});button.dispatchEvent(e);}
   const e=moment37.engine;e._web_reset();e._web_start();paused=false;audioMixer.reset();assistanceGuide.reset();assistanceGuide.observe(e);update();
   const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let testNow=performance.now()+20000;
   Object.defineProperty(performance,'now',{configurable:true,value:()=>testNow});
   const origin=testNow;resetInputClock(true,origin);let direction=0,kick=0,events=[],count=0;
   for(let frame=0;frame<800&&e._web_status()===2;frame++){
    testNow=origin+(frame+1)*MomentTiming.FRAME_MS;
    const bits=g.inputs[frame]||0,dir=bits&15,attack=bits&1904,time=origin+(frame+.5)*MomentTiming.FRAME_MS;
    if(dir!==direction){event(dir?(direction?'pointermove':'pointerdown'):'pointerup',dir,1,time);direction=dir;}
    if(attack!==kick){if(kick)event('pointerup',0,2,time);if(attack)event('pointerdown',attack,2,time);kick=attack;}
    controlledFrames.shift()(origin+(frame+1)*MomentTiming.FRAME_MS);
    const parries=e._web_value(5);if(parries>count){events.push(frame);count=parries;}
   }
   const result={status:e._web_status(),parries:e._web_value(5),hp:e._web_value(3),enemyHP:e._web_value(4),events,remaining:touchHistory.latest};
   // A one-millisecond tap delivered before a three-frame catch-up must still
   // parry at either edge and every other position in the first window.
   result.shortTaps=[];
   for(let at=g.expected_parries[0]-9;at<=g.expected_parries[0];at++){
    e._web_reset();e._web_start();paused=false;update();e._web_render(0);for(let frame=0;frame<at-1;frame++)e._web_step(0);
    const now=performance.now(),start=now-(at+2)*MomentTiming.FRAME_MS;resetInputClock(true,start);frameClock.frames=at-1;frameClock.last=now-3*MomentTiming.FRAME_MS;
    const time=start+(at+.5)*MomentTiming.FRAME_MS;event('pointerdown',4,1,time);event('pointerup',0,1,time+1);
    controlledFrames.shift()(now);while(e._web_value(2)<=153&&e._web_status()===2)e._web_step(0);
    result.shortTaps.push({at,parries:e._web_value(5)});
   }
   controls.setPointerCapture=capture;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;return result;
  },golden);
  assert.equal(touchRun.status,4,'Touch controls must execute the complete parry-and-KO sequence');
  assert.equal(touchRun.parries,15);assert.equal(touchRun.hp,1);assert.ok(touchRun.enemyHP<0);assert.equal(touchRun.remaining,0);
  assert.deepEqual(touchRun.events,golden.expected_parries);
  for(const tap of touchRun.shortTaps)assert.equal(tap.parries,1,`A short touch tap must parry at frame ${tap.at}`);
  assert.deepEqual(errors,[]);await context.close();
  // WebKit exercises the Safari browser engine as well as Chromium. This is
  // browser emulation, not a claim of testing a physical iPhone.
  const safari=await webkit.launch({headless:true});browsers.push(safari);
  const ios=await safari.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});
  await ios.route(/cloudflareinsights\.com/,route=>route.abort());
  const iosPage=await ios.newPage(),iosErrors=[];iosPage.on('pageerror',error=>iosErrors.push(error.message));
  await iosPage.goto('http://127.0.0.1:3744/');await iosPage.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  assert.equal(await iosPage.locator('#mobile-rotate').isVisible(),true);
  await iosPage.setViewportSize({width:844,height:390});await iosPage.waitForFunction(()=>!touchControls.blocked);
  assert.equal(await iosPage.evaluate(()=>$('game').clientWidth),844);
  await iosPage.tap('#play');await iosPage.waitForFunction(()=>moment37.state.status===2);
  assert.equal(await iosPage.evaluate(()=>moment37.audio.ready&&moment37.audio.enabled),true,'Default Evo audio must arm from a mobile Start tap');
  await iosPage.tap('[data-touch-input="4"]');await iosPage.tap('#mobile-menu-open');
  assert.equal(await iosPage.evaluate(()=>moment37.state.paused),true);
  await iosPage.tap('#help');await iosPage.tap('#help-close');
  assert.equal(await iosPage.evaluate(()=>mobileMenu.open&&moment37.state.paused),true);
  await iosPage.tap('#mobile-menu-close');assert.equal(await iosPage.evaluate(()=>moment37.state.paused),false);
  await iosPage.tap('#mobile-menu-open');
  assert.equal(await iosPage.locator('#touch-controls').isVisible(),false);
  await iosPage.setViewportSize({width:390,height:844});await iosPage.waitForFunction(()=>touchControls.blocked);
  assert.equal(await iosPage.locator('#mobile-rotate').isVisible(),true);
  await iosPage.setViewportSize({width:844,height:390});await iosPage.waitForFunction(()=>!touchControls.blocked);
  await iosPage.tap('#resume');await iosPage.waitForFunction(()=>!moment37.state.paused);
  assert.deepEqual(await iosPage.evaluate(()=>[canvas.width,canvas.height]),[768,576]);
  assert.deepEqual(iosErrors,[]);await ios.close();
  console.log(JSON.stringify({passed:true,desktopControlsHidden:true,multitouchSlide:slide,orientationPause:true,layouts,touchRun,webkit:'Engine boot, touch, pause and portrait gate passed'},null,2));
 }finally{for(const browser of browsers)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
