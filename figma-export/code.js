const ids = [
  "21-29965",
  "24-6273",
  "24-3810",
  "24-6934",
  "21-25472",
  "24-6327",
  "24-4746",
  "24-6990",
  "21-417",
  "24-6214",
  "24-4903",
  "24-7147",
  "24-2207",
  "24-6795",
  "24-5345",
  "24-7205",
  "23-122",
  "24-6484",
  "24-5089",
  "24-7344",
  "23-121",
  "24-6569",
  "24-5485",
  "24-7429",
  "28-11628",
  "30-11902",
  "28-11629",
  "28-11766",
  "23-211",
  "24-6660",
  "24-4594",
  "24-7568",
  "24-1899",
  "24-6772",
  "24-4430",
  "24-7520",
  "24-1734",
  "24-6747",
  "24-4287",
  "24-7543",
  "21-25258",
  "21-25399",
  "21-29593",
  "24-5990",
  "24-6120",
  "24-6055"
];
const schemes = {lavender:'21:29569',peach:'21:29570',mint:'21:29579'};

async function exportLibrary() {
  const library = {version:1,assets:{},palettes:{}};
  const errors = [];
  for (const id of ids) {
    try {
      const node = await figma.getNodeByIdAsync(id.replace('-',':'));
      if (!node || !('exportAsync' in node)) throw new Error('Узел недоступен.');
      library.assets[id] = await node.exportAsync({format:'SVG_STRING'});
    } catch(error) {
      errors.push(id + ' — ' + error.message);
    }
  }
  for (const [name,id] of Object.entries(schemes)) {
    const group = await figma.getNodeByIdAsync(id);
    if (!group || !('children' in group)) continue;
    const rectangles = group.children.filter(node=>node.type==='RECTANGLE' && node.visible);
    rectangles.sort((a,b)=>Math.abs(a.y-b.y)>1?a.y-b.y:a.x-b.x);
    const colors = rectangles.map(node=>{
      const paint = node.fills.find(entry=>entry.type==='SOLID' && entry.visible!==false);
      if (!paint) return null;
      const {r,g,b} = paint.color;
      return '#' + [r,g,b].map(value=>Math.round(value*255).toString(16).padStart(2,'0')).join('');
    });
    if (colors.length===8 && colors.every(Boolean)) library.palettes[name] = colors;
  }
  return {library,errors};
}

figma.showUI(__html__,{width:360,height:220});
exportLibrary().then(result=>figma.ui.postMessage(result)).catch(error=>figma.ui.postMessage({errors:[error.message]}));
