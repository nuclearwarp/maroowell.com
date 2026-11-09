import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const js=readFileSync("public/home-admin.js","utf8");
const css=readFileSync("public/home-admin.css","utf8");
const html=readFileSync("public/home","utf8");
assert.equal((js.match(/class="homeWorkflowDropzone"/g)||[]).length,2);
for(const id of ["homeProcessFiles","homeTemplateAddFiles"]){
 assert(js.includes('data-workflow-file-input="'+id+'"'),id+" dropzone");
 assert(js.includes('id="'+id+'-selected"'),id+" selected file list");
 assert(js.includes('id="'+id+'" type="file"'),id+" browser file picker");
}
assert(js.includes('bindWorkflowDropzones();'),"dropzones must bind after markup insertion");
assert(js.includes('files=[...workflowPendingFiles("homeProcessFiles")]'),"create must upload queued files");
assert(js.includes('files=[...workflowPendingFiles("homeTemplateAddFiles")]'),"edit must upload queued files");
assert(css.includes(".homeWorkflowDropzone.is-dragover"),"visual active state");
assert(html.includes("/home-admin.js?v=20261109-workflow-dnd2"),"cache-busted JS");
const start=js.indexOf("const WORKFLOW_UPLOAD_HINT=");
const end=js.indexOf("function workflowFileList(",start);
assert(start>=0&&end>start);
const source=js.slice(start,end);
const elements=new Map();
function element(id){
 if(!elements.has(id))elements.set(id,{
   id,value:"",innerHTML:"",textContent:"",dataset:{},classList:{toggle(){},add(){},remove(){}},
   querySelectorAll:()=>[],addEventListener(){},open:false
 });
 return elements.get(id);
}
const H={workflowFiles:{homeProcessFiles:[],homeTemplateAddFiles:[]}};
const factory=new Function("H","$","canEditWorkflow","WORKFLOW_FILE_EXT","esc","document",source+
 "\nreturn {appendWorkflowFiles,workflowPendingFiles,resetWorkflowPendingFiles,renderWorkflowPendingFiles};");
const {appendWorkflowFiles,workflowPendingFiles,resetWorkflowPendingFiles}=factory(H,element,()=>true,
/\.(pdf|doc|docx|xls|xlsx|pptx|jpe?g|png|webp|txt)$/i,
 v=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"),
 {querySelectorAll:()=>[],addEventListener(){}});
const pdf={name:"contract.pdf",size:2048,lastModified:1};
const doc={name:"guide.docx",size:4096,lastModified:2};
let result=appendWorkflowFiles("homeProcessFiles",[pdf,doc]);
assert.equal(result.added,2);
assert.equal(workflowPendingFiles("homeProcessFiles").length,2);
result=appendWorkflowFiles("homeProcessFiles",[pdf,{name:"virus.exe",size:200,lastModified:4},{name:"large.pdf",size:6*1024*1024+1,lastModified:5}]);
assert.equal(result.added,0,"dedupe + reject invalid items");
assert.equal(result.rejected.length,2);
assert.equal(workflowPendingFiles("homeProcessFiles").length,2);
result=appendWorkflowFiles("homeTemplateAddFiles",[doc]);
assert.equal(result.added,1);
assert.equal(workflowPendingFiles("homeTemplateAddFiles").length,1,"edit queue independent");
resetWorkflowPendingFiles("homeProcessFiles");
assert.equal(workflowPendingFiles("homeProcessFiles").length,0);
assert.equal(workflowPendingFiles("homeTemplateAddFiles").length,1);
console.log("PASS workflow drag/drop markup, validation, deduplication and separate create/edit queues");
