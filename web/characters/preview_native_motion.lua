-- Replay recorded native VM graphics and world positions from the final atlases.
-- Original artwork is on the left, replacement artwork on the right.
local root=assert(app.params.aseprite_mcp_workspace)
local function bytes(path)local f=assert(io.open(root..'/'..path,'rb'));local b=f:read('*a');f:close();return b end
local traces=json.decode(bytes('outputs/character-audit/native-movement-traces.json'))
local function atlas(manifest,prefix)
 local b=bytes(manifest);assert(b:sub(1,4)=='M37H')
 local count,pages,pos=string.unpack('<I4I4',b,5);local images={};local frames={}
 for p=0,pages-1 do
  local s=assert(app.open(root..'/'..prefix..p..'.png'));app.sprite=s
  app.command.ChangePixelFormat{format='rgb'};images[p]=Image(s.cels[1].image);s:close()
 end
 for i=1,count do
  local cg,page,x,y,w,h,left,top,ww,hh
  cg,page,x,y,w,h,left,top,ww,hh,pos=string.unpack('<I2I2I2I2I2I2i2i2i2i2',b,pos)
  assert(w==ww//64 and h==hh//64,'Unexpected atlas scale')
  local im=Image(w,h,ColorMode.RGB);im:drawImage(images[page],Point(-x,-y))
  frames[cg]={image=im,w=w,h=h,x=left//64,y=top//64}
 end
 return frames
end
local original=atlas('outputs/character-audit/reference/sprites.bin','outputs/character-audit/reference/sprites-')
local custom=atlas('web/dist/characters/suits.bin','web/dist/characters/suits-')
local outdir=root..'/outputs/character-audit/motion';app.fs.makeAllDirectories(outdir)
local scenes={}
for _,action in ipairs({'idle','walkForward','walkBackward','jumpNeutral','jumpForward','jumpBackward'}) do
 scenes[#scenes+1]={player=1,action=action,first=1,last=action=='idle' and 80 or 40,file='ken-'..action..'.gif'}
end
scenes[#scenes+1]={player=2,action='idle',first=1,last=80,file='chun-li-idle.gif'}
scenes[#scenes+1]={player=2,action='challenge',first=140,last=240,file='chun-li-houyoku-sen.gif'}
scenes[#scenes+1]={player=2,action='challenge',first=420,last=530,file='chun-li-counterattack-reactions.gif'}
scenes[#scenes+1]={player=1,action='challenge',first=440,last=530,file='ken-counterattack.gif'}
if app.params.only_idle=='true' then
 local idle={};for _,scene in ipairs(scenes) do if scene.action=='idle' then idle[#idle+1]=scene end end
 scenes=idle
end
for _,scene in ipairs(scenes) do
 local player,first,last=scene.player,scene.first,scene.last
 local trace=assert(traces[scene.action][1]);local ticks=last-first+1
 local minX,maxX,minY,maxY=math.huge,-math.huge,0,0
 for tick=first,last do
  local state=trace[tick].players[player];local fr=original[state[6]]
  if fr then
   local flip=state[5]~state[9]
   local x=state[7]+((flip&1)~=0 and -fr.x-fr.w or fr.x)
   local y=-state[8]+((flip&2)~=0 and -fr.y-fr.h or fr.y)
   minX=math.min(minX,x);maxX=math.max(maxX,x+fr.w);minY=math.min(minY,y);maxY=math.max(maxY,y+fr.h)
  end
 end
 local width,height=math.max(256,maxX-minX+32),math.max(224,maxY-minY+32)
 local camX,camY=math.floor(width/2-(minX+maxX)/2),math.floor(height-16-maxY)
 local movie=Sprite(width*2,height,ColorMode.RGB)
 for tick=first,last do
  local frame=tick-first+1
  if frame>1 then movie:newEmptyFrame(frame) end
  local image=Image(width*2,height,ColorMode.RGB);image:clear(app.pixelColor.rgba(30,35,43,255))
  for x=0,width*2-1 do image:drawPixel(x,camY,app.pixelColor.rgba(65,72,82,255)) end
  local state=trace[tick].players[player];local flip=state[5]~state[9]
  for side,group in ipairs({original,custom}) do if state[6]~=0 then
   local fr=assert(group[state[6]],'Missing native graphic '..state[6]);local ox=(side-1)*width+camX+state[7];local oy=camY-state[8]
   for y=0,fr.h-1 do for x=0,fr.w-1 do
    local color=fr.image:getPixel(x,y)
    if app.pixelColor.rgbaA(color)>0 then
     local dx=(flip&1)~=0 and -fr.x-x-1 or fr.x+x
     local dy=(flip&2)~=0 and -fr.y-y-1 or fr.y+y
     image:drawPixel(ox+dx,oy+dy,color)
    end
   end end
  end end
  movie:newCel(movie.layers[1],frame,image);movie.frames[frame].duration=frame%3==2 and .01 or .02
 end
 app.sprite=movie;app.command.SpriteSize{ui=false,width=width*4,height=height*2,method='nearest'}
 local file=scene.file
 movie:saveCopyAs(outdir..'/'..file);movie:close();print(file..': '..ticks..' recorded native ticks')
end
