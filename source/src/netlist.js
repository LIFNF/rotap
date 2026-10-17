export function bytes(hex){if(!/^0x(?:[0-9a-f]{2})*$/i.test(hex))throw Error('网表必须是完整字节的十六进制数据');return Uint8Array.from(hex.slice(2).match(/../g)||[],x=>parseInt(x,16));}
export const hex=data=>'0x'+Array.from(data,x=>x.toString(16).padStart(2,'0')).join('');
const bit=(data,index)=>Boolean((data[index>>3]||0)&(1<<(index&7)));
const set=(data,index)=>{data[index>>3]|=1<<(index&7);};
export function decode(program,nIn,nOut){
 const data=typeof program==='string'?bytes(program):program,nodes=[];
 let cursor=0,wire=2+nIn,state=0;
 const u24=offset=>{if(offset+3>data.length)throw Error('网表字节不完整');return data[offset]*65536+data[offset+1]*256+data[offset+2];};
 while(cursor<data.length){const offset=cursor,op=data[cursor++],a=u24(cursor);cursor+=3;
  if(op===0){const b=u24(cursor);cursor+=3;if(a>=wire||b>=wire)throw Error('NAND 只能读取此前定义的信号');nodes.push({op,a,b,wire:wire++,offset});}
  else if(op===1)nodes.push({op,a,wire:wire++,state:state++,offset});
  else throw Error('当前运行时尚不支持此操作码：'+op);
 }
 if(!Number.isInteger(nIn)||nIn<0||!Number.isInteger(nOut)||nOut<1||nOut>wire)throw Error('输入或输出数量无效');
 for(const node of nodes)if(node.a>=wire)throw Error('锁存器读取了不存在的信号');
 return {nodes,wires:wire,states:state};
}
export function metrics(program,nIn,nOut){
 const parsed=decode(program,nIn,nOut),levels=Array(parsed.wires).fill(0);let nand=0,latch=0;
 for(const node of parsed.nodes)if(node.op===0){nand++;levels[node.wire]=1+Math.max(levels[node.a],levels[node.b]);}else latch++;
 let depth=0;for(let wire=parsed.wires-nOut;wire<parsed.wires;wire++)depth=Math.max(depth,levels[wire]);
 for(const node of parsed.nodes)if(node.op===1)depth=Math.max(depth,levels[node.a]);
 const area=nand+7*latch;return {nand,latch,depth,burn:nand+latch,area,cost:BigInt(area)*BigInt(Math.max(depth,1))**3n};
}
export function createRunner(program,nIn,nOut){
 const parsed=decode(program,nIn,nOut);
 return (state,input)=>{
 const old=typeof state==='string'?bytes(state):state,inputs=typeof input==='string'?bytes(input):input;
 if(inputs.length!==Math.ceil(nIn/8))throw Error('输入字节数不符合电路规格');
 if(old.length!==0&&old.length!==Math.ceil(parsed.states/8))throw Error('状态字节数不符合电路规格');
 const wires=Array(parsed.wires).fill(false);wires[1]=true;for(let i=0;i<nIn;i++)wires[i+2]=bit(inputs,i);
 for(const node of parsed.nodes)wires[node.wire]=node.op===0?!(wires[node.a]&&wires[node.b]):bit(old,node.state);
 const next=new Uint8Array(Math.ceil(parsed.states/8)),outputs=new Uint8Array(Math.ceil(nOut/8));
 for(const node of parsed.nodes)if(node.op===1&&wires[node.a])set(next,node.state);
 for(let i=0;i<nOut;i++)if(wires[parsed.wires-nOut+i])set(outputs,i);
 return {state:hex(next),output:hex(outputs)};
 };
}
export function step(program,nIn,nOut,state,input){return createRunner(program,nIn,nOut)(state,input);}
