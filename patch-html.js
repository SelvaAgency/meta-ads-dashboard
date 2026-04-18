// patch-html.js — Injects a fetch-interceptor into index.html
// so that campaigns.ads calls resolve DB ids to real Meta campaign IDs
const fs = require('fs');
const path = '/home/ubuntu/meta-ads-dashboard/dist/public/index.html';

let html = fs.readFileSync(path, 'utf8');

// Don't double-patch
if (html.includes('__metaIdMap')) {
  console.log('Already patched!');
  process.exit(0);
}

const script = `<script>
(function(){
  var OF=window.fetch;
  window.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      var inp=encodeURIComponent(JSON.stringify({"0":{json:{accountId:60015}}}));
      OF.call(window,'/api/trpc/campaigns.list?batch=1&input='+inp)
      .then(function(r){return r.json()})
      .then(function(d){
        var cs=d[0]&&d[0].result&&d[0].result.data&&d[0].result.data.json;
        if(!cs)return;
        var m={};
        cs.forEach(function(c){if(c.id&&c.metaCampaignId)m[String(c.id)]=c.metaCampaignId});
        window.__metaIdMap=m;
        console.log('[PATCH] MetaIdMap loaded: '+Object.keys(m).length+' campaigns');
      }).catch(function(e){console.error('[PATCH] Failed to load metaIdMap:',e)});
    }, 500);
  });
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
              console.log('[PATCH] Resolved campaign '+r.metaCampaignId+' -> '+window.__metaIdMap[r.metaCampaignId]);
              r.metaCampaignId=window.__metaIdMap[r.metaCampaignId];
              changed=true;
            }
          });
          if(changed)url=before+encodeURIComponent(JSON.stringify(dd))+rest;
        }
      }catch(e){console.error('[PATCH] Error:',e)}
    }
    return OF.call(this,url,opts);
  };
})();
</script>`;

html = html.replace('</head>', script + '\n</head>');
fs.writeFileSync(path, html);
console.log('SUCCESS: index.html patched with metaIdMap fetch interceptor');
console.log('Occurrences of __metaIdMap:', (html.match(/__metaIdMap/g)||[]).length);
