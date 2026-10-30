/* Talo embedded support widget. Public app ID only; never include secret keys. */
(() => {
  const script = document.currentScript;
  if (!script || !script.dataset.appId || document.querySelector('[data-talo-widget]')) return;
  const appId = script.dataset.appId;
  if (!/^app_[0-9a-f-]{36}$/.test(appId)) return;
  const base = new URL(script.src).origin;
  const mount = document.createElement('div');
  mount.dataset.taloWidget = '';
  document.body.append(mount);
  const root = mount.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;font-family:Arial,sans-serif;color:#30261f}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}.launcher{position:fixed;right:24px;bottom:24px;width:58px;height:58px;border:0;border-radius:50%;background:#ee431f;color:white;font-size:25px;box-shadow:0 8px 26px #6e28142b;z-index:2147483000}.panel{position:fixed;right:24px;bottom:94px;width:370px;max-width:calc(100vw - 32px);height:530px;max-height:calc(100dvh - 120px);background:#fffcf8;border:1px solid #e9ddd0;border-radius:18px;box-shadow:0 16px 60px #36201126;z-index:2147483000;display:flex;flex-direction:column;overflow:hidden}.panel[hidden]{display:none}header{display:flex;align-items:center;gap:10px;padding:18px;border-bottom:1px solid #ecdfd2}h2{font-size:16px;line-height:1.3;margin:0;overflow-wrap:anywhere}small{display:block;font-size:11px;color:#897767;margin-top:4px}.close,.reset{background:none;border:0;color:#806b5b;min-height:44px;padding:8px;font-size:12px}.close{margin-left:auto;font-size:24px}.log{overflow:auto;flex:1;padding:18px;overscroll-behavior:contain}.message{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2e9df;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.6;margin-bottom:12px}.user{background:#ffdfcc;margin-left:30px}.source{font-size:11px;color:#8c7967;padding:0 5px 15px;line-height:1.6}.source summary{cursor:pointer}.source p{white-space:pre-wrap;overflow-wrap:anywhere}form{border-top:1px solid #ecdfd2;padding:14px;display:flex;gap:8px}input{width:100%;min-width:0;border:1px solid #e0d3c6;border-radius:9px;padding:12px;font-size:16px;color:#30261f;background:white}form button{border:0;border-radius:9px;background:#ee431f;color:white;padding:10px 13px;min-height:44px}.status{padding:0 18px 10px;font-size:12px;color:#8e4b34;line-height:1.5}footer{display:flex;align-items:center;justify-content:space-between;padding:0 14px 7px;font-size:10px;color:#9b8877}.panel:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid #d84220;outline-offset:2px}@media(max-width:480px){.launcher{right:16px;bottom:16px}.panel{right:16px;bottom:84px;height:560px}.message{font-size:16px}}@media(prefers-reduced-motion:no-preference){.panel{animation:appear .2s ease-out}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}`;
  root.append(style);
  function element(tag, text, className) { const el=document.createElement(tag); if(text)el.textContent=text;if(className)el.className=className;return el; }
  const launcher=element('button','?','launcher');launcher.type='button';launcher.setAttribute('aria-label','Open support');launcher.setAttribute('aria-expanded','false');
  const panel=element('section',null,'panel');panel.hidden=true;panel.setAttribute('aria-label','Talo support');panel.id='talo-panel';launcher.setAttribute('aria-controls',panel.id);
  const header=element('header');const title=element('h2','Support');const titleBlock=element('div');titleBlock.append(title,element('small','Powered by Talo'));const close=element('button','\u00d7','close');close.type='button';close.setAttribute('aria-label','Close support');header.append(titleBlock,close);
  const log=element('div',null,'log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-relevant','additions');
  const status=element('div','','status');status.setAttribute('role','status');
  const form=element('form');const input=element('input');input.setAttribute('aria-label','Your support question');input.placeholder='Ask a question...';input.maxLength=1000;input.required=true;const send=element('button','Send');send.type='submit';form.append(input,send);
  const footer=element('footer');const reset=element('button','New conversation','reset');reset.type='button';footer.append(element('span','Context stays in this open tab'),reset);panel.append(header,log,status,form,footer);root.append(panel,launcher);
  let history=[];let busy=false;let ready=false;
  function message(text, role) { const item=element('div',text,`message ${role}`);log.append(item);log.scrollTop=log.scrollHeight; }
  function welcome(){message('Hi. What can I help you with? I answer from this product\'s support documentation.','assistant');}
  welcome();
  function open(value){panel.hidden=!value;launcher.setAttribute('aria-expanded',String(value));launcher.setAttribute('aria-label',value?'Close support':'Open support');if(value)input.focus();else launcher.focus();}
  launcher.addEventListener('click',()=>open(panel.hidden));close.addEventListener('click',()=>open(false));panel.addEventListener('keydown',event=>{if(event.key==='Escape')open(false);});
  reset.addEventListener('click',()=>{if(busy)return;history=[];log.replaceChildren();status.textContent='';welcome();input.focus();});
  async function api(path,body){const response=await fetch(`${base}/api/widget/${path}?appId=${encodeURIComponent(appId)}`,{method:body?'POST':'GET',mode:'cors',credentials:'omit',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Support is unavailable. Try again later.');return data;}
  send.disabled=true;
  api('config').then(data=>{title.textContent=data.name;ready=true;send.disabled=false;}).catch(()=>{status.textContent='Support is not connected on this website. Please contact the team.';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const question=input.value.trim();if(!ready||busy||!question)return;
    busy=true;send.disabled=true;reset.disabled=true;input.disabled=true;status.textContent='Looking through the support documentation...';message(question,'user');
    try {const data=await api('chat',{message:question,history:history.slice(-6)});message(data.answer,'assistant');if(data.source){const details=element('details',null,'source');details.append(element('summary',data.generation==='openai'?'Source: support documentation':'Matched documentation excerpt'),element('p',data.source));log.append(details);}history.push({role:'user',text:question},{role:'assistant',text:data.answer});history=history.slice(-6);input.value='';status.textContent=data.generation==='documentation'?'Showing a documentation excerpt. AI is currently unavailable.':'';log.scrollTop=log.scrollHeight;}
    catch(error){status.textContent=error instanceof Error&&error.name!=='TypeError'?error.message:'Support could not connect. Please try again.';}
    finally{busy=false;send.disabled=false;reset.disabled=false;input.disabled=false;if(!panel.hidden)input.focus();}
  });
})();
