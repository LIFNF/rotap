import fs from 'node:fs';
// Every visible edge is assembled from whole square pixels.
const W=192,H=160,pixels=new Map();
const C={bg:'#0a101a',edge:'#526d58',dark:'#132b30',side:'#1d4441',top:'#487254',light:'#b5ed63',acid:'#d8ff60',cyan:'#6df3de',purple:'#bc86ff',pink:'#ff67ad',orange:'#ff8851'};
function dot(x,y,c){if(x>=0&&y>=0&&x<W&&y<H)pixels.set(`${Math.round(x)},${Math.round(y)}`,c);}
function rect(x,y,w,h,c){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c);}
function line(x0,y0,x1,y1,c){const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=n;i++)dot(Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),c);}
function poly(points,c){for(let y=0;y<H;y++)for(let x=0;x<W;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}if(inside)dot(x,y,c);}}
const iso=(x,y,z)=>[96+x-y,103+(x+y)/2-z];
function plane(points,c){poly(points.map(p=>iso(...p)),c);}
function cube(x,y,w,d,z,h,top,front,side){plane([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top);plane([[x,y+d,z+h],[x+w,y+d,z+h],[x+w,y+d,z],[x,y+d,z]],front);plane([[x+w,y,z+h],[x+w,y+d,z+h],[x+w,y+d,z],[x+w,y,z]],side);}
// Solder traces, status pixels and distant machine-room silhouettes.
for(let i=0;i<7;i++){const x=6+i*28;rect(x,72-(i%3)*8,13,39+(i%3)*8,'#101e28');for(let y=80-(i%3)*8;y<104;y+=6)rect(x+3,y,2,2,i%2?'#304d4b':'#3e3659');}
for(const [x,y] of [[8,18],[26,122],[151,17],[179,106],[168,144],[57,8]]){line(x,y,x+8,y,C.edge);line(x+8,y,x+8,y+12,C.edge);rect(x-1,y-1,3,3,C.acid);}
for(let x=10;x<186;x+=12)for(let y=14;y<153;y+=12)if((x+y)%5===0)dot(x,y,'#294337');
// Raised motherboard, pin grid and discrete chip package.
cube(-48,-40,96,80,-10,10,C.side,'#17282e','#20343b');
plane([[-46,-39,1],[46,-39,1],[46,39,1],[-46,39,1]],C.top);
plane([[-42,-35,2],[42,-35,2],[42,35,2],[-42,35,2]],'#203e36');
for(let i=-31;i<=32;i+=7){plane([[i,23,3],[i+3,23,3],[i+3,34,3],[i,34,3]],C.light);plane([[24,i,3],[34,i,3],[34,i+3,3],[24,i+3,3]],C.light);}
cube(-27,-24,54,48,4,7,'#798a4b','#647343','#455a39');
cube(-25,-22,50,44,11,21,'#466b48','#263d36','#192e31');
plane([[-25,-22,33],[25,-22,33],[25,22,33],[-25,22,33]],C.acid);
plane([[-20,-17,34],[20,-17,34],[20,17,34],[-20,17,34]],'#97bf51');
cube(-13,-11,26,22,34,4,'#d8ff60','#739a43','#55793d');
plane([[-7,-6,39],[7,-6,39],[7,6,39],[-7,6,39]],'#1b3533');
plane([[-3,-2,40],[3,-2,40],[3,2,40],[-3,2,40]],C.cyan);
for(let i=-18;i<21;i+=7){plane([[i,22,16],[i+3,22,16],[i+3,22,23],[i,22,23]],C.acid);}
for(let i=-36;i<=37;i+=8){const p=iso(i,40,-4);rect(p[0],p[1],3,2,i%3?C.cyan:C.pink);}
// Fixed pixel beams and binary motes.
for(const [x,y,c] of [[95,18,C.acid],[71,29,C.cyan],[128,32,C.pink],[38,60,C.orange],[150,60,C.purple]]){rect(x,y,3,3,c);for(let j=y+7;j<y+23;j+=5)rect(x+1,j,1,2,'#45664a');}
const out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="像素电路铸造装置"><title>ROtap 像素电路铸造装置</title>${[...pixels].map(([p,c])=>{const [x,y]=p.split(',');return `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;}).join('')}</svg>`;
fs.writeFileSync('dist/pixel-foundry.svg',out);
