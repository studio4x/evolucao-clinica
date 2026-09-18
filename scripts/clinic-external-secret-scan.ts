import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {loadRuntime} from './clinic-preproduction-runtime.js';
const runtime=loadRuntime();
const values=new Set<string>();
function collect(object:any,key='') {if(typeof object==='string'&&object.length>=16&&/(?:token|secret|pass|serviceKey|bypass|actionLink|accessToken)/i.test(key)&&!/ANON|PUBLIC/i.test(key))values.add(object);else if(object&&typeof object==='object')for(const [name,value] of Object.entries(object))collect(value,name);}
collect(runtime);if(process.env.F6B_CHECKPOINT_FILE)collect(JSON.parse(readFileSync(process.env.F6B_CHECKPOINT_FILE,'utf8')));
for(const key of ['CLINIC_INVITATION_SMTP_USER','CLINIC_INVITATION_SMTP_FROM']) {const value=runtime.stagingEnv[key];if(value){values.add(value);for(const address of value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])values.add(address);}}
const files=new Set([...execFileSync('git',['diff','--name-only','82421e96f0000666f76944ba1643c31c882cfe9b'],{encoding:'utf8'}).trim().split('\n'),...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')].filter(Boolean));
for(const file of files){if(!existsSync(file))continue;const content=readFileSync(file,'utf8');assert.ok(![...values].some(value=>content.includes(value)),`credential_detected:${file}`);assert.ok(!/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|https:\/\/checkout\.stripe\.com\/c\/pay\//.test(content),`secret_pattern_detected:${file}`);}
console.log(JSON.stringify({status:'PASS',files:files.size,actualCredentialValuesChecked:values.size,rawCheckoutUrlsAbsent:true}));
