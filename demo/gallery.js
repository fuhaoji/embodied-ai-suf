'use strict';
const $=id=>document.getElementById(id),pretty=s=>s.replaceAll('_',' '),title=s=>pretty(s).replace(/^./,c=>c.toUpperCase());
const video=document.querySelector('video');
let collection,selected,controller,ticket=0;
video.muted=true;
function loadVideo(url,signal){
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=error=>{clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);error?reject(error):resolve();};
  const ready=()=>finish(),failed=()=>finish(Error(video.error?.message||'Video could not be decoded')),aborted=()=>finish(new DOMException('Task changed','AbortError'));
  video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',aborted,{once:true});
  timer=setTimeout(()=>finish(Error('Video loading timed out')),20000);video.src=url;video.preload='auto';video.load();
 });
}
async function play(){
 try{await video.play();$('manual-play').hidden=true;$('loading').textContent='';}
 catch{$('manual-play').hidden=false;$('loading').textContent='Your browser paused playback. Press Play video to start.';}
}
function link(text,url,download=false){const a=document.createElement('a');a.textContent=text;a.href=url;if(download)a.download='';return a;}
async function showTask(c,autoplay=false,scroll=false){
 const current=++ticket;selected=c;
 if(controller)controller.abort();controller=new AbortController();
 $('player').hidden=false;$('player-category').textContent=c.category;$('player-title').textContent=title(c.object)+' · '+pretty(c.task);
 $('player-meta').textContent=`${c.total_waypoints}/${c.total_waypoints} waypoints · ${c.duration.toFixed(1)} simulated seconds`;
 $('loading').textContent='Loading video…';$('manual-play').hidden=true;$('copy-status').textContent='';$('share-fallback').hidden=true;
 $('player-links').replaceChildren(link('Open interactive 3D replay ↗','replay/?task='+c.id),link('Download MP4 ↓',c.mp4,true),link('Download WebM ↓',c.vp8,true));
 try{history.replaceState(null,'','#task='+c.id);}catch{}
 if(scroll)$('player').scrollIntoView({behavior:'instant',block:'start'});
 video.pause();video.removeAttribute('src');delete video.dataset.task;video.load();video.poster=c.poster;
 const attempts=[];
 for(const source of [{url:c.mp4,codec:'H.264'},{url:c.vp8,codec:'VP8'}]){
  try{
   await loadVideo(source.url,controller.signal);if(current!==ticket)return;
   video.dataset.task=c.id;video.dataset.codec=source.codec;window.playbackDiagnostics={task:c.id,codec:source.codec,attempts,status:'decoded'};
   $('loading').textContent='';if(autoplay)await play();return;
  }catch(error){if(current!==ticket||error.name==='AbortError')return;attempts.push({codec:source.codec,error:error.message});}
 }
 $('loading').textContent='This browser could not decode the video. Download it or open the interactive 3D replay.';
 window.playbackDiagnostics={task:c.id,status:'failed',attempts};
}
function render(){
 const category=$('filter').value,query=$('search').value.trim().toLowerCase();
 const cases=collection.cases.filter(c=>(category==='all'||c.category===category)&&pretty(c.category+' '+c.object+' '+c.task).includes(query));
 $('cards').replaceChildren();$('counter').textContent=`${cases.length} of ${collection.cases.length} trajectories`;$('empty').hidden=cases.length!==0;
 for(const c of cases){
  const article=document.createElement('article');article.className='card';article.dataset.task=c.id;
  const img=document.createElement('img');img.className='card-image';img.src=c.poster;img.alt=`Robot holding a ${pretty(c.object)} during ${pretty(c.task)}`;img.loading='lazy';img.width=960;img.height=720;
  const body=document.createElement('div');body.className='card-content';
  const category=document.createElement('span');category.className='category';category.textContent=c.category;
  const heading=document.createElement('h3');heading.textContent=title(c.object);
  const task=document.createElement('p');task.className='task-name';task.textContent=title(c.task);
  const meta=document.createElement('p');meta.className='task-meta';meta.textContent=`${c.total_waypoints} waypoints · ${c.duration.toFixed(1)} s`;
  const actions=document.createElement('div');actions.className='card-actions';
  const watch=document.createElement('button');watch.className='button primary';watch.type='button';watch.textContent='Watch trajectory';watch.setAttribute('aria-label','Watch '+pretty(c.object)+' '+pretty(c.task));watch.onclick=()=>showTask(c,true,true);
  actions.append(watch,link('Explore in 3D ↗','replay/?task='+c.id));body.append(category,heading,task,meta,actions);article.append(img,body);$('cards').append(article);
 }
}
$('manual-play').onclick=play;
$('copy-link').onclick=async()=>{
 if(!selected)return;const url=new URL(location.href);url.hash='task='+selected.id;
 try{await navigator.clipboard.writeText(url.href);$('copy-status').textContent='Link copied.';}
 catch{$('share-fallback').hidden=false;$('share-url').value=url.href;$('share-url').focus();$('share-url').select();$('copy-status').textContent='Copy the selected link to share this task.';}
};
$('filter').onchange=render;$('search').oninput=render;
window.addEventListener('hashchange',()=>{const id=location.hash.startsWith('#task=')?location.hash.slice(6):'';const c=collection?.cases.find(c=>c.id===id);if(c&&selected?.id!==id)showTask(c,false,true);});
async function main(){
 try{
  const response=await fetch('data/gallery.json');if(!response.ok)throw Error('Trajectory collection could not be loaded.');collection=await response.json();
  for(const category of [...new Set(collection.cases.map(c=>c.category))].sort()){const option=document.createElement('option');option.value=category;option.textContent=title(category);$('filter').append(option);}
  render();const id=location.hash.startsWith('#task=')?location.hash.slice(6):'';
  const c=collection.cases.find(c=>c.id===id)||collection.cases[0];showTask(c,false,Boolean(id));
 }catch(error){$('error').textContent=error.message;}
}
main();
