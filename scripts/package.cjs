const fs=require('node:fs'),path=require('node:path');
const JSZip=require('../extension/jszip.min.js');
(async()=>{
  const zip=new JSZip();
  function add(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name),name=prefix+entry.name;if(entry.isDirectory())add(full,name+'/');else zip.file(name,fs.readFileSync(full));}}
  add('extension'); fs.mkdirSync('releases',{recursive:true});
  const version=JSON.parse(fs.readFileSync('extension/manifest.json')).version;
  const output=`releases/chat-intelligent-ui-exporter-${version}.zip`;
  fs.writeFileSync(output,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(output);
})();
