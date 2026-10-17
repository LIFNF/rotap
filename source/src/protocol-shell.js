import {parseEther,parseUnits,isAddress,getAddress} from 'ethers';
import {esc,bindAction} from './protocol-client.js';
import {hrefFor} from './router.js';
export const moduleLinks=[['miners','电路与矿机'],['boost','质押与加成'],['market','交易市场'],['accounts','电路账户'],['processors','处理器']];
export function protocolView(kind,title,description){return `<main id="main" class="container" data-protocol-page="${kind}"><div class="page-head"><span class="eyebrow">ROTAP / ${kind.toUpperCase()}</span><h1>${title}</h1><p>${description}</p></div><nav class="protocol-subnav" aria-label="协议功能">${moduleLinks.map(([page,label])=>`<a class="btn small ${page===kind?'primary':''}" href="${hrefFor(page)}">${label}</a>`).join('')}</nav><div class="page-body" data-module-body><div class="notice">正在读取协议状态。</div></div><p data-protocol-status role="status" aria-live="polite"></p></main>`;}
export const field=(id,label,value='',type='text',extra='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
export const numberField=(id,label,value=1)=>field(id,label,value,'number','min="1" step="1" inputmode="numeric"');
export const textArea=(id,label,value='',rows=3)=>`<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" spellcheck="false">${esc(value)}</textarea></div>`;
export const button=(id,label,enabled=true,style='primary')=>`<button id="${id}" class="btn ${style}" ${enabled?'':'disabled'}>${label}</button>`;
export const stat=(label,value)=>`<div class="stat"><span>${label}</span><strong>${esc(value)}</strong></div>`;
export const card=(title,content)=>`<article class="inventory-card"><h2>${title}</h2>${content}</article>`;
export function processorSelect(processors,selected,id='protocol-processor'){return `<div class="field"><label for="${id}">处理器</label><select id="${id}">${processors.map(p=>`<option value="${esc(p.address)}" ${p.address.toLowerCase()===selected.toLowerCase()?'selected':''}>${esc(p.name)} · ${esc(p.address.slice(0,8))}</option>`).join('')}</select></div>`;}
export function moduleRoot(kind){return document.querySelector(`[data-protocol-page="${kind}"]`);}
export function status(root,message){const target=root.querySelector('[data-protocol-status]');if(target?.isConnected)target.textContent=message;}
export function write(root,id,client,action,refresh){bindAction(root,'#'+id,client,action,refresh);}
export const input=(root,id)=>root.querySelector('#'+id).value.trim();
export function uint(value,positive=true){if(!/^\d+$/.test(String(value)))throw Error('请输入整数。');const n=BigInt(value);if(positive&&n===0n)throw Error('数量必须大于零。');return n;}
export function amount(value,asset='ETH'){const result=asset==='ROTAP'?parseUnits(value,8):parseEther(value);if(result<=0n)throw Error('金额必须大于零。');return result;}
export function address(value){if(!isAddress(value))throw Error('请输入有效的 EVM 地址。');return getAddress(value);}
export function hexValue(value){if(!/^0x(?:[\da-fA-F]{2})*$/.test(value))throw Error('请输入完整的十六进制字节数据。');return value;}
export function keys(root){return [...root.querySelectorAll('[data-miner-key]:checked')].map(item=>item.value);}
export async function mountModule(kind,client,required,load){const root=moduleRoot(kind);if(!root)return;const body=root.querySelector('[data-module-body]');if(!client.available(...required)){body.innerHTML='<div class="notice">相应主网合约尚未部署，当前不接受交易。</div>';return;}try{await load(root,body);}catch(error){if(root.isConnected)status(root,error.reason||error.shortMessage||error.message||'链上数据读取失败。');}}
export function onChange(root,id,callback){const element=root.querySelector('#'+id);if(element)element.onchange=()=>Promise.resolve(callback(element.value)).catch(error=>status(root,error.message));}
export async function waitForBlock(client,anchor){const deadline=Date.now()+90000;while(!client.closed&&Date.now()<deadline){if(await client.reader.getBlockNumber()>Number(anchor))return;await new Promise(resolve=>setTimeout(resolve,1000));}throw Error(client.closed?'页面已更新。':'等待新区块超时，请重新启动。');}
