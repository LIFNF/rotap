import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {acceptRelease} from './release-server.mjs';
const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/api/release')return acceptRelease(req,res);if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}let p;try{p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);return res.end();}if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);return res.end();}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
