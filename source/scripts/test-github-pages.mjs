import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const root=path.resolve('.github-pages'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);if(!pathname.startsWith('/rotap/')){res.writeHead(404);res.end();return;}
 let filename=path.resolve(root,pathname.slice(7)||'index.html');if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
 if(fs.statSync(filename).isDirectory()){if(!pathname.endsWith('/')){res.writeHead(301,{Location:pathname+'/'+new URL(req.url,'http://local').search});res.end();return;}filename=path.join(filename,'index.html');}
 res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(fs.readFileSync(filename));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({executablePath:process.env.ROTAP_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
const base='http://127.0.0.1:'+server.address().port+'/rotap/';await page.goto(base+'#tasks');await page.locator('#v2-task-list .task-card').first().waitFor();assert.equal(await page.locator('#v2-task-list .task-card').count(),100);
await page.waitForURL(base+'tasks');
await page.getByRole('link',{name:'Mint 元件',exact:true}).click();await page.waitForURL(base+'mint');
await page.goBack();await page.waitForURL(base+'tasks');await page.goForward();await page.waitForURL(base+'mint');
for(const route of ['home','tasks','mint','studio','materials','miners','boost','market','accounts','processors','governance','status','docs','docs/rewards']){const response=await page.goto(base+route);assert.equal(response.status(),200);await page.locator('#main').waitFor();await page.waitForURL(base+route);await page.reload();await page.locator('#main').waitFor();assert.equal(new URL(page.url()).hash,'');}
await page.goto(base+'tasks');await page.locator('#v2-task-search').fill('反相');await page.locator('#v2-task-list a').first().click();await page.waitForURL(/\/workbench\?task=\d+$/);
await page.goto(base+'#workbench?task=1');await page.locator('#v2-official').click();await page.waitForFunction(()=>document.querySelector('#v2-metrics').textContent.includes('官方向量验证通过：256 / 256'));
await page.goto(base+'#mint');assert.equal(await page.locator('#mint-submit').isDisabled(),true);assert.match(await page.locator('#mint-status').textContent(),/不接受付款/);
assert.equal(await page.locator('#mint-unit').textContent(),'0.0002445 ETH');assert.equal(await page.locator('#mint-fee').textContent(),'0.0003227 ETH');
await page.locator('#mint-quantity').fill('100');assert.equal(await page.locator('#mint-total').textContent(),'0.0247727 ETH');
assert.ok((await page.locator('body').innerText()).includes('0x8638636536Ed50fC1cCCDFDa1790aCC83E39643A'));
for(const route of ['home','docs','materials','miners']){await page.goto(base+'#'+route);await page.locator('#main').waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/登记下一周期|固定周期奖池|32 NAND|领取初始元件|四项任务|EPOCH BASED/);}
await page.goto(base+'#docs');assert.match(await page.locator('body').innerText(),/99%/);assert.match(await page.locator('body').innerText(),/8 位小数/);
await page.goto(base+'launch.html');await page.locator('#status').filter({hasText:'尚未完成部署'}).waitFor();assert.equal(await page.locator('button,input[type="checkbox"]').count(),0);
for(const retired of ['deployment-artifact.json','protocol-abi.json','materials-abi.json','reward-abi.json'])assert.equal(fs.existsSync(path.join(root,retired)),false);
await page.goto(base+'?demo=1#tasks');assert.equal(await page.locator('#v2-task-list .task-card').count(),100);
assert.doesNotMatch(fs.readFileSync(path.join(root,'app.js'),'utf8'),/claimStarter|currentEpoch|circuitEpochActive|mintCircuit|commitCircuit/);
await page.setViewportSize({width:390,height:844});await page.goto(base+'#home');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);fs.writeFileSync('audit/github-pages-verification.json',JSON.stringify({environment:'local Pages subdirectory',checks:['all assets resolve under /rotap/','100 tasks load','256 official vectors load and pass','Mint payment disabled without deployed contract','configured recipient visible','mobile layout','no browser errors or HTTP failures'],passed:true},null,2));console.log('PASS: GitHub Pages subdirectory assets, 100 tasks, official vectors, recipient, payment gate and mobile view.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
