import { Dialog, Switch, Transition } from '@headlessui/react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Injected, InjectedWeb3, PrivateWalletStateInfo } from './interfaces';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { MantaSbtWallet, interfaces } from 'manta-extension-sdk';
import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { BAB_ABI, BAB_ADDRESS } from './BAB/abi';
import BN from 'bn.js';
import { getWallets } from 'manta-extension-connect'
import { decodeAddress } from '@polkadot/util-crypto';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import type { Signer as InjectSigner } from '@polkadot/api/types';
import { u8aToHex, u8aToString } from "@polkadot/util";

const injectedWeb3 = window.injectedWeb3
  ? (window.injectedWeb3['manta-wallet-js'] as InjectedWeb3)
  : null;
const rpcUrl = [
  "wss://crispy.baikal.testnet.calamari.systems"
  // 'https://c1.calamari.seabird.systems',
  // 'https://a2.calamari.systems/rpc',
  // 'https://a3.calamari.systems/rpc',
  // 'https://a4.calamari.systems/rpc',
];
const decimals = 12;
const network = 'Calamari';
const assetId = '1';

export default function App() {
  const [isOpen, setIsOpen] = useState("")
  const [publicAddress, setPublicAddress] = useState<string | null>(null);
  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const [maskAddress, setMaskAddress] = useState<string | null>(null);
  const [injected, setInjected] = useState<Injected | null>(null);
  const [babID, setBab] = useState<string | null>(null);
  const [signer, setSigner] = useState<InjectSigner | null>(null);
  const [isInjected] = useState(!!injectedWeb3);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [stateInfo, setStateInfo] = useState<PrivateWalletStateInfo | null>(
    null,
  );

  const onConnect = useCallback(async () => {
    const injected = await injectedWeb3?.enable('DTIM');
    if (!injected) {
      return;
    }

    const accounts = await injected.accounts.get();
    if (!accounts || accounts.length <= 0) {
      return;
    }
    setPublicAddress(accounts[0].address);
    setSigner(injected.signer);

    // @ts-ignore
    setZkAddress(accounts[0].zkAddress);
    setInjected(injected);


    // 链接manta
    const provider = new WsProvider(
      rpcUrl[(Math.random() * rpcUrl.length) | 0],
    );
    const api = await ApiPromise.create({ provider });
    api.setSigner(injected.signer);
    setApi(api);

  }, [setInjected]);

  const fetchPublicBalance = useCallback(async () => {
    const accountInfo = await api?.query.system.account(publicAddress);
    const result = accountInfo as { data?: { free?: any } };
    const balanceString = result?.data?.free?.toString();
    if (!balanceString) {
      return null;
    }
    return balanceString
      ? new BigNumber(balanceString)
        .div(new BigNumber(10).pow(decimals))
        .toFixed()
      : '0';
  }, [api, publicAddress]);

  const fetchBalance = useCallback(async () => {
    const balance = await injected?.privateWallet.getZkBalance({
      network,
      assetId,
    });
    if (!balance) {
      return null;
    }
    return new BigNumber(balance)
      .div(new BigNumber(10).pow(decimals))
      .toFixed();
  }, [injected]);

  const updateBalance = useCallback(async () => {
    const result = await Promise.all([fetchBalance(), fetchPublicBalance()]);
    setBalance(result[0] ?? '-');
    setPublicBalance(result[1] ?? '-');
  }, [fetchBalance, fetchPublicBalance, setBalance, setPublicBalance]);

  useEffect(() => {
    if (stateInfo?.isWalletBusy || !stateInfo?.isWalletReady) {
      return;
    }
    updateBalance();
  }, [stateInfo?.isWalletReady, updateBalance]);

  useEffect(() => {
    if (injected == null || (injected.privateWallet) == null) {
      console.log(injected)
      return;
    }

    console.log("injected.privateWallet => ", injected.privateWallet)
    return injected.privateWallet.subscribeWalletState(setStateInfo);
  }, [injected, setStateInfo]);


  const connectMetaMask = async () => {
    await disconnectMetaMask();
    (window as any).ethereum
      .request({ method: 'eth_requestAccounts' })
      .then((accounts: any[]) => {
        var provider = 'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3'; // Add your nodereal HTTP provider link here
        var web3Provider = new Web3.providers.HttpProvider(provider);
        var web3 = new Web3(web3Provider);
        //@ts-ignore
        const bab = new web3.eth.Contract(BAB_ABI, BAB_ADDRESS);
        bab.methods.tokenIdOf(accounts[0]).call().then((res: any) => {
          console.log(res);
          setBab(res);
        }).catch((err: any) => {
          setBab(null);
        });
        setMaskAddress(accounts[0]);
      }).catch((err: any) => {
        if (err.code === 4001) {
          setIsOpen("你拒绝连接Metamask");
        } else {
          setIsOpen(err);
        }
      });
  };

  const mint = async () => {
    const selectedWallet = getWallets().find((wallet) => wallet.extensionName === 'manta-wallet-js');
    await selectedWallet!.enable('DTIM');
    console.log(selectedWallet)
    console.log(selectedWallet?.extension)
    const mantaWallet = selectedWallet?.extension;
    const privateWallet = mantaWallet?.privateWallet;

    console.log(mantaWallet)
    mintSbtWithSignature(privateWallet!);
  }

  const mintSbtWithSignature = async (
    privateWallet: MantaSbtWallet,
  ) => {
    // try {
    await privateWallet.walletSync();
    // const reserverTx = await api!.tx.mantaSbt.reserveSbt(null);
    // let id = await reserverTx.signAndSend(publicAddress!);
    // console.log(id.toHuman())

    const assetIdRange: any = await api!.query.mantaSbt.reservedIds(publicAddress);
    const [startAssetId, endAssetId] = assetIdRange.unwrap();
    console.log(startAssetId.toString());
    console.log(endAssetId.toString());

    // const sbt = await privateWallet.multiSbtPostBuild(sbtInfoList);
    const sbt = await injected?.privateWallet.multiSbtPostBuild({
      sbtInfoList: [
        { assetId: startAssetId, amount: '1' },
      ],
      network: "Calamari",
    });
    console.log(sbt)
    const { transactionDatas, posts } = sbt!;
    const batchesTx: any[] = [];
    const genesis = (await api!.rpc.chain.getBlockHash(0)).toHex();
    const domain = {
      name: "Claim Free SBT",
      version: "1",
      chainId: 0,
      salt: genesis,
    };
    const types = {
      Transaction: [{ name: "proof", type: "bytes" }],
    };

    for (const post of posts) {
      console.log(post[0])
      const zkp = post[0];
      const value = {
        proof: zkp.proof,
      };
      console.log(value)
      const msgParams = JSON.stringify({
        domain: domain,
        types: types,
        primaryType: 'Transaction',
        message: value
      })
      const sign = await (window as any).ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [maskAddress, msgParams],
      });

      console.log(sign)
      const payload: SignerPayloadRaw = {
        address: publicAddress!,
        // data: ethers.utils._TypedDataEncoder.hash(domain, types, value),
        data: sign,
        type: "bytes"
      };

      // @ts-ignore
      const sig = await signer.signRaw(payload);
      const sigAndPubKey = { sig: { sr25519: sig.signature }, pub_key: { sr25519: decodeAddress(publicAddress) } };

      const tx = api!.tx.mantaSbt.toPrivate(null, null, sigAndPubKey, zkp, babID);
      batchesTx.push(tx);
    };

    await batchesTx[0].signAndSend(publicAddress!, { nonce: -1 }, async ({ events = [], status, txHash, dispatchError }:any) => {
      if (status.isInBlock || status.isFinalized) {
        let tx_data = transactionDatas[0];
        const proofId = u8aToHex(
          tx_data[0].ToPrivate[0]['utxo_commitment_randomness']
        );
        console.log("ProofKey:" + proofId);
        // let eth_address = "0xf5F1bb0420543b1db39351F0B8c63a844e8F982c";
        // const proof_info = await proofInfo(transactionDatas, startAssetId, "TOKEN", zkAddress, eth_address, "https://manta.network/");
        // const post_proof_info = {
        // "address": signerAccount.address,
        // "proof_info": proof_info
        // }
        // TODO: save proof info to NPO platform.
      }
    });
    // await publishTransaction([sbtTx]);
  };
  // console.log(res.toHuman())
  // await publishTransaction([sbtTx]);
  // } catch (e:any) {
  //   console.log(e.toString())
  //   setIsOpen(e.toString())
  // }


  const connectWeb3 = async () => {
    // 判断链对不，链不对就请求切换网络，或者添加网络，
    if ((window as any).ethereum) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{
            chainId: Web3.utils.numberToHex(56) // 目标链ID
          }]
        })
      } catch (e) {
        if ((e as any).code === 4902) {
          try {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x38',
                chainName: 'BNB Smart Chain (previously Binance Smart Chain Mainnet)',
                nativeCurrency: {
                  name: 'Binance Coin',
                  symbol: 'BNB',
                  decimals: 18
                },
                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                blockExplorerUrls: ['https://bscscan.com/']
              }]
            })
          } catch (ee) {
            //
          }
        } else if ((e as any).code === 4001) return
      }
    }
  }

  const disconnectMetaMask = async () => {
    await (window as any).ethereum.request({
      method: "eth_requestAccounts",
      params: [
        {
          eth_accounts: {}
        }
      ]
    });
    await (window as any).ethereum.request({
      method: "wallet_requestPermissions",
      params: [
        {
          eth_accounts: {}
        }
      ]
    });
  }

  return (
    <div className="main-app relative flex min-h-screen flex-col justify-center overflow-hidden bg-gray-50 py-6 sm:py-12">
      <div className="relative px-6 pb-8 pt-10 ring-1 ring-gray-900/5 sm:mx-auto sm:max-w-lg sm:rounded-lg sm:px-10">
        <div className="mx-auto max-w-md">
          <div className='flex items-center'>
            <img src="https://wetee.app/images/icon.png" className="h-16 text-white" alt="DTIM-身份认证" />
            <div className='text-white ml-4 flex-row '>
              <div>DTIM - zkBAB身份认证</div>
              <div className='text-sm text-slate-300' >通过 Manta Network 和 BAB (Binance Account Bound Token) 完成您的数字身份认证。</div>
            </div>
          </div>
          <div className='h-3'></div>
          <div className="divide-y">
            <div className="space-y-6 py-8 text-base leading-7 text-white">
              <ul className="space-y-4 ml-0.5">
                <li className="flex items-start step">
                  <svg style={{ filter: (publicBalance != null && parseInt(publicBalance) > 0) ? "" : "grayscale(100%)" }} className="h-6 w-6 flex-none fill-sky-100 stroke-sky-500 stroke-2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="11" />
                    <path d="m8 13 2.165 2.165a1 1 0 0 0 1.521-.126L16 9" fill="none" />
                  </svg>
                  <div className='step-dot'></div>
                  <div className="ml-4">
                    <div style={{ marginTop: "-0.55rem" }} className="py-2 text-lg font-medium text-slate-300/60">第一步: Manta Network</div>
                    {zkAddress ? <div>
                      <div className="outline outline-offset-1 outline-slate-500/10 rounded flex items-center mb-4">
                        <div className='break-all text-white w-20 text-sm p-1.5 text-center'>账户地址
                        </div>
                        <div className='break-all text-white text-sm flex-1 p-1.5  border-l-2 border-slate-500/10'> {zkAddress}
                          <button
                            className="text-left text-white focus:outline-none"
                            style={{ fontSize: "12px", padding: "2px 5px", marginLeft: "10px" }}
                            onClick={onConnect}
                          >
                            重联
                          </button>
                        </div>
                      </div>
                      <div className="outline outline-offset-1 outline-slate-500/10 rounded flex mb-4">
                        <div className='break-all text-white w-20 text-sm p-1.5 text-center'>账户余额</div>
                        <div className='break-all text-white text-sm flex-1 p-1.5 border-l-2 border-slate-500/10'>{publicBalance ?? "Wallet is not ready"}</div>
                      </div>
                    </div> : <button
                      className="text-left px-4 py-1.5 text-white focus:outline-none"
                      onClick={onConnect}
                    >
                      连接 Manta 钱包
                    </button>}
                  </div>
                </li>
                <li className="flex items-start step">
                  <svg style={{ filter: babID ? "" : "grayscale(100%)" }} className="h-6 w-6 flex-none fill-sky-100 stroke-sky-500 stroke-2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="11" />
                    <path d="m8 13 2.165 2.165a1 1 0 0 0 1.521-.126L16 9" fill="none" />
                  </svg>
                  <div className='step-dot'></div>
                  <div className="ml-4">
                    <div style={{ marginTop: "-0.55rem" }} className="py-2 text-lg font-medium text-slate-300/60">第二步: 连接 binance 获取BAB</div>
                    {maskAddress ? <div>
                      <div className="outline outline-offset-1 outline-slate-500/10 rounded flex items-center mb-4">
                        <div className='break-all text-white w-20 text-sm p-1.5 text-center'>账户地址</div>
                        <div className='break-all text-white text-sm flex-1 p-1.5  border-l-2 border-slate-500/10'> {maskAddress}  <button
                          className="text-left text-white focus:outline-none inline-block"
                          style={{ fontSize: "12px", padding: "2px 5px", marginLeft: "10px" }}
                          onClick={connectMetaMask}
                        >
                            重联
                          </button></div>
                      </div>
                      <div className="outline outline-offset-1 outline-slate-500/10 rounded flex items-center mb-4">
                        <div className='break-all text-white w-20 text-sm p-1.5 text-center'>BAB ID</div>
                        <div className='break-all text-white text-sm flex-1 p-1.5 border-l-2 border-slate-500/10'>{babID ? <div className='inline-block'>
                          <img className='h-8 inline-block' style={{ marginLeft: "-10px" }} src='https://public.nftstatic.com/images/babt/token.gif' />
                          {babID}
                        </div> : "当前账户未持有BAB"}
                        </div>
                      </div>
                    </div> : <button
                      className="text-left px-4 py-1.5 text-white focus:outline-none"
                      onClick={connectMetaMask}
                    >
                      连接 Metamask 钱包
                    </button>}
                  </div>
                </li>
                <li className="flex items-start">
                  <svg style={{ filter: "grayscale(100%)" }} className="h-6 w-6 flex-none fill-sky-100 stroke-sky-500 stroke-2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="11" />
                    <path d="m8 13 2.165 2.165a1 1 0 0 0 1.521-.126L16 9" fill="none" />
                  </svg>
                  <div className="ml-4">
                    <div style={{ marginTop: "-0.55rem" }} className="py-2 text-lg font-medium text-slate-300/60">第三步: 生成zkSBT</div>
                    <button
                      disabled={!babID || (publicBalance == null || parseInt(publicBalance) == 0)}
                      className="text-left px-4 py-1.5 text-white focus:outline-none"
                      onClick={mint}
                    >
                      完成身份认证
                    </button>
                  </div>
                </li>
              </ul>
              <div className='h-0.5'></div>
              <p>完成认证后,客户端会自动获取认证信息并做出相应处理，无需刷新客户端</p>
            </div>
            <div className="pt-8 text-base font-semibold leading-7  border-gray-200/30">
              <div className="text-slate-300 flex flex-row items-center">
                <div className='mr-2' >Powered by</div>
                <a target="_blank" href='https://npo.manta.network/calamari/sbt/projects/zkBAB'><img className='h-10' src='https://manta.network/assets/img/logo-white.svg' /></a>
                <div className='ml-2 mr-1'>+</div>
                <a target="_blank" href='https://www.binance.com/en/BABT'><img className='h-12' src='https://public.nftstatic.com/images/babt/token.gif' /></a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Transition appear show={isOpen != ""} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsOpen("")}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Error
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {isOpen}
                    </p>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={() => setIsOpen("")}
                    >
                      Got it
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
