export function mailRequired(env){return env.APP_ENV!=='local'&&env.APP_ENV!=='owner-test';}
export function enrollmentAllowed(env,email){if(env.APP_ENV!=='owner-test')return true;return typeof email==='string'&&(env.OWNER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>x.includes('@')).includes(email.trim().toLowerCase());}
