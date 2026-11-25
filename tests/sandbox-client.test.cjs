// The sandbox frame can be taken out of the page while an export is drawing cards (ChatGPT
// re-rendering as it settles after a navigation did this on 2026-11-24: 7 of 23 cards fell back
// to the plain text with "Cannot read properties of null (reading 'postMessage')").
// The client puts the frame back, waits for its page and carries on.
const {test}=require('node:test');const assert=require('node:assert/strict');require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
// A stand-in document: append() connects the frame and "loads" its page shortly after;
// remove() disconnects it (contentWindow null, as in Chrome). The page answers every request.
function fakeDoc({loadMs=5}={}){
  const frames=[];let loads=0;
  const doc={createElement:()=>{
    const listeners={};const frame={dataset:{},style:{},isConnected:false,contentWindow:null,setAttribute(){},
      addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);},
      remove(){frame.isConnected=false;frame.contentWindow=null;}};
    frames.push(frame);
    frame.attach=()=>{frame.isConnected=true;let loaded=false;
      frame.contentWindow={postMessage:(msg,origin,[port])=>{if(!loaded)return;/* a page still loading drops it */port.postMessage({tree:{type:'text',props:{},children:[msg.type]}});}};
      setTimeout(()=>{loaded=true;loads++;const fns=listeners.load||[];listeners.load=[];fns.forEach(f=>f());},loadMs);};
    return frame;},
    documentElement:{append:f=>f.attach()}};
  return {doc,frames,loads:()=>loads};
}
test('sandbox client answers requests',async()=>{
  const {doc}=fakeDoc(),client=render.sandboxClient(doc,'sandbox.html',{timeout:500});
  assert.deepEqual(await client({code:'x'}),{type:'text',props:{},children:['dil:evaluate']});
  client.close();
});
test('sandbox client puts a removed frame back and keeps answering',async()=>{
  const {doc,frames,loads}=fakeDoc(),client=render.sandboxClient(doc,'sandbox.html',{timeout:500});
  await client({code:'x'});
  frames[0].remove();
  // Several cards ask at once after the frame was taken out.
  const trees=await Promise.all([client({code:'a'}),client({code:'b'}),client.snapshot({code:'c'})]);
  assert.equal(trees.length,3);assert.equal(loads(),2);assert.equal(frames.length,1);assert.equal(client.stats.reattached,1);
  client.close();
});
test('a request sent just before the frame was removed is sent again',async()=>{
  const {doc,frames}=fakeDoc({loadMs:20}),client=render.sandboxClient(doc,'sandbox.html',{timeout:150});
  await client({code:'x'});
  // Remove the frame right after this request went out: its answer never comes.
  const pending=client({code:'late'});frames[0].remove();
  await new Promise(r=>setTimeout(r,10));const other=client({code:'other'});// notices the removal and re-attaches
  assert.deepEqual(await pending,{type:'text',props:{},children:['dil:evaluate']});await other;
  client.close();
});
test('after close, requests fail with a clear error, not a TypeError',async()=>{
  const {doc}=fakeDoc(),client=render.sandboxClient(doc,'sandbox.html',{timeout:200});
  await client({code:'x'});client.close();
  await assert.rejects(client({code:'y'}),e=>!(e instanceof TypeError));
});
