-- Pose-only guides. The output figures are authored with imagegen, not recolored.
local root = assert(app.params.aseprite_mcp_workspace)
local file = assert(io.open(root..'/web/characters/poses.json', 'r'))
local selection = json.decode(file:read('*a')); file:close()
app.fs.makeAllDirectories(root..'/outputs/character-study/guides')
for _, name in ipairs({'pl11','pl16'}) do
  local f=assert(io.open(root..'/outputs/character-study/'..name..'-frames.bin','rb'))
  local blob=f:read('*a'); f:close()
  local n,pos=string.unpack('<I4',blob,5)
  local palette={}
  for i=0,63 do
    local color; color,pos=string.unpack('<I2',blob,pos)
    palette[i]=app.pixelColor.rgba(((color>>10)&31)*255//31,((color>>5)&31)*255//31,(color&31)*255//31,i==0 and 0 or 255)
  end
  local frames={}
  for i=1,n do
    local cg,w,h,x,y,size
    cg,w,h,x,y,size,pos=string.unpack('<I2I2I2i2i2I4',blob,pos)
    frames[cg]={w=w,h=h,x=x,y=y,data=blob:sub(pos,pos+size-1)}; pos=pos+size
  end
  for batch=0,math.ceil(#selection[name]/9)-1 do
    local guide=Sprite(1536,1536,ColorMode.RGB)
    guide.cels[1].image:clear(app.pixelColor.rgba(245,242,234,255))
    for cell=0,8 do
      local cg=selection[name][batch*9+cell+1]
      if cg then
        local fr=frames[cg]
        local ox=(cell%3)*512+256-math.floor(fr.w*1.5)-fr.x*3
        local oy=(cell//3)*512+444-fr.h*3-fr.y*3
        for y=0,fr.h-1 do for x=0,fr.w-1 do
          local c=fr.data:byte(y*fr.w+x+1)
          if c~=0 then
            for dy=0,2 do for dx=0,2 do
              local xx,yy=ox+(fr.x+x)*3+dx,oy+(fr.y+y)*3+dy
              if xx>=cell%3*512 and xx<(cell%3+1)*512 and yy>=cell//3*512 and yy<(cell//3+1)*512 then
                guide.cels[1].image:drawPixel(xx,yy,palette[c])
              end
            end end
          end
        end end
      end
    end
    local path=root..'/outputs/character-study/guides/'..name..'-'..batch..'.png'
    guide:saveCopyAs(path); guide:close(); print(path)
  end
end
