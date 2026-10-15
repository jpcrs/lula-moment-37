-- Assemble editable character art and export it at the game's pixel scale.
local root=assert(app.params.aseprite_mcp_workspace)
-- Full native coverage is the default. The rejected approximation is available
-- only for explicitly requested historical comparisons.
if app.params.pipeline~='legacy' then
 dofile(root..'/web/characters/build_native.lua')
 dofile(root..'/web/characters/build_hud.lua')
 return
end
local output=root..'/web/dist/characters'
app.fs.makeAllDirectories(output)
local function readJson(path)
  local f=assert(io.open(root..path,'r'));local value=json.decode(f:read('*a'));f:close();return value
end
local poses=readJson('/web/characters/poses.json')
local bindings=readJson('/web/characters/frame-map.json')
local originals={}
for _,fr in ipairs(bindings) do originals[fr.cg]=fr end

-- Isolate the main connected figure, including a small cell overhang. This
-- avoids clipping toes across a cell boundary or retaining a neighbor's hand.
local function cutout(image,rect)
  local x0,y0=math.max(0,rect.x-64),math.max(0,rect.y-64)
  local x1,y1=math.min(image.width-1,rect.x+rect.width+63),math.min(image.height-1,rect.y+rect.height+63)
  local width=x1-x0+1
  local seen,best={},{}
  local function alpha(at)
    return app.pixelColor.rgbaA(image:getPixel(x0+at%width,y0+at//width))
  end
  for y=y0,y1 do for x=x0,x1 do
    local first=(y-y0)*width+x-x0
    if not seen[first] then
      seen[first]=true
      if alpha(first)>=32 then
        local queue,cursor={first},1
        while cursor<=#queue do
          local at=queue[cursor];cursor=cursor+1
          local xx,yy=x0+at%width,y0+at//width
          for _,offset in ipairs({-1,1,-width,width}) do
            local next=at+offset
            local valid=(offset~=-1 or xx>x0) and (offset~=1 or xx<x1) and
              (offset~=-width or yy>y0) and (offset~=width or yy<y1)
            if valid and not seen[next] then
              seen[next]=true
              if alpha(next)>=32 then queue[#queue+1]=next end
            end
          end
        end
        if #queue>#best then best=queue end
      end
    end
  end end
  assert(#best>100,'Empty illustrated pose')
  local left,top,right,bottom=x1,y1,x0,y0
  for _,at in ipairs(best) do
    local x,y=x0+at%width,y0+at//width
    left=math.min(left,x);top=math.min(top,y);right=math.max(right,x);bottom=math.max(bottom,y)
  end
  local crop=Image(right-left+1,bottom-top+1,ColorMode.RGB)
  for _,at in ipairs(best) do
    local x,y=x0+at%width,y0+at//width
    crop:drawPixel(x-left,y-top,image:getPixel(x,y))
  end
  return crop
end

local all,byCg={},{}
local refresh=app.params.refresh_sources=='true'
local missing=not app.fs.isFile(root..'/web/characters/hat-fighter.aseprite') or
  not app.fs.isFile(root..'/web/characters/gray-fighter.aseprite')
if refresh or missing then
for _,name in ipairs({'pl11','pl16'}) do
  for batch=0,math.ceil(#poses[name]/9)-1 do
    local sheet=app.open(root..'/web/characters/art/'..name..'-'..batch..'.png')
    assert(sheet,'Missing illustrated pose sheet')
    local image=sheet.cels[1].image
    for cell=0,8 do
      local cg=poses[name][batch*9+cell+1]
      if cg then
        local col,row=cell%3,cell//3
        local x0,x1=math.floor(col*image.width/3),math.floor((col+1)*image.width/3)
        local y0,y1=math.floor(row*image.height/3),math.floor((row+1)*image.height/3)
        local crop=cutout(image,Rectangle(x0,y0,x1-x0,y1-y0))
        local fr={cg=cg,image=crop,w=crop.width,h=crop.height}
        all[#all+1]=fr;byCg[cg]=fr
      end
    end
    sheet:close()
  end
end

-- Editable named frames, with the native origin at (320,500).
for _,name in ipairs({'pl11','pl16'}) do
  local sourcePath=root..'/web/characters/'..(name=='pl11' and 'hat-fighter' or 'gray-fighter')..'.aseprite'
  if refresh or not app.fs.isFile(sourcePath) then
  local source=Sprite(640,640,ColorMode.RGB)
  source.layers[1].name=name=='pl11' and 'Cream hat / white beard / red tie' or 'Gray suit / blue tie'
  source:deleteCel(source.cels[1])
  for i,cg in ipairs(poses[name]) do
    if i>1 then source:newEmptyFrame(i) end
    local fr,orig=byCg[cg],originals[cg]
    local scale=orig.h*3/fr.h
    local copy=Sprite(fr.w,fr.h,ColorMode.RGB)
    copy.cels[1].image:drawImage(fr.image)
    app.sprite=copy
    app.command.SpriteSize{ui=false,width=math.floor(fr.w*scale+.5),height=orig.h*3,method='bilinear'}
    local celImage=Image(copy.cels[1].image)
    local left=320+(orig.x+orig.w/2)*3-celImage.width/2
    source:newCel(source.layers[1],i,celImage,Point(math.floor(left+.5),math.floor(500+orig.y*3)))
    source.frames[i].duration=.067
    local tag=source:newTag(i,i);tag.name=string.format('%d',cg)
    copy:close()
  end
  source:saveAs(sourcePath)
  source:close()
  end
end
end

-- The saved Aseprite animations are the editable source of truth. Reimporting
-- the generation sheets requires the explicit refresh_sources=true option.
all,byCg={},{}
for _,name in ipairs({'hat-fighter','gray-fighter'}) do
  local source=app.open(root..'/web/characters/'..name..'.aseprite')
  for _,tag in ipairs(source.tags) do
    local cg=tonumber(tag.name)
    if cg and originals[cg] then
      local cel=assert(source.layers[1]:cel(tag.fromFrame),'Missing illustrated cel')
      -- Restore padding relative to the shared origin before sampling, so an unchanged foot
      -- or face always lands on the same native pixels in every drawing.
      local left=math.floor((cel.position.x-320)/3)
      local top=math.floor((cel.position.y-500)/3)
      local width=(math.ceil((cel.position.x+cel.image.width-320)/3)-left)*3
      local height=(math.ceil((cel.position.y+cel.image.height-500)/3)-top)*3
      local image=Image(width,height,ColorMode.RGB)
      image:drawImage(cel.image,Point(cel.position.x-320-left*3,cel.position.y-500-top*3))
      local fr={cg=cg,image=image,w=image.width,h=image.height,
        left=left,top=top}
      fr.worldWidth=fr.w/3;fr.worldHeight=fr.h/3
      -- Fixed 3x3 premultiplied samples keep the filter phase independent of
      -- changing cel bounds. A whole-image resize shifts that phase as a
      -- breathing pose changes height, making otherwise fixed shoes shimmer.
      local native=Image(fr.w//3,fr.h//3,ColorMode.RGB)
      for y=0,native.height-1 do for x=0,native.width-1 do
        local alpha,red,green,blue=0,0,0,0
        for yy=0,2 do for xx=0,2 do
          local c=image:getPixel(x*3+xx,y*3+yy);local a=app.pixelColor.rgbaA(c)
          alpha=alpha+a;red=red+app.pixelColor.rgbaR(c)*a
          green=green+app.pixelColor.rgbaG(c)*a;blue=blue+app.pixelColor.rgbaB(c)*a
        end end
        if alpha>=128*9 then
          native:drawPixel(x,y,app.pixelColor.rgba(math.floor(red/alpha+.5),math.floor(green/alpha+.5),math.floor(blue/alpha+.5),255))
        end
      end end
      fr.image=native;fr.w=native.width;fr.h=native.height
      all[#all+1]=fr;byCg[cg]=fr
    end
  end
  source:close()
end

-- Pack distinct drawings once; retain native origins and frame timing.
table.sort(all,function(a,b) return a.h==b.h and a.cg<b.cg or a.h>b.h end)
local page=Sprite(2048,2048,ColorMode.RGB)
local pageNumber,x,y,rowHeight=0,4,4,0
local function savePage()
  app.sprite=page
  app.command.ColorQuantization{ui=false,maxColors=128,withAlpha=false}
  app.command.ChangePixelFormat{format='indexed',dithering='none'}
  page:saveCopyAs(output..'/suits-'..pageNumber..'.png');page:close()
end
for _,fr in ipairs(all) do
  if x+fr.w+4>2048 then x=4;y=y+rowHeight+8;rowHeight=0 end
  if y+fr.h+4>2048 then savePage();pageNumber=pageNumber+1;page=Sprite(2048,2048,ColorMode.RGB);x=4;y=4;rowHeight=0 end
  page.cels[1].image:drawImage(fr.image,Point(x,y))
  fr.page=pageNumber;fr.atlasX=x;fr.atlasY=y
  x=x+fr.w+8;rowHeight=math.max(rowHeight,fr.h)
end
savePage()
for _,path in ipairs(app.fs.listFiles(output)) do
  local n=path:match('suits%-(%d+)%.png$')
  if n and tonumber(n)>pageNumber then os.remove(output..'/'..app.fs.fileName(path)) end
end
local entries={}
for _,orig in ipairs(bindings) do
  -- Authored in-betweens take precedence over the silhouette fallback map.
  local fr=byCg[orig.cg] or assert(byCg[orig.key])
  local key=originals[fr.cg]
  local scale=orig.h/key.h
  local worldHeight=fr.worldHeight*scale
  local worldWidth=fr.worldWidth*scale
  local worldLeft=orig.x+orig.w/2+(fr.left-key.x-key.w/2)*scale
  local worldTop=orig.y+(fr.top-key.y)*scale
  local function fixed(value) return math.floor(value*64+.5) end
  entries[#entries+1]=string.pack('<I2I2I2I2I2I2i2i2i2i2',orig.cg,fr.page,fr.atlasX,fr.atlasY,fr.w,fr.h,
    fixed(worldLeft),fixed(worldTop),fixed(worldWidth),fixed(worldHeight))
end
local file=assert(io.open(output..'/suits.bin','wb'))
file:write('M37H',string.pack('<I4I4',#entries,pageNumber+1),table.concat(entries));file:close()
print('Exported '..#all..' poses, '..#entries..' native bindings, '..(pageNumber+1)..' indexed pixel atlases')
