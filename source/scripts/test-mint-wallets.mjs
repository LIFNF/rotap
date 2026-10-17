import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const make=(digit)=>({request:async({method})=>method==='eth_requestAccounts'?['0x'+digit.repeat(40)]:method==='eth_chainId'?'0x1237':null,on(){},removeListener(){}});
  const wallets=[{info:{uuid:'wallet-one',name:'Wallet One'},provider:make('1')},{info:{uuid:'wallet-two',name:'Wallet Two'},provider:make('2')}];
  window.addEventListener('eip6963:requestProvider',()=>wallets.forEach(detail=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail}))));
 });
 await page.goto('http://127.0.0.1:4173/#mint');
 await page.getByRole('heading',{name:'铸造晶体管',exact:true,level:1}).waitFor();
 assert.equal(await page.locator('#mint-kind option').count(),2);
 assert.equal(await page.locator('#mint-cap').textContent(),'1,000,000');
 assert.equal(await page.locator('#mint-submit').isDisabled(),true);
 await page.getByRole('button',{name:'连接钱包',exact:true}).click();
 await page.getByRole('button',{name:'Wallet Two',exact:true}).click();
 await page.getByRole('button',{name:'0x2222…2222',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: Mint route, NAND/LATCH options, cap, undeployed payment guard, multiple-wallet discovery and chosen account.');
}finally{await browser.close();}
