import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const mode=process.argv[2]||'check';if(!['check','deploy','status'].includes(mode))throw Error('Invalid mode');
const token=await new Promise((resolve,reject)=>{let value='';const terminal=process.stdin.isTTY;
 const finish=()=>{process.stdin.removeAllListeners('data');if(terminal)process.stdin.setRawMode(false);process.stdin.pause();resolve(value.trim());};
 if(terminal){process.stdin.setRawMode(true);process.stderr.write('Ready for GitHub token on stdin (input is hidden).\n');}
 process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk;if(value.includes('\u0003'))reject(Error('Cancelled'));else if(/[\r\n]/.test(value))finish();});process.stdin.once('end',finish);
});
if(!/^gh[pousr]_[a-zA-Z0-9_]+$/.test(token))throw Error('Invalid token format');
const env={...process.env,GH_TOKEN:token,GH_HOST:'github.com',GH_PROMPT_DISABLED:'1',HTTPS_PROXY:'http://127.0.0.1:7890',GIT_TERMINAL_PROMPT:'0'};
delete env.GH_DEBUG;delete env.GIT_TRACE;delete env.GIT_CURL_VERBOSE;
function run(command,args,options={}){const r=spawnSync(command,args,{env,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,...options});
 if(r.status!==0)throw Error((r.stderr||r.error?.message||'Command failed').split(token).join('[redacted]').slice(0,1800));return r.stdout;}
function api(route,{method='GET',body}={}){const args=['api',route,'--method',method,'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2026-03-10'];if(body!==undefined)args.push('--input','-');const result=run('gh',args,{input:body===undefined?undefined:JSON.stringify(body)});return result.trim()?JSON.parse(result):{};}
try{
 const user=api('user'),owner=user.login,repo='rotap',route='repos/'+owner+'/'+repo;
 console.log(JSON.stringify({authenticated:true,owner,repository:owner+'/'+repo,mode}));
 if(mode==='check')process.exit(0);
 if(mode==='status'){
  const site=api(route+'/pages');let build;try{build=api(route+'/pages/builds/latest');}catch(e){build={message:e.message};}
  console.log(JSON.stringify({site:{status:site.status,html_url:site.html_url,source:site.source},build:{status:build.status,error:build.error,commit:build.commit}},null,2));process.exit(0);
 }
 let repository;try{repository=api(route);}catch(e){if(!e.message.includes('404'))throw e;repository=api('user/repos',{method:'POST',body:{name:repo,description:'ROtap pixel cyberpunk website on Robinhood Chain',private:false,auto_init:false}});}
 if(repository.owner.login!==owner||repository.archived||repository.private)throw Error('Repository owner, visibility or archive state does not match');
 const directory=path.resolve('.github-pages');if(!fs.existsSync(path.join(directory,'index.html')))throw Error('Prepare Pages assets first');
 if(!fs.existsSync(path.join(directory,'.git')))run('git',['init','--initial-branch','main',directory]);
 const git=args=>run('git',args,{cwd:directory});
 if(!fs.existsSync(path.join(directory,'source/source-files.json')))throw Error('Prepare the complete public source package first');
 git(['add','--','source','.gitattributes']);const sourceChange=spawnSync('git',['diff','--cached','--quiet'],{cwd:directory,env});if(sourceChange.status===1)git(['-c','user.name='+owner,'-c','user.email='+user.id+'+'+owner+'@users.noreply.github.com','commit','-m','Publish reproducible ROtap source and security fixes']);else if(sourceChange.status!==0)throw Error('Unable to inspect source changes');const sourceCommit=git(['rev-parse','HEAD']).trim(),provenance=JSON.parse(fs.readFileSync(path.join(directory,'build-provenance.json')));provenance.sourceCommit=sourceCommit;provenance.sourceUrl=repository.html_url+'/tree/'+sourceCommit+'/source';fs.writeFileSync(path.join(directory,'build-provenance.json'),JSON.stringify(provenance,null,2));
 git(['add','--all']);const difference=spawnSync('git',['diff','--cached','--quiet'],{cwd:directory,env});
 if(difference.status===1)git(['-c','user.name='+owner,'-c','user.email='+user.id+'+'+owner+'@users.noreply.github.com','commit','-m','Publish ROtap website']);else if(difference.status!==0)throw Error('Unable to inspect deployment changes');
 const remote='https://github.com/'+owner+'/'+repo+'.git';
 env.GITHUB_PAGES_AUTH='Authorization: Basic '+Buffer.from('x-access-token:'+token).toString('base64');
 const pushArgs=['-c','credential.helper=','-c','http.extraHeader=','-c','http.proxy=http://127.0.0.1:7890','-c','http.sslVersion=tlsv1.2','-c','http.version=HTTP/1.1','-c','http.postBuffer=10485760','--config-env=http.'+remote+'.extraHeader=GITHUB_PAGES_AUTH','push',remote,'HEAD:refs/heads/main'];
 for(let attempt=1;attempt<=3;attempt++){try{git(pushArgs);break;}catch(error){if(attempt===3||!/HTTP (?:408|429|5\d\d)|disconnect|connection|timed out|remote end hung up/i.test(error.message))throw error;console.log('Retrying interrupted GitHub upload ('+attempt+'/3).');}}
 let pages;try{pages=api(route+'/pages');if(pages.build_type!=='legacy'||pages.source?.branch!=='main'||pages.source?.path!=='/')throw Error('Existing Pages configuration differs; refusing to overwrite');}
 catch(e){if(!e.message.includes('404'))throw e;pages=api(route+'/pages',{method:'POST',body:{build_type:'legacy',source:{branch:'main',path:'/'}}});}
 const receipt={repository:repository.html_url,siteUrl:pages.html_url,siteCommit:git(['rev-parse','HEAD']).trim(),pagesStatus:pages.status,sourceCommit,sourceTreeHash:provenance.sourceTreeHash,mainnetContractsDeployed:false,mintPaymentsEnabled:false};
 fs.writeFileSync('audit/github-pages-deployment.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}catch(error){console.error(error.message.split(token).join('[redacted]'));process.exitCode=1;}
