// Browser checks at the actual GitHub Pages subpath, including chapter cuts,
// raw-pose binding, every screw's stages, mobile layout and iframe playback.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(__dirname,'..'),prefix='/embodied-ai-suf/demo/';
const artifacts=process.env.ARTIFACT_DIR||'/tmp/assembly-site-check';
fs.mkdirSync(artifacts,{recursive:true});
const assert=(v,m)=>{if(!v)throw Error(m)};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary','.png':'image/png','.gz':'application/gzip'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/embedded'){
  res.writeHead(200,{'Content-Type':'text/html'}).end(`<iframe title="Assembly replay" width="1400" height="1000" sandbox="allow-scripts allow-same-origin" src="http://localhost:${server.address().port}${prefix}assembly/"></iframe>`);return;
 }
 if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return}
 let file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length)));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,base=origin+prefix;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],failed=[];
 page.setDefaultTimeout(90000);
 page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE_ERROR',String(e))});page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+':'+r.status())});
 await page.goto(base);await page.waitForSelector('#cards .card');assert(await page.locator('#cards .card').count()===24,'Existing gallery changed');
 assert(await page.locator('a[href="assembly/"]').count()>=1,'Missing assembly entry');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Gallery mobile overflow');
 await page.setViewportSize({width:1280,height:960});await page.goto(base+'assembly/');
 await page.waitForFunction(()=>window.assemblyDemo||document.querySelector('#error')?.textContent,null,{timeout:120000});
 assert(await page.evaluate(()=>!!window.assemblyDemo),await page.locator('#error').textContent());
 const info=await page.evaluate(()=>({frames:assemblyDemo.chapters.map(d=>d.frames.length),cut:assemblyDemo.manifest.chapters[1].offset_seconds}));
 assert(info.frames[0]>1200&&info.frames[1]>31000,'Incomplete recordings');
 await page.selectOption('#speed','1');
 async function jump(button,phase,index){
  await page.evaluate(button=>{document.getElementById(button).click();assemblyDemo.setPlaying(false)},button);
  const result=await page.evaluate(()=>({phase:assemblyDemo.frame().phase,index:assemblyDemo.chapter()}));
  assert(result.phase===phase&&result.index===index,'Stage '+button+':'+JSON.stringify(result));
 }
 await jump('coverPickup','cover_grip',0);await page.screenshot({path:path.join(artifacts,'cover-pickup.png')});
 await jump('coverCarry','cover_transport',0);await page.click('#assembly');
 await page.evaluate(()=>{document.getElementById('metrics').style.visibility='hidden';document.querySelector('.orbit-hint').style.visibility='hidden'});
 await page.locator('canvas').screenshot({path:path.join(root,'assembly/assets/preview.png')});
 await page.evaluate(()=>{document.getElementById('metrics').style.visibility='';document.querySelector('.orbit-hint').style.visibility=''});
 await jump('coverRelease','cover_release',0);await page.screenshot({path:path.join(artifacts,'cover-release.png')});
 await page.evaluate(()=>assemblyDemo.seek(assemblyDemo.manifest.chapters[0].duration_seconds));
 assert(await page.evaluate(()=>Math.abs(assemblyDemo.cover.position.z-.5517272)<.0002),'Cover not physically seated');
 // A manually selected camera must stay put through the transition. Tools,
 // screws, stands, table supports and base must retain identities and poses.
 await page.click('#assembly');
 const shared=await page.evaluate(()=>{
  const d=assemblyDemo,start=d.manifest.chapters[0].duration_seconds,span=d.manifest.transition_seconds;
  const snapshot=()=>d.sharedProps().map(o=>({uuid:o.uuid,visible:o.visible,p:o.position.toArray(),q:o.quaternion.toArray()}));
  d.seek(0);const reference=snapshot(),camera=d.camera.position.toArray(),target=d.target().toArray();
  const points=[0,10.6,37.35,start,start+span*.25,start+span*.5,start+span*.75,start+span];
  const records=points.map(time=>{d.seek(time);return {time,props:snapshot(),camera:d.camera.position.toArray(),target:d.target().toArray(),opacity:d.robotOpacity()}});
  return {reference,camera,target,records};
 });
 for(const frame of shared.records){
  assert(JSON.stringify(frame.props)===JSON.stringify(shared.reference),'Tool or fixture changed at '+frame.time);
  assert(JSON.stringify(frame.camera)===JSON.stringify(shared.camera)&&JSON.stringify(frame.target)===JSON.stringify(shared.target),'Camera jumped at '+frame.time);
 }
 assert(shared.records[5].opacity===0,'Robot must be invisible at the recorded-pose switch');
 assert(shared.records[4].opacity===.5&&shared.records[6].opacity===.5,'Missing robot dissolve');
 // Only the cover/robot bindings are driven by the cover recording; tools use
 // the parked mechanical scene. Active screw-stage poses are checked below.
 await jump('coverRelease','cover_release',0);
 const start=await page.evaluate(()=>assemblyDemo.manifest.chapters[0].duration_seconds);
 await page.evaluate(t=>assemblyDemo.seek(t),start+.75);
 assert(await page.locator('#transition').isVisible(),'Replay dissolve not identified');
 assert(await page.evaluate(()=>assemblyDemo.renderer.domElement.offsetHeight>300),'Scene hidden by transition');
 await page.screenshot({path:path.join(artifacts,'transition.png')});
 await page.evaluate(()=>{assemblyDemo.seek(assemblyDemo.manifest.chapters[1].offset_seconds-.05);assemblyDemo.setPlaying(true)});
 await page.waitForFunction(()=>assemblyDemo.chapter()===1);await page.evaluate(()=>assemblyDemo.setPlaying(false));
 assert(await page.locator('#transition').isHidden(),'Transition obscures second stage');
 assert(await page.evaluate(()=>Math.abs(assemblyDemo.camera.position.x+.27)<.00001),'Cover-follow camera did not ease to assembly view');
 // Rewinding after driving restores both parked tools, all screws and robot opacity.
 await page.evaluate(()=>{assemblyDemo.seek(assemblyDemo.manifest.duration_seconds);assemblyDemo.seek(0)});
 assert(await page.evaluate(()=>assemblyDemo.robotOpacity()===1),'Rewind left the robot faded');
 const rewind=await page.evaluate(()=>assemblyDemo.sharedProps().map(o=>({uuid:o.uuid,visible:o.visible,p:o.position.toArray(),q:o.quaternion.toArray()})));
 assert(JSON.stringify(rewind)===JSON.stringify(shared.reference),'Rewind left stale scene objects');
 await jump('toolPickup','grasp',1);await page.screenshot({path:path.join(artifacts,'grabber-pickup.png')});
 const order=await page.evaluate(()=>assemblyDemo.manifest.requested_order);
 for(const id of order){
  await page.selectOption('#screw',String(id));
  for(const [button,phase] of [['picking','close_claws'],['carrying','carry'],['releasing','open_claws'],['driving','driver_drive']]){
   await jump(button,phase,1);
   const state=await page.evaluate(()=>{
    const d=assemblyDemo,f=d.frame();let maxError=0;
    d.bindings().forEach((obj,i)=>{if(obj)maxError=Math.max(maxError,obj.position.distanceTo({x:f.poses[i][0],y:f.poses[i][1],z:f.poses[i][2]}))});
    return {screw:f.active_screw,error:maxError};
   });
   assert(state.screw===id&&state.error<1e-8,'Wrong screw or rendered pose');
  }
 }
 console.log('All 44 per-screw stage and raw-pose checks passed');
 await page.selectOption('#screw',String(order[0]));
 await jump('carrying','carry',1);await page.screenshot({path:path.join(artifacts,'underhead-carry.png')});
 await jump('releasing','open_claws',1);await page.screenshot({path:path.join(artifacts,'screw-release.png')});
 await jump('changeTool','return_grabber',1);await page.screenshot({path:path.join(artifacts,'tool-change.png')});
 await jump('driverPickup','driver_grasp',1);
 await page.click('#finishing');
 assert(await page.evaluate(()=>assemblyDemo.frame().driven.length===11&&assemblyDemo.frame().placed.length===11),'Not all screws complete');
 await page.screenshot({path:path.join(artifacts,'desktop-complete.png')});
 await page.click('#reset');assert(await page.evaluate(()=>assemblyDemo.chapter()===0),'Restart did not restore cover scene');
 await page.click('#play');await page.waitForFunction(()=>assemblyDemo.frame().time>.1);await page.click('#play');
 await page.click('#copyLink');assert((await page.locator('#shareStatus').textContent()).length>0,'Share feedback missing');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Assembly mobile overflow');
 await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
 await page.goto(origin+'/embedded');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow);
 let frame;for(let i=0;i<100;i++){frame=page.frames().find(f=>f.url().includes(prefix+'assembly/'));if(frame)break;await page.waitForTimeout(100)}
 assert(frame,'Missing embedded frame');await frame.waitForFunction(()=>window.assemblyDemo,null,{timeout:120000});
 await frame.click('#coverRelease');await frame.evaluate(()=>assemblyDemo.setPlaying(false));assert(await frame.evaluate(()=>assemblyDemo.frame().phase==='cover_release'),'Embedded cover control failed');
 await frame.click('#releasing');await frame.evaluate(()=>assemblyDemo.setPlaying(false));assert(await frame.evaluate(()=>assemblyDemo.frame().phase==='open_claws'),'Embedded screw control failed');
 assert(errors.length===0,errors.join('\n'));assert(failed.length===0,failed.join('\n'));
 const report={passed:true,prefix,frames:info.frames,screws:order.length,shared_scene:true,stable_parked_tools_and_fixtures:true,no_camera_jump:true,robot_dissolve:true,rewind_consistent:true,all_release_controls:true,existing_gallery:true,mobile:true,embedded:true,playback:true,share:true,errors,failed};
 fs.writeFileSync(path.join(artifacts,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
