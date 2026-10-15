/* Record the real browser tab and game mix while the native engine executes
 * the verified player inputs in real time. No combat state or artwork is changed. */
const {chromium}=require('@playwright/test');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const golden=require('../web/tests/golden-inputs.json');

const root=path.resolve(__dirname,'..');
const work=path.join(root,'outputs/recording');
const output=path.join(root,'web/dist/media/lula-moment-37-full-run.mp4');
const raw=path.join(work,'full-run-capture.mp4');
const run=(command,args)=>{
 const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.status!==0)throw Error(`${command}: ${result.stderr||result.error}`);
 return result.stdout;
};

(async()=>{
 fs.mkdirSync(work,{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
 const server=spawn('python3',['web/serve.py','--port','3754'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Recording server exited: ${code}`)));});
  // macOS tab capture needs a headed browser; capture only this isolated tab.
  browser=await chromium.launch({headless:false,args:[
   '--auto-select-tab-capture-source-by-title=Lula Moment #37',
   '--auto-accept-this-tab-capture','--autoplay-policy=no-user-gesture-required',
   '--disable-background-timer-throttling','--disable-renderer-backgrounding',
   '--disable-backgrounding-occluded-windows'
  ]});
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  // The capture stays on this tab when the operator uses another application.
  // Suppress only host focus notifications, not the native simulation clock.
  await page.addInitScript(()=>{
   window.addEventListener('blur',event=>event.stopImmediatePropagation(),true);
   document.addEventListener('visibilitychange',event=>event.stopImmediatePropagation(),true);
  });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(/cloudflareinsights\.com/,route=>route.abort());
  await page.goto('http://127.0.0.1:3754/');
  await page.waitForFunction(()=>window.moment37?.state.ready,null,{timeout:60000});
  await page.evaluate(()=>audioMixer.arm());
  const capture=await page.evaluate(async golden=>{
   const tab=await navigator.mediaDevices.getDisplayMedia({
    video:{displaySurface:'browser',frameRate:{ideal:60,max:60},cursor:'never'},
    audio:false,preferCurrentTab:true,selfBrowserSurface:'include'
   });
   const destination=audioMixer.context.createMediaStreamDestination();
   const gain=audioMixer.context.createGain();gain.gain.value=.45;
   audioMixer.gameGain.connect(gain);audioMixer.evoGain.connect(gain);gain.connect(destination);
   const stream=new MediaStream([...tab.getVideoTracks(),...destination.stream.getAudioTracks()]);
   const mimeType='video/mp4;codecs=avc1.42002A,mp4a.40.2';
   if(!MediaRecorder.isTypeSupported(mimeType))throw Error('H.264/AAC browser recording is unavailable');
   const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:12000000,audioBitsPerSecond:192000});
   window.recording={recorder,stream,tab,destination,gain,chunks:[],start:performance.now(),marks:{}};
   recorder.ondataavailable=event=>{if(event.data.size)recording.chunks.push(event.data);};
   $('play').addEventListener('click',()=>{
    // start() resets the clock synchronously after the preloaded audio unlock.
    // Queue buttons at each tick's midpoint through the normal input sampler.
    recording.marks.play=(performance.now()-recording.start)/1000;
    const last=Math.max(...Object.keys(golden.inputs).map(Number));
    for(let frame=0;frame<=last+1;frame++)keyboardHistory.record(golden.inputs[frame]||0,frameClock.origin+(frame+.5)*MomentTiming.FRAME_MS);
   },{once:true});
   recorder.start(1000);
   const settings=tab.getVideoTracks()[0].getSettings();
   return {width:settings.width,height:settings.height,frameRate:settings.frameRate,mimeType};
  },golden);
  await page.mouse.move(0,0);
  await page.waitForTimeout(1000);await page.click('#play');await page.mouse.move(0,0);
  await page.waitForFunction(()=>[3,4].includes(moment37.state.status)||moment37.state.paused,null,{timeout:30000,polling:50});
  const outcome=await page.evaluate(()=>{
   recording.marks.victory=(performance.now()-recording.start)/1000;
   return {status:moment37.state.status,paused:moment37.state.paused,pauseNote:$('pause-note').textContent,parries:moment37.engine._web_value(5),
    finish:moment37.finish,title:$('overlay-title').textContent};
  });
  assert.equal(outcome.status,4,JSON.stringify(outcome));assert.equal(outcome.paused,false);
  assert.equal(outcome.parries,15);
  assert.deepEqual(outcome.finish,{stage:4,failed:false,hits:12,cancels:3,airParry:true});
  assert.equal(outcome.title,'Parabéns. Não esqueça de votar dia 25.');
  await page.waitForTimeout(7000);
  await page.screenshot({path:path.join(work,'victory.png')});
  const movie=await page.evaluate(async()=>{
   const r=recording;
   await new Promise(resolve=>{r.recorder.onstop=resolve;r.recorder.stop();});
   const blob=new Blob(r.chunks,{type:r.recorder.mimeType});
   const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
   r.stream.getTracks().forEach(t=>t.stop());r.tab.getTracks().forEach(t=>t.stop());
   audioMixer.gameGain.disconnect(r.gain);audioMixer.evoGain.disconnect(r.gain);r.gain.disconnect();
   // Codec parameters can contain commas; split at the actual encoding marker.
   return {base64:data.slice(data.indexOf(';base64,')+8),marks:r.marks};
  });
  assert.deepEqual(errors,[]);const bytes=Buffer.from(movie.base64,'base64');
  assert(bytes.subarray(0,32).includes(Buffer.from('ftyp')),'Invalid MP4 capture header');
  fs.writeFileSync(raw,bytes);
  await browser.close();browser=null;
  const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,channels:format=duration,size','-of','json',file]));
  const source=probe(raw),duration=Number(source.format.duration);
  run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',raw,
   '-r','60000/1001','-fps_mode','cfr','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
   '-c:a','aac','-b:a','192k','-ar','48000','-af',`loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${Math.max(0,duration-.5)}:d=0.5`,
   '-movflags','+faststart',output]);
  const final=probe(output);
  assert(final.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264'&&s.width===1440&&s.height===1080));
  assert(final.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'&&s.channels===2));
  assert(Number(final.format.duration)>movie.marks.victory+6);
  const report={outcome,capture,marks:movie.marks,source,final,output:path.relative(root,output)};
  fs.writeFileSync(path.join(work,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
