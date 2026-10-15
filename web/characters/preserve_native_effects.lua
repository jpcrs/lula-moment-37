-- Preserve native abstract effects instead of inventing figures inside them.
local root=assert(app.params.aseprite_mcp_workspace)
local f=assert(io.open(root..'/web/characters/native-redraw-plan.json','r'));local plan=json.decode(f:read('*a'));f:close()
local preserve={};for _,cg in ipairs(plan.preservedEffects) do preserve[cg]=true end
local out=Sprite(1536,1536,ColorMode.RGB);out:deleteCel(out.cels[1]);out.layers[1].name='Native abstract effects';local index=0
for _,name in ipairs({'pl11','pl16'}) do
local f=assert(io.open(root..'/outputs/character-study/'..name..'-frames.bin','rb'));local b=f:read('*a');f:close()
local count,pos=string.unpack('<I4',b,5);local palette={}
for i=0,63 do local c;c,pos=string.unpack('<I2',b,pos);palette[i]=app.pixelColor.rgba(((c>>10)&31)*255//31,((c>>5)&31)*255//31,(c&31)*255//31,i==0 and 0 or 255) end
for i=1,count do
 local cg,w,h,x,y,len;cg,w,h,x,y,len,pos=string.unpack('<I2I2I2i2i2I4',b,pos)
 if preserve[cg] then
  local image=Image(w*3,h*3,ColorMode.RGB)
  for yy=0,h-1 do for xx=0,w-1 do
   local c=b:byte(pos+yy*w+xx)
   if c~=0 then for dy=0,2 do for dx=0,2 do image:drawPixel(xx*3+dx,yy*3+dy,palette[c]) end end end
  end end
  index=index+1;if index>1 then out:newEmptyFrame(index) end
  out:newCel(out.layers[1],index,image,Point(960+x*3,1100+y*3));out:newTag(index,index).name=tostring(cg);out.frames[index].duration=4/60
 end
 pos=pos+len
end
end
assert(index==#plan.preservedEffects,'Incomplete native effect extraction')
out:saveAs(root..'/web/characters/native-effects.aseprite');out:close();print('Preserved '..index..' native effect drawings')
