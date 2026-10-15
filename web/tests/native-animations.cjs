/* Verify every native frame binding and trace real movement against the VM. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..');
const plan=require('../characters/native-redraw-plan.json');
const catalog=require('../characters/native-animations.json');
const manifest=fs.readFileSync(path.join(root,'web/dist/characters/suits.bin'));
assert.equal(manifest.toString('ascii',0,4),'M37H');
const count=manifest.readUInt32LE(4),frames=new Map();
const pageCount=manifest.readUInt32LE(8),paletteColors=new Set();
assert(pageCount>0&&pageCount<=16,'Atlas count must fit the native renderer');
for(let page=0;page<pageCount;page++){
 const png=fs.readFileSync(path.join(root,`web/dist/characters/suits-${page}.png`));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const chunks={};
 for(let p=8;p<png.length;){const size=png.readUInt32BE(p);chunks[png.toString('ascii',p+4,p+8)]=png.subarray(p+8,p+8+size);p+=12+size;}
 assert.equal(chunks.IHDR.readUInt32BE(0),2048);assert.equal(chunks.IHDR.readUInt32BE(4),2048);
 assert.equal(chunks.IHDR[9],3,'Game atlases must use the limited indexed palette');
 assert(chunks.PLTE.length<=128*3,'Atlas palette must contain at most 128 colors');
 for(const alpha of chunks.tRNS||[])assert(alpha===0||alpha===255,'Game sprite alpha must be binary');
 for(let c=0;c<chunks.PLTE.length/3;c++)if((chunks.tRNS?.[c]??255)>0)paletteColors.add(chunks.PLTE.subarray(c*3,c*3+3).toString('hex'));
}
assert(paletteColors.size<=127,'All atlas pages must share the same limited opaque colors');
for(let p=12;p<manifest.length;p+=20){
 const cg=manifest.readUInt16LE(p);
 assert(!frames.has(cg),`Duplicate native frame ${cg}`);
 frames.set(cg,{page:manifest.readUInt16LE(p+2),x:manifest.readUInt16LE(p+4),y:manifest.readUInt16LE(p+6),
  w:manifest.readUInt16LE(p+8),h:manifest.readUInt16LE(p+10),left:manifest.readInt16LE(p+12)/64,top:manifest.readInt16LE(p+14)/64,
  ww:manifest.readInt16LE(p+16)/64,hh:manifest.readInt16LE(p+18)/64});
}
assert.equal(count,Object.keys(plan.graphics).length,'Every native graphic must have a replacement');
const rectangles=new Map();
for(const [key,g] of Object.entries(plan.graphics)){
 const f=frames.get(Number(key));assert(f,`No replacement for CG ${key}`);
 assert.deepEqual([f.left,f.top,f.w,f.h,f.ww,f.hh],[g.x,g.y,g.w,g.h,g.w,g.h],`CG ${key} must retain native placement and scale`);
 const rectangle=[f.page,f.x,f.y,f.w,f.h].join(',');
 if(rectangles.has(rectangle))assert.equal(rectangles.get(rectangle),g.pixelHash,'Different original poses must not share one replacement');
 rectangles.set(rectangle,g.pixelHash);
}
for(const [key,alias] of Object.entries(plan.aliases)){
 const a=plan.graphics[key],b=plan.graphics[alias];
 assert.equal(a.pixelHash,b.pixelHash,'Only identical original drawings may share artwork');
 assert.deepEqual([a.w,a.h],[b.w,b.h]);
}
(async()=>{
 const out=path.join(root,'outputs/character-audit');fs.mkdirSync(out,{recursive:true});
 const server=spawn('python3',['web/serve.py','--port','3752'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
  browser=await chromium.launch();const p=await browser.newPage();
  await p.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.freeze=false;window.frozen=false;window.requestAnimationFrame=cb=>freeze?(frozen=true,0):raf(cb);});
  await p.goto('http://127.0.0.1:3752');await p.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  // The page's RAF is deliberately frozen; poll outside that same scheduler.
  await p.evaluate(()=>freeze=true);await p.waitForFunction(()=>frozen,null,{polling:10});
  const bundleHashes=await p.evaluate(async count=>{
   const paths=['suits.bin',...Array.from({length:count},(_,i)=>`suits-${i}.png`)],hashes=[];
   for(const file of paths){
    const bytes=moment37.engine.FS.readFile(`/characters/${file}`);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    hashes.push(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''));
   }
   return hashes;
  },pageCount);
  for(const [i,file]of ['suits.bin',...Array.from({length:pageCount},(_,i)=>`suits-${i}.png`)].entries()){
   const digest=createHash('sha256').update(fs.readFileSync(path.join(root,'web/dist/characters',file))).digest('hex');
   assert.equal(bundleHashes[i],digest,`${file}: rebuild the WebAssembly bundle to embed the current artwork`);
  }
  const effects=require('../characters/native-effects.json');
  const effectHashes=await p.evaluate(async entries=>{
   const pages=new Map(),hashes=[];
   for(const f of entries){
    if(!pages.has(f.page))pages.set(f.page,await createImageBitmap(new Blob([moment37.engine.FS.readFile(`/characters/suits-${f.page}.png`)],{type:'image/png'})));
    const canvas=document.createElement('canvas');canvas.width=f.w;canvas.height=f.h;
    const ctx=canvas.getContext('2d');ctx.drawImage(pages.get(f.page),f.x,f.y,f.w,f.h,0,0,f.w,f.h);
    const bytes=ctx.getImageData(0,0,f.w,f.h).data;
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    hashes.push(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''));
   }
   for(const page of pages.values())page.close();return hashes;
  },effects.map(e=>({...frames.get(e.cg),cg:e.cg})));
  for(let i=0;i<effects.length;i++)assert.equal(effectHashes[i],effects[i].sha256Rgba,`Ken fire CG ${effects[i].cg} must retain exact native pixels`);
  const traces=await p.evaluate(golden=>{
   const e=moment37.engine;e._web_render(0);
   const actions={idle:()=>0,walkForward:()=>4,walkBackward:()=>8,crouch:()=>2,jumpNeutral:()=>1,jumpForward:()=>5,jumpBackward:()=>9,
    dashForward:f=>f===0||f>=2?4:0,dashBackward:f=>f===0||f>=2?8:0,punch:()=>16,kick:()=>256,
    challenge:f=>golden.inputs[f]||0};
   const result={};
   for(const [name,input]of Object.entries(actions)){
    const modes=[];
    for(const original of [0,1]){
     e._web_original(original);e._web_reset();e._web_start();const trace=[];
     for(let f=0;f<(name==='challenge'?600:80);f++){
      e._web_step(input(f));trace.push({fight:Array.from({length:66},(_,i)=>e._web_value(i)),
       players:[0,1].map(player=>Array.from({length:12},(_,key)=>e._web_animation(player,key)))});
     }
     modes.push(trace);
    }
    result[name]=modes;
   }
   return result;
  },require('./golden-inputs.json'));
  let compared=0;const observed=new Set();
  for(const [move,[custom,original]]of Object.entries(traces)){
   assert.deepEqual(custom,original,`${move}: artwork must not change a native VM field or combat value`);
   for(const frame of custom)for(const [player,state]of frame.players.entries()){
    const name=player===0?'pl11':'pl16',data=catalog[name];
    const [koc,index,pc,,flip,cg,,,,,,stride]=state;
    if(!cg)continue;
    assert(frames.has(cg),`${move}: missing live native CG ${cg}`);
    const entry=data.tables.find(t=>t.koc===koc&&t.index===index);
    if(!entry)continue;
    const script=data.scripts[entry.script],record=script.records.find(r=>r.pc===pc);
    assert.equal(stride,script.strideWords);
    if(record?.type==='frame'){
     assert.equal(cg,record.cg,`${move}: catalog CG must match the native VM`);
     assert.equal(flip,record.flip,`${move}: catalog flip must match the native VM`);compared++;
    }
    observed.add(cg);
   }
  }
  const roll=new Set(traces.jumpForward[0].map(f=>f.players[0][5]).filter(cg=>cg>=14732&&cg<=14743));
  assert(roll.size>=8,'A moving jump must run the original somersault drawings');
  fs.writeFileSync(path.join(out,'native-movement-traces.json'),JSON.stringify(traces));
  console.log(JSON.stringify({passed:true,graphicBindings:count,atlasPages:pageCount,opaquePaletteColors:paletteColors.size,animationScripts:Object.values(catalog).reduce((n,d)=>n+Object.keys(d.scripts).length,0),
    inputScenarios:Object.keys(traces).length,observedGraphics:observed.size,vmRecordsCompared:compared,somersaultFrames:roll.size,nativeFireDrawings:effects.length},null,2));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
