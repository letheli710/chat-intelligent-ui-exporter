const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
// Every change bumps the version so a reloaded extension is recognizable.
test('extension, panel and package versions match',()=>{
  const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
  const panel=fs.readFileSync('extension/fast-content.js','utf8').match(/const version='([^']+)'/)[1];
  // The toolbar panel and the settings tab show this one (settings.js).
  const settings=fs.readFileSync('extension/settings.js','utf8').match(/const version='([^']+)'/)[1];
  assert.equal(panel,manifest.version);assert.equal(settings,manifest.version);assert.equal(JSON.parse(fs.readFileSync('package.json','utf8')).version,manifest.version);
  assert.ok(manifest.version_name.startsWith(manifest.version));
});
