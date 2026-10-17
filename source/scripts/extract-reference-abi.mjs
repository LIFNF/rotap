import fs from 'node:fs';
const s=fs.readFileSync('reference-v2/abi.generated-BbLFGlvZ.js','utf8');
const mapping={n:'circuitFactory',r:'circuits',i:'transistors',a:'podMining',s:'marketplace',c:'circuitMarket',f:'okbBoost',o:'podLens',u:'accountLens',l:'accountOpener',d:'circuitAccount',p:'fabSiteRegistry'};
fs.mkdirSync('reference-v2/abi',{recursive:true});
for(const [variable,name] of Object.entries(mapping)){
 const start=s.indexOf(variable+'=[{');if(start<0)throw Error('Missing '+name);
 const from=start+variable.length+1;let depth=0,end=-1,quote=null,escape=false;
 for(let j=from;j<s.length;j++){const ch=s[j];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote=null;continue;}if(ch==='`'||ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='[')depth++;else if(ch===']'&&--depth===0){end=j+1;break;}}
 const json=s.slice(from,end).replace(/`([^`]*)`/g,(_,v)=>JSON.stringify(v)).replace(/([,{])(\w+):/g,'$1"$2":').replace(/!0/g,'true').replace(/!1/g,'false');
 const abi=JSON.parse(json);fs.writeFileSync('reference-v2/abi/'+name+'.json',JSON.stringify(abi,null,2)+'\n');
 console.log(name,abi.filter(x=>x.type==='function').map(x=>x.name).join(', '));
}
