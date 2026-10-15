/* Browser mixing only. The engine still produces its own sound and super activation. */
class MomentAudio {
  constructor({volume,volumeValue,evoVolume,evoValue}) {
    this.volume=volume;this.volumeValue=volumeValue;this.evoVolume=evoVolume;this.evoValue=evoValue;
    this.context=null;this.gameGain=null;this.evoGain=null;this.buffer=null;this.loading=null;
    this.enabled=false;this.source=null;this.offset=0;this.anchor=0;this.clockStart=null;
    this.status='off';this.starts=0;this.lastDrift=0;this.complete=false;this.suspended=false;
    this.primed=false;this.configureSession();
    volume.addEventListener('input',()=>this.setVolume(volume.value));
    this.setVolume(volume.value);
    this.setEvoVolume(evoVolume.value);
  }
  init(engine) {
    this.context=engine.SDL3.audioContext;
    const output=engine.SDL3.audio_playback.scriptProcessorNode;
    this.gameGain=this.context.createGain();this.evoGain=this.context.createGain();
    output.disconnect();output.connect(this.gameGain);this.gameGain.connect(this.context.destination);
    this.evoGain.connect(this.context.destination);
    this.setVolume(this.volume.value);
    this.setEvoVolume(this.evoVolume.value);
  }
  configureSession() {
    // WebKit's default ambient session obeys the iPhone's Silent Mode switch.
    // Both the original game audio and the recording need playback routing.
    try{if(navigator.audioSession&&navigator.audioSession.type!=='playback')navigator.audioSession.type='playback';}catch{}
  }
  unlock() {
    this.configureSession();
    if(!this.context)return Promise.resolve();
    if(this.context.state==='closed')return Promise.reject(new Error('O navegador encerrou o áudio. Recarregue a página para restaurar o som.'));
    // Start a zero-valued sample inside the user gesture to prime mobile audio.
    if(!this.primed||this.context.state!=='running'){
      const source=this.context.createBufferSource();source.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
      source.connect(this.context.destination);source.onended=()=>source.disconnect();source.start();this.primed=true;
    }
    const resumed=this.context.state==='interrupted'?this.context.suspend().then(()=>this.context.resume()):this.context.state==='running'?Promise.resolve():this.context.resume();
    return resumed.then(()=>{if(this.context.state!=='running')throw new Error('O áudio continua interrompido. Toque em Continuar quando estiver disponível.');});
  }
  setVolume(value) {
    const percent=Math.max(0,Math.min(100,Number(value)));
    this.volumeValue.value=`${percent}%`;
    this.volume.setAttribute('aria-valuetext',`${percent} por cento`);
    if(this.gameGain){if(this.context.state==='running')this.gameGain.gain.setTargetAtTime(percent/100,this.context.currentTime,.01);else this.gameGain.gain.value=percent/100;}
  }
  setEvoVolume(value) {
    const percent=Math.max(0,Math.min(100,Number(value)));
    this.enabled=percent>0;this.evoVolume.value=percent;this.evoValue.value=`${percent}%`;
    this.evoVolume.setAttribute('aria-valuetext',`${percent} por cento`);
    if(this.evoGain){
      const gain=this.evoGain.gain,time=this.context.currentTime;gain.cancelScheduledValues(time);
      if(this.context.state==='running'&&this.source)gain.setTargetAtTime(percent/100,time,.01);
      else{gain.value=percent/100;gain.setValueAtTime(percent/100,time);}
    }
    if(!this.source&&!this.complete&&(this.status==='ready'||this.status==='off'))this.status=this.enabled?'ready':'off';
  }
  async load() {
    if(this.buffer)return this.buffer;
    if(this.loading)return this.loading;
    this.status='loading';this.evoVolume.setAttribute('aria-busy','true');
    this.loading=(async()=>{
      const response=await fetch('audio/evo-moment37.wav');
      if(!response.ok)throw new Error('Não foi possível carregar o áudio da torcida.');
      const bytes=await response.arrayBuffer();
      this.buffer=await this.context.decodeAudioData(bytes);
      this.status=this.enabled?'ready':'off';return this.buffer;
    })().catch(error=>{this.setEvoVolume(0);this.status='error';throw error;})
      .finally(()=>{this.loading=null;this.evoVolume.removeAttribute('aria-busy');});
    return this.loading;
  }
  async arm() {
    await this.unlock();
    if(this.enabled&&!this.complete)await this.load();
  }
  reset() {
    this.stop();this.clockStart=null;this.offset=0;this.complete=false;this.suspended=false;
    this.status=this.enabled?'ready':'off';
  }
  stop() {
    if(this.source){const source=this.source;this.source=null;source.onended=null;try{source.stop();}catch{}source.disconnect();}
  }
  position() {
    return this.source?this.offset+(this.context.currentTime-this.anchor)*this.source.playbackRate.value:this.offset;
  }
  play(offset) {
    if(!this.buffer||offset>=this.buffer.duration){this.complete=true;this.stop();return;}
    this.stop();this.offset=Math.max(0,offset);this.anchor=this.context.currentTime;
    const source=this.context.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=MomentTiming.FPS/MomentTiming.EVO_REFERENCE_FPS;source.connect(this.evoGain);
    this.source=source;this.starts++;this.status='playing';
    source.onended=()=>{if(this.source===source){this.source=null;source.disconnect();this.complete=true;this.status='ended';}};
    source.start(this.anchor,this.offset);
  }
  pause(engine) {
    this.suspended=true;
    if(this.source){this.offset=this.clockStart===null?this.position():this.target(engine);this.stop();this.status='paused';}
  }
  resume(engine) {
    this.suspended=false;
    if(this.buffer&&this.clockStart!==null&&!this.complete)this.play(this.target(engine));
  }
  target(engine) {return Math.max(0,(engine._web_value(53)-this.clockStart-1)/MomentTiming.EVO_REFERENCE_FPS);}
  frame(engine) {
    if(this.suspended||this.complete)return;
    if(engine._web_value(54)||engine._web_status()===3){this.stop();this.complete=true;this.status='stopped';return;}
    if(!this.buffer)return;
    const activation=engine._web_value(52);
    if(activation<0)return;
    if(this.clockStart===null){this.clockStart=activation;this.play(this.target(engine));return;}
    if(engine._web_status()===4)return; // Let the recorded reaction finish after a successful attempt.
    if(!this.source){this.play(this.target(engine));return;}
    this.lastDrift=this.target(engine)-this.position();
    // Correct a browser stall without delaying the game or changing its frame calculations.
    if(Math.abs(this.lastDrift)>2/MomentTiming.EVO_REFERENCE_FPS)this.play(this.target(engine));
  }
  get state() {return {enabled:this.enabled,status:this.status,ready:!!this.buffer,contextState:this.context?.state??'uninitialized',sessionType:navigator.audioSession?.type??null,activationFrame:this.clockStart,starts:this.starts,offset:this.offset,position:this.context?this.position():0,lastDrift:this.lastDrift,gameVolume:this.gameGain?.gain.value??1,evoVolume:this.evoGain?.gain.value??Number(this.evoVolume.value)/100};}
}
