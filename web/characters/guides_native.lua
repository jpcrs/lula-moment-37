-- Exact native pose guides for every distinct replacement drawing.
local root=assert(app.params.aseprite_mcp_workspace)
local f=assert(io.open(root..'/web/characters/native-redraw-plan.json','r'));local plan=json.decode(f:read('*a'));f:close()
app.fs.makeAllDirectories(root..'/outputs/character-audit/guides')
for _,name in ipairs({'pl11','pl16'}) do
 local f=assert(io.open(root..'/outputs/character-study/'..name..'-frames.bin','rb'));local b=f:read('*a');f:close()
 local n,pos=string.unpack('<I4',b,5);local palette={};local frames={}
 for i=0,63 do local c;c,pos=string.unpack('<I2',b,pos);palette[i]=app.pixelColor.rgba(((c>>10)&31)*255//31,((c>>5)&31)*255//31,(c&31)*255//31,i==0 and 0 or 255) end
 for i=1,n do
  local cg,w,h,x,y,len;cg,w,h,x,y,len,pos=string.unpack('<I2I2I2i2i2I4',b,pos)
  frames[cg]={w=w,h=h,x=x,y=y,data=b:sub(pos,pos+len-1)};pos=pos+len
 end
 for _,batch in ipairs(plan.sheets) do if batch.name==name and (not app.fs.isFile(root..'/'..batch.guide) or app.params.refresh=='true') then
  local size=batch.rows==3 and 512 or 384
  local sheet=Sprite(size*batch.cols,size*batch.rows,ColorMode.RGB)
  sheet.cels[1].image:clear(app.pixelColor.rgba(30,35,43,255))
  for i,cg in ipairs(batch.cgs) do
   local fr=frames[cg];local scale=math.min(3,(size-64)/math.max(fr.w,fr.h))
   local width,height=math.floor(fr.w*scale+.5),math.floor(fr.h*scale+.5)
   local left=((i-1)%batch.cols)*size+(size-width)//2;local top=((i-1)//batch.cols)*size+(size-height)//2
   for y=0,height-1 do for x=0,width-1 do
    local c=fr.data:byte(math.min(fr.h-1,math.floor(y/scale))*fr.w+math.min(fr.w-1,math.floor(x/scale))+1)
    if c~=0 then sheet.cels[1].image:drawPixel(left+x,top+y,palette[c]) end
   end end
  end
  sheet:saveCopyAs(root..'/'..batch.guide);sheet:close()
 end end
end
print('Native pose guides are complete')
