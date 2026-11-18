import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import * as schema from './schema';
import {enrollmentAllowed,mailRequired} from './enrollment.mjs';
import {validateBoard,validateEntry} from './domain.mjs';
interface Env{DB:D1Database;ASSETS:Fetcher;APP_ORIGIN:string;APP_ENV:string;BETTER_AUTH_SECRET:string;MAIL_API_KEY?:string;MAIL_FROM?:string;OWNER_EMAILS?:string}
const blank=()=>({version:1,projects:[],reviews:[],reports:[],rcas:[],drafts:{}});
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function authFor(env:Env){
 const send=async(email:string,url:string,kind:string)=>{
  if(env.APP_ENV==='owner-test'){if(kind==='verify')return;throw Error('Email recovery unavailable in owner testing');}
  if(env.APP_ENV==='local'){await env.DB.prepare('INSERT INTO local_mail VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),email,url,kind,new Date().toISOString()).run();return;}
  if(!env.MAIL_API_KEY||!env.MAIL_FROM)throw Error('Mail is not configured');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:kind==='reset'?'Reset your Personal Board password':'Verify your Personal Board email',text:`Personal Board of Directors\n\n${kind==='reset'?'Reset password':'Verify email'}: ${url}\n\nIf you did not request this, ignore this message.`})});
  if(!r.ok)throw Error('Mail delivery failed');
 };
 return betterAuth({baseURL:env.APP_ORIGIN,secret:env.BETTER_AUTH_SECRET,database:drizzleAdapter(drizzle(env.DB),{provider:'sqlite',schema,transaction:false}),trustedOrigins:[env.APP_ORIGIN],emailAndPassword:{enabled:true,minPasswordLength:12,requireEmailVerification:env.APP_ENV!=='local',revokeSessionsOnPasswordReset:true,sendResetPassword:async({user,url})=>send(user.email,url,'reset')},emailVerification:{sendOnSignUp:mailRequired(env),sendVerificationEmail:async({user,url})=>send(user.email,url,'verify')},user:{deleteUser:{enabled:true}},session:{expiresIn:60*60*24*30,updateAge:60*60*24},advanced:{useSecureCookies:env.APP_ENV!=='local'},rateLimit:{enabled:true,window:60,max:30}});
}
async function limitedRequest(request:Request){if(!request.body)return request;const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('payload');}chunks.push(value);}const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return new Request(request.url,{method:request.method,headers:request.headers,body:data});}
async function handle(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),p=url.pathname;
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(p==='/api/config')return json({local:env.APP_ENV==='local',emailReady:Boolean(env.MAIL_API_KEY&&env.MAIL_FROM),ownerOnly:env.APP_ENV==='owner-test',signup:!mailRequired(env)||Boolean(env.MAIL_API_KEY&&env.MAIL_FROM)});
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)return json({error:'Authentication not configured'},503);
 if(env.APP_ENV==='local'&&!['127.0.0.1','localhost'].includes(url.hostname))return json({error:'Local-only build'},503);
 if(mailRequired(env)&&(!env.MAIL_API_KEY||!env.MAIL_FROM))return json({error:'Public enrollment unavailable until email verification and recovery are configured'},503);
 if(!['GET','HEAD'].includes(request.method)){
  if(request.headers.get('Origin')!==env.APP_ORIGIN)return json({error:'Invalid origin'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415);
  const period=Math.floor(Date.now()/3600000),ip=request.headers.get('CF-Connecting-IP')||'local';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.BETTER_AUTH_SECRET+ip+period));const key=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('')+(p.startsWith('/api/auth')?':auth':':data');
  const r=await env.DB.prepare('INSERT INTO request_limit(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,Date.now()+3600000).first<{count:number}>();if((r?.count||0)>(p.startsWith('/api/auth')?40:1000))return json({error:'Too many requests. Try later.'},429);
  try{request=await limitedRequest(request);}catch{return json({error:'Payload too large'},413);}
 }
 const auth=authFor(env);
 if(env.APP_ENV==='owner-test'&&['/api/auth/sign-up/email','/api/auth/sign-in/email'].includes(p)){const b=await request.clone().json() as {email?:string};if(!enrollmentAllowed(env,b.email))return json({error:'Private owner testing only. Public registration is not open.'},403);}
 if(env.APP_ENV==='owner-test'&&['/api/auth/request-password-reset','/api/auth/reset-password','/api/auth/change-email'].includes(p))return json({error:'Email recovery is not connected during private testing. Contact the operator in Telegram.'},503);
 if(p.startsWith('/api/auth/')){
  if(env.APP_ENV==='local'&&p==='/api/auth/sign-up/email') {const b=await request.clone().json() as {email?:string};if(!b.email?.endsWith('@example.test'))return json({error:'Local test: use @example.test only'},400);}
  return auth.handler(request);
 }
 const session=await auth.api.getSession({headers:request.headers});if(!session)return json({error:'Sign in required'},401);const owner=session.user.id;if(!enrollmentAllowed(env,session.user.email))return json({error:'Private testing only'},403);
 if(env.APP_ENV!=='local'&&!session.user.emailVerified)return json({error:'Verify email first'},403);
 if(p==='/api/board'&&request.method==='GET'){const row=await env.DB.prepare('SELECT data,revision FROM board_state WHERE user_id=?').bind(owner).first<{data:string;revision:number}>();return json({state:row?JSON.parse(row.data):blank(),revision:row?.revision||0,user:{name:session.user.name,email:session.user.email}});}
 if(p==='/api/board'&&request.method==='PUT'){
  const b=await request.json() as {state:any;revision:number};try{validateBoard(b.state);if(!Number.isInteger(b.revision)||b.revision<0)throw Error();}catch{return json({error:'Invalid board data'},400);}
  const now=new Date().toISOString();const r=await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO board_state VALUES(?,0,?,?)').bind(owner,JSON.stringify(blank()),now),env.DB.prepare('UPDATE board_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(b.state),now,owner,b.revision)]);
  if(r[1].meta.changes!==1)return json({error:'Another tab or device saved first. Export your current draft, then reload to resolve the conflict.'},409);return json({revision:b.revision+1});
 }
 if(p==='/api/entries'&&request.method==='GET'){const r=await env.DB.prepare('SELECT id,project_id AS projectId,project_name AS projectName,description,work_date AS workDate,timezone,created_at AS createdAt FROM work_entry WHERE user_id=? ORDER BY work_date DESC,created_at DESC LIMIT 10001').bind(owner).all();return json({entries:r.results.slice(0,10000),partial:r.results.length>10000});}
 if(p==='/api/entries'&&request.method==='POST'){
  const e=await request.json() as any;try{validateEntry(e);}catch{return json({error:'Provide a project, valid date, timezone and work description'},400);}
  const prior=await env.DB.prepare('SELECT project_id,description,work_date,timezone FROM work_entry WHERE id=? AND user_id=?').bind(e.id,owner).first<any>();if(prior){if(prior.project_id!==e.projectId||prior.description!==e.description.trim()||prior.work_date!==e.workDate||prior.timezone!==e.timezone)return json({error:'Entry ID already used for different work'},409);return json({id:e.id,duplicate:true});}
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO work_entry(id,user_id,project_id,project_name,description,work_date,timezone,created_at) SELECT ?,?,json_extract(j.value,'$.id'),json_extract(j.value,'$.name'),?,?,?,? FROM board_state b,json_each(b.data,'$.projects') j WHERE b.user_id=? AND json_extract(j.value,'$.id')=? AND (SELECT COUNT(*) FROM work_entry WHERE user_id=?)<10000`).bind(e.id,owner,e.description.trim(),e.workDate,e.timezone,new Date().toISOString(),owner,e.projectId,owner).run();
  if(inserted.meta.changes!==1)return json({error:'Project unavailable, entry ID conflict or work-entry limit reached'},404);return json({id:e.id},201);
 }
 if(p.startsWith('/api/entries/')&&request.method==='DELETE'){const r=await env.DB.prepare('DELETE FROM work_entry WHERE id=? AND user_id=?').bind(p.slice('/api/entries/'.length),owner).run();return json(r.meta.changes?{deleted:true}:{error:'Not found'},r.meta.changes?200:404);}
 if(p==='/api/export'&&request.method==='GET'){const b=await env.DB.prepare('SELECT data FROM board_state WHERE user_id=?').bind(owner).first<{data:string}>();const entries=await env.DB.prepare('SELECT * FROM work_entry WHERE user_id=?').bind(owner).all();return json({exportedAt:new Date().toISOString(),state:b?JSON.parse(b.data):blank(),entries:entries.results});}
 if(p==='/api/erase'&&request.method==='POST'){const body=await request.json() as any;if(body.confirm!=='ERASE')return json({error:'Explicit confirmation required'},400);await env.DB.batch([env.DB.prepare('DELETE FROM work_entry WHERE user_id=?').bind(owner),env.DB.prepare('DELETE FROM board_state WHERE user_id=?').bind(owner)]);return json({deleted:true});}
 return json({error:'Not found'},404);
}
export default {async fetch(request:Request,env:Env){try{return await handle(request,env);}catch{return json({error:'Request failed; your data was not confirmed saved. Try again or export your draft.'},500);}}};
