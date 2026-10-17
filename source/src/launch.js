import pricing from '../config/mint-pricing.json';
const release=await(await fetch(new URL('release.json',import.meta.url),{cache:'no-store'})).json();
for(const [id,value] of Object.entries({owner:pricing.recipient,unit:pricing.unitPriceETH+' ETH',fee:pricing.protocolFeeETH+' ETH',supply:Number(pricing.supplyCap).toLocaleString('en-US'),status:release.blockReason}))document.getElementById(id).textContent=value;
