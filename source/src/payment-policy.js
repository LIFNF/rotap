export const MINT_RECIPIENT='0x8638636536Ed50fC1cCCDFDa1790aCC83E39643A';

export function verifyMintRecipients(creator, protocolWallet) {
  const expected=MINT_RECIPIENT.toLowerCase();
  if(creator.toLowerCase()!==expected||protocolWallet.toLowerCase()!==expected) {
    throw Error('合约收款地址与指定地址不一致，已停止铸造');
  }
}
