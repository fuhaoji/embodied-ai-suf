// npm install --no-save playwright; npx playwright install chromium
// node tools/check_browser.cjs
// Test under the GitHub Pages project prefix, including codec fallback and 3D.
const fs=require('fs'), path=require('path'), http=require('http');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(__dirname,'..'), prefix='/embodied-ai-suf/demo/';
const artifacts=process.env.ARTIFACT_DIR||'/tmp/embodied-ai-site-check';
fs.mkdirSync(artifacts,{recursive:true});
const assert=(value,message)=>{if(!value)throw Error(message);};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm','.gz':'application/gzip'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/embed'){
  res.writeHead(200,{'Content-Type':'text/html'});res.end(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src *; style-src 'unsafe-inline';"></head><body style="margin:0"><iframe title="VS Code preview" style="width:100vw;height:100vh;border:0" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads" src="${prefix}"></iframe></body></html>`);return;
 }
 if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 let file=path.resolve(root,pathname.slice(prefix.length));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const size=fs.statSync(file).size, range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
 const start=range?Number(range[1]):0, end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
 const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1};
 if(range)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}
 if(!size){res.end();return;}fs.createReadStream(file,{start,end}).pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`, url=base+prefix;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const errors=[], cases=JSON.parse(fs.readFileSync(path.join(root,'data/gallery.json'))).cases, played=[], replays=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url);await page.waitForSelector('#cards .card button');
  assert(await page.locator('#cards .card').count()===24,'Missing task cards');
  assert(await page.locator('#benchmark').count()===0,'Unwanted checkpoint comparison');
  assert(!/checkpoint|Experiment 023|seed 90011/i.test(await page.locator('body').textContent()),'Unwanted source labels');
  for(const family of [...new Set(cases.map(c=>c.category))]){
   await page.selectOption('#filter',family);assert(await page.locator('#cards .card').count()===4,'Filter '+family);
  }
  await page.selectOption('#filter','all');await page.fill('#search','vertical');
  assert(await page.locator('#cards .card').count()===2,'Search');
  await page.fill('#search','no such tool');assert(await page.locator('#empty').isVisible(),'No-results state');
  await page.fill('#search','');
  for(const c of cases){
   await page.locator(`[data-task="${c.id}"] button`).click();
   await page.waitForFunction(id=>document.querySelector('video').dataset.task===id,c.id);
   await page.waitForFunction(()=>document.querySelector('video').currentTime>.1);
   const result=await page.evaluate(()=>{const v=document.querySelector('video');return{codec:v.dataset.codec,width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error?.message};});
   assert(result.width===960&&result.height===720&&!result.error,'Decoded video '+c.id);
   assert(Math.abs(result.duration-c.duration-1.1)<.15,'Video duration '+c.id);
   await page.evaluate(()=>{const v=document.querySelector('video');v.pause();v.currentTime=v.duration-.5;});
   await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.seeking&&v.currentTime>v.duration-.7;});
   played.push({id:c.id,...result});
  }
  await page.goto(url+'#task='+cases[0].id);await page.waitForFunction(()=>document.querySelector('video').dataset.task);
  await page.click('#copy-link');
  assert((await page.locator('#copy-status').textContent()).length>0,'Copy link');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>scrollY===0);await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:false});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:false});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
  for(const id of ['brush__blue_brush__sweep_forward','screwdriver__short_screwdriver__spin_vertical','spatula__spoon_spatula__serve_plate']){
   await page.setViewportSize({width:1280,height:900});await page.goto(url+'replay/?task='+id);
   await page.waitForFunction(()=>window.replay?.ready,null,{timeout:120000});
   const result=await page.evaluate(()=>{replay.seek(replay.duration);const d=replay.panels[0].data;return{frame:d.transitions,total:d.total_waypoints,final:d.frames.at(-1).successes,success:d.episode.full_trajectory};});
   assert(result.total===result.final&&result.success&&result.frame===cases.find(c=>c.id===id).transitions,'3D recording '+id);
   await page.check('#hulls');await page.uncheck('#points');
   await page.locator('#play').click();await page.waitForFunction(()=>replayTime>0&&replayTime<2);
   await page.locator('#play').click();replays.push({id,...result});
   await page.setViewportSize({width:390,height:844});
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{timeout:5000});
   if(id.startsWith('brush'))await page.screenshot({path:path.join(artifacts,'replay-mobile.png')});
  }
  await page.setViewportSize({width:1280,height:1000});await page.goto(base+'/embed');
  const frame=page.frameLocator('iframe');await frame.locator('#cards .card button').first().click();
  await page.frames()[1].waitForFunction(()=>document.querySelector('video').currentTime>.1);
  assert(!errors.length,errors.join('\n'));
  const report={status:'passed',prefix,played,replays,filters:true,search:true,deepLinks:true,shareLink:true,mobile:true,vscodeIframe:true,errors};
  fs.writeFileSync(path.join(artifacts,'browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:'passed',videos:played.length,replays:replays.length,artifacts}));
 }finally{await browser.close();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
