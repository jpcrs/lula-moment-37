-- Import full native-frame redraws into editable, origin-aligned Aseprite cels.
-- Each cell redraws its own native pose. The standing loops receive a separate
-- continuity pass; gameplay timing remains in the original interpreter.
local root=assert(app.params.aseprite_mcp_workspace)
local function read(path)
 local f=assert(io.open(root..'/'..path,'r'));local data=json.decode(f:read('*a'));f:close();return data
end
local plan=read('web/characters/native-redraw-plan.json')
local catalog=read('web/characters/native-animations.json')
local effects={};for _,cg in ipairs(plan.preservedEffects or {}) do effects[cg]=true end
local origin=Point(960,1100)
local fabric=dofile(root..'/web/characters/striped_tie.lua')
local function cutout(image,x0,y0,x1,y1)
 -- Ignore isolated alpha specks outside the figure when measuring its bounds.
 -- Otherwise a stray dot can squash an entire horizontal recovery drawing.
 local width=x1-x0;local mask={};local parts={};local largest=0
 for y=y0,y1-1 do for x=x0,x1-1 do
  if app.pixelColor.rgbaA(image:getPixel(x,y))>=128 then mask[(y-y0)*width+x-x0]=true end
 end end
 for seed=0,width*(y1-y0)-1 do if mask[seed] then
  local queue={seed};mask[seed]=nil;local head=1
  local part={left=x1,top=y1,right=x0-1,bottom=y0-1,count=0}
  while head<=#queue do
   local pos=queue[head];head=head+1
   local x,y=pos%width+x0,pos//width+y0;part.count=part.count+1
   part.left=math.min(part.left,x);part.top=math.min(part.top,y)
   part.right=math.max(part.right,x);part.bottom=math.max(part.bottom,y)
   local function visit(p) if mask[p] then mask[p]=nil;queue[#queue+1]=p end end
   if x>x0 then visit(pos-1) end;if x<x1-1 then visit(pos+1) end
   if y>y0 then visit(pos-width) end;if y<y1-1 then visit(pos+width) end
  end
  largest=math.max(largest,part.count);parts[#parts+1]=part
 end end
 local left,top,right,bottom=x1,y1,x0-1,y0-1
 for _,part in ipairs(parts) do if part.count==largest or part.count>=math.max(9,largest*.035) then
  left=math.min(left,part.left);top=math.min(top,part.top)
  right=math.max(right,part.right);bottom=math.max(bottom,part.bottom)
 end end
 assert(right>=left and bottom>=top,'Empty redraw cell')
 local crop=Image(right-left+1,bottom-top+1,ColorMode.RGB)
 crop:drawImage(image,Point(-left,-top))
 return crop
end
local character=app.params.character
assert(not character or character=='pl11' or character=='pl16','Unknown native character')
for _,name in ipairs(character and {character} or {'pl11','pl16'}) do
 local artwork={};local missing={};local ticks={};local ties={}
 for _,script in pairs(catalog[name].scripts) do for _,record in ipairs(script.records) do
  if record.type=='frame' and record.ticks<250 then
   local cg=math.floor(record.cg);ticks[cg]=ticks[cg] or {};ticks[cg][record.ticks]=(ticks[cg][record.ticks] or 0)+1
  end
 end end
 for _,sheet in ipairs(plan.sheets) do if sheet.name==name then
  local path=root..'/web/characters/art/native/'..sheet.file
  if app.fs.isFile(path) then
   local s=app.open(path);app.sprite=s;app.command.ChangePixelFormat{format='rgb'}
   local image=s.cels[1].image
   for i,cg in ipairs(sheet.cgs) do if not effects[cg] then
    local col,row=(i-1)%sheet.cols,(i-1)//sheet.cols
    local x0,x1=math.floor(col*image.width/sheet.cols),math.floor((col+1)*image.width/sheet.cols)
    local y0,y1=math.floor(row*image.height/sheet.rows),math.floor((row+1)*image.height/sheet.rows)
    local crop=cutout(image,x0,y0,x1,y1)
    local fr=plan.graphics[tostring(math.floor(cg))]
    local scaled=Sprite(crop.width,crop.height,ColorMode.RGB);scaled.cels[1].image:drawImage(crop)
    app.sprite=scaled
    app.command.SpriteSize{ui=false,width=fr.w*3,height=fr.h*3,method='bilinear'}
    artwork[cg]=Image(scaled.cels[1].image);scaled:close()
   end end
   s:close()
  else missing[#missing+1]=sheet.file end
 end end
 do
  local s=assert(app.open(root..'/web/characters/native-effects.aseprite'))
  for _,tag in ipairs(s.tags) do
   local cg=tonumber(tag.name);assert(effects[cg],'Unexpected native effect')
   if (name=='pl11' and cg<19000) or (name=='pl16' and cg>=19000) then
    artwork[cg]=Image(s.layers[1]:cel(tag.fromFrame).image)
   end
  end
  s:close()
 end
 -- Generated sheets are retained as historical inputs. Apply the current
 -- fabric after import, before cloning exact aliases or linking their cels.
 if name=='pl11' then for cg,image in pairs(artwork) do if not effects[cg] then
  local _,mask=fabric.apply(image,3,true);ties[cg]=mask
 end end end
 local cgs={}
 for key,fr in pairs(plan.graphics) do if (name=='pl11' and fr.cg<19000) or (name=='pl16' and fr.cg>=19000) then
  local cg=math.floor(fr.cg);local alias=plan.aliases[tostring(cg)]
  if not artwork[cg] and alias and artwork[alias] then artwork[cg]=Image(artwork[alias]);ties[cg]=ties[alias] end
  if artwork[cg] then cgs[#cgs+1]=cg end
 end end
 table.sort(cgs)
 local limit=name=='pl16' and 900 or #cgs
 for first=1,#cgs,limit do
 local last=math.min(#cgs,first+limit-1)
 local source=Sprite(1536,1536,ColorMode.RGB);source.layers[1].name='Replacement artwork';source:deleteCel(source.cels[1])
 local maskLayer
 if name=='pl11' then maskLayer=source:newLayer();maskLayer.name='Tie fabric mask';maskLayer.isVisible=false end
 local links={}
 for at=first,last do
  local i,cg=at-first+1,cgs[at]
  if i>1 then source:newEmptyFrame(i) end
  local fr=plan.graphics[tostring(cg)]
  source:newCel(source.layers[1],i,artwork[cg],Point(origin.x+fr.x*3,origin.y+fr.y*3))
  if ties[cg] then source:newCel(maskLayer,i,ties[cg],Point(origin.x+fr.x*3,origin.y+fr.y*3)) end
  local tag=source:newTag(i,i);tag.name=tostring(cg)
  -- Linked cels share their position in Aseprite, so link exact aliases only
  -- when their native origins also agree. This keeps editable files compact.
  local canonical=plan.aliases[tostring(cg)] or cg
  local key=tostring(canonical)..':'..fr.x..':'..fr.y
  links[key]=links[key] or {};links[key][#links[key]+1]=source.frames[i]
  local most,count=4,0
  for duration,occurrences in pairs(ticks[cg] or {}) do if occurrences>count or occurrences==count and duration<most then most,count=duration,occurrences end end
  source.frames[i].duration=most/60
 end
 local linked=0;app.sprite=source
 for _,group in pairs(links) do if #group>1 then
  app.frame=group[1];app.range.frames=group;app.range.layers={source.layers[1]}
  app.command.LinkCels();linked=linked+#group-1
 end end
 local file=name=='pl11' and 'hat-fighter-native.aseprite' or 'gray-fighter-native.aseprite'
 if name=='pl16' and first>1 then file='gray-fighter-native-extra.aseprite' end
 source:saveAs(root..'/web/characters/'..file);source:close()
 print(file..': '..(last-first+1)..' imported drawings; '..linked..' exact aliases linked; '..#missing..' sheets pending')
 end
end
-- Keep the temporally coherent standing loops when deliberately re-importing
-- the independently generated attack and movement sheets.
dofile(root..'/web/characters/apply_native_idle.lua')
