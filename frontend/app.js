const VAULT_DEFAULT=`0x9D722b578Ff03791C84F39f0f2F1a78aDd3f9791`;
const RPC=`https://rpc.bohr.life`;
const EXPLORER=`https://scan.bohr.life`;

const VAULT_ABI=[
`function owner() view returns (address)`,
`function pendingOwner() view returns (address)`,
`function agents(address) view returns (bool)`,
`function targets(address) view returns (bool)`,
`function dailyLimit(address,address) view returns (uint256)`,
`function perTxLimit(address,address) view returns (uint256)`,
`function execCooldown() view returns (uint256)`,
`function lastExec(address) view returns (uint256)`,
`function daySpent(address,address) view returns (uint256)`,
`function paused() view returns (bool)`,
`function setAgent(address,bool)`,
`function setTarget(address,bool)`,
`function setDailyLimit(address,address,uint256)`,
`function setPerTxLimit(address,address,uint256)`,
`function setExecCooldown(uint256)`,
`function execute(address,address,uint256,bytes)`,
`function setPaused(bool)`,
`function ownerWithdraw(address,uint256,address)`,
`function proposeOwner(address)`,
`function cancelOwnerRotation()`,
`function acceptOwner()`,
];

let signer=null;
let account=null;

function log(m){
  const el=document.getElementById(`log`);
  el.textContent+=m+`\n`;
}
async function connect(){
  if(!window.ethereum){ log(`no wallet found, use MetaMask`); return; }
  const accs=await window.ethereum.request({method:`eth_requestAccounts`});
  account=accs[0];
  try{
    await window.ethereum.request({method:`wallet_switchEthereumChain`,params:[{chainId:`0x3c8`}]});
  }catch(e){
    await window.ethereum.request({method:`wallet_addEthereumChain`,params:[{chainId:`0x3c8`,chainName:`BOT Chain Testnet`,nativeCurrency:{name:`BOT`,symbol:`BOT`,decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});
  }
  signer=await new ethers.BrowserProvider(window.ethereum).getSigner();
  log(`connected `+account);
}
function vault(){
  const a=document.getElementById(`vaddr`).value||VAULT_DEFAULT;
  const p=signer||new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(a,VAULT_ABI,p);
}

async function send(promise,label){
  try{
    const tx=await promise;
    log(label+` sent `+tx.hash);
    await tx.wait();
    log(label+` confirmed`);
  }catch(e){
    log(label+` failed `+(e.reason||e.message||e));
  }
}
async function doSetAgent(){
  const v=vault();
  const a=document.getElementById(`av_a`).value;
  const on=document.getElementById(`av_on`).value===`true`;
  await send(v.setAgent(a,on),`setAgent`);
}
async function doSetTarget(){
  const v=vault();
  const a=document.getElementById(`tg_t`).value;
  const on=document.getElementById(`tg_on`).value===`true`;
  await send(v.setTarget(a,on),`setTarget`);
}
async function doSetLimit(){
  const v=vault();
  const a=document.getElementById(`lim_a`).value;
  const t=document.getElementById(`lim_t`).value;
  const amt=ethers.parseEther(document.getElementById(`lim_v`).value||`0`);
  await send(v.setDailyLimit(a,t,amt),`setDailyLimit`);
}
async function doSetPerTx(){
  const v=vault();
  const a=document.getElementById(`ptx_a`).value;
  const t=document.getElementById(`ptx_t`).value;
  const amt=ethers.parseEther(document.getElementById(`ptx_v`).value||`0`);
  await send(v.setPerTxLimit(a,t,amt),`setPerTxLimit`);
}
async function doSetCooldown(){
  const v=vault();
  const secs=Number(document.getElementById(`cd_v`).value||`0`);
  await send(v.setExecCooldown(secs),`setExecCooldown`);
}
async function doPropose(){
  const v=vault();
  await send(v.proposeOwner(document.getElementById(`ro_p`).value),`proposeOwner`);
}
async function doCancelRotation(){
  const v=vault();
  await send(v.cancelOwnerRotation(),`cancelOwnerRotation`);
}
async function doAccept(){
  const v=vault();
  await send(v.acceptOwner(),`acceptOwner`);
}
async function doExecute(){
  const v=vault();
  const t=document.getElementById(`ex_tok`).value;
  const to=document.getElementById(`ex_tgt`).value;
  const amt=ethers.parseEther(document.getElementById(`ex_amt`).value||`0`);
  await send(v.execute(t,to,amt,`0x`),`execute`);
}
async function doRead(){
  const v=vault();
  const a=document.getElementById(`rd_a`).value;
  const tk=document.getElementById(`rd_t`).value;
  log(`owner `+await v.owner());
  log(`pendingOwner `+await v.pendingOwner());
  log(`paused `+await v.paused());
  log(`execCooldown `+Number(await v.execCooldown())+` secs`);
  if(a){
    log(`isAgent `+await v.agents(a));
    if(tk){
      log(`dailyLimit `+ethers.formatEther(await v.dailyLimit(a,tk)));
      log(`perTxLimit `+ethers.formatEther(await v.perTxLimit(a,tk)));
      log(`spentToday `+ethers.formatEther(await v.daySpent(a,tk)));
    }
    const le=Number(await v.lastExec(a));
    if(le)log(`lastExec `+new Date(le*1000).toISOString());
  }
}
async function doPause(){
  const v=vault();
  const on=document.getElementById(`p_on`).value===`true`;
  await send(v.setPaused(on),`setPaused`);
}
async function doWithdraw(){
  const v=vault();
  const t=document.getElementById(`w_tok`).value;
  const amt=ethers.parseEther(document.getElementById(`w_amt`).value||`0`);
  const to=document.getElementById(`w_to`).value;
  await send(v.ownerWithdraw(t,amt,to),`ownerWithdraw`);
}
document.getElementById(`b_connect`).addEventListener(`click`,connect);
document.getElementById(`b_setagent`).addEventListener(`click`,doSetAgent);
document.getElementById(`b_settarget`).addEventListener(`click`,doSetTarget);
document.getElementById(`b_setlimit`).addEventListener(`click`,doSetLimit);
document.getElementById(`b_setper`).addEventListener(`click`,doSetPerTx);
document.getElementById(`b_setcd`).addEventListener(`click`,doSetCooldown);
document.getElementById(`b_exec`).addEventListener(`click`,doExecute);
document.getElementById(`b_read`).addEventListener(`click`,doRead);
document.getElementById(`b_pause`).addEventListener(`click`,doPause);
document.getElementById(`b_withdraw`).addEventListener(`click`,doWithdraw);
document.getElementById(`b_propose`).addEventListener(`click`,doPropose);
document.getElementById(`b_cancelrotation`).addEventListener(`click`,doCancelRotation);
document.getElementById(`b_accept`).addEventListener(`click`,doAccept);