import fs from 'node:fs';
// Recolour the existing integer-pixel art without smoothing its silhouette.
let svg=fs.readFileSync('dist/pixel-foundry.svg','utf8');
const palette={'#526d58':'#8952b4','#132b30':'#210e3b','#1d4441':'#352052','#487254':'#743d9c','#b5ed63':'#ff69d0','#d8ff60':'#ff4bbd','#6df3de':'#55ffe2','#bc86ff':'#bc86ff','#ff67ad':'#55ffe2','#ff8851':'#ffdc72','#101e28':'#24123b','#304d4b':'#c645b3','#3e3659':'#4b3876','#294337':'#542c76','#17282e':'#27133d','#20343b':'#1c2146','#203e36':'#2c1946','#798a4b':'#a748a5','#647343':'#74326e','#455a39':'#40234c','#466b48':'#a359a6','#263d36':'#3c1c4a','#192e31':'#242441','#97bf51':'#b427a3','#739a43':'#3ab5be','#55793d':'#266c83','#1b3533':'#102c43','#45664a':'#9253a8'};
svg=svg.replace(/#[0-9a-f]{6}/g,c=>palette[c]||c);
// Pixel skyline and illuminated towers behind the foundry.
let city='';const r=(x,y,w,h,c)=>city+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
for(let i=0;i<11;i++){const x=i*18-2,y=38+(i*17)%38,w=12+(i%3)*2;r(x,y,w,98-y,'#1b1231');r(x+2,y-3,w-4,3,'#35204a');if(i%3===0){r(x+6,y-10,1,7,'#6a367c');r(x+5,y-12,3,2,'#ff4bbd');}for(let yy=y+6;yy<95;yy+=6)for(let xx=x+3;xx<x+w-2;xx+=5)r(xx,yy,2,2,(yy+i)%3?'#643568':i%2?'#55ffe2':'#c054a8');}
const index=svg.indexOf('</title>')+8;svg=svg.slice(0,index)+city+svg.slice(index);
fs.writeFileSync('dist/pixel-foundry.svg',svg);
