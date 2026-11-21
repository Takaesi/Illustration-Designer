import { formats } from './catalog.js';

function partitions(items) {
  if (items.length>10) {
    return items.map((_,index)=>{
      const columns = index+1;
      const rows = [];
      for (let start=0;start<items.length;start+=columns) rows.push(items.slice(start,start+columns));
      return rows;
    });
  }
  let layouts = [[[]]];
  for (const item of items) {
    const next = [];
    for (const rows of layouts) {
      next.push([...rows.slice(0,-1), [...rows.at(-1),item]]);
      if (rows.at(-1).length) next.push([...rows,[item]]);
    }
    layouts = next;
  }
  return layouts;
}

function measure(rows, shifted) {
  const rowSizes = rows.map(row=>({
    row,
    w:row.reduce((sum,item)=>sum+item.w,0),
    h:Math.max(...row.map(item=>item.h)),
  }));
  const gap = Math.max(...rows.flat().map(item=>Math.min(item.w,item.h))) * .1;
  const width = Math.max(...rowSizes.map(row=>row.w+(row.row.length-1)*gap));
  const stagger = shifted ? gap*2 : 0;
  const height = rowSizes.reduce((sum,row)=>sum+row.h,0)+(rowSizes.length-1)*gap+rowSizes.length*stagger;
  return {rowSizes,gap,stagger,width,height};
}

export function createScene(objects, {format,size,palette}, variant) {
  const [width,height] = formats[format];
  const vertical = format==='portrait';
  const underTitle = variant===2;
  const shifted = variant===1;
  const area = underTitle
    ? (vertical ? [.08,.36,.84,.56] : [.39,.08,.53,.84])
    : [.08,.08,.84,.84];
  const [left,top,frameWidth,frameHeight] = area.map((value,i)=>value*(i%2 ? height : width));
  const dimensions = objects.map((object,index)=>({id:'item-'+index,object:object.id,...object[size]}));
  if (!dimensions.length) return {width,height,size,palette,scale:1,items:[]};

  const arranged = shifted
    ? [...dimensions].sort((a,b)=>vertical ? b.h-a.h : b.w-a.w)
    : dimensions;
  let solution;
  for (const rows of partitions(arranged)) {
    const candidate = measure(rows,shifted);
    const scale = Math.min(frameWidth/candidate.width,frameHeight/candidate.height)*(shifted ? .94 : 1);
    if (!solution || scale>solution.scale) solution = {...candidate,scale};
  }

  const {scale,gap,stagger,rowSizes} = solution;
  let y = top+(frameHeight-solution.height*scale)/2;
  const items = [];
  for (const [rowIndex,{row,w,h}] of rowSizes.entries()) {
    const rowWidth = w+(row.length-1)*gap;
    const offset = shifted ? (rowIndex%2 ? .85 : -.85) : 0;
    let x = left+(frameWidth-rowWidth*scale)*(1+offset)/2;
    for (const [column,{id,object,w:itemWidth}] of row.entries()) {
      const verticalOffset = column%2 ? stagger : 0;
      items.push({
        id,object,role:'main',angle:0,
        x:x+itemWidth*scale/2,
        y:y+(h/2+verticalOffset)*scale,
      });
      x += (itemWidth+gap)*scale;
    }
    y += (h+gap+stagger)*scale;
  }
  return {width,height,size,palette,scale,items};
}

export function changeLayer(items,id,step) {
  const index = items.findIndex(item=>item.id===id);
  const target = index+step;
  if (index<0 || target<0 || target>=items.length) return;
  [items[index],items[target]] = [items[target],items[index]];
}
