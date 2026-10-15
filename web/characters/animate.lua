-- Animate approved suit drawings using the native fighters' head and sole arcs.
-- Edit motion-masters.aseprite for appearance; motion.json retains measured arcs.
local root=assert(app.params.aseprite_mcp_workspace)
local file=assert(io.open(root..'/web/characters/motion.json','r'))
local motion=json.decode(file:read('*a'));file:close()
local masters=app.open(root..'/web/characters/motion-masters.aseprite')
local rigs={
  pl11={name='hat-fighter',split=5,waist=-44,head=-78,
    hips={{-1,-44},{12,-44}},knees={{-16,-27},{30,-30}},ankles={{-27,-7},{28,-7}},bend={1,-1},hands={{-16,-60},{9,-75}}},
  pl16={name='gray-fighter',split=0,waist=-42,head=-73,
    hips={{-5,-41},{9,-40}},knees={{-26,-27},{10,-23}},ankles={{-34,-8},{21,-8}},bend={1,1},hands={{-37,-68},{-14,-65}}}
}
local function clamp(v,a,b)return math.max(a,math.min(b,v))end
local function mix(a,b,t)return a+(b-a)*clamp(t,0,1)end
local function length(x,y)return math.sqrt(x*x+y*y)end
local function round(v)return math.floor(v+.5)end
local function knee(hip,ankle,rig,leg)
  local h,k,a=rig.hips[leg],rig.knees[leg],rig.ankles[leg]
  local l1,l2=length(k[1]-h[1],k[2]-h[2]),length(a[1]-k[1],a[2]-k[2])
  -- A planted sole stays on the ground when a long step straightens the knee.
  local vertical=ankle[2]-hip[2]
  local reach=math.sqrt(math.max(0,((l1+l2)*1.035)^2-vertical^2))
  ankle[1]=hip[1]+clamp(ankle[1]-hip[1],-reach,reach)
  local dx,dy=ankle[1]-hip[1],ankle[2]-hip[2]
  local distance=length(dx,dy)
  local stretch=math.max(1,distance/(l1+l2))
  l1=l1*stretch;l2=l2*stretch
  local along=(l1*l1-l2*l2+distance*distance)/(2*distance)
  local across=math.sqrt(math.max(0,l1*l1-along*along))*rig.bend[leg]
  return {hip[1]+dx/distance*along-dy/distance*across,hip[2]+dy/distance*along+dx/distance*across}
end

-- Rasterize a deformed mesh by inverse sampling. No interpolated alpha or
-- subpixel movement reaches the game: build.lua samples onto its pixel grid.
local function render(image,position,rig,pose)
  local output=Image(640,640,ColorMode.RGB)
  local function displaced(x,y,part)
    local dx,dy
    if part==0 then
      local t=clamp((rig.waist-y)/(rig.waist-rig.head),0,1)
      -- A rigid face/hat above the neck; chest and pelvis can move separately.
      dx=mix(pose.hipX,pose.headX,t);dy=mix(pose.hipY,pose.headY,t)
      for i,hand in ipairs(rig.hands) do
        local radius=((x-hand[1])/13)^2+((y-hand[2])/14)^2
        local weight=y>rig.head+2 and math.exp(-radius*1.5) or 0
        dx=dx+weight*pose.guardX*(i==1 and 1 or -.45)
        dy=dy+weight*pose.guardY
      end
      -- The tie and jacket hem settle a little behind the torso.
      local tie=math.exp(-((x-(rig.name=='hat-fighter' and 8 or -2))/7)^2-((y+58)/15)^2)
      dx=dx+tie*pose.cloth
    else
      local h,k,a=rig.hips[part],rig.knees[part],rig.ankles[part]
      local th,tk,ta=pose.hips[part],pose.knees[part],pose.ankles[part]
      if y<k[2] then
        local t=(y-h[2])/(k[2]-h[2])
        dx=mix(th[1]-h[1],tk[1]-k[1],t);dy=mix(th[2]-h[2],tk[2]-k[2],t)
      else
        local t=(y-k[2])/(a[2]-k[2])
        dx=mix(tk[1]-k[1],ta[1]-a[1],t);dy=mix(tk[2]-k[2],ta[2]-a[2],t)
      end
      local turn=pose.turn[part]*clamp((y-(a[2]-2))/5,0,1)
      dx=dx-(y-a[2])*turn;dy=dy+(x-a[1])*turn
    end
    return {320+(x+dx)*3,500+(y+dy)*3,x,y}
  end
  local function triangle(a,b,c,part)
    local denominator=(b[2]-c[2])*(a[1]-c[1])+(c[1]-b[1])*(a[2]-c[2])
    if math.abs(denominator)<.0001 then return end
    local x0=clamp(math.floor(math.min(a[1],b[1],c[1])),0,639)
    local x1=clamp(math.ceil(math.max(a[1],b[1],c[1])),0,639)
    local y0=clamp(math.floor(math.min(a[2],b[2],c[2])),0,639)
    local y1=clamp(math.ceil(math.max(a[2],b[2],c[2])),0,639)
    for y=y0,y1 do for x=x0,x1 do
      local u=((b[2]-c[2])*(x-c[1])+(c[1]-b[1])*(y-c[2]))/denominator
      local v=((c[2]-a[2])*(x-c[1])+(a[1]-c[1])*(y-c[2]))/denominator
      local w=1-u-v
      if u>=-.00001 and v>=-.00001 and w>=-.00001 then
        local sx,sy=u*a[3]+v*b[3]+w*c[3],u*a[4]+v*b[4]+w*c[4]
        local allowed=(part==0 and sy<=rig.waist+7) or
          (part~=0 and sy>=rig.waist-1 and (sx<rig.split and part==1 or sx>=rig.split and part==2))
        if allowed then
          local ix,iy=round(320+sx*3-position.x),round(500+sy*3-position.y)
          if ix>=0 and ix<image.width and iy>=0 and iy<image.height then
            local color=image:getPixel(ix,iy)
            if app.pixelColor.rgbaA(color)>0 then output:drawPixel(x,y,color) end
          end
        end
      end
    end end
  end
  local left=(position.x-320)/3-1;local top=(position.y-500)/3-1
  local right=left+image.width/3+2;local bottom=top+image.height/3+2
  for _,part in ipairs({2,1,0}) do
    local grid={}
    for y=top,bottom+4,4 do
      local row={}
      for x=left,right+4,4 do row[#row+1]=displaced(x,y,part) end
      grid[#grid+1]=row
    end
    for y=1,#grid-1 do for x=1,#grid[y]-1 do
      triangle(grid[y][x],grid[y][x+1],grid[y+1][x],part)
      triangle(grid[y][x+1],grid[y+1][x+1],grid[y+1][x],part)
    end end
  end
  -- Copy rigid regions exactly. Floating-point triangle edges can otherwise
  -- resample a neighboring working pixel in a motionless shoe or facial line.
  local function rigidArea(y0,y1,dx,dy)
    for y=y0,y1 do for x=0,639 do
      local ix,iy=x-position.x-dx,y-position.y-dy
      local color=0
      if ix>=0 and ix<image.width and iy>=0 and iy<image.height then color=image:getPixel(ix,iy) end
      output:drawPixel(x,y,color)
    end end
  end
  rigidArea(0,500+(rig.head+pose.headY)*3,pose.headX*3,pose.headY*3)
  if pose.idle then
    rigidArea(500+(math.max(rig.ankles[1][2],rig.ankles[2][2])+1)*3,639,0,0)
  end
  local x0,y0,x1,y1=640,640,-1,-1
  for y=0,639 do for x=0,639 do if app.pixelColor.rgbaA(output:getPixel(x,y))>0 then
    x0=math.min(x0,x);x1=math.max(x1,x);y0=math.min(y0,y);y1=math.max(y1,y)
  end end end
  -- Keep the sampling grid fixed relative to the native origin. Cropping at
  -- arbitrary working pixels would make stationary shoes shimmer on export.
  x0=320+math.floor((x0-320)/3)*3;y0=500+math.floor((y0-500)/3)*3
  x1=x0+math.ceil((x1-x0+1)/3)*3-1;y1=y0+math.ceil((y1-y0+1)/3)*3-1
  local crop=Image(x1-x0+1,y1-y0+1,ColorMode.RGB)
  crop:drawImage(output,Point(-x0,-y0))
  return crop,Point(x0,y0)
end

for _,name in ipairs({'pl11','pl16'}) do
  local rig,track=rigs[name],motion[name]
  local anchor=track.frames[tostring(math.floor(track.anchor))]
  local master
  for _,tag in ipairs(masters.tags) do if tag.name==name then master=masters.layers[1]:cel(tag.fromFrame) end end
  assert(master,'Missing motion master')
  local source=app.open(root..'/web/characters/'..rig.name..'.aseprite')
  local tags={}
  for _,tag in ipairs(source.tags) do tags[tonumber(tag.name)]=tag end
  local count=0
  for _,group in ipairs({'idle','forward','backward'}) do
    local sequence=track.groups[group]
    for i,cg in ipairs(sequence) do
      local fr=track.frames[tostring(math.floor(cg))]
      local previous=track.frames[tostring(math.floor(sequence[(i-2)%#sequence+1]))]
      local idle=group=='idle'
      local headX=(fr.head[1]-anchor.head[1])*(name=='pl11' and .65 or .55)
      local headY=(fr.head[2]-anchor.head[2])*(name=='pl11' and .70 or .85)
      local footDX={0,0};local footDY={0,0}
      if not idle then for leg=1,2 do
        footDX[leg]=(fr.feet[leg][1]-anchor.feet[leg][1])*.85
        footDY[leg]=math.min(0,fr.feet[leg][2]-anchor.feet[leg][2])*.9
      end end
      local hipX=idle and headX*.45 or (footDX[1]+footDX[2])*.225
      local hipY=headY*.32
      local pose={idle=idle,headX=round(headX+hipX*.2),headY=round(headY),hipX=hipX,hipY=hipY,
        guardX=headY*.11+headX*.10,guardY=headY*.12,
        cloth=(previous.head[1]-fr.head[1])*.17+(previous.head[2]-fr.head[2])*.10,
        hips={},knees={},ankles={},turn={}}
      for leg=1,2 do
        pose.hips[leg]={rig.hips[leg][1]+hipX,rig.hips[leg][2]+hipY}
        pose.ankles[leg]={rig.ankles[leg][1]+footDX[leg],rig.ankles[leg][2]+footDY[leg]}
        pose.knees[leg]=knee(pose.hips[leg],pose.ankles[leg],rig,leg)
        pose.turn[leg]=idle and 0 or clamp((fr.feet[leg][1]-previous.feet[leg][1])*.008,-.10,.10)*clamp(-footDY[leg]/2,0,1)
      end
      local image,position=render(master.image,master.position,rig,pose)
      local tag=tags[cg]
      local index=tag and tag.fromFrame.frameNumber or #source.frames+1
      if not tag then
        source:newEmptyFrame(index);tag=source:newTag(index,index);tag.name=string.format('%d',cg);tags[cg]=tag
      end
      local old=source.layers[1]:cel(source.frames[index]);if old then source:deleteCel(old) end
      source:newCel(source.layers[1],index,image,position)
      source.frames[index].duration=(name=='pl11' and idle and cg>=14660 and cg<=14663) and 4/60 or (idle and name=='pl16' and 4/60 or 3/60)
      count=count+1
    end
  end
  source:saveAs(root..'/web/characters/'..rig.name..'.aseprite');source:close()
  print(rig.name..': '..count..' dedicated breathing and walking cels')
end
masters:close()
