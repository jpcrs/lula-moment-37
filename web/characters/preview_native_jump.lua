-- A real recorded native jump, rendered with original and replacement cels.
local root=assert(app.params.aseprite_mcp_workspace)
local function read(path)local f=assert(io.open(root..'/'..path,'r'));local d=json.decode(f:read('*a'));f:close();return d end
local trace=read('outputs/character-audit/ken-movement.json').forward
local f=assert(io.open(root..'/outputs/character-study/pl11-frames.bin','rb'));local b=f:read('*a');f:close()
local n,pos=string.unpack('<I4',b,5);local palette={};local native={}
for i=0,63 do local c;c,pos=string.unpack('<I2',b,pos);palette[i]=app.pixelColor.rgba(((c>>10)&31)*255//31,((c>>5)&31)*255//31,(c&31)*255//31,i==0 and 0 or 255) end
for i=1,n do
 local cg,w,h,x,y,len;cg,w,h,x,y,len,pos=string.unpack('<I2I2I2i2i2I4',b,pos)
 local im=Image(w,h,ColorMode.RGB)
 for yy=0,h-1 do for xx=0,w-1 do local c=b:byte(pos+yy*w+xx);if c~=0 then im:drawPixel(xx,yy,palette[c]) end end end
 native[cg]={image=im,w=w,h=h,x=x,y=y};pos=pos+len
end
local replacement={};local s=app.open(root..'/web/characters/hat-fighter-native.aseprite')
for _,tag in ipairs(s.tags) do
 local cg=tonumber(tag.name);local orig=cg and native[cg]
 if orig then
  local c=s.layers[1]:cel(tag.fromFrame);local im=Image(orig.w,orig.h,ColorMode.RGB)
  local dx,dy=960+orig.x*3-c.position.x,1100+orig.y*3-c.position.y
  for y=0,orig.h-1 do for x=0,orig.w-1 do
   local a,r,g,b=0,0,0,0
   for yy=0,2 do for xx=0,2 do
    local sx,sy=dx+x*3+xx,dy+y*3+yy
    if sx>=0 and sx<c.image.width and sy>=0 and sy<c.image.height then
     local color=c.image:getPixel(sx,sy);local alpha=app.pixelColor.rgbaA(color)
     a=a+alpha;r=r+app.pixelColor.rgbaR(color)*alpha;g=g+app.pixelColor.rgbaG(color)*alpha;b=b+app.pixelColor.rgbaB(color)*alpha
    end
   end end
   if a>=128*9 then im:drawPixel(x,y,app.pixelColor.rgba(math.floor(r/a+.5),math.floor(g/a+.5),math.floor(b/a+.5),255)) end
  end end
  replacement[cg]={image=im,w=orig.w,h=orig.h,x=orig.x,y=orig.y}
 end
end
s:close()
local out=Sprite(512,224,ColorMode.RGB)
for tick=1,40 do
 if tick>1 then out:newEmptyFrame(tick) end
 local frame=trace[tick];local image=Image(512,224,ColorMode.RGB);image:clear(app.pixelColor.rgba(30,35,43,255))
 for side,group in ipairs({native,replacement}) do
  local fr=assert(group[frame.cg],'Missing native jump drawing '..frame.cg)
  local ox=(side-1)*256+188+frame.x-trace[1].x;local oy=216-frame.y
  if frame.facing==0 then image:drawImage(fr.image,Point(ox+fr.x,oy+fr.y))
  else
   for y=0,fr.h-1 do for x=0,fr.w-1 do
    local c=fr.image:getPixel(x,y);if app.pixelColor.rgbaA(c)>0 then image:drawPixel(ox-fr.x-x-1,oy+fr.y+y,c) end
   end end
  end
 end
 out:newCel(out.layers[1],tick,image);out.frames[tick].duration=tick%3==2 and .01 or .02
end
app.sprite=out;app.command.SpriteSize{ui=false,width=1024,height=448,method='nearest'}
out:saveCopyAs(root..'/outputs/character-audit/ken-jump-comparison.gif')
out:saveAs(root..'/outputs/character-audit/ken-jump-comparison.aseprite');out:close()
print('Original vs replacement: native CGs and recorded jump physics, 40 ticks')
