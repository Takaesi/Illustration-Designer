import { backgrounds, objects } from './catalog.js';

const ns = 'http://www.w3.org/2000/svg';
const elements = new Set('svg g defs path rect circle ellipse line polyline polygon mask clipPath linearGradient radialGradient stop pattern use title desc'.split(' '));
const paintAttributes = ['fill','stroke','stop-color'];
export const palettes = {
  lavender:["#D7CDF5","#F9ECB0","#AA9BF0","#F9A3AA","#7864D7","#FFE3E1","#181817","#FFFFFF"],
  peach:["#FDD7B9","#F9ECB0","#FAC896","#80DADA","#D27532","#BEEBEB","#181817","#FFFFFF"],
  mint:["#BEEBEB","#FFD4F2","#80DADA","#6D7BFC","#5ABEBE","#B6C6FE","#181817","#FFFFFF"],
};

export function parseAsset(source) {
  const doc = new DOMParser().parseFromString(source,'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== ns || doc.doctype) throw new Error('Требуется SVG без внешних ресурсов.');
  for (const element of [root,...root.querySelectorAll('*')]) {
    if (element.namespaceURI !== ns || !elements.has(element.localName)) throw new Error('Неподдерживаемый SVG-элемент: ' + element.localName);
    for (const attr of [...element.attributes]) {
      const {name,value,localName} = attr;
      if (name.startsWith('xmlns')) continue;
      if ((/^(on|style$|src$|xml:base$)/i.test(name)) ||
          (localName === 'href' && !/^#[\w:.-]+$/.test(value)) ||
          (/url\s*\(/i.test(value) && !/^url\(#[\w:.-]+\)$/.test(value))) {
        throw new Error('SVG содержит неподдерживаемую ссылку или атрибут.');
      }
    }
  }
  const view = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (view?.length!==4 || !view.every(Number.isFinite) || view[2]<=0 || view[3]<=0) {
    throw new Error('В SVG требуется корректный viewBox.');
  }
  return root;
}

function tag(name,attrs) {
  const result = document.createElementNS(ns,name);
  for (const [key,value] of Object.entries(attrs)) result.setAttribute(key,value);
  return result;
}

function recolor(value, palette, role) {
  const paint = value.toLowerCase();
  if (role === 'bg' && paint === 'white') return value;
  const token = paint === 'white' ? '#ffffff' : paint;
  const index = palettes.lavender.findIndex(color=>color.toLowerCase()===token);
  return index<0 || (role==='bg' && index%2===1) ? value : palette[index];
}

function place(source, placement, prefix, palette, role) {
  const svg = document.importNode(source,true);
  const nodes = [svg,...svg.querySelectorAll('*')];
  const ids = new Map(nodes.filter(node=>node.id).map(node=>[node.id,prefix+'-'+node.id]));
  for (const node of nodes) {
    if (node.id) node.id = ids.get(node.id);
    for (const attr of [...node.attributes]) {
      const ref = /^url\(#(.+)\)$/.exec(attr.value);
      if (ref && ids.has(ref[1])) attr.value = 'url(#' + ids.get(ref[1]) + ')';
      if (attr.localName === 'href' && ids.has(attr.value.slice(1))) attr.value = '#' + ids.get(attr.value.slice(1));
    }
    if (palette) for (const attr of paintAttributes) {
      if (node.hasAttribute(attr)) node.setAttribute(attr,recolor(node.getAttribute(attr),palette,role));
    }
  }
  const {x,y,width,height,preserveAspectRatio} = placement;
  const [left,top,originalWidth,originalHeight] = svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
  const mode = preserveAspectRatio ?? svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  if (!/^xMidYMid(?: (?:meet|slice))?$/.test(mode)) {
    for (const [name,value] of Object.entries(placement)) svg.setAttribute(name,value);
    return svg;
  }
  const ratio = (mode.endsWith('slice') ? Math.max : Math.min)(width/originalWidth,height/originalHeight);
  const tx = x+(width-originalWidth*ratio)/2-left*ratio;
  const ty = y+(height-originalHeight*ratio)/2-top*ratio;
  const viewportId = prefix+'-viewport';
  const viewport = tag('clipPath',{id:viewportId});
  viewport.append(tag('rect',{x,y,width,height}));
  const outer = tag('g',{'clip-path':'url(#'+viewportId+')'});
  const art = tag('g',{transform:'translate('+tx+' '+ty+') scale('+ratio+')'});
  const rootOnly = new Set(['x','y','width','height','viewBox','preserveAspectRatio','overflow']);
  for (const attr of [...svg.attributes]) {
    if (!rootOnly.has(attr.name) && !attr.name.startsWith('xmlns')) art.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
  }
  art.append(...svg.childNodes);
  outer.append(viewport,art);
  return outer;
}

export function drawScene(scene,assets,custom,{interactive=false}={}) {
  const {width,height,items,size,scale,palette} = scene;
  const colors = palette === 'custom' ? custom : palettes[palette];
  const svg = tag('svg',{width,height,viewBox:'0 0 '+width+' '+height,overflow:'hidden'});
  const clipId = 'canvas-clip';
  const defs = tag('defs',{});
  const clip = tag('clipPath',{id:clipId});
  clip.append(tag('rect',{width,height}));
  defs.append(clip);
  svg.append(defs);
  const art = tag('g',{'clip-path':'url(#'+clipId+')'});
  svg.append(art);
  const scheme = backgrounds[size][palette] ? palette : 'lavender';
  const background = assets.get(backgrounds[size][scheme]);
  art.append(tag('rect',{width,height,fill:colors?.[0] || palettes.lavender[0]}));
  if (background) art.append(place(background,{x:0,y:0,width,height,preserveAspectRatio:'xMidYMid slice'},'canvas-bg',palette==='custom'?colors:null,'bg'));
  for (const item of items) {
    const object = objects.find(entry=>entry.id===item.object);
    const variant = object[size];
    const source = assets.get(variant[item.role]);
    const group = tag('g',{id:object.id+'-'+item.id,transform:'translate('+item.x+' '+item.y+') rotate('+item.angle+') scale('+scale+')'});
    if (interactive) group.setAttribute('data-instance',item.id);
    const placement = {x:-variant.w/2,y:-variant.h/2,width:variant.w,height:variant.h};
    if (source) {
      group.append(place(source,placement,item.id,colors,item.role));
    } else if (interactive) {
      group.append(tag('rect',{...placement,rx:10,fill:'#ffffff',stroke:'#7654b8','stroke-dasharray':'12 8'}));
      const label = tag('text',{'text-anchor':'middle','dominant-baseline':'middle','font-size':Math.min(80,variant.w/7),fill:'#35245c'});
      label.textContent = object.name;
      group.append(label);
    }
    art.append(group);
  }
  return svg;
}
