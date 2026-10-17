import routes from '../config/routes.json';
export const basePath=new URL('.',import.meta.url).pathname;
const isRoute=route=>routes.pages.includes(route.split(/[?/#]/)[0]);
export function hrefFor(route){return basePath+route.replace(/^\/+|\/+$/g,'');}
export function currentRoute(){
 const legacy=location.hash.slice(1);if(isRoute(legacy))return legacy;
 let route=location.pathname.startsWith(basePath)?location.pathname.slice(basePath.length):'';
 route=route.replace(/\/+$/,'');if(!route||route==='index.html')route='home';
 const query=new URLSearchParams(location.search);query.delete('v');query.delete('demo');
 return (isRoute(route)?route:'home')+(query.size?'?'+query:'');
}
export function goTo(route){if(!isRoute(route))return;history.pushState(null,'',hrefFor(route));window.dispatchEvent(new Event('rotap:navigate'));}
export function normalizeLinks(root){for(const a of root.querySelectorAll('a[href^="#"]')){const route=a.getAttribute('href').slice(1);if(isRoute(route))a.href=hrefFor(route);}}
export function startRouter(onNavigate){
 const sync=()=>{const route=currentRoute();const fragment=location.hash&&!isRoute(location.hash.slice(1))?location.hash:'';const canonical=hrefFor(route)+fragment;if(location.pathname+location.search+location.hash!==canonical)history.replaceState(null,'',canonical);onNavigate();};
 document.addEventListener('click',event=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const anchor=event.target.closest?.('a[href]');if(!anchor||anchor.target||anchor.hasAttribute('download'))return;const url=new URL(anchor.href,location.href);if(url.hash||url.origin!==location.origin||!url.pathname.startsWith(basePath))return;const route=url.pathname.slice(basePath.length).replace(/\/+$/,'')+url.search;if(!isRoute(route))return;event.preventDefault();goTo(route);});
 window.addEventListener('popstate',sync);window.addEventListener('hashchange',()=>{if(isRoute(location.hash.slice(1)))sync();});window.addEventListener('rotap:navigate',sync);sync();
}
