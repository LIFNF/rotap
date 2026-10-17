import fs from 'node:fs';import path from 'node:path';
export const retiredAssets=['deployment-artifact.json','protocol-abi.json','materials-abi.json','reward-abi.json'];
export function removeLegacyAssets(directory){const root=path.resolve(directory);for(const file of retiredAssets){const target=path.resolve(root,file);if(path.dirname(target)!==root)throw Error('Unsafe asset path');if(fs.existsSync(target))fs.unlinkSync(target);}}
