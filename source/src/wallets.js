const discovered = new Map();
let unsubscribe = () => {};

export function watchWallet(provider, {accountsChanged, chainChanged}) {
  unsubscribe();
  provider.on?.('accountsChanged', accountsChanged);
  provider.on?.('chainChanged', chainChanged);
  unsubscribe = () => {
    provider.removeListener?.('accountsChanged', accountsChanged);
    provider.removeListener?.('chainChanged', chainChanged);
  };
}
window.addEventListener('eip6963:announceProvider', event => {
  const detail = event.detail;
  if (detail?.info?.uuid && typeof detail.provider?.request === 'function') {
    discovered.set(detail.info.uuid, detail);
  }
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

export function availableWallets() {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  const wallets = [...discovered.values()].map(({info, provider}) => ({name: info.name, provider}));
  for (const provider of window.ethereum?.providers || (window.ethereum ? [window.ethereum] : [])) {
    if (typeof provider?.request !== 'function' || wallets.some(w => w.provider === provider)) continue;
    wallets.push({name: provider.isMetaMask ? 'MetaMask' : provider.isCoinbaseWallet ? 'Coinbase Wallet' : provider.isRabby ? 'Rabby' : '浏览器钱包', provider});
  }
  return wallets;
}
