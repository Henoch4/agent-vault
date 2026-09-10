const VAULT_DEFAULT=`0x3cb5faCA74f5F0211a1f1a773Ed45B042bDD50C5`;
const RPC=`https://rpc.bohr.life`;
const EXPLORER=`https://scan.bohr.life`;
const CHAIN_ID=0x3c8;

const VAULT_ABI=[
`function owner() view returns (address)`,
`function pendingOwner() view returns (address)`,
`function pendingOwnerAt() view returns (uint256)`,
`function paused() view returns (bool)`,
`function agents(address) view returns (bool)`,
`function targets(address) view returns (bool)`,
`function dailyLimit(address,address) view returns (uint256)`,
`function perTxLimit(address,address) view returns (uint256)`,
`function execCooldown() view returns (uint256)`,
`function lastExec(address) view returns (uint256)`,
`function daySpent(address,address) view returns (uint256)`,
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

const ERC20_ABI=[
`function balanceOf(address) view returns (uint256)`,
`function transfer(address,uint256) returns (bool)`,
];

let signer=null;
let account=null;

function el(id){ return document.getElementById(id); }
function shorten(a){ return a ? a.slice(0,6)+`…`+a.slice(-4) : (a===null?`null`:`—`); }
function log(m){
  for(const id of [`log`,`logfoot`]){
    const t=el(id);
    const d=document.createElement(`div`);
    d.textContent=m;
    t.appendChild(d);
    t.scrollTop=t.scrollHeight;
  }
}
function fmtW(n){ return ethers.formatEther(n)+` BOT`; }

function vault(){
  const a=el(`vaddr`).value.trim()||VAULT_DEFAULT;
  const p=signer||new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(a,VAULT_ABI,p);
}
function vaultAddr(){
  return el(`vaddr`).value.trim()||VAULT_DEFAULT;
}
function erc20(a){
  const p=signer||new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(a,ERC20_ABI,p);
}

async function connect(e){
  if(e) e.preventDefault();
  if(!window.ethereum){ log(`no wallet found, use MetaMask`); return; }
  const accs=await window.ethereum.request({method:`eth_requestAccounts`});
  account=accs[0];
  try{
    await window.ethereum.request({method:`wallet_switchEthereumChain`,params:[{chainId:`0x${CHAIN_ID.toString(16)}`}]});
  }catch(e){
    await window.ethereum.request({method:`wallet_addEthereumChain`,params:[{chainId:`0x${CHAIN_ID.toString(16)}`,chainName:`BOT Chain Testnet`,nativeCurrency:{name:`BOT`,symbol:`BOT`,decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});
  }
  signer=await new ethers.BrowserProvider(window.ethereum).getSigner();
  el(`navState`).textContent=shorten(account)+` · testnet`;
  el(`connectBtn`).textContent=`Connected`;
  log(`connected `+account);
  readPolicy(); refreshDial(); refreshVault();
}

async function act(promise,label){
  try{
    const tx=await promise;
    log(label+` sent `+tx.hash);
    await tx.wait();
    log(`✓ `+label+` confirmed`);
    readPolicy(); refreshDial(); refreshVault();
  }catch(e){
    log(`✗ `+label+` failed: `+(e.reason||e.shortMessage||(e.message||e).split(`\n`)[0]));
  }
}

async function readPolicy(){
  const v=vault();
  try{
    const now=Math.floor(Date.now()/1000);
    const owner=await v.owner();
    const paused=await v.paused();
    const pending=await v.pendingOwner();
    const pAt=Number(await v.pendingOwnerAt());
    const cd=Number(await v.execCooldown());
    const zero=`0x0000000000000000000000000000000000000000`;
    const cdTxt=cd?cd+` s`:`off`;
    el(`stOwner`).textContent=shorten(owner);
    el(`stPaused`).textContent=paused?`ON`:`off`;
    el(`stPaused`).className=el(`stPaused`).className=paused?`val on`:`val`;
    el(`stPending`).textContent=pending===zero?`none`:shorten(pending);
    el(`stRotationAt`).textContent=pending===zero?`—`:fmtWhen(pAt);
    el(`stCooldown`).textContent=cdTxt;
    el(`metaOwner`).textContent=shorten(owner);
    el(`metaPause`).textContent=paused?`PAUSED`:`live`;
    el(`metaPause`).style.color=paused?`var(--rust)`:`var(--brass)`;

    const pendingNonzero=pending!==zero;
    el(`tlPropose`).classList.toggle(`live`,pendingNonzero);
    el(`tlWait`).classList.toggle(`live`,pendingNonzero);
    const canAccept=pendingNonzero && now>=pAt+2*86400;
    el(`tlAccept`).classList.toggle(`live`,canAccept);

    if(pendingNonzero){
      el(`rotationStatus`).style.display=`block`;
      const remain=pAt+2*86400-now;
      el(`rotationStatus`).textContent=canAccept
        ?`acceptOwner is ready — pending ${shorten(pending)} can take ownership now`
        :`rotation to ${shorten(pending)} pending · accept unlocks ${remain>0?(Math.ceil(remain/3600))+'h':''} (2-day timelock)`;
    }else{
      el(`rotationStatus`).style.display=`none`;
    }
  }catch(e){
    log(`read policy failed: `+(e.shortMessage||e.message));
  }
}
function fmtWhen(ts){
  if(!ts)return `—`;
  const d=new Date(ts*1000);
  return d.toLocaleString();
}

async function refreshDial(){
  const v=vault();
  const agent=el(`dialAgent`).value.trim();
  const token=el(`dialToken`).value.trim()||`0x0000000000000000000000000000000000000000`;
  if(!agent || !/^0x[0-9a-fA-F]{40}$/.test(agent)){
    for(const id of [`limitVal`,`usedVal`,`ptxVal`,`cdVal`,`leVal`])el(id).textContent=`—`;
    el(`meterFill`).style.width=`0%`;
    el(`meterFill`).classList.remove(`denied`);
    return;
  }
  try{
    const daily=await v.dailyLimit(agent,token);
    const spent=await v.daySpent(agent,token);
    const ptl=await v.perTxLimit(agent,token);
    const le=Number(await v.lastExec(agent));
    el(`limitVal`).textContent=`${fmtW(daily)}`;
    el(`usedVal`).textContent=`${fmtW(spent)}`;
    el(`ptxVal`).textContent=ptl===0n?`no cap`:fmtW(ptl);
    el(`cdVal`).textContent=Number(await v.execCooldown())?Number(await v.execCooldown())+` s`:`off`;
    el(`leVal`).textContent=le?new Date(le*1000).toLocaleString():`never`;
    const pct=Number(spent*10000n/daily)/100;
    const fill=el(`meterFill`);
    fill.style.width=(daily===0n?100:Math.min(100,pct))+'%';
    const over=daily!==0n && spent>=daily;
    fill.classList.toggle(`denied`,over);
  }catch(e){
    log(`policy read failed: `+(e.shortMessage||e.message));
    el(`limitVal`).textContent=`err`;
  }
}

async function refreshVault(){
  const a=vaultAddr();
  const bal=el(`vaultBal`), tok=el(`vaultTokBal`);
  bal.textContent=`—`; tok.textContent=`—`;
  try{
    const p=new ethers.JsonRpcProvider(RPC);
    bal.textContent=fmtW(await p.getBalance(a));
    const t=el(`dialToken`).value.trim();
    if(/^0x[0-9a-fA-F]{40}$/.test(t) && t!==`0x0000000000000000000000000000000000000000`){
      tok.textContent=fmtW(await erc20(t).balanceOf(a));
    }
  }catch(e){
    bal.textContent=`err`;
  }
}

async function doDeposit(){
  if(!signer){ await connect(); if(!signer)return; }
  const amt=ethers.parseEther(el(`depAmt`).value||`0`);
  if(amt<=0n){ log(`deposit: amount must be > 0`); return; }
  await act(signer.sendTransaction({to:vaultAddr(),value:amt}),`deposit native BOT `+ethers.formatEther(amt));
}

async function doDepositTok(){
  if(!signer){ await connect(); if(!signer)return; }
  const t=el(`dialToken`).value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(t) || t===`0x0000000000000000000000000000000000000000`){
    log(`deposit token: set a token address in the dial field (0x0 native is for the native deposit)`);
    return;
  }
  const amt=ethers.parseEther(el(`depTokAmt`).value||`0`);
  if(amt<=0n){ log(`deposit token: amount must be > 0`); return; }
  await act(erc20(t).transfer(vaultAddr(),amt),`deposit token in dial `+ethers.formatEther(amt));
}

async function doExecute(){
  const v=vault();
  const target=el(`exTgt`).value.trim();
  const amt=el(`exAmt`).value.trim();
  const token=el(`dialToken`).value.trim()||`0x0000000000000000000000000000000000000000`;
  const verdict=el(`verdict`);
  if(!target || !amt){
    verdict.className=`verdict denied`;
    el(`verdictText`).innerHTML=`Missing target or amount`;
    return;
  }
  if(!signer){ await connect(); if(!signer)return; }
  el(`execBtn`).disabled=true;
  verdict.className=`verdict`;
  el(`verdictText`).textContent=`Sending…`;
  try{
    const tx=await v.execute(token,target,ethers.parseEther(amt),`0x`);
    log(`execute sent `+tx.hash);
    await tx.wait();
    verdict.className=`verdict approved`;
    el(`verdictText`).innerHTML=`Transfer sent — no owner signature needed`;
    el(`reqLine`).textContent=`Executed `+amt+` → `+shorten(target);
    readPolicy(); refreshDial();
  }catch(e){
    const reason=e.reason||e.shortMessage||(e.message||e).split(`\n`)[0];
    verdict.className=`verdict denied`;
    el(`verdictText`).innerHTML=`Denied &nbsp;<span class="reason mono">${reason}</span>`;
    log(`✗ execute failed: `+reason);
  }finally{
    el(`execBtn`).disabled=false;
  }
}

async function doOwnercmd(kind){
  const v=vault();
  const is=(a)=>a.trim();
  switch(kind){
    case `agent`:
      return act(v.setAgent(is(el(`ag_addr`).value),el(`ag_on`).value===`true`),`setAgent`);
    case `target`:
      return act(v.setTarget(is(el(`tg_t`).value),el(`tg_on`).value===`true`),`setTarget`);
    case `limit`:
      return act(v.setDailyLimit(is(el(`lim_a`).value),is(el(`lim_t`).value),ethers.parseEther(el(`lim_v`).value||`0`)),`setDailyLimit`);
    case `percd`:
      await act(v.setPerTxLimit(is(el(`ptx_a`).value),is(el(`ptx_t`).value),ethers.parseEther(el(`ptx_v`).value||`0`)),`setPerTxLimit`);
      await act(v.setExecCooldown(Number(el(`cd_v`).value||`0`)),`setExecCooldown`);
      return;
    case `pause`:
      return act(v.setPaused(el(`p_on`).value===`true`),`setPaused`);
    case `withdraw`:
      return act(v.ownerWithdraw(is(el(`w_tok`).value),ethers.parseEther(el(`w_amt`).value||`0`),is(el(`w_to`).value)),`ownerWithdraw`);
    case `propose`:
      return act(v.proposeOwner(is(el(`ro_p`).value)),`proposeOwner`);
    case `cancel`:
      return act(v.cancelOwnerRotation(),`cancelOwnerRotation`);
    case `accept`:
      return act(v.acceptOwner(),`acceptOwner`);
  }
}

document.addEventListener(`DOMContentLoaded`,()=>{
  el(`vaddr`).value=VAULT_DEFAULT;
  el(`connectBtn`).addEventListener(`click`,connect);
  el(`refreshBtn`).addEventListener(`click`,()=>{ readPolicy(); refreshDial(); refreshVault(); });
  el(`execBtn`).addEventListener(`click`,doExecute);
  el(`depBtn`).addEventListener(`click`,doDeposit);
  el(`depTokBtn`).addEventListener(`click`,doDepositTok);
  el(`b_setagent`).addEventListener(`click`,()=>doOwnercmd(`agent`));
  el(`b_settarget`).addEventListener(`click`,()=>doOwnercmd(`target`));
  el(`b_setlimit`).addEventListener(`click`,()=>doOwnercmd(`limit`));
  el(`b_setpercd`).addEventListener(`click`,()=>doOwnercmd(`percd`));
  el(`b_pause`).addEventListener(`click`,()=>doOwnercmd(`pause`));
  el(`b_withdraw`).addEventListener(`click`,()=>doOwnercmd(`withdraw`));
  el(`b_propose`).addEventListener(`click`,()=>doOwnercmd(`propose`));
  el(`b_cancelrotation`).addEventListener(`click`,()=>doOwnercmd(`cancel`));
  el(`b_accept`).addEventListener(`click`,()=>doOwnercmd(`accept`));
  el(`clearLog`).addEventListener(`click`,(e)=>{ e.preventDefault(); for(const id of [`log`,`logfoot`])el(id).innerHTML=``; });
  el(`vaddr`).addEventListener(`change`,()=>{ readPolicy(); refreshDial(); refreshVault(); });
  for(const id of [`dialAgent`,`dialToken`])el(id).addEventListener(`change`,refreshDial);
  el(`dialToken`).addEventListener(`change`,refreshVault);
  readPolicy(); refreshVault();
  setInterval(()=>{ refreshVault(); },30000);
});