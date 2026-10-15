-- Preview exported native-scale motion and verify that idle soles stay fixed.
local root=app.params.aseprite_mcp_workspace
app.fs.makeAllDirectories(root..'/outputs/character-motion')
local manifest=assert(io.open(root..'/web/dist/characters/suits.bin','rb'));local data=manifest:read('*a');manifest:close()
local count,pages,pos=string.unpack('<I4I4',data,5)
local frames={};local atlas={}
for p=0,pages-1 do local s=app.open(root..'/web/dist/characters/suits-'..p..'.png');app.sprite=s;app.command.ChangePixelFormat{format='rgb'};atlas[p]=Image(s.cels[1].image);s:close() end
for i=1,count do
 local cg,page,x,y,w,h,left,top,ww,hh
 cg,page,x,y,w,h,left,top,ww,hh,pos=string.unpack('<I2I2I2I2I2I2i2i2i2i2',data,pos)
 local crop=Image(w,h,ColorMode.RGB);crop:drawImage(atlas[page],Point(-x,-y))
 frames[cg]={image=crop,x=left/64,y=top/64,w=ww/64,h=hh/64}
end
local cycles={
 {'hat-idle',14657,14658,14659,14660,14661,14662,14663,14664,14665,14666},
 {'hat-back',14684,14685,14686,14687,14688,14689,14690,14691,14692,14693,14694},
 {'hat-walk',14672,14673,14674,14675,14676,14677,14678,14679,14680,14681,14682},
 {'gray-idle',19472,19473,19474,19475,19476,19477,19476,19475,19474,19473},
 {'gray-walk',19488,19489,19490,19491,19492,19493,19494,19495},
 {'gray-back',19496,19497,19498,19499,19500,19501,19502,19503}
}
for _,cycle in ipairs(cycles) do
 local s=Sprite(128,128,ColorMode.RGB)
 local contact=Sprite(128*(#cycle-1),128,ColorMode.RGB)
 contact.cels[1].image:clear(app.pixelColor.rgba(30,35,43,255))
 for i=2,#cycle do
  if i>2 then s:newEmptyFrame(i-1) end
  local image=Image(128,128,ColorMode.RGB);image:clear(app.pixelColor.rgba(30,35,43,255))
  local fr=frames[cycle[i]]
  image:drawImage(fr.image,Point(math.floor(64+fr.x+.5),math.floor(118+fr.y+.5)))
  s:newCel(s.layers[1],i-1,image)
  s.frames[i-1].duration=cycle[1]=='hat-idle' and cycle[i]>=14660 and cycle[i]<=14663 and .067 or cycle[1]=='gray-idle' and .067 or .050
  contact.cels[1].image:drawImage(image,Point((i-2)*128,0))
 end
 contact:saveCopyAs(root..'/outputs/character-motion/'..cycle[1]..'-contact.png');contact:close()
 s:saveAs(root..'/outputs/character-motion/'..cycle[1]..'.aseprite')
 app.sprite=s;app.command.SpriteSize{ui=false,width=384,height=384,method='nearest'}
 s:saveCopyAs(root..'/outputs/character-motion/'..cycle[1]..'.gif');s:close()
end
-- Compare the planted sole pixels in world coordinates, not cel-local bounds.
local function solePixels(cg,x0,y0,x1,y1)
 local fr=frames[cg];local result={}
 for y=y0,y1 do for x=x0,x1 do
  local xx,yy=x-fr.x,y-fr.y
  result[#result+1]=xx>=0 and xx<fr.image.width and yy>=0 and yy<fr.image.height and fr.image:getPixel(xx,yy) or 0
 end end
 return result
end
for _,item in ipairs({{'hat',14657,14666,-47,-5,48,6},{'gray',19472,19479,-49,-4,32,6}}) do
 local baseline=solePixels(item[2],item[4],item[5],item[6],item[7])
 for cg=item[2]+1,item[3] do
  local sample=solePixels(cg,item[4],item[5],item[6],item[7])
  for i,pixel in ipairs(sample) do assert(pixel==baseline[i],item[1]..' foot moved at '..cg..' pixel '..i) end
 end
 print(item[1]..': every idle sole pixel stays planted')
end
local function atTime(cgs,durations,time)
 local sum=0;for _,d in ipairs(durations) do sum=sum+d end
 time=time%sum
 for i,cg in ipairs(cgs) do if time<durations[i] then return cg end;time=time-durations[i] end
end
local hat={14657,14658,14659,14660,14661,14662,14663,14664,14665,14666}
local gray={19472,19473,19474,19475,19476,19477,19476,19475,19474,19473}
local s=Sprite(256,128,ColorMode.RGB)
for tick=0,678,2 do
 local index=tick//2+1;if index>1 then s:newEmptyFrame(index) end
 local image=Image(256,128,ColorMode.RGB);image:clear(app.pixelColor.rgba(30,35,43,255))
 for i,cg in ipairs({atTime(hat,{3,3,3,4,4,4,4,3,3,3},tick),atTime(gray,{4,4,4,4,4,4,4,4,4,4},tick)}) do
  local fr=frames[cg];image:drawImage(fr.image,Point((i-1)*128+64+fr.x,118+fr.y))
 end
 s:newCel(s.layers[1],index,image);s.frames[index].duration=index%3==0 and .04 or .03
end
app.sprite=s;app.command.SpriteSize{ui=false,width=768,height=384,method='nearest'}
s:saveCopyAs(root..'/outputs/character-motion/breathing.gif');s:close()
