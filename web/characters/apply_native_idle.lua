-- Rebuild only the standing loops from coherent artwork and native feature arcs.
-- Runtime frame selection, holds, branching and all other poses stay native.
local root=assert(app.params.aseprite_mcp_workspace)
local function read(path)
 local f=assert(io.open(root..'/'..path,'r'));local v=json.decode(f:read('*a'));f:close();return v
end
local tracks=read('web/characters/native-idle-motion.json')
local plan=read('web/characters/native-redraw-plan.json')
local masters=assert(app.open(root..'/web/characters/native-idle-masters.aseprite'))
local origin={960,1100}
local function clamp(v,a,b)return math.max(a,math.min(b,v))end
local function mix(a,b,t)return a+(b-a)*clamp(t,0,1)end
local function feather(v,lo,hi,pad)
 local t=clamp(math.max(lo-v,v-hi,0)/pad,0,1)
 return 1-t*t*(3-2*t)
end
local function displacement(rig,pose,x,y)
 local dx,dy
 if y<=rig.neck then dx,dy=pose.head[1],pose.head[2]
 elseif y<rig.waist then
  local t=(y-rig.neck)/(rig.waist-rig.neck)
  dx,dy=mix(pose.head[1],pose.waist[1],t),mix(pose.head[2],pose.waist[2],t)
 elseif y<rig.ankle then
  local leg=x<0 and 1 or 2;local knee=pose.knees[leg]
  if y<rig.knee then
   local t=(y-rig.waist)/(rig.knee-rig.waist)
   dx,dy=mix(pose.waist[1],knee[1],t),mix(pose.waist[2],knee[2],t)
  else
   local t=(y-rig.knee)/(rig.ankle-rig.knee)
   dx,dy=mix(knee[1],0,t),mix(knee[2],0,t)
  end
 else dx,dy=0,0 end
 for i,box in ipairs(rig.hands) do
  local w=feather(x,box[1],box[3],7)*feather(y,box[2],box[4],9)
  -- Above the collar, keep every facial/hat pixel on one rigid translation.
  if y<rig.neck and x>-23 then w=w*clamp((y-rig.neck+2)/2,0,1) end
  dx,dy=mix(dx,pose.hands[i][1],w),mix(dy,pose.hands[i][2],w)
 end
 return dx,dy
end
local function render(source,mask,rig,pose,expected)
 local image=Image(expected.w*3,expected.h*3,ColorMode.RGB)
 local cloth=mask and Image(image.width,image.height,ColorMode.RGB)
 local sx0=(source.position.x-origin[1])/3
 local sy0=(source.position.y-origin[2])/3
 local input=source.image;local maskImage=mask and mask.image
 local function vertex(x,y)
  local wx,wy=sx0+x/3,sy0+y/3
  local dx,dy=displacement(rig,pose,wx,wy)
  return {(wx+dx-expected.x)*3,(wy+dy-expected.y)*3,x,y}
 end
 local function triangle(a,b,c)
  local denominator=(b[2]-c[2])*(a[1]-c[1])+(c[1]-b[1])*(a[2]-c[2])
  if math.abs(denominator)<.000001 then return end
  local x0=clamp(math.floor(math.min(a[1],b[1],c[1])),0,image.width-1)
  local x1=clamp(math.ceil(math.max(a[1],b[1],c[1]))-1,0,image.width-1)
  local y0=clamp(math.floor(math.min(a[2],b[2],c[2])),0,image.height-1)
  local y1=clamp(math.ceil(math.max(a[2],b[2],c[2]))-1,0,image.height-1)
  for y=y0,y1 do for x=x0,x1 do
   local xx,yy=x+.5,y+.5
   local u=((b[2]-c[2])*(xx-c[1])+(c[1]-b[1])*(yy-c[2]))/denominator
   local v=((c[2]-a[2])*(xx-c[1])+(a[1]-c[1])*(yy-c[2]))/denominator
   local w=1-u-v
   if u>=-.000001 and v>=-.000001 and w>=-.000001 then
    local ix=math.floor(u*a[3]+v*b[3]+w*c[3]+.000001)
    local iy=math.floor(u*a[4]+v*b[4]+w*c[4]+.000001)
    if ix>=0 and iy>=0 and ix<input.width and iy<input.height then
     image:drawPixel(x,y,input:getPixel(ix,iy))
     if cloth then
      local mx=ix+source.position.x-mask.position.x;local my=iy+source.position.y-mask.position.y
      if mx>=0 and my>=0 and mx<maskImage.width and my<maskImage.height then cloth:drawPixel(x,y,maskImage:getPixel(mx,my)) end
     end
    end
   end
  end end
 end
 -- A one-game-pixel mesh only bends the fabric between rigid features.
 -- Integer native translations keep face, hands and planted shoes coherent.
 local previous={}
 for y=0,input.height,3 do
  local row={}
  for x=0,input.width,3 do row[#row+1]=vertex(x,y) end
  if #previous>0 then for x=1,#row-1 do
   triangle(previous[x],previous[x+1],row[x]);triangle(previous[x+1],row[x+1],row[x])
  end end
  previous=row
 end
 return image,cloth
end
for player,name in ipairs({'pl11','pl16'}) do
 local rig=tracks[name];local source=assert(app.open(root..'/web/characters/'..rig.project..'.aseprite'))
 local artwork=source.layers[1];local masks
 for _,l in ipairs(source.layers) do if l.name=='Tie fabric mask' then masks=l end end
 local master=assert(masters.layers[1]:cel(player));local mask=masters.layers[2]:cel(player)
 local blink
 for _,l in ipairs(masters.layers) do if l.name=='Blink artwork' then blink=l:cel(player) end end
 local count=0
 for _,tag in ipairs(source.tags) do
  local cg=tostring(math.floor(tonumber(tag.name)));local pose=rig.frames[cg]
  if pose then
   local expected=plan.graphics[cg]
   local image,cloth=render(pose.blink and assert(blink,'Missing blink drawing') or master,mask,rig,pose,expected)
   local position=Point(origin[1]+expected.x*3,origin[2]+expected.y*3)
   local old=artwork:cel(tag.fromFrame);if old then source:deleteCel(old) end
   source:newCel(artwork,tag.fromFrame,image,position)
   if cloth then
    assert(masks,'Missing fabric mask layer');local oldMask=masks:cel(tag.fromFrame);if oldMask then source:deleteCel(oldMask) end
    source:newCel(masks,tag.fromFrame,cloth,position)
   end
   count=count+1
  end
 end
 source:saveAs(root..'/web/characters/'..rig.project..'.aseprite');source:close()
 print(name..': '..count..' coherent native idle drawings')
end
masters:close()
