import fs from 'node:fs';import path from 'node:path';
import routes from '../config/routes.json' with {type:'json'};
export function createRoutePages(directory,basePath){
 const root=path.resolve(directory);if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('Invalid base path');
 const withBase=html=>html.replace(/<base\b[^>]*>/g,'').replace('<head>','<head><base href="'+basePath+'">');
 const app=withBase(fs.readFileSync(path.join(root,'index.html'),'utf8'));
 const status=withBase(fs.readFileSync(path.join(root,'launch.html'),'utf8'));
 fs.writeFileSync(path.join(root,'index.html'),app);fs.writeFileSync(path.join(root,'launch.html'),status);
 for(const route of [...routes.pages,...routes.documentSections.map(section=>'docs/'+section),'status']){
  const destination=path.resolve(root,route);if(!destination.startsWith(root+path.sep))throw Error('Invalid route output');
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'index.html'),app);
 }
}
