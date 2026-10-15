-- Compare the export with an explicitly supplied pre-edit pack, pixel for pixel.
local root=assert(app.params.aseprite_mcp_workspace)
local before=assert(app.params.before,'Pass before=path/to/previous/pack')
local function bytes(path)local f=assert(io.open(root..'/'..path,'rb'));local b=f:read('*a');f:close();return b end
local manifest=bytes('web/dist/characters/suits.bin')
assert(manifest==bytes(before..'/suits.bin'),'Native geometry or bindings changed')
local count,pages,pos=string.unpack('<I4I4',manifest,5)
local frames={}
for i=1,count do
 local cg,page,x,y,w,h,left,top,ww,hh
 cg,page,x,y,w,h,left,top,ww,hh,pos=string.unpack('<I2I2I2I2I2I2i2i2i2i2',manifest,pos)
 frames[cg]={page=page,x=x,y=y,w=w,h=h,left=left/64,top=top/64}
end
local source=assert(app.open(root..'/web/characters/hat-fighter-native.aseprite'))
local maskLayer
for _,layer in ipairs(source.layers) do if layer.name=='Tie fabric mask' then maskLayer=layer end end
assert(maskLayer and not maskLayer.isVisible,'Missing hidden cloth mask')
local allowed={}
for _,tag in ipairs(source.tags) do local cg=tonumber(tag.name);local mask=maskLayer:cel(tag.fromFrame)
 if mask then local f=assert(frames[cg])
  for pixel in mask.image:pixels() do if app.pixelColor.rgbaA(pixel())>0 then
   local x=(pixel.x+mask.position.x-960-f.left*3)//3
   local y=(pixel.y+mask.position.y-1100-f.top*3)//3
   if x>=0 and y>=0 and x<f.w and y<f.h then allowed[(f.page*2048+f.y+y)*2048+f.x+x]=true end
  end end
 end
end
source:close()
local function palette(s)
 local colors={}
 for i=0,#s.palettes[1]-1 do local c=s.palettes[1]:getColor(i)
  colors[i]=c.alpha==0 and 0 or app.pixelColor.rgba(c.red,c.green,c.blue,c.alpha)
 end
 return colors
end
local compared,changed=0,0
for page=0,pages-1 do
 local a=assert(app.open(root..'/'..before..'/suits-'..page..'.png'))
 local b=assert(app.open(root..'/web/dist/characters/suits-'..page..'.png'))
 local pa,pb=palette(a),palette(b);local bi=b.cels[1].image
 for pixel in a.cels[1].image:pixels() do
  local ca,cb=pa[pixel()],pb[bi:getPixel(pixel.x,pixel.y)];compared=compared+1
  assert(app.pixelColor.rgbaA(ca)==app.pixelColor.rgbaA(cb),'Sprite silhouette alpha changed')
  if ca~=cb then
   assert(allowed[(page*2048+pixel.y)*2048+pixel.x],'Pixel outside tie changed at '..page..':'..pixel.x..','..pixel.y)
   changed=changed+1
  end
 end
 a:close();b:close()
end
assert(changed>10000,'Expected striped fabric throughout the animation set')
local report={pixelsCompared=compared,pixelsChanged=changed,outsideTieChanges=0,alphaChanges=0,bindings=count}
local f=assert(io.open(root..'/outputs/striped-tie/pixel-verification.json','w'));f:write(json.encode(report));f:close()
print(json.encode(report))
