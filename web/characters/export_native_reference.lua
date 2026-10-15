-- Full original indexed-frame atlas for side-by-side artwork review.
local root=assert(app.params.aseprite_mcp_workspace)
local out=root..'/outputs/character-audit/reference';app.fs.makeAllDirectories(out)
local all={}
for _,name in ipairs({'pl11','pl16'}) do
 local f=assert(io.open(root..'/outputs/character-study/'..name..'-frames.bin','rb'));local b=f:read('*a');f:close()
 local n,pos=string.unpack('<I4',b,5);local palette={}
 for i=0,63 do local c;c,pos=string.unpack('<I2',b,pos);palette[i]=app.pixelColor.rgba(((c>>10)&31)*255//31,((c>>5)&31)*255//31,(c&31)*255//31,i==0 and 0 or 255) end
 for i=1,n do
  local cg,w,h,x,y,len;cg,w,h,x,y,len,pos=string.unpack('<I2I2I2i2i2I4',b,pos)
  local data=b:sub(pos,pos+len-1);pos=pos+len
  local image=Image(w,h,ColorMode.RGB)
  for yy=0,h-1 do for xx=0,w-1 do local c=data:byte(yy*w+xx+1);if c~=0 then image:drawPixel(xx,yy,palette[c]) end end end
  all[#all+1]={cg=cg,w=w,h=h,left=x,top=y,image=image,key=name..':'..w..','..h..':'..data}
 end
end
table.sort(all,function(a,b)return a.h==b.h and a.cg<b.cg or a.h>b.h end)
local page=Sprite(2048,2048,ColorMode.RGB)
local number,x,y,rowh=0,4,4,0;local seen={}
local function save()
 app.sprite=page;app.command.ColorQuantization{ui=false,maxColors=256,withAlpha=false}
 app.command.ChangePixelFormat{format='indexed',dithering='none'}
 page:saveCopyAs(out..'/sprites-'..number..'.png');page:close()
end
for _,fr in ipairs(all) do
 local other=seen[fr.key]
 if other then fr.page=other.page;fr.ax=other.ax;fr.ay=other.ay
 else
  if x+fr.w+4>2048 then x=4;y=y+rowh+8;rowh=0 end
  if y+fr.h+4>2048 then save();number=number+1;page=Sprite(2048,2048,ColorMode.RGB);x=4;y=4;rowh=0 end
  fr.page=number;fr.ax=x;fr.ay=y;page.cels[1].image:drawImage(fr.image,Point(x,y))
  x=x+fr.w+8;rowh=math.max(rowh,fr.h);seen[fr.key]=fr
 end
end
save()
local entries={}
for _,fr in ipairs(all) do entries[#entries+1]=string.pack('<I2I2I2I2I2I2i2i2i2i2',fr.cg,fr.page,fr.ax,fr.ay,fr.w,fr.h,fr.left*64,fr.top*64,fr.w*64,fr.h*64) end
local f=assert(io.open(out..'/sprites.bin','wb'));f:write('M37H',string.pack('<I4I4',#entries,number+1),table.concat(entries));f:close()
print('Original reference: '..#all..' frames, '..(number+1)..' atlas pages')
