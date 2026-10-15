/* Exercise the compact Portuguese UI through its actual desktop/mobile controls. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium,devices}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/interface');fs.mkdirSync(output,{recursive:true});
 const server=spawn('python3',['web/serve.py','--port','3750'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route(/cloudflareinsights\.com/,route=>route.abort());
  await page.addInitScript(()=>{window.freezeFrames=false;window.pendingFrames=[];const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>freezeFrames?(pendingFrames.push(callback),0):raf(callback);});
  await page.goto('http://127.0.0.1:3750');await page.waitForFunction(()=>moment37?.state.ready);
  await page.evaluate(()=>window.freezeFrames=true);await page.waitForFunction(()=>pendingFrames.length>0);
  assert.equal(await page.title(),'Lula Moment #37');assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');
  assert.equal((await page.locator('#overlay').innerText()).replace(/\s+/g,' '),'Lula Moment #37 Jogar ↗');
  assert.equal(await page.locator('#phase-label,#overlay-tag').count(),0);
  assert.equal(await page.locator('#game-volume').isVisible(),false);
  const frame=await page.evaluate(()=>moment37.engine._web_value(2));
  await page.getByRole('button',{name:'Som',exact:true}).click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-expanded'),'true');
  await page.getByRole('slider',{name:'Volume do jogo',exact:true}).focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#game-volume').inputValue(),'1');
  assert.equal(await page.locator('#game-volume-value').innerText(),'1%');
  assert.equal(await page.locator('#evo-volume').inputValue(),'100','Each slider controls its own track');
  await page.getByRole('slider',{name:'Volume da torcida',exact:true}).focus();await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>moment37.audio.evoVolume),0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sound-panel').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'sound-toggle');
  assert.equal(await page.evaluate(()=>moment37.engine._web_value(2)),frame,'Audio controls never advance the native fight');
  await page.keyboard.press('Space');assert.equal(await page.locator('#sound-panel').isVisible(),true);
  await page.locator('.matchup').click();assert.equal(await page.locator('#sound-panel').isVisible(),false);
  await page.screenshot({path:path.join(output,'lula-start.png')});
  await page.click('#play');await page.waitForFunction(()=>moment37.state.status===2);
  await page.evaluate(()=>{moment37.engine._web_step(0);update();});
  await page.click('#sound-toggle');await page.screenshot({path:path.join(output,'lula-sound.png')});
  assert.equal(await page.evaluate(()=>moment37.state.paused),false);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>moment37.state.paused),false,'Escape dismisses Sound without pausing the game');
  const layouts=[];
  for(const [width,height] of [[1440,1000],[1440,550],[900,700],[497,1099],[390,844],[320,640]]){
   await page.setViewportSize({width,height});await page.click('#sound-toggle');
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,header:document.querySelector('.game-top').getBoundingClientRect().height,
    boxes:[...document.querySelectorAll('.top-controls>button,#sound-toggle,#sound-panel,.game-actions button')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{id:e.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})}));
   assert(layout.width<=width);assert(layout.header<=81,`Compact header at ${width}×${height}`);
   for(const box of layout.boxes)assert(box.x>=-.1&&box.right<=width+.1&&box.y>=-.1&&box.bottom<=height+.1,JSON.stringify({width,height,box}));
   layouts.push({width,height,header:layout.header});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{const e=moment37.engine;e._web_render(0);for(let f=0;f<350&&e._web_status()===2;f++)e._web_step(0);e._web_render(1);update();});
  assert.equal(await page.evaluate(()=>moment37.state.status),3);assert.equal(await page.locator('#overlay').innerText(),'Tentar novamente');
  await page.screenshot({path:path.join(output,'lula-try-again.png')});await page.close();
  const mobile=await browser.newContext({...devices['iPhone 13'],viewport:{width:844,height:390}}),phone=await mobile.newPage();
  phone.on('pageerror',error=>errors.push(error.message));await phone.route(/cloudflareinsights\.com/,route=>route.abort());
  await phone.goto('http://127.0.0.1:3750');await phone.waitForFunction(()=>moment37?.state.ready);
  await phone.tap('#mobile-menu-open');assert.equal(await phone.locator('#game-volume').isVisible(),false);
  await phone.tap('#sound-toggle');assert.equal(await phone.locator('#game-volume').isVisible(),true);
  await phone.getByRole('slider',{name:'Volume da torcida',exact:true}).focus();await phone.keyboard.press('Home');
  await phone.screenshot({path:path.join(output,'lula-mobile-sound.png')});
  await phone.tap('#help');assert.equal(await phone.locator('#sound-panel').isVisible(),false);
  assert.equal(await phone.locator('#help-title').innerText(),'Como jogar');
  await phone.tap('#help-close');await phone.tap('#mobile-menu-back');
  assert.equal(await phone.locator('#game-volume').isVisible(),false);assert.equal(await phone.locator('#evo-volume').inputValue(),'0');
  await mobile.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,layouts,language:'pt-BR',sound:'Independent volumes, keyboard, dismissal and mobile menu verified',failure:'Tentar novamente'},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1});
