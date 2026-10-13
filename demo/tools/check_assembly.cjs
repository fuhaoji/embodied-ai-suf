const fs=require('fs'),path=require('path'),http=require('http'),zlib=require('zlib');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=path.resolve(__dirname,'..'),prefix='/embodied-ai-suf/demo/',artifacts=process.env.ARTIFACT_DIR||'/tmp/assembly-site-check';
fs.mkdirSync(artifacts,{recursive:true});
const assert=(v,m)=>{if(!v)throw Error(m)};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary','.png':'image/png','.gz':'application/gzip'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return}
 let file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length)));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+prefix;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+':'+r.status())});
 await page.goto(base);await page.waitForSelector('#cards .card');assert(await page.locator('#cards .card').count()===24,'Existing gallery changed');
 assert(await page.locator('a[href="assembly/"]').count()>=1,'Missing assembly entry');await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Gallery mobile overflow');
 await page.setViewportSize({width:1440,height:1100});await page.goto(base+'assembly/');await page.waitForFunction(()=>window.driverDemo,null,{timeout:120000});
 const ready=await page.evaluate(()=>({frames:driverDemo.data().frames.length,phase:driverDemo.frame().phase}));assert(ready.frames>18000,'Incomplete recording');
 await page.selectOption('#speed','1');
 async function jump(button,phase){await page.evaluate(button=>{document.getElementById(button).click();document.getElementById('play').click()},button);assert(await page.evaluate(()=>driverDemo.frame().phase)===phase,'Stage '+button)}
 await jump('coverPickup','cover_grip');await jump('coverCarry','cover_transport');await page.click('#assembly');
 await page.evaluate(()=>{document.getElementById('metrics').style.visibility='hidden';document.querySelector('.orbit-hint').style.visibility='hidden'});
 await page.locator('canvas').screenshot({path:path.join(root,'assembly/assets/preview.png')});
 await page.evaluate(()=>{document.getElementById('metrics').style.visibility='';document.querySelector('.orbit-hint').style.visibility=''});
 await jump('coverRelease','cover_release');await jump('toolPickup','grasp');
 const order=await page.evaluate(()=>driverDemo.data().result.requested_order);
 for(const id of order){await page.selectOption('#screw',String(id));await jump('picking','insert');await jump('carrying','carry');await jump('driving','drive')}
 await page.click('#finishing');assert(await page.evaluate(()=>driverDemo.frame().completed_screws.length)===11,'Not all screws complete');
 await page.screenshot({path:path.join(artifacts,'desktop-complete.png')});
 await page.click('#reset');await page.click('#play');await page.waitForFunction(()=>driverDemo.frame().time>.1);await page.click('#play');
 await page.click('#copyLink');assert((await page.locator('#shareStatus').textContent()).length>0,'Share feedback missing');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Assembly mobile overflow');await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
 assert(errors.length===0,errors.join('\n'));assert(failed.length===0,failed.join('\n'));
 const report={passed:true,prefix,frames:ready.frames,screws:order.length,existing_gallery:true,mobile:true,playback:true,share:true,errors,failed};fs.writeFileSync(path.join(artifacts,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
