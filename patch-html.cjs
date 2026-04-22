// patch-html.js — Injects a fetch-interceptor into index.html
// so that campaigns.ads calls resolve DB ids to real Meta campaign IDs
const fs = require('fs');
const path = require('path');

// Auto-detect the correct path
const possiblePaths = [
  path.join(__dirname, 'dist/public/index.html'),
  '/home/ubuntu/meta-ads-dashboard/dist/public/index.html',
  path.resolve(__dirname, 'dist/public/index.html'),
];

let htmlPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    htmlPath = p;
    break;
  }
}

if (!htmlPath) {
  console.error('ERROR: Could not find index.html. Tried:', possiblePaths);
  process.exit(1);
}

console.log('Found index.html at:', htmlPath);
let html = fs.readFileSync(htmlPath, 'utf8');

// Don't double-patch
if (html.includes('__metaIdMap')) {
  console.log('Already patched! Skipping.');
  process.exit(0);
}

const script = `<script>
(function(){
  var OF=window.fetch;
  // Build metaIdMap on page load for ALL accounts
  function loadMetaIdMap(){
    // Find accountId from the page URL or localStorage
    var aid=60015; // default
    try{
      var m=window.location.search.match(/accountId=(\\d+)/);
      if(m)aid=parseInt(m[1]);
    }catch(e){}
    var inp=encodeURIComponent(JSON.stringify({"0":{json:{accountId:aid}}}));
    OF.call(window,'/api/trpc/campaigns.list?batch=1&input='+inp)
    .then(function(r){return r.json()})
    .then(function(d){
      var cs=d[0]&&d[0].result&&d[0].result.data&&d[0].result.data.json;
      if(!cs)return;
      if(!window.__metaIdMap)window.__metaIdMap={};
      cs.forEach(function(c){if(c.id&&c.metaCampaignId)window.__metaIdMap[String(c.id)]=c.metaCampaignId});
      console.log('[SELVA] MetaIdMap loaded: '+Object.keys(window.__metaIdMap).length+' campaigns');
    }).catch(function(e){console.error('[SELVA] Failed to load metaIdMap:',e)});
  }
  // Load on DOMContentLoaded with a small delay to ensure auth is ready
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){setTimeout(loadMetaIdMap,800)});
  }else{
    setTimeout(loadMetaIdMap,500);
  }
  // Patch fetch to intercept campaigns.ads calls
  window.fetch=function(url,opts){
    if(typeof url==='string'&&url.indexOf('campaigns.ads')!==-1&&window.__metaIdMap){
      try{
        var qi=url.indexOf('input=');
        if(qi!==-1){
          var before=url.substring(0,qi+6);
          var after=url.substring(qi+6);
          var ai=after.indexOf('&');
          var enc=ai>=0?after.substring(0,ai):after;
          var rest=ai>=0?after.substring(ai):'';
          var dd=JSON.parse(decodeURIComponent(enc));
          var changed=false;
          Object.keys(dd).forEach(function(k){
            var r=dd[k]&&dd[k].json;
            if(r&&r.metaCampaignId&&window.__metaIdMap[r.metaCampaignId]){
              console.log('[SELVA] Resolved '+r.metaCampaignId+' -> '+window.__metaIdMap[r.metaCampaignId]);
              r.metaCampaignId=window.__metaIdMap[r.metaCampaignId];
              changed=true;
            }
          });
          if(changed)url=before+encodeURIComponent(JSON.stringify(dd))+rest;
        }
      }catch(e){console.error('[SELVA] Patch error:',e)}
    }
    return OF.call(this,url,opts);
  };
})();
</script>`;

html = html.replace('</head>', script + '\n</head>');
fs.writeFileSync(htmlPath, html);
console.log('SUCCESS: index.html patched with metaIdMap fetch interceptor');
console.log('Occurrences of __metaIdMap:', (html.match(/__metaIdMap/g)||[]).length);
