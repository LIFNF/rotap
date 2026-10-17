import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const included=['dist','src','config','contracts','scripts','reference-v2','candidate-v2','audit','README.md','CONTRACTS.md','package.json','package-lock.json','.gitignore','启动ROtap.cmd'];
const staging=fs.mkdtempSync(path.join(root,'../ROtap-current-'));
for(const file of included){if(fs.existsSync(file))fs.cpSync(path.join(root,file),path.join(staging,file),{recursive:true});}
console.log(staging);
