-- Strict, one-to-one native animation artwork packer. Missing cels are errors.
local root=assert(app.params.aseprite_mcp_workspace)
local out=root..'/web/dist/characters'
local f=assert(io.open(root..'/web/characters/native-redraw-plan.json','r'));local plan=json.decode(f:read('*a'));f:close()
local all,byCg={},{}
local origin=Point(960,1100)
local rgba=app.pixelColor.rgba
local rgbaR,rgbaG,rgbaB,rgbaA=app.pixelColor.rgbaR,app.pixelColor.rgbaG,app.pixelColor.rgbaB,app.pixelColor.rgbaA
for _,name in ipairs({'hat-fighter-native','gray-fighter-native','gray-fighter-native-extra'}) do
 local s=assert(app.open(root..'/web/characters/'..name..'.aseprite'),'Missing native source project')
 local maskLayer
 for _,layer in ipairs(s.layers) do if layer.name=='Tie fabric mask' then maskLayer=layer end end
 for _,tag in ipairs(s.tags) do
  local cg=tonumber(tag.name);local expected=cg and plan.graphics[tostring(math.floor(cg))]
  if expected then
   assert(not byCg[cg],'Duplicate native CG tag '..tostring(cg))
   local c=assert(s.layers[1]:cel(tag.fromFrame),'Missing native cel')
   local mask=maskLayer and maskLayer:cel(tag.fromFrame)
   local input=c.image;local iw,ih=input.width,input.height
   local maskImage=mask and mask.image
   local mw,mh=maskImage and maskImage.width or 0,maskImage and maskImage.height or 0
   -- Canonical 3x3 samples, fixed relative to the native world origin.
   local image=Image(expected.w,expected.h,ColorMode.RGB)
   local tie=mask and Image(expected.w,expected.h,ColorMode.RGB)
   local offsetX,offsetY=origin.x+expected.x*3-c.position.x,origin.y+expected.y*3-c.position.y
   local maskX=mask and origin.x+expected.x*3-mask.position.x or 0
   local maskY=mask and origin.y+expected.y*3-mask.position.y or 0
   for y=0,expected.h-1 do for x=0,expected.w-1 do
    local a,r,g,b,cloth=0,0,0,0,false
    for yy=0,2 do for xx=0,2 do
     local sx,sy=offsetX+x*3+xx,offsetY+y*3+yy
     if sx>=0 and sx<iw and sy>=0 and sy<ih then
      local color=input:getPixel(sx,sy);local alpha=rgbaA(color)
      a=a+alpha;r=r+rgbaR(color)*alpha;g=g+rgbaG(color)*alpha;b=b+rgbaB(color)*alpha
     end
     if mask then
      local mx=maskX+x*3+xx
      local my=maskY+y*3+yy
      if mx>=0 and my>=0 and mx<mw and my<mh and rgbaA(maskImage:getPixel(mx,my))>0 then cloth=true end
     end
    end end
    if a>=128*9 then
     local color=rgba(math.floor(r/a+.5),math.floor(g/a+.5),math.floor(b/a+.5),255)
     image:drawPixel(x,y,color);if cloth then tie:drawPixel(x,y,color) end
    end
   end end
   local fr={cg=cg,image=image,tie=tie,w=image.width,h=image.height,left=expected.x,top=expected.y}
   all[#all+1]=fr;byCg[cg]=fr
  end
 end
 s:close()
end
local missing={}
for key,fr in pairs(plan.graphics) do if not byCg[fr.cg] then missing[#missing+1]=fr.cg end end
table.sort(missing)
assert(#missing==0,'Incomplete native redraw: '..#missing..' original animation drawings have no exact replacement; first missing CG '..tostring(missing[1]))
app.fs.makeAllDirectories(out)
-- Every page uses the approved design palette, so a frame moving onto another
-- atlas page cannot change the suit, face, hat, or tie colors.
-- Freeze the approved colors so a costume edit cannot recolor either face,
-- Flávio's suit, or any of the original fire. Two spare slots hold tie fabric.
local swatch=assert(app.open(root..'/web/characters/native-palette.aseprite'))
-- Preserve the original fire colors without forcing the suits to share a
-- separately quantized atlas palette. At most sixteen reserved color slots.
local effects=assert(app.open(root..'/web/characters/native-effects.aseprite'))
local colors={};for _,tag in ipairs(effects.tags) do if tonumber(tag.name)<19000 then
 local cel=effects.layers[1]:cel(tag.fromFrame)
 for pixel in cel.image:pixels() do local c=pixel();if app.pixelColor.rgbaA(c)>0 then colors[c]=true end end
end end
effects:close()
local palette=swatch.palettes[1];local first=#palette
local originalPalette=Palette(126)
for i=0,125 do originalPalette:setColor(i,palette:getColor(i)) end
local existing={}
for i=0,first-1 do local c=palette:getColor(i);existing[app.pixelColor.rgba(c.red,c.green,c.blue,c.alpha)]=true end
local ordered={};for c in pairs(colors) do if not existing[c] then ordered[#ordered+1]=c end end;table.sort(ordered)
assert(first+#ordered<=128,'Native fire palette exceeds reserved slots')
palette:resize(first+#ordered)
for i,c in ipairs(ordered) do palette:setColor(first+i-1,Color{r=app.pixelColor.rgbaR(c),g=app.pixelColor.rgbaG(c),b=app.pixelColor.rgbaB(c),a=255}) end
table.sort(all,function(a,b)return a.h==b.h and a.cg<b.cg or a.h>b.h end)
local page=Sprite(2048,2048,ColorMode.RGB)
local clothPage=Sprite(2048,2048,ColorMode.RGB)
local number,x,y,rowh=0,4,4,0
local packed={}
local function save()
 app.sprite=page
 -- Non-cloth pixels use exactly the previous palette, so the two new fabric
 -- colors cannot attract an existing skin, suit, or Flávio tie pixel.
 page:setPalette(originalPalette)
 app.command.ChangePixelFormat{format='indexed',dithering='none'}
 app.sprite=clothPage;clothPage:setPalette(swatch.palettes[1])
 app.command.ChangePixelFormat{format='indexed',dithering='none'}
 page:setPalette(swatch.palettes[1]);page.cels[1].image:drawImage(clothPage.cels[1].image)
 page:saveCopyAs(out..'/suits-'..number..'.png');page:close();clothPage:close()
end
for _,fr in ipairs(all) do
 local alias=plan.aliases[tostring(math.floor(fr.cg))]
 local old=packed[alias or fr.cg]
 -- Aliases are allowed only when the native indexed drawings are identical.
 if old then fr.page=old.page;fr.ax=old.ax;fr.ay=old.ay
 else
  if x+fr.w+4>2048 then x=4;y=y+rowh+8;rowh=0 end
  if y+fr.h+4>2048 then save();number=number+1;page=Sprite(2048,2048,ColorMode.RGB);clothPage=Sprite(2048,2048,ColorMode.RGB);x=4;y=4;rowh=0 end
  page.cels[1].image:drawImage(fr.image,Point(x,y))
  if fr.tie then clothPage.cels[1].image:drawImage(fr.tie,Point(x,y)) end
  fr.page=number;fr.ax=x;fr.ay=y;x=x+fr.w+8;rowh=math.max(rowh,fr.h)
 end
 packed[alias or fr.cg]=fr
end
save()
swatch:close()
local entries={}
for _,fr in ipairs(all) do
 entries[#entries+1]=string.pack('<I2I2I2I2I2I2i2i2i2i2',fr.cg,fr.page,fr.ax,fr.ay,fr.w,fr.h,fr.left*64,fr.top*64,fr.w*64,fr.h*64)
end
local manifest=assert(io.open(out..'/suits.bin','wb'));manifest:write('M37H',string.pack('<I4I4',#entries,number+1),table.concat(entries));manifest:close()
for _,path in ipairs(app.fs.listFiles(out)) do local n=path:match('suits%-(%d+)%.png$');if n and tonumber(n)>number then os.remove(out..'/'..app.fs.fileName(path)) end end
print('Strict native artwork: '..#all..' exact frame bindings, '..(number+1)..' atlases, no pose fallbacks')
