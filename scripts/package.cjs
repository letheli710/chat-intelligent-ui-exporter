// Builds the store package releases/chat-intelligent-ui-exporter-<version>.zip from extension/ as
// committed (HEAD), byte for byte as git stores it (LF line endings), never from the working copy:
// a Windows checkout turns files into CRLF, and an unfinished edit must not reach the store.
// Uncommitted changes under extension/ are named, and left out of the package.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const JSZip=require('../extension/jszip.min.js');
const root=path.join(__dirname,'..');
const git=(...args)=>execFileSync('git',['-c','core.quotepath=off',...args],{cwd:root,maxBuffer:1<<28});
(async()=>{
  const pending=git('status','--porcelain','--','extension').toString().trim();
  if(pending)console.warn(`Not packed (uncommitted, the package holds HEAD):\n${pending}`);
  const zip=new JSZip();
  for(const file of git('ls-tree','-r','--name-only','HEAD','extension/').toString().trim().split('\n'))
    zip.file(file.slice('extension/'.length),git('cat-file','blob',`HEAD:${file}`));
  const version=JSON.parse(git('cat-file','blob','HEAD:extension/manifest.json').toString()).version;
  fs.mkdirSync(path.join(root,'releases'),{recursive:true});
  const output=`releases/chat-intelligent-ui-exporter-${version}.zip`;
  fs.writeFileSync(path.join(root,output),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(output);
})();
