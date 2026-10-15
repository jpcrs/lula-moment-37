-- Luiz's fabric replacement, in the 3x native artwork coordinate system.
-- Only the red cloth is changed; skin, the tie clip, outlines and alpha stay.
local function isRed(c)
 local r,g,b=app.pixelColor.rgbaR(c),app.pixelColor.rgbaG(c),app.pixelColor.rgbaB(c)
 return app.pixelColor.rgbaA(c)>0 and r>=45 and r>g*1.7 and r>b*1.55 and b>g*.72
end
local function apply(image,scale,makeMask)
 scale=scale or 3
 local pixels={};local sx,sy=0,0
 for pixel in image:pixels() do if isRed(pixel()) then
  local p={x=pixel.x,y=pixel.y,color=pixel()};pixels[#pixels+1]=p;sx=sx+p.x;sy=sy+p.y
 end end
 if #pixels==0 then return 0,nil end
 local mask=makeMask and Image(image.width,image.height,ColorMode.RGB) or nil
 local cx,cy=sx/#pixels,sy/#pixels
 local xx,xy,yy=0,0,0
 for _,p in ipairs(pixels) do local x,y=p.x-cx,p.y-cy;xx=xx+x*x;xy=xy+x*y;yy=yy+y*y end
 local angle=.5*math.atan(2*xy,xx-yy)
 -- A small angular grid keeps neighboring idle drawings from shimmering.
 angle=math.floor(angle/(math.pi/24)+.5)*(math.pi/24)
 local dx,dy=math.cos(angle),math.sin(angle)
 if dy<0 then dx,dy=-dx,-dy end
 local acrossX,acrossY=dy,-dx
 local start=math.huge
 for _,p in ipairs(pixels) do start=math.min(start,(p.x-cx)*dx+(p.y-cy)*dy) end
 for _,p in ipairs(pixels) do
  if mask then mask:drawPixel(p.x,p.y,app.pixelColor.rgba(255,255,255,255)) end
  local x,y=p.x-cx,p.y-cy
  local along=x*dx+y*dy-start;local across=x*acrossX+y*acrossY
  local phase=(along-across)%(10*scale)/scale
  local base
  if phase<2 then base={12,75,62} -- bottle green
  elseif phase<2.35 or phase>=2.7 and phase<3.05 then base={225,222,226} -- fine pale double line
  elseif phase>=3.05 and phase<4.8 then base={227,187,54} -- gold stripe
  else base={18,38,57} end -- navy ground
  local shade=.65+.35*math.min(1,math.max(0,(app.pixelColor.rgbaR(p.color)-50)/160))
  image:drawPixel(p.x,p.y,app.pixelColor.rgba(math.floor(base[1]*shade+.5),math.floor(base[2]*shade+.5),math.floor(base[3]*shade+.5),app.pixelColor.rgbaA(p.color)))
 end
 return #pixels,mask
end
return {apply=apply,isRed=isRed}
