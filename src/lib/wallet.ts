import { BrowserProvider } from 'ethers'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
    }
  }
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No injected wallet found. Open this in MetaMask or another EVM wallet browser.')
  }

  const provider = new BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = await provider.getSigner()
  const address = await signer.getAddress()
  return { provider, signer, address: address.toLowerCase() }
}
