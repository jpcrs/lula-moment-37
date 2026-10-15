-- Native-size portraits cropped from the approved designs, plus pixel lettering.
-- Existing hud.aseprite is editable; pass refresh_hud=true to recreate it.
local root=assert(app.params.aseprite_mcp_workspace)
local source=root..'/web/characters/hud.aseprite'
local function drawLabels(atlas)
 -- Match the native name tiles: five-pixel capitals, two-pixel stems,
 -- off-white ink, a gray shadow and a solid dark backing strip.
 local palette=atlas.palettes[1]
 local indexed=atlas.colorMode==ColorMode.INDEXED
 local function ink(r,g,b)
  if not indexed then return app.pixelColor.rgba(r,g,b,255) end
  for i=0,#palette-1 do local c=palette:getColor(i)
   if c.red==r and c.green==g and c.blue==b and c.alpha==255 then return i end
  end
  local index=#palette;palette:resize(index+1);palette:setColor(index,Color{r=r,g=g,b=b,a=255});return index
 end
 local dark,white,shadow=ink(57,65,65),ink(246,255,246),ink(139,148,172)
 if indexed then atlas:setPalette(palette) end
 local image=Image(40,16,atlas.colorMode)
 local glyph={
  L={'110000','110000','110000','110000','111111'},
  U={'110011','110011','110011','110011','011110'},
  I={'11','11','11','11','11'},
  Z={'111111','000110','001100','011000','111111'},
  F={'111111','110000','111110','110000','110000'},
  A={'011110','110011','111111','110011','110011'},
  V={'110011','110011','110011','011110','001100'},
  O={'011110','110011','110011','110011','011110'}
 }
 local function lettering(text,top,alignRight,accent)
  local width=-1
  for i=1,#text do width=width+#glyph[text:sub(i,i)][1]+1 end
  local left=alignRight and 40-width-2 or (40-width-2)//2
  for y=0,6 do for x=left,left+width+1 do image:drawPixel(x,top+y,dark) end end
  local pixels,x={},left+1
  for i=1,#text do
   local rows=glyph[text:sub(i,i)]
   for y,row in ipairs(rows) do for xx=1,#row do
    if row:sub(xx,xx)=='1' then pixels[#pixels+1]={x+xx-1,top+y} end
   end end
   -- One raised pixel keeps Á distinct within the native seven-pixel strip.
   if i==accent then pixels[#pixels+1]={x+5,top} end
   x=x+#rows[1]+1
  end
  for _,p in ipairs(pixels) do image:drawPixel(p[1]-1,p[2]+1,shadow) end
  for _,p in ipairs(pixels) do image:drawPixel(p[1],p[2],white) end
 end
 lettering('LUIZ',0,false)
 lettering('FLAVIO',8,true,3)
 local labels
 for _,layer in ipairs(atlas.layers) do if layer.name=='LUIZ / FLÁVIO' then labels=layer end end
 labels=labels or atlas:newLayer();labels.name='LUIZ / FLÁVIO'
 local previous=labels:cel(1);if previous then atlas:deleteCel(previous) end
 atlas:newCel(labels,1,image,Point(80,0))
end
if not app.fs.isFile(source) or app.params.refresh_hud=='true' then
 local atlas=Sprite(128,32,ColorMode.RGB)
 atlas.layers[1].name='Native HUD backing panels and red borders'
 local backing=atlas.cels[1].image
 local red=app.pixelColor.rgba(131,0,0,255)
 local faceBg=app.pixelColor.rgba(213,230,230,255)
 local nameBg=app.pixelColor.rgba(213,230,238,255)
 -- The original 40×24 face tiles include the bar's stepped outer border.
 -- Rebuild only that neutral panel, retaining its original pixel geometry.
 for y=0,22 do
  local left,inside,right,last
  if y==0 then left,inside,right,last=3,5,40,39
  elseif y==1 then left,inside,right,last=2,4,40,39
  elseif y<12 then left,inside,right,last=2,3,40,39
  elseif y<20 then left,inside,right,last=2,3,39,39
  elseif y==20 then left,inside,right,last=2,4,38,39
  elseif y==21 then left,inside,right,last=3,6,36,38
  else left,inside,right,last=5,5,5,36 end
  for x=left,last do
   local color=(x<inside or x>=right) and red or faceBg
   backing:drawPixel(x,y,color);backing:drawPixel(79-x,y,color)
  end
 end
 for y=0,15 do for x=80,119 do backing:drawPixel(x,y,y%8==7 and red or nameBg) end end
 local hat=atlas:newLayer();hat.name='Luiz / cream hat and white beard'
 local function portrait(path,box,left,flip,layer)
  local ref=assert(app.open(root..'/web/characters/art/native/'..path..'-reference.png'))
  local img=ref.cels[1].image;local position=ref.cels[1].position
  local dest=Image(40,24,ColorMode.RGB)
  local height=21
  local width=math.floor(box.width*height/box.height+.5)
  -- Box sampling followed by palette reduction gives solid native-sized pixels.
  for y=0,height-1 do for x=0,width-1 do
   local sx0=box.x+math.floor(x*box.width/width)
   local sx1=box.x+math.floor((x+1)*box.width/width)-1
   local sy0=box.y+math.floor(y*box.height/height)
   local sy1=box.y+math.floor((y+1)*box.height/height)-1
   local a,r,g,b,n=0,0,0,0,0
   for sy=sy0,sy1 do for sx=sx0,sx1 do
    local c=img:getPixel(sx-position.x,sy-position.y);local alpha=app.pixelColor.rgbaA(c)
    a=a+alpha;r=r+app.pixelColor.rgbaR(c)*alpha;g=g+app.pixelColor.rgbaG(c)*alpha;b=b+app.pixelColor.rgbaB(c)*alpha;n=n+1
   end end
   if a>=128*n then dest:drawPixel((flip and width-1-x or x)+(40-width)//2,y,
    app.pixelColor.rgba(math.floor(r/a+.5),math.floor(g/a+.5),math.floor(b/a+.5),255)) end
  end end
  atlas:newCel(layer,1,dest,Point(left,0));ref:close()
 end
 portrait('hat',Rectangle(270,187,94,80),0,true,hat)
 local gray=atlas:newLayer();gray.name='Flávio / bare eyes and gray temples'
 portrait('gray',Rectangle(274,213,72,71),40,false,gray)
 drawLabels(atlas)
 app.sprite=atlas
 app.command.ColorQuantization{ui=false,maxColors=56,withAlpha=false}
 -- Reserve the exact panel, border and lettering colors rather than allowing
 -- portrait quantization to merge white text into the pale HUD background.
 local palette=atlas.palettes[1];local first=#palette
 local reserved={{131,0,0},{213,230,230},{213,230,238},{57,65,65},{246,255,246},{139,148,172}}
 palette:resize(first+#reserved)
 for i,c in ipairs(reserved) do palette:setColor(first+i-1,Color{r=c[1],g=c[2],b=c[3],a=255}) end
 atlas:setPalette(palette)
 app.command.ChangePixelFormat{format='indexed',dithering='none'}
 atlas:saveAs(source);atlas:close()
end
local atlas=assert(app.open(source))
-- Re-letter the saved project without resampling portraits or their palette.
if app.params.refresh_labels=='true' then drawLabels(atlas);atlas:saveAs(source) end
atlas:saveCopyAs(root..'/web/dist/characters/hud.png')
-- Enlarged nearest-neighbor preview for checking the small faces and accent.
app.fs.makeAllDirectories(root..'/outputs/character-hud')
app.sprite=atlas
app.command.SpriteSize{ui=false,width=1024,height=256,method='nearest'}
atlas:saveCopyAs(root..'/outputs/character-hud/atlas-preview.png');atlas:close()
print('Exported Luiz and Flávio portraits and names at native HUD resolution')
