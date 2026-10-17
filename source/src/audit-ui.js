import {basePath,hrefFor} from './router.js';
import {esc} from './protocol-client.js';

const github='https://github.com/LIFNF/rotap';
const stateLabel=value=>({passed:'扫描完成',complete:'扫描完成',completed:'扫描完成',failed:'发现待处理项',error:'运行失败',pending:'尚未完成',unavailable:'未取得结果',skipped:'未执行'}[value]||'结果待核对');
function publicLink(value){
 if(typeof value!=='string'||!value)return null;
 try{const url=new URL(value,location.origin+basePath);if(url.protocol!=='https:'&&url.origin!==location.origin)return null;if(url.origin===location.origin&&!url.pathname.startsWith(basePath))return null;return url.href;}catch{return null;}
}
function anchor(label,value,download=false){const url=publicLink(value);return url?`<a class="btn small" href="${esc(url)}" ${download?'download':'target="_blank" rel="noopener noreferrer"'}>${esc(label)} ↗</a>`:'';}
function hashes(value,prefix=''){
 if(!value||typeof value!=='object')return [];
 return Object.entries(value).flatMap(([name,hash])=>typeof hash==='object'&&hash!==null?hashes(hash,prefix+name+'/'):[{name:prefix+name,hash:String(hash)}]);
}
export function auditView(){return `<main id="main" class="container" data-audit-page><div class="page-head"><span class="eyebrow">ROTAP / REVIEW RECORDS</span><h1>审计报告</h1><p>公开检查范围、工具输出和对应源码版本。自动化扫描结果与独立人工审查分别记录。</p></div><div class="audit-actions">${anchor('GitHub 完整源码',github)}<a class="btn small" href="${hrefFor('status')}">部署与核验状态 ↗</a></div><div data-audit-body role="status" aria-live="polite"><div class="notice">正在读取公开检查记录。</div></div></main>`;}
export async function bindAudit(){
 const root=document.querySelector('[data-audit-page]'),body=root?.querySelector('[data-audit-body]');if(!body)return;
 try{
  const response=await fetch(basePath+'audit-summary.json',{cache:'no-store'});if(!response.ok)throw Error('报告索引尚未发布。');const data=await response.json();if(!root.isConnected)return;
  const tools=Array.isArray(data.tools)?data.tools:[],scope=Array.isArray(data.scope)?data.scope:[],limitations=Array.isArray(data.limitations)?data.limitations:[],sourceHashes=hashes(data.sourceHashes),commit=typeof data.sourceCommit==='string'&&/^[a-f\d]{40}$/i.test(data.sourceCommit)?data.sourceCommit:null;
  const generated=data.generatedAt&&Number.isFinite(Date.parse(data.generatedAt))?new Date(data.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'未记录';
  const overall=data.kind==='automated'?stateLabel(data.status):'记录类型待核对';
  const findings=Array.isArray(data.findings)?data.findings:[];
  body.innerHTML=`<section class="protocol-panel audit-overview"><span class="eyebrow">AUTOMATED ANALYSIS</span><h2>自动化代码检查</h2><div class="stat"><span>检查状态</span><strong>${esc(overall)}</strong></div><div class="stat"><span>生成时间</span><strong>${esc(generated)}</strong></div><div class="stat"><span>独立人工审查</span><strong>尚未完成</strong></div><p class="protocol-note">本页公布自动化静态分析与项目测试的执行记录。工具可能漏报或误报；扫描完成不代表代码没有漏洞，也不构成资金安全、经济可持续性或投资回报保证。独立人工审查报告取得后将另行公布。</p><div class="audit-actions">${anchor('下载报告索引',basePath+'audit-summary.json',true)}${commit?anchor('查看对应提交',github+'/tree/'+commit):''}</div></section><section class="audit-section"><h2>工具与原始报告</h2><div class="inventory-grid audit-tool-grid">${tools.length?tools.map(tool=>`<article class="inventory-card audit-tool"><h3>${esc(tool.name||'未命名工具')}</h3><div class="stat"><span>版本</span><strong>${esc(tool.version||'未记录')}</strong></div><div class="stat"><span>执行状态</span><strong>${esc(stateLabel(tool.status))}</strong></div>${tool.summary?`<p>${esc(tool.summary)}</p>`:''}<div class="audit-actions">${anchor('原始报告',tool.report)}${anchor('阅读检查报告',tool.readableReport)}${anchor('逐项处理记录',tool.triageReport)}${anchor('工具官方说明',tool.officialUrl)}</div></article>`).join(''):'<div class="notice">当前索引没有工具报告。</div>'}</div></section>${scope.length?`<section class="protocol-panel"><h2>检查范围</h2><ul class="audit-list">${scope.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></section>`:''}${findings.length?`<section class="protocol-panel"><h2>问题与处理记录</h2><div class="release-list">${findings.map(item=>`<article><h3>${esc(item.title||item.id||'检查记录')}</h3>${item.severity?`<p>工具评级：${esc(item.severity)}</p>`:''}${item.status?`<p>处理状态：${esc(item.status)}</p>`:''}${item.description?`<p>${esc(item.description)}</p>`:''}${item.resolution?`<p>${esc(item.resolution)}</p>`:''}</article>`).join('')}</div></section>`:''}<section class="protocol-panel"><h2>对应源码</h2><p>校验值用于识别报告检查的文件版本。页面和合约变更后需重新检查；本报告不自动覆盖其他提交或其他链上部署。</p>${commit?`<p>提交版本：<code class="address-line">${esc(commit)}</code></p>`:''}${sourceHashes.length?`<details><summary>文件校验值（${sourceHashes.length} 项）</summary><dl class="audit-hashes">${sourceHashes.map(item=>`<div><dt>${esc(item.name)}</dt><dd>${esc(item.hash)}</dd></div>`).join('')}</dl></details>`:'<p>当前报告尚未列出文件校验值。</p>'}</section><section class="protocol-panel"><h2>限制与待完成事项</h2><ul class="audit-list">${limitations.map(item=>`<li>${esc(item)}</li>`).join('')}<li>尚未完成独立人工代码与合约审查。</li><li>部署交易、链上代码与源码验证结果以发布状态页的实际记录为准。合约未部署或核验未通过时，网站继续禁止付款。</li></ul></section>`;
  body.removeAttribute('role');body.removeAttribute('aria-live');
 }catch(error){if(root.isConnected)body.innerHTML=`<div class="notice warn"><p>${esc(error.message||'公开检查记录暂时无法读取。')}</p><p>当前不能据此认定审查已完成。可在 GitHub 核对源码和已发布记录。</p>${anchor('查看 GitHub',github)}</div>`;}
}
