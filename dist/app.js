import { backgrounds, objects } from './catalog.js';
import { changeLayer, createScene } from './layout.js';
import { drawScene, palettes, parseAsset } from './svg.js';

const $ = id => document.getElementById(id);
const assets = new Map();
const knownIds = new Set([
  ...objects.flatMap(({L,S})=>[L.main,L.bg,S.main,S.bg]),
  ...Object.values(backgrounds).flatMap(Object.values),
]);
const selected = new Map();
const validPalette = colors => Array.isArray(colors) && colors.length===8
  && colors.every(color=>typeof color==='string' && /^#[0-9a-f]{6}$/i.test(color));
const titles = ['Собранно','Со смещением','Под заголовок'];
let scenes = [];
let variant = 0;
let active = null;
let custom;
let drag;
let nextId = 0;

const scene = () => scenes[variant];
const item = () => scene()?.items.find(entry=>entry.id===active);
const options = () => ({format:$('format').value,size:$('size').value,palette:$('palette').value});

function button(label,callback,pressed) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (pressed !== undefined) node.setAttribute('aria-pressed',pressed);
  node.addEventListener('click',callback);
  return node;
}

function renderCatalog() {
  const query = $('query').value.trim().toLocaleLowerCase('ru').replaceAll('ё','е');
  const matches = objects.filter(object=>[object.name,object.aliases].join(' ').toLocaleLowerCase('ru').replaceAll('ё','е').includes(query));
  $('catalog').replaceChildren(...matches.map(object=>button(object.name+(selected.get(object.id)==='bg'?' · фон':''),()=>{
    if (!selected.delete(object.id)) selected.set(object.id,'main');
    renderCatalog();
    const index = matches.indexOf(object);
    $('catalog').children[index]?.focus();
  },selected.has(object.id))));
  if (!matches.length) $('catalog').textContent = 'Нет совпадений';
  $('compose').disabled = !selected.size;
}

function renderArtwork() {
  if (!scene()) return;
  const svg = drawScene(scene(),assets,custom,{interactive:true});
  for (const group of svg.querySelectorAll('[data-instance]')) {
    group.classList.toggle('active-layer',group.dataset.instance===active);
  }
  $('stage').replaceChildren(svg);
}

function render() {
  const current = scene();
  renderArtwork();
  $('variants').replaceChildren(...scenes.map((_,index)=>button(titles[index],()=>{
    variant = index;
    active = scene().items.at(-1)?.id;
    render();
  },variant===index)));
  $('layers').replaceChildren(...(current?.items ?? []).slice().reverse().map(entry=>{
    const name = objects.find(object=>object.id===entry.object).name;
    return button(name+(entry.role==='bg'?' · фон':''),()=>{active = entry.id; render();},entry.id===active);
  }));
  const selectedItem = item();
  $('controls').disabled = !selectedItem;
  for (const key of ['x','y','angle','role']) {
    $(key).value = selectedItem ? (key==='role' ? selectedItem[key] : Math.round(selectedItem[key])) : '';
  }
  const missing = current?.items.filter(entry=>!assets.has(objects.find(object=>object.id===entry.object)[current.size][entry.role])) ?? [];
  $('export').disabled = !current?.items.length || Boolean(missing.length);
  $('assets-status').textContent = 'Загружено исходников: '+assets.size+' из '+knownIds.size+'.';
  $('status').textContent = missing.length
    ? 'Показаны границы отсутствующих объектов. Для экспорта добавьте соответствующие SVG.'
    : current ? current.width+' × '+current.height+' · '+current.size : '';
}

function compose() {
  const picked = objects.filter(object=>selected.has(object.id));
  if (!picked.length) return;
  scenes = titles.map((_,index)=>{
    const layout = createScene(picked,options(),index);
    for (const entry of layout.items) entry.role = selected.get(entry.object);
    layout.items.sort((a,b)=>Number(a.role==='main')-Number(b.role==='main'));
    return layout;
  });
  variant = 0;
  active = scene().items.at(-1)?.id;
  render();
}

// The autonomous file keeps the manual workflow available without a Node server.
if (location.protocol==='http:' || location.protocol==='https:') {
  $('suggest-form').hidden = false;
  let pending;
  $('headline').addEventListener('input',()=>{
    pending?.abort();
    $('suggest-status').textContent = '';
  });
  $('suggest-form').addEventListener('submit',async event=>{
    event.preventDefault();
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    $('suggest').disabled = true;
    $('suggest-status').textContent = 'Подбираю предметы…';
    try {
      const response = await fetch('/api/suggest',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:$('headline').value}),signal:controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось подобрать предметы.');
      if (controller.signal.aborted) return;
      if (!result.items.length) {
        $('suggest-status').textContent = 'Подходящие предметы не найдены. Выберите их вручную.';
        return;
      }
      selected.clear();
      for (const {id,role} of result.items) selected.set(id,role);
      $('query').value = '';
      renderCatalog();
      $('suggest-status').textContent = 'Проверьте отмеченные предметы и нажмите «Собрать варианты».';
    } catch(error) {
      if (!controller.signal.aborted) $('suggest-status').textContent = error.message;
    } finally {
      if (pending===controller) $('suggest').disabled = false;
    }
  });
}

$('query').addEventListener('input',renderCatalog);
$('compose').addEventListener('click',compose);
for (const key of ['format','size']) $(key).addEventListener('change',()=>{
  const current = scene();
  if (!current) return;
  scenes = scenes.map((previous,index)=>{
    const picked = previous.items.map(entry=>objects.find(object=>object.id===entry.object));
    const rebuilt = createScene(picked,options(),index);
    const positions = new Map(rebuilt.items.map(entry=>[Number(entry.id.slice(5)),entry]));
    rebuilt.items = previous.items.map((entry,index)=>{
      const {x,y} = positions.get(index);
      return {...entry,x,y};
    });
    return rebuilt;
  });
  render();
});
$('palette').addEventListener('change',()=>{
  for (const entry of scenes) entry.palette = options().palette;
  render();
});
for (const key of ['x','y','angle','role']) $(key).addEventListener('change',()=>{
  if (!item()) return;
  if (key === 'role') item()[key] = $(key).value;
  else if ($(key).value !== '' && Number.isFinite($(key).valueAsNumber)) item()[key] = $(key).valueAsNumber;
  render();
});
$('controls').addEventListener('click',event=>{
  const action = event.target.dataset.action;
  if (!action || !item()) return;
  const {items} = scene();
  if (action === 'front' || action === 'back') changeLayer(items,active,action==='front'?1:-1);
  if (action === 'duplicate') {
    const copy = {...item(),id:'copy-'+(++nextId),x:item().x+24,y:item().y+24};
    items.splice(items.indexOf(item())+1,0,copy);
    active = copy.id;
  }
  if (action === 'remove') {
    items.splice(items.indexOf(item()),1);
    active = items.at(-1)?.id;
  }
  render();
});

function point(event,matrix) {
  return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
}
$('stage').addEventListener('pointerdown',event=>{
  const target = event.target.closest('[data-instance]');
  if (!target || event.button !== 0) return;
  event.preventDefault();
  const matrix = $('stage').querySelector('svg').getScreenCTM()?.inverse();
  if (!matrix) return;
  active = target.dataset.instance;
  const start = point(event,matrix);
  drag = {matrix,start,x:item().x,y:item().y,pointer:event.pointerId};
  $('stage').setPointerCapture(event.pointerId);
  render();
});
$('stage').addEventListener('pointermove',event=>{
  if (drag?.pointer !== event.pointerId || !item()) return;
  const position = point(event,drag.matrix);
  item().x = drag.x+position.x-drag.start.x;
  item().y = drag.y+position.y-drag.start.y;
  const group = $('stage').querySelector('[data-instance="'+active+'"]');
  group.setAttribute('transform','translate('+item().x+' '+item().y+') rotate('+item().angle+') scale('+scene().scale+')');
  $('x').value = Math.round(item().x);
  $('y').value = Math.round(item().y);
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) $('stage').addEventListener(event,()=>{drag=undefined;});
$('export').addEventListener('click',()=>{
  if ($('export').disabled) return;
  const svg = drawScene(scene(),assets,custom);
  const file = new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'});
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'composition-'+scene().width+'x'+scene().height+'.svg';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
});

$('colors').addEventListener('change',async event=>{
  const file = event.target.files[0];
  if (!file) return;
  try {
    const colors = JSON.parse(await file.text());
    if (!validPalette(colors)) {
      throw new Error('Палитра должна содержать восемь цветов в формате #RRGGBB.');
    }
    custom = colors;
    $('palette').querySelector('[value=custom]').hidden=false;
    $('palette').value = 'custom';
    $('palette').dispatchEvent(new Event('change'));
  } catch(error) {
    $('status').textContent = error.message;
  } finally {
    event.target.value = '';
  }
});
function addAsset(id,source) {
  if (!knownIds.has(id)) throw new Error('неизвестный ID ' + id);
  assets.set(id,parseAsset(source));
}

function loadLibrary(bundle) {
  if (bundle?.version!==1 || !bundle.assets || typeof bundle.assets!=='object') {
    throw new Error('Файл не соответствует формату библиотеки.');
  }
  const errors = [];
  for (const [id,source] of Object.entries(bundle.assets)) {
    try { addAsset(id,source); } catch(error) { errors.push(id+' — '+error.message); }
  }
  for (const key of Object.keys(palettes)) {
    if (validPalette(bundle.palettes?.[key])) palettes[key] = bundle.palettes[key];
  }
  return errors;
}

$('files').addEventListener('change',async event=>{
  const errors = [];
  for (const file of event.target.files) {
    try {
      const contents = await file.text();
      if (/\.json$/i.test(file.name)) errors.push(...loadLibrary(JSON.parse(contents)));
      else addAsset(file.name.replace(/\.svg$/i,'').replace(':','-'),contents);
    } catch(error) {
      errors.push(file.name+' — '+error.message);
    }
  }
  event.target.value = '';
  render();
  if (errors.length) $('status').textContent = errors.join(', ');
});

renderCatalog();
render();
const bundledLibrary = document.getElementById('bundled-library');
if (bundledLibrary) {
  const warnings = loadLibrary(JSON.parse(bundledLibrary.textContent));
  render();
  if (warnings.length) $('assets-status').textContent += ' Некоторые SVG не удалось прочитать.';
} else {
  const results = await Promise.allSettled([...knownIds].map(async id=>{
    const response = await fetch('./assets/'+id+'.svg');
    if (response.ok && !assets.has(id)) addAsset(id,await response.text());
  }));
  let warnings = [];
  try {
    const bundle = await fetch('./assets/library.json');
    if (bundle.ok) warnings = loadLibrary(await bundle.json());
  } catch (error) {
    warnings.push(error.message);
  }
  render();
  if (warnings.length || results.some(result=>result.status==='rejected')) {
    $('assets-status').textContent += ' Некоторые SVG не удалось прочитать.';
  }
}
