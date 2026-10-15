-- Run once on existing editable sources; imports use the same fabric helper.
local root=assert(app.params.aseprite_mcp_workspace)
local fabric=dofile(root..'/web/characters/striped_tie.lua')
local out=root..'/outputs/striped-tie';app.fs.makeAllDirectories(out)
local source=assert(app.open(root..'/'..(app.params.input or 'web/characters/hat-fighter-native.aseprite')))
local unique,stats={},{}
local wanted={14668,14665,14725,14735,15033,15269,15190,15194,15346,15137,15074,15640}
local picks={};for i,cg in ipairs(wanted) do picks[cg]=i end
local contact=Sprite(1536,768,ColorMode.RGB)
contact.cels[1].image:clear(app.pixelColor.rgba(30,35,43,255))
local cells={}
for _,tag in ipairs(source.tags) do
 local cel=source.layers[1]:cel(tag.fromFrame);local image=cel.image
 local cg=tonumber(tag.name);local count=0
 if cg<15648 or cg>15658 then
  if not unique[image.id] then
   for pixel in image:pixels() do if fabric.isRed(pixel()) then count=count+1 end end
   unique[image.id]=count
  else count=unique[image.id] end
 end
 stats[#stats+1]={cg=cg,redPixels=count,w=image.width,h=image.height}
 if picks[cg] then cells[picks[cg]]={image=Image(image),cg=cg} end
end
local count=0
local masks={}
local body=source.layers[1]
local maskLayer
for _,layer in ipairs(source.layers) do if layer.name=='Tie fabric mask' then maskLayer=layer end end
maskLayer=maskLayer or source:newLayer();maskLayer.name='Tie fabric mask';maskLayer.isVisible=false
for _,cel in ipairs(body.cels) do local id=cel.image.id
 if unique[id] and unique[id]>0 then
  local n,mask=fabric.apply(cel.image,3,true);count=count+n;masks[id]=mask
  unique[id]=0
 end
 if masks[id] then
  local old=maskLayer:cel(cel.frame);if old then source:deleteCel(old) end
  source:newCel(maskLayer,cel.frame,masks[id],cel.position)
 end
end
if app.params.preview~='true' then source:saveAs(root..'/web/characters/hat-fighter-native.aseprite') end
for i,cell in pairs(cells) do
 local before=cell.image;local after=Image(before);fabric.apply(after)
 for side,image in ipairs({before,after}) do
  local s=Sprite(image.width,image.height,ColorMode.RGB);s.cels[1].image:drawImage(image);app.sprite=s
  local factor=math.min(120/image.width,238/image.height)
  app.command.SpriteSize{ui=false,width=math.floor(image.width*factor+.5),height=math.floor(image.height*factor+.5),method='nearest'}
  local x=((i-1)%6)*256+(side-1)*128+(128-s.width)//2
  local y=((i-1)//6)*384+8
  contact.cels[1].image:drawImage(s.cels[1].image,Point(x,y));s:close()
 end
end
contact:saveCopyAs(out..'/poses.png');contact:close();source:close()
local file=assert(io.open(out..'/source-audit.json','w'));file:write(json.encode(stats));file:close()
print('Patterned '..count..' cloth pixels; '..#stats..' native graphics inspected')
