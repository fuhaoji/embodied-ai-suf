import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {OrbitControls} from './vendor/OrbitControls.js';

const query=new URLSearchParams(location.search), taskId=query.get('task');
if(!taskId)location.replace('../#trajectories');
if(taskId && !/^[a-z0-9_]+__[a-z0-9_]+__[a-z0-9_]+$/.test(taskId))throw Error('Invalid task');
const policies=['023'];
if(query.has('record'))document.body.classList.add('recording');
document.querySelector('#back').href='../#task='+encodeURIComponent(taskId||'');
async function trajectory(){
 const response=await fetch('../data/gallery.json');if(!response.ok)throw Error('Unable to load collection');
 const manifest=await response.json(), entry=manifest.cases.find(c=>c.id===taskId);
 if(!entry)throw Error('Unknown task. Return to the gallery to choose a trajectory.');
 const result=await fetch('../'+entry.trajectory);if(!result.ok)throw Error('Unable to load trajectory');
 let bytes=new Uint8Array(await result.arrayBuffer());
 if(bytes[0]===31&&bytes[1]===139){
  if(!('DecompressionStream' in window))throw Error('Please use a recent browser for 3D replay, or return to the gallery to watch the video.');
  bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 }
 return JSON.parse(new TextDecoder().decode(bytes));
}
const panels=[], loader=new GLTFLoader();
let current=0, duration=0, playing=false, previous=performance.now();
const load=url=>new Promise((yes,no)=>loader.load(url,g=>yes(g.scene),undefined,no));
function pose(node,p){node.position.fromArray(p);node.quaternion.fromArray(p,3);}
function makeLine(points,color,opacity=1){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p.slice(0,3)))),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));}

async function addPanel(policy){
  const data=await trajectory();
  const element=document.createElement('section');element.className='panel';
  element.innerHTML='<div class="view"></div><div class="metrics"></div>';
  document.querySelector('#panels').append(element);
  const view=element.querySelector('.view');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(view.clientWidth,view.clientHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  view.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8edf2');
  const camera=new THREE.PerspectiveCamera(38,view.clientWidth/view.clientHeight,.01,30);camera.up.set(0,0,1);
  camera.position.set(1.15,-1.4,1.3);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.3,.57);controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff,0x6a7887,2.1));
  const sun=new THREE.DirectionalLight(0xffffff,2.6);sun.position.set(1.5,-.7,3);sun.castShadow=true;
  sun.shadow.mapSize.set(taskId?512:1024,taskId?512:1024);sun.shadow.camera.left=-1.2;sun.shadow.camera.right=1.2;sun.shadow.camera.top=1.2;sun.shadow.camera.bottom=-1.2;sun.shadow.bias=-.0005;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshStandardMaterial({color:0xcbd4dd,roughness:.95}));ground.position.z=-.005;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(4,40,0x9faebd,0xbfcad4);grid.rotation.x=Math.PI/2;grid.position.z=-.003;scene.add(grid);
  const table=new THREE.Mesh(new THREE.BoxGeometry(.475,.4,.3),new THREE.MeshStandardMaterial({color:0xc9a77f,roughness:.85}));pose(table,data.table_pose);table.castShadow=true;table.receiveShadow=true;scene.add(table);
  const [robot,brush,hulls]=await Promise.all([load('assets/robot.glb'),load(taskId?`assets/tools/${data.object_name}.glb`:'assets/brush.glb'),load(taskId?`assets/tools/${data.object_name}-collision.glb`:'assets/brush_collision.glb')]);
  const bodies=data.body_names.map(name=>{const node=robot.getObjectByName(name);if(!node)throw Error('Missing robot body '+name);return node;});
  robot.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});scene.add(robot);
  brush.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.material.side=THREE.DoubleSide;}});scene.add(brush);
  const goal=brush.clone(true);goal.traverse(n=>{if(n.isMesh){n.material=new THREE.MeshBasicMaterial({color:0x04a16f,transparent:true,opacity:.23,depthWrite:false});n.castShadow=false;n.receiveShadow=false;}});scene.add(goal);
  let k=0;hulls.traverse(n=>{if(n.isMesh){n.material=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL((k++*.137)%1,.65,.5),roughness:.8});n.castShadow=true;}});hulls.visible=false;scene.add(hulls);
  scene.add(makeLine(data.waypoints,0x00a6c1,.9));
  const keypoints=new THREE.Group(), objects=[], targets=[];
  for(let i=0;i<4;i++){
    const a=new THREE.Mesh(new THREE.SphereGeometry(.004,10,8),new THREE.MeshBasicMaterial({color:0xf18b23}));
    const b=new THREE.Mesh(new THREE.SphereGeometry(.004,10,8),new THREE.MeshBasicMaterial({color:0x009761}));
    objects.push(a);targets.push(b);keypoints.add(a,b);
  }
  scene.add(keypoints);
  const panel={policy,data,element,view,renderer,scene,camera,controls,bodies,brush,goal,hulls,keypoints,objects,targets};panels.push(panel);
  duration=Math.max(duration,data.frames.at(-1).time);
  controls.addEventListener('change',()=>renderer.render(scene,camera));
  new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);}).observe(view);
}

function seek(t){
  current=Math.max(0,Math.min(t,duration));
  for(const p of panels){
    const {data}=p;let index=0;
    while(index+1<data.frames.length && data.frames[index+1].time<=current+1e-6)index++;
    const frame=data.frames[index];
    p.bodies.forEach((body,i)=>pose(body,frame.robot[i]));pose(p.brush,frame.object);pose(p.goal,frame.goal);pose(p.hulls,frame.object);
    p.objects.forEach((node,i)=>node.position.fromArray(frame.object_keypoints[i]));p.targets.forEach((node,i)=>node.position.fromArray(frame.goal_keypoints[i]));
    const finished=current>=data.frames.at(-1).time;
    const pct=100*frame.successes/data.total_waypoints;
    p.element.querySelector('.metrics').innerHTML=`<strong>${frame.successes} / ${data.total_waypoints} waypoints · ${pct.toFixed(1)}%</strong><br>Max keypoint gap: ${(frame.keypoint_distance*100).toFixed(1)} cm · threshold: 1.5 cm${finished?'<br><b>Episode ended: '+(data.episode.full_trajectory?'completed in '+data.episode.simulated_seconds.toFixed(1)+' s':data.episode.object_below_floor?'object fell':data.episode.timeout?'no progress for 10 s':'terminated')+'</b>':''}`;
    p.renderer.render(p.scene,p.camera);
  }
  document.querySelector('#time').textContent=current.toFixed(2)+' s';document.querySelector('#seek').value=current;
  window.replayTime=current;
}
document.querySelector('#play').onclick=()=>{if(current>=duration)seek(0);playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play';};
document.querySelector('#seek').oninput=e=>{playing=false;document.querySelector('#play').textContent='Play';seek(Number(e.target.value));};
document.querySelector('#hulls').onchange=e=>{for(const p of panels){p.hulls.visible=e.target.checked;p.brush.visible=!e.target.checked;}seek(current);};
document.querySelector('#points').onchange=e=>{for(const p of panels)p.keypoints.visible=e.target.checked;seek(current);};
function animate(now){if(playing){seek(current+Math.min((now-previous)/1000,.1));if(current>=duration){playing=false;document.querySelector('#play').textContent='Play';}}previous=now;requestAnimationFrame(animate);}
try{
  for(const policy of policies)await addPanel(policy);
  if(taskId)document.querySelector('header h1').textContent=`DexToolBench · ${panels[0].data.object_name.replaceAll('_',' ')} / ${panels[0].data.task.replaceAll('_',' ')}`;
  document.querySelector('header p').textContent='Simulated tool use · Drag to orbit · Scroll to zoom';
  document.querySelector('#seek').max=duration;
  seek(0);window.replay={seek,duration,panels,ready:true};requestAnimationFrame(animate);
}catch(error){document.querySelector('#error').textContent=error.message;throw error;}
