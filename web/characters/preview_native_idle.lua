-- Compare original, previous and corrected idle drawings at the native origin.
local root=assert(app.params.aseprite_mcp_workspace)
local function bytes(path)local f=assert(io.open(root..'/'..path,'rb'));local b=f:read('*a');f:close();return b end
local tracks=json.decode(bytes('web/characters/native-idle-motion.json'))
local plan=json.decode(bytes('web/characters/native-redraw-plan.json'))
local catalog=json.decode(bytes('web/characters/native-animations.json'))
local swatch=assert(app.open(root..'/web/characters/native-palette.aseprite'));local palette=swatch.palettes[1]
local oldPalette=Palette(126);for i=0,125 do oldPalette:setColor(i,palette:getColor(i)) end
local out=root..'/outputs/idle-fix';app.fs.makeAllDirectories(out)
local function atlas(manifest,prefix)
 local b=bytes(manifest);local count,pages,pos=string.unpack('<I4I4',b,5);local images,frames={},{}
 for p=0,pages-1 do
  local s=assert(app.open(root..'/'..prefix..p..'.png'));app.sprite=s;app.command.ChangePixelFormat{format='rgb'}
  images[p]=Image(s.cels[1].image);s:close()
 end
 for i=1,count do
  local cg,page,x,y,w,h,left,top,ww,hh
  cg,page,x,y,w,h,left,top,ww,hh,pos=string.unpack('<I2I2I2I2I2I2i2i2i2i2',b,pos)
  local im=Image(w,h,ColorMode.RGB);im:drawImage(images[page],Point(-x,-y))
  frames[cg]={image=im,x=left//64,y=top//64}
 end
 return frames
end
local original=atlas('outputs/character-audit/reference/sprites.bin','outputs/character-audit/reference/sprites-')
local before=atlas('outputs/idle-fix/before/suits.bin','outputs/idle-fix/before/suits-')
for _,name in ipairs({'pl11','pl16'}) do
 local rig=tracks[name];local s=assert(app.open(root..'/web/characters/'..rig.project..'.aseprite'))
 local after={};local maskLayer
 for _,l in ipairs(s.layers) do if l.name=='Tie fabric mask' then maskLayer=l end end
 for _,tag in ipairs(s.tags) do
  local cg=tonumber(tag.name);local key=tostring(math.floor(cg))
  if rig.frames[key] then
   local e=plan.graphics[key];local c=s.layers[1]:cel(tag.fromFrame);local input=c.image
   local mask=maskLayer and maskLayer:cel(tag.fromFrame);local mi=mask and mask.image
   local fr=Sprite(e.w,e.h,ColorMode.RGB);local cloth=Sprite(e.w,e.h,ColorMode.RGB)
   local ox,oy=960+e.x*3-c.position.x,1100+e.y*3-c.position.y
   for y=0,e.h-1 do for x=0,e.w-1 do
    local a,r,g,b,masked=0,0,0,0,false
    for yy=0,2 do for xx=0,2 do
     local sx,sy=ox+x*3+xx,oy+y*3+yy
     if sx>=0 and sy>=0 and sx<input.width and sy<input.height then
      local color=input:getPixel(sx,sy);local alpha=app.pixelColor.rgbaA(color)
      a=a+alpha;r=r+app.pixelColor.rgbaR(color)*alpha;g=g+app.pixelColor.rgbaG(color)*alpha;b=b+app.pixelColor.rgbaB(color)*alpha
     end
     if mask then
      local mx,my=960+e.x*3+x*3+xx-mask.position.x,1100+e.y*3+y*3+yy-mask.position.y
      if mx>=0 and my>=0 and mx<mi.width and my<mi.height and app.pixelColor.rgbaA(mi:getPixel(mx,my))>0 then masked=true end
     end
    end end
    if a>=128*9 then
     local color=app.pixelColor.rgba(math.floor(r/a+.5),math.floor(g/a+.5),math.floor(b/a+.5),255)
     fr.cels[1].image:drawPixel(x,y,color);if masked then cloth.cels[1].image:drawPixel(x,y,color) end
    end
   end end
   app.sprite=fr;fr:setPalette(oldPalette);app.command.ChangePixelFormat{format='indexed',dithering='none'}
   app.sprite=cloth;cloth:setPalette(palette);app.command.ChangePixelFormat{format='indexed',dithering='none'}
   fr:setPalette(palette);fr.cels[1].image:drawImage(cloth.cels[1].image)
   app.sprite=fr;app.command.ChangePixelFormat{format='rgb'}
   after[cg]={image=Image(fr.cels[1].image),x=e.x,y=e.y};fr:close();cloth:close()
  end
 end
 s:close()
 local records={};for _,r in ipairs(catalog[name].scripts['nmca:d8'].records) do
  if r.type=='frame' then records[#records+1]=r end
  if #records==10 then break end
 end
 for _,kind in ipairs({'original-after','before-after','contact'}) do
  local columns=kind=='contact' and #records or 2
  local rows=kind=='contact' and 3 or 1
  local movie=Sprite(150*columns,144*rows,ColorMode.RGB)
  local contact=kind=='contact' and Image(movie.width,movie.height,ColorMode.RGB)
  if contact then contact:clear(app.pixelColor.rgba(30,35,43,255)) end
  for i,r in ipairs(records) do
   if not contact and i>1 then movie:newEmptyFrame(i) end
   local im=contact or Image(movie.width,movie.height,ColorMode.RGB)
   if not contact then im:clear(app.pixelColor.rgba(30,35,43,255)) end
   local groups=kind=='contact' and {original,before,after} or {kind=='original-after' and original or before,after}
   for j,g in ipairs(groups) do
    local f=assert(g[r.cg]);local x=(contact and i-1 or j-1)*150+75+f.x
    local y=(contact and j-1 or 0)*144+132+f.y
    im:drawImage(f.image,Point(x,y))
   end
   if not contact then movie:newCel(movie.layers[1],i,im);movie.frames[i].duration=r.ticks/60 end
  end
  if contact then movie:newCel(movie.layers[1],1,contact) end
  app.sprite=movie;app.command.SpriteSize{ui=false,width=movie.width*3,height=movie.height*3,method='nearest'}
  movie:saveCopyAs(out..'/'..name..'-'..kind..(contact and '.png' or '.gif'));movie:close()
 end
end
swatch:close();print('Native idle comparisons exported')
