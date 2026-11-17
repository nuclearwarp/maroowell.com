import assert from "node:assert/strict";
import worker from "../worker.js";
let calls=0;
const previous=globalThis.fetch;
try {
  globalThis.fetch=async url=>{
    calls++;
    const parsed=new URL(String(url));
    assert.equal(parsed.hostname,"portal.esrikr.com","fixed public source only");
    assert.equal(parsed.searchParams.get("where"),"bsi_zon_no = '07420'");
    assert.equal(parsed.searchParams.get("resultOffset"),"0");
    assert.equal(parsed.searchParams.get("resultRecordCount"),"200");
    assert.equal(parsed.searchParams.get("outSR"),"4326");
    return new Response(JSON.stringify({
      type:"FeatureCollection",features:[
        {id:1,type:"Feature",properties:{objectid:1,street_name:"도림천로13길",house_number:"5",bsi_zon_no:"07420"},geometry:{type:"Polygon",coordinates:[[[126.9,37.5],[126.91,37.5],[126.91,37.51],[126.9,37.5]]]}}
      ]
    }),{status:200,headers:{"Content-Type":"application/json"}});
  };
  for(const bad of ["1234","x' OR 1=1","000000"]){
    const res=await worker.fetch(new Request("https://proxy.test/building-footprints?zipcode="+encodeURIComponent(bad)),{});
    assert.equal(res.status,400);
  }
  assert.equal(calls,0,"invalid zipcode never reaches remote source");
  const badOffset=await worker.fetch(new Request("https://proxy.test/building-footprints?zipcode=07420&offset=-2"),{});
  assert.equal(badOffset.status,400);
  const response=await worker.fetch(new Request("https://proxy.test/building-footprints?zipcode=07420&limit=200"),{});
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),"*");
  assert.equal(data.ok,true);
  assert.equal(data.count,1);
  assert.equal(data.features[0].properties.street_name,"도림천로13길");
  assert.equal(data.hasMore,false);
  assert.equal(calls,1);
  globalThis.fetch=async ()=>new Response(JSON.stringify({type:"FeatureCollection",features:[
    {type:"Feature",properties:{bsi_zon_no:"07421"},geometry:{type:"Polygon",coordinates:[]}}
  ]}),{status:200});
  const mismatch=await worker.fetch(new Request("https://proxy.test/building-footprints?zipcode=07420"),{});
  assert.equal(mismatch.status,502,"never mix unrelated zipcode building footprints");
  console.log("PASS: public official building-geometry proxy, pagination, no arbitrary URL, validation and zip isolation");
} finally {globalThis.fetch=previous}
