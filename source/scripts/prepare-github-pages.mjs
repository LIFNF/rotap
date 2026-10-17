import fs from 'node:fs';
import path from 'node:path';
import {removeLegacyAssets} from './remove-legacy-assets.mjs';
import {createRoutePages} from './create-route-pages.mjs';
const output=path.resolve('.github-pages');
fs.mkdirSync(output,{recursive:true});
removeLegacyAssets(output);
fs.cpSync('dist',output,{recursive:true});
function rewrite(directory){for(const file of fs.readdirSync(directory,{withFileTypes:true})){
 const full=path.join(directory,file.name);if(file.isDirectory()){if(!['.git','source'].includes(file.name))rewrite(full);continue;}
 if(!/\.(html|js|css)$/.test(file.name))continue;
 const source=fs.readFileSync(full,'utf8');
 const assetNames=fs.readdirSync('dist').map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const assets=new RegExp('(["\'])/(?=(?:'+assetNames.join('|')+'|api/release)(?:["\'/?]))','g');
 const rewritten=source.replace(assets,'$1./').replace(/(href=["'])\/(["'])/g,'$1./$2').replace(/url\(\/fonts\//g,'url(./fonts/');
 fs.writeFileSync(full,rewritten);
}}
rewrite(output);
createRoutePages(output,'/rotap/');
fs.writeFileSync(path.join(output,'.nojekyll'),'');
fs.writeFileSync(path.join(output,'README.md'),'# ROtap\n\nROtap 官网发布文件，面向 Robinhood Chain。\n\n当前主网合约尚未部署，Mint 不接受付款。\n\n完整源码、依赖锁、构建、测试和部署脚本位于 source/。构建来源见 build-provenance.json。独立审查尚未完成，当前未开放付款。\n');
console.log('Prepared minified GitHub Pages assets with relative URLs. Payment status preserved.');
