import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.ROTAP_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#tasks');await page.locator('#v2-task-list .task-card').first().waitFor();assert.equal(await page.locator('#v2-task-list .task-card').count(),100);
 await page.locator('#v2-task-search').fill('两级4位弹性握手流水线');assert.equal(await page.locator('#v2-task-list .task-card').count(),1);await page.locator('#v2-task-list a').click();await page.waitForURL('**/workbench?task=100');
 assert.equal(await page.locator('#v2-task').inputValue(),'100');assert.equal(await page.locator('#v2-tapeout').isDisabled(),true);
 await page.goto('http://127.0.0.1:4173/#workbench?task=1');await page.locator('#v2-input').fill('0x00');await page.locator('#v2-run').click();assert.ok((await page.locator('#v2-output').textContent()).includes('输出 0x01'));
 await page.locator('#v2-input').fill('0x01');await page.locator('#v2-run').click();assert.ok((await page.locator('#v2-output').textContent()).includes('输出 0x00'));
 await page.locator('#v2-netlist').fill('0x00000002000002');await page.locator('#v2-save').click();await page.reload();assert.equal(await page.locator('#v2-netlist').inputValue(),'0x00000002000002');assert.ok((await page.locator('#v2-metrics').textContent()).includes('成本 1'));
 await page.locator('#v2-official').click();await page.waitForFunction(()=>document.querySelector('#v2-metrics').textContent.includes('官方向量验证通过：256 / 256'));
 await page.locator('#v2-netlist').fill('0x00000001000001');await page.locator('#v2-official').click();await page.waitForFunction(()=>document.querySelector('#v2-metrics').textContent.includes('官方向量验证未通过'));
 await page.goto('http://127.0.0.1:4173/#workbench?task=27');await page.locator('#v2-input').fill('0x01');await page.locator('#v2-run').click();assert.ok((await page.locator('#v2-output').textContent()).includes('输出 0x00'));await page.locator('#v2-run').click();assert.ok((await page.locator('#v2-output').textContent()).includes('输出 0x01'));
 fs.mkdirSync('screenshots',{recursive:true});await page.screenshot({path:'screenshots/v2-workbench-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4173/#workbench?task=100');await page.locator('#v2-netlist').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile workbench overflow');await page.screenshot({path:'screenshots/v2-workbench-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: 100 original tasks, search, task 100, netlist editing, execution, latch timing, draft persistence, payment gating and mobile layout.');
}finally{await browser.close();}
