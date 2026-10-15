-- Change the existing tie's blue/violet ramp to red; preserve the other art.
local root=assert(app.params.aseprite_mcp_workspace)
local changed=0
local paths={'/web/characters/hat-fighter.aseprite'}
for i=0,6 do paths[#paths+1]='/web/characters/art/pl11-'..i..'.png' end
for _,path in ipairs(paths) do
local s=app.open(root..path)
for _,cel in ipairs(s.cels) do
  for pixel in cel.image:pixels() do
    local c=pixel()
    local r,g,b,a=app.pixelColor.rgbaR(c),app.pixelColor.rgbaG(c),app.pixelColor.rgbaB(c),app.pixelColor.rgbaA(c)
    if a>0 and b-r>18 and b-g>9 and b<210 then
      local red=math.min(235,math.floor(b*1.45+14))
      pixel(app.pixelColor.rgba(red,math.floor(red*.22),math.floor(red*.27),a))
      changed=changed+1
    end
  end
end
s.layers[1].name='Cream hat / white beard / red tie'
s:saveAs(s.filename);s:close()
end
print('Recolored '..changed..' tie pixels')
