import * as T from '../replay/vendor/three.module.js';
import {GLTFLoader} from '../replay/vendor/GLTFLoader.js';
import {OrbitControls} from '../replay/vendor/OrbitControls.js';
import {decodeRecording} from './decode-recording.js';
const $=id=>document.getElementById(id),view=$('view'),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));view.prepend(renderer.domElement);renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene();scene.background=new T.Color('#e8eef2');const camera=new T.PerspectiveCamera(38,1,.00005,10);camera.up.set(0,0,1);const controls=new OrbitControls(camera,renderer.domElement);scene.add(new T.HemisphereLight(0xffffff,0x718592,2.4));const sun=new T.DirectionalLight(0xffffff,2.4);sun.position.set(.3,-.5,1.5);scene.add(sun);
const mat=c=>new T.MeshStandardMaterial({color:c,metalness:.3,roughness:.4});
function cyl(r,h,c){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,24),mat(c));o.rotation.x=Math.PI/2;return o}
function roundedPost(r,h,c){const o=new T.Mesh(new T.CapsuleGeometry(r,h-2*r,6,16),mat(c));o.rotation.x=Math.PI/2;return o}
function rod(a,b,r){a=new T.Vector3(...a);b=new T.Vector3(...b);const o=new T.Mesh(new T.CapsuleGeometry(r,a.distanceTo(b),4,12),mat(0xc3cbd1));o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return o}
const handle=new T.Group();handle.add(cyl(.012,.08,0x334f59));
// Hollow polygonal tube: identical wall dimensions to the collision asset.
for(let i=0;i<16;i++){const a=(i+.5)*2*Math.PI/16,ri=.0025,ro=.0033,rc=(ri+ro)/2;
 const wall=new T.Mesh(new T.BoxGeometry(ro-ri,2*ro*Math.tan(Math.PI/16),.055),mat(0x9ca8b0));wall.position.set(rc*Math.cos(a),rc*Math.sin(a),-.0675);wall.rotation.z=a;handle.add(wall)}
const stripe=new T.Mesh(new T.BoxGeometry(.002,.002,.06),mat(0xe0b85c));stripe.position.y=-.012;handle.add(stripe);scene.add(handle);
const button=new T.Group();const stem=cyl(.0025,.020,0xb0b8bf);stem.position.z=.048;button.add(stem);const cap=cyl(.009,.004,0xc23d20);cap.position.z=.058;button.add(cap);scene.add(button);
const carriage=new T.Group();const carrierRod=cyl(.0006,.043,0xb0b8bf);carrierRod.position.z=-.0615;carriage.add(carrierRod);const carrierHub=cyl(.00145,.0006,0xb0b8bf);carrierHub.position.z=-.0828;carriage.add(carrierHub);scene.add(carriage);
const claws=[];for(let i=0;i<4;i++){const g=new T.Group();g.add(rod([0,0,0],[0,0,-.011],.00025));g.add(rod([0,0,-.011],[-.0013,0,-.011],.00025));claws.push(g);scene.add(g)}
const driverHandle=new T.Group();driverHandle.add(cyl(.012,.08,0x3f525f));const marker=new T.Mesh(new T.BoxGeometry(.002,.002,.06),mat(0xe0b85c));marker.position.y=-.012;driverHandle.add(marker);scene.add(driverHandle);
const bit=new T.Group();const shaft=cyl(.0016,.05,0xb0b9c0);shaft.position.z=-.065;bit.add(shaft);const hex=new T.Mesh(new T.CylinderGeometry(.00190/Math.sqrt(3),.00190/Math.sqrt(3),.007,6),mat(0x69757b));hex.rotation.x=Math.PI/2;hex.position.z=-.0915;bit.add(hex);const spindleMark=new T.Mesh(new T.BoxGeometry(.0003,.0003,.02),mat(0xffc247));spindleMark.position.set(.0016,0,-.065);bit.add(spindleMark);scene.add(bit);
const screws=[];
const table=new T.Mesh(new T.BoxGeometry(.475,.4,.53),mat(0xb5c3ca));table.position.z=.265;scene.add(table);const fixtures=new T.Group();scene.add(fixtures);const grid=new T.GridHelper(2,20);grid.rotation.x=Math.PI/2;grid.position.z=.001;scene.add(grid);
const loader=new GLTFLoader();
const load=url=>new Promise((resolve,reject)=>loader.load(url,g=>resolve(g.scene),undefined,reject));
let manifest,chapters,robot,parts,cover,base,current,activeChapter=-1,bindings=[];
let t=0,last=0,playing=false,follow=null,viewScale=1;
let inTransition=false,transitionCamera=null,robotOpacity=1;
const robotMaterials=[];
const grabberObjects=[handle,button,carriage,...claws];
const nextPosition=new T.Vector3(),nextQuaternion=new T.Quaternion();
function pose(obj,p,next=p,blend=0){
 obj.position.fromArray(p).lerp(nextPosition.fromArray(next),blend);
 obj.quaternion.fromArray(p,3).normalize().slerp(nextQuaternion.fromArray(next,3).normalize(),blend);
}
let renderQueued=false;
function render(){
 if(renderQueued)return;renderQueued=true;
 requestAnimationFrame(()=>{renderQueued=false;renderer.render(scene,camera)});
}
function fitPreset(){camera.position.sub(controls.target).multiplyScalar(viewScale).add(controls.target);controls.update()}
new ResizeObserver(()=>{
 renderer.setSize(view.clientWidth,view.clientHeight);camera.aspect=view.clientWidth/view.clientHeight;
 const scale=Math.max(1,1.5/camera.aspect);
 camera.position.sub(controls.target).multiplyScalar(scale/viewScale).add(controls.target);viewScale=scale;
 camera.updateProjectionMatrix();controls.update();render();
}).observe(view);
controls.addEventListener('change',render);controls.addEventListener('start',()=>{follow=null;transitionCamera=null});
function look(target,offset){controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(...offset));fitPreset()}
function whole(){follow=null;look(new T.Vector3(0,.2,.65),[1.2,-1.7,.7])}
function assembly(){follow=null;look(new T.Vector3(.015,.055,.59),[-.285,-.435,.33])}
function close(){follow=null;look((current?.tool==='driver'?driverHandle:handle).position,[.20,-.25,.12])}
function selectedScrew(){return Number($('screw').value)}
function socket(){follow=null;const v=new T.Vector3(...chapters[1].layout.seats[selectedScrew()]);v.z+=.0022;look(v,[.012,-.025,.018])}
function fixture(obj,x,y,z){obj.position.set(x,y,z);fixtures.add(obj)}
function bodyObject(label){
 const n=label.split('/').at(-1);
 if(label.includes('/Robot/'))return robot.getObjectByName(n);
 if(label.includes('/Driver/'))return n==='Handle'?driverHandle:n==='Bit'?bit:null;
 if(n==='Cover')return cover;
 if(n==='Screw')return screws[Number(label.match(/Screw(\d+)/)[1])];
 return n==='Handle'?handle:n==='Button'?button:n==='Carriage'?carriage:n.startsWith('Claw')?claws[Number(n.slice(4))]:null;
}
function buildSharedSet(){
 // Presentation context only: use the mechanical assembly's parked tools,
 // rack and stands in both clips. The unused legacy driver is never drawn.
 // Keep the empty cover supports after pickup. No recorded pose is rewritten.
 const layout=chapters[1].layout,b=layout.assembly_base;
 base.position.copy(parts.getObjectByName('base').position).add(new T.Vector3(...b));
 base.quaternion.copy(parts.getObjectByName('base').quaternion);
 for(const xy of [[-.0264225,-.015437],[-.0264225,.015437],[.0264225,-.015437],[.0264225,.013037]])fixture(cyl(.001,.02,0x496b78),b[0]+xy[0],b[1]+xy[1],b[2]-.01);
 const c=chapters[0].layout.cover_source;
 for(const xy of [[-.0231871744,-.012037],[-.0231871744,.012037],[.0231871744,-.012037],[.0231871744,.012037]])fixture(cyl(.001,.02,0x496b78),c[0]+xy[0],c[1]+xy[1],c[2]-.0101);
 for(const p of [layout.tool_position,layout.driver_position]){
  const z=p[2]-.04;
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,r=layout.tool_support_radius_m;
   fixture((layout.tool_support_rounded?roundedPost:cyl)(.0015,z-.53,0x315563),p[0]+r*Math.cos(a),p[1]+r*Math.sin(a),(.53+z)/2);
  }
 }
 for(const c of layout.sources){
  const bottom=c[2]-.003175,top=c[2]-.0025,inner=.0013,outer=.0025;
  fixture(cyl(.004,bottom-.53,0x496b78),c[0],c[1],(.53+bottom)/2);
  for(const [xy,wh] of [[[ -(inner+outer)/2,0],[outer-inner,2*outer]],[[ (inner+outer)/2,0],[outer-inner,2*outer]],[[0,-(inner+outer)/2],[2*inner,outer-inner]],[[0,(inner+outer)/2],[2*inner,outer-inner]]])fixture(new T.Mesh(new T.BoxGeometry(...wh,top-bottom),mat(0x496b78)),c[0]+xy[0],c[1]+xy[1],(bottom+top)/2);
 }
 const materials=new Map();
 robot.traverse(obj=>{
  if(!obj.isMesh)return;
  const clone=original=>{
   if(!materials.has(original)){
    const material=original.clone();materials.set(original,material);
    robotMaterials.push({material,opacity:original.opacity,transparent:original.transparent,depthWrite:original.depthWrite});
   }
   return materials.get(original);
  };
  obj.material=Array.isArray(obj.material)?obj.material.map(clone):clone(obj.material);
 });
}
function parkedContext(){
 const d=chapters[1],f=d.frames[0];
 d.body_labels.forEach((label,i)=>{
  if(label.includes('/Robot/'))return;
  const obj=bodyObject(label);if(obj)pose(obj,f.poses[i]);
 });
}
function setChapter(index){
 activeChapter=index;const d=chapters[index];follow=null;
 if(index===0)parkedContext();
 else{
  cover.position.copy(parts.getObjectByName('cover').position).add(new T.Vector3(...chapters[1].layout.assembly_base));
  cover.quaternion.copy(parts.getObjectByName('cover').quaternion);
 }
 bindings=d.body_labels.map(label=>{
  // Only the hand/arm and cover are active in the first recording. Other
  // visible objects are the shared presentation set, not legacy physics data.
  if(index===0&&!label.includes('/Robot/')&&!label.endsWith('/Cover'))return null;
  return bodyObject(label);
 });
 d.body_labels.forEach((label,i)=>{
  const required=index===0?/\/Robot\/|\/Cover$/:/\/Robot\/|\/Driver\/|\/Grabber\/|\/Cover$|\/Screw\d+\/Screw$/;
  if(required.test(label)&&!bindings[i])throw Error('Missing scene object: '+label);
 });
 $('chapter').textContent=index===0?'Stage 1 · Cover pickup, alignment and release':'Stage 2 · Mechanical screw placement → Tool change → Powered rotation';
}
function robotFade(amount){
 robotOpacity=amount;robot.visible=amount>0.001;
 for(const entry of robotMaterials){
  const m=entry.material,transparent=amount<.999||entry.transparent;
  if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true}
  m.opacity=entry.opacity*amount;m.depthWrite=entry.depthWrite&&amount>=.999;
 }
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
function showTransition(u){
 // Dissolve the empty robot between two real poses; do not interpolate links
 // or suggest that an unvalidated arm trajectory was simulated.
 if(u>=.5){
  const d=chapters[1],f=d.frames[0];
  d.body_labels.forEach((label,i)=>{if(label.includes('/Robot/'))pose(bodyObject(label),f.poses[i])});
 }
 robotFade(u<.5?1-smooth(2*u):smooth(2*u-1));
 if(transitionCamera){
  const w=smooth(u);
  camera.position.copy(transitionCamera.position).lerp(transitionCamera.endPosition,w);
  controls.target.copy(transitionCamera.target).lerp(transitionCamera.endTarget,w);controls.update();
 }
}
function seek(time){
 if(!chapters)return;t=Math.max(0,Math.min(time,manifest.duration_seconds));
 const transition=t>manifest.chapters[0].duration_seconds&&t<manifest.chapters[1].offset_seconds;
 const index=t>=manifest.chapters[1].offset_seconds?1:0;
 if(transition&&!inTransition){
  if(follow){
   const target=new T.Vector3(.015,.055,.59);
   transitionCamera={position:camera.position.clone(),target:controls.target.clone(),endTarget:target,
    endPosition:target.clone().add(new T.Vector3(-.285,-.435,.33).multiplyScalar(viewScale))};
  }
  follow=null;
 }
 if(!transition&&inTransition){
  if(transitionCamera&&index===1){camera.position.copy(transitionCamera.endPosition);controls.target.copy(transitionCamera.endTarget);controls.update()}
  transitionCamera=null;
 }
 inTransition=transition;
 if(index!==activeChapter)setChapter(index);
 const d=chapters[index],local=Math.min(t-manifest.chapters[index].offset_seconds,d.frames.at(-1).time);
 let lo=0,hi=d.frames.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(d.frames[mid].time<=local)lo=mid;else hi=mid-1}
 const f=d.frames[lo],next=d.frames[Math.min(lo+1,d.frames.length-1)];
 const blend=next.time>f.time?(local-f.time)/(next.time-f.time):0;current=f;
 bindings.forEach((obj,i)=>{if(obj)pose(obj,f.poses[i],next.poses[i],blend)});
 $('transition').hidden=!transition;
 $('metrics').hidden=transition;
 if(transition)showTransition((t-manifest.chapters[0].duration_seconds)/manifest.transition_seconds);else robotFade(1);
 if(follow==='cover')look(cover.position.clone().add(new T.Vector3(0,0,.015)),[.12,-.18,.09]);
 if(follow==='screw')look(screws[f.active_screw].position.clone().add(new T.Vector3(0,0,.003)),[.025,-.045,.025]);
 const placed=f.placed||[],driven=f.driven||[];
 if(index===0){
  $('metrics').innerHTML=`<b>Place the cover</b><br>${f.phase.replaceAll('_',' ')}<br>Hand–cover contact: ${(f.cover_N||0).toFixed(2)} N`;
 }else{
  const rotation=Math.abs(f.driver_angle||0)/(2*Math.PI);
  $('metrics').innerHTML=`<b>${f.phase==='complete'?'Assembly complete':f.phase.replaceAll('_',' ')}</b><br>Placed ${placed.length}/11 · Driven ${driven.length}/11${f.phase==='complete'?'':' · Screw '+(f.active_screw+1)}<br>Hand grip: ${(f.grip_N||0).toFixed(2)} N${f.tool==='driver'?'<br>Screw rotation: '+rotation.toFixed(2)+' turns':`<br>Hooks beneath head: ${f.underhead_count??0} / 4<br>Thumb–button force: ${(f.button_N||0).toFixed(2)} N`}`;
 }
 for(const node of $('progress').children){
  const id=Number(node.dataset.id);node.className=driven.includes(id)?'done':index===1&&f.active_screw===id?'active':placed.includes(id)?'placed':'';
  node.title=driven.includes(id)?'Driven':placed.includes(id)?'Placed':'On pickup rack';
 }
 $('seek').value=t;$('clock').textContent=t.toFixed(1)+' / '+manifest.duration_seconds.toFixed(1)+' replay s';render();
}
function setPlaying(value){playing=value;last=performance.now();$('play').textContent=playing?'Pause':'Play'}
function jump(index,phase,byScrew=false){
 const f=chapters[index].frames.find(f=>f.phase===phase&&(!byScrew||f.active_screw===selectedScrew()));
 if(!f)throw Error('Stage unavailable: '+phase);
 seek(manifest.chapters[index].offset_seconds+f.time);setPlaying(true);
 if(index===0){follow='cover';seek(t)}
 else if(byScrew){follow='screw';seek(t)}
 else close();
}
async function recording(meta){
 const r=await fetch(meta.file+'?v='+meta.sha256.slice(0,12));
 if(!r.ok)throw Error('The recording could not be loaded. Please reload the page.');
 const decoded=decodeRecording(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json());
 if(decoded.frames.length!==meta.frames)throw Error('Incomplete recording');
 return decoded;
}
function tick(now){
 if(playing){seek(t+(now-last)/1000*Number($('speed').value));if(t>=manifest.duration_seconds)setPlaying(false)}
 last=now;requestAnimationFrame(tick);
}
document.querySelectorAll('button,select,input').forEach(n=>n.disabled=true);
try{
 if(!('DecompressionStream' in window))throw Error('Please use a current Chrome, Edge, Firefox or Safari browser.');
 const response=await fetch('data/recording.json?v=shared-scene-3');if(!response.ok)throw Error('Recording index unavailable');manifest=await response.json();
 if(manifest.format!=='assembly-chapters-v2')throw Error('Please refresh this page to load the updated demo.');
 [robot,parts,chapters]=await Promise.all([load('../replay/assets/robot.glb'),load('assets/assembly.glb'),Promise.all(manifest.chapters.map(recording))]);
 scene.add(robot);base=parts.getObjectByName('base').clone();cover=parts.getObjectByName('cover').clone();scene.add(base,cover);
 const screw=parts.getObjectByName('screw_01');
 for(let i=0;i<11;i++){const o=screw.clone();screws.push(o);scene.add(o)}
 buildSharedSet();
 for(const id of manifest.requested_order){
  $('screw').add(new Option('Screw '+(id+1),id));
  const b=document.createElement('button');b.textContent=id+1;b.dataset.id=id;b.onclick=()=>{$('screw').value=id;jump(1,'close_claws',true)};$('progress').append(b);
 }
 for(const [id,index,phase] of [['coverPickup',0,'cover_grip'],['coverCarry',0,'cover_transport'],['coverRelease',0,'cover_release'],['toolPickup',1,'grasp'],['changeTool',1,'return_grabber'],['driverPickup',1,'driver_grasp']])$(id).onclick=()=>{jump(index,phase);if(id==='changeTool')assembly()};
 for(const [id,phase] of [['picking','close_claws'],['carrying','carry'],['releasing','open_claws'],['driving','driver_drive']])$(id).onclick=()=>jump(1,phase,true);
 $('whole').onclick=whole;$('assembly').onclick=assembly;$('close').onclick=close;$('socket').onclick=socket;
 $('pickup').onclick=()=>{follow=activeChapter===0?'cover':'screw';seek(t)};
 $('finishing').onclick=()=>{setPlaying(false);follow=null;seek(manifest.duration_seconds);look(new T.Vector3(...chapters[1].layout.assembly_base).add(new T.Vector3(0,0,.003)),[-.085,-.12,.105])};
 $('seek').max=manifest.duration_seconds;$('seek').oninput=e=>seek(Number(e.target.value));
 $('play').onclick=()=>{if(t>=manifest.duration_seconds)seek(0);setPlaying(!playing)};
 $('reset').onclick=()=>{setPlaying(false);seek(0);assembly()};
 $('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('shareStatus').textContent='Link copied'}catch{$('shareStatus').textContent='Copy the page address from your browser to share this demo.'}};
 seek(0);assembly();document.querySelectorAll('button,select,input').forEach(n=>n.disabled=false);
 window.assemblyDemo={scene,camera,renderer,manifest,chapters,frame:()=>current,chapter:()=>activeChapter,time:()=>t,seek,setPlaying,cover,base,bindings:()=>bindings,robot,robotOpacity:()=>robotOpacity,target:()=>controls.target.clone(),
  sharedProps:()=>[...grabberObjects,driverHandle,bit,...screws,base,...fixtures.children]};
 requestAnimationFrame(tick);
}catch(e){$('error').textContent=e.message;console.error(e)}
