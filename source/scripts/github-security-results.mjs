import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const token=await new Promise((resolve,reject)=>{let value='';const tty=process.stdin.isTTY;const finish=()=>{process.stdin.removeAllListeners('data');if(tty)process.stdin.setRawMode(false);process.stdin.pause();resolve(value.trim());};if(tty){process.stdin.setRawMode(true);process.stderr.write('Ready for GitHub token on stdin (input is hidden).\n');}process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk;if(value.includes('\u0003'))reject(Error('Cancelled'));else if(/[\r\n]/.test(value))finish();});process.stdin.once('end',finish);});
const env={...process.env,GH_TOKEN:token,GH_REPO:'LIFNF/rotap',GH_PROMPT_DISABLED:'1',HTTPS_PROXY:'http://127.0.0.1:7890'};delete env.GH_DEBUG;delete env.GIT_TRACE;
function run(args){const result=spawnSync('gh',args,{env,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,windowsHide:true});if(result.status!==0)throw Error((result.stderr||result.error?.message||'GitHub request failed').split(token).join('[redacted]').slice(0,1500));return result.stdout;}
const api=route=>JSON.parse(run(['api',route,'-H','Accept: application/vnd.github+json']));
try{
 const owner=api('user').login;if(owner.toLowerCase()!=='lifnf')throw Error('Unexpected GitHub account');
 const result=api('repos/LIFNF/rotap/actions/workflows/security.yml/runs?per_page=10'),runs=result.workflow_runs||[],wanted=process.argv[2],job=wanted?runs.find(item=>item.head_sha===wanted):runs[0];if(!job)throw Error('No matching public audit run');
 console.log(JSON.stringify({id:job.id,status:job.status,conclusion:job.conclusion,commit:job.head_sha,url:job.html_url}));
 if(job.status!=='completed'||job.conclusion!=='success')process.exit(0);
 const sourceFile=api('repos/LIFNF/rotap/contents/source/source-files.json?ref='+job.head_sha),sourceManifest=JSON.parse(Buffer.from(sourceFile.content,'base64').toString('utf8')),sourceFileSHA256={};
 for(const item of sourceManifest.files.filter(item=>/^(src|scripts)\/.*\.(js|mjs)$/.test(item.path))){const actual=createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');if(actual!==item.sha256)throw Error('CodeQL result does not match the current JavaScript: '+item.path);sourceFileSHA256[item.path]=actual;}
 const destination=path.resolve('.test-chain/codeql-'+job.id);fs.mkdirSync(destination,{recursive:true});run(['run','download',String(job.id),'--name','rotap-codeql-sarif','--dir',destination]);
 const files=fs.readdirSync(destination).filter(name=>name.endsWith('.sarif'));if(!files.length)throw Error('No SARIF artifact was returned');
 fs.mkdirSync('audit/public',{recursive:true});let findings=0;const reports=[];
 for(const [index,name] of files.entries()){const data=fs.readFileSync(path.join(destination,name)),document=JSON.parse(data),count=(document.runs||[]).reduce((n,item)=>n+(item.results||[]).length,0),target=index?'codeql-'+index+'.sarif':'codeql.sarif';findings+=count;fs.writeFileSync('audit/public/'+target,data);reports.push({path:'reports/'+target,sha256:createHash('sha256').update(data).digest('hex'),findingCount:count});}
 const report={kind:'automated',tool:'GitHub CodeQL',status:'completed',conclusion:job.conclusion,generatedAt:new Date().toISOString(),runId:job.id,runUrl:job.html_url,sourceCommit:job.head_sha,sourceFileSHA256,scope:['source/src JavaScript','source/scripts JavaScript'],solidityAnalyzed:false,independentHumanReview:false,findingCount:findings,reports,limitations:['CodeQL does not analyze Solidity.','Static analysis may miss defects. This is not an independent human audit.','Results apply only to the recorded file hashes.']};
 fs.writeFileSync('audit/public/codeql-summary.json',JSON.stringify(report,null,2));
 let summary=null;try{summary=JSON.parse(fs.readFileSync('audit/audit-summary.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(summary){summary.tools=(summary.tools||[]).filter(item=>item.name!=='GitHub CodeQL');summary.tools.push({name:'GitHub CodeQL',version:'GitHub Actions / security-extended',status:'completed',report:'reports/codeql-summary.json',officialUrl:'https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning',summary:'JavaScript 静态分析已完成，'+findings+' 项工具结果；Solidity 不在此工具范围内。',triageReport:'reports/codeql-fixes.json'});summary.codeqlSourceCommit=job.head_sha;summary.generatedAt=new Date().toISOString();fs.writeFileSync('audit/audit-summary.json',JSON.stringify(summary,null,2));}
 console.log(JSON.stringify({saved:true,findingCount:findings,reports}));
}catch(error){console.error(error.message.split(token).join('[redacted]'));process.exitCode=1;}
