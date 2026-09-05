import { validateBackup, freshData } from './model.js';

const MAX_BYTES = 950000;
const githubOrigin='https://blazzer10200.github.io';
const allowedOrigin=request=>[new URL(request.url).origin,githubOrigin].includes(request.headers.get('origin'));
function cors(request,response) {
  if(request.headers.get('origin')===githubOrigin) {
    response.headers.set('Access-Control-Allow-Origin',githubOrigin);
    response.headers.set('Vary','Origin');
    response.headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers','Content-Type, X-Bandbook-Request');
  }
  return response;
}
const json = (body, status=200) => Response.json(body, { status, headers: {
  'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
  'Vary':'Cookie',
} });
const snapshot = row => ({ data:JSON.parse(row.document), revision:row.revision, updatedAt:row.updated_at });

async function readLedger(db, userId) {
  let row=await db.prepare('SELECT * FROM ledger WHERE id = 1').first();
  if(!row) {
    await db.prepare('INSERT OR IGNORE INTO ledger (id, revision, document, updated_at, updated_by, write_id) VALUES (1, 0, ?, ?, ?, ?)')
      .bind(JSON.stringify(freshData()), new Date().toISOString(), userId, 'initial').run();
    row=await db.prepare('SELECT * FROM ledger WHERE id = 1').first();
  }
  return row;
}

export async function handleApi(request, env) {
  // This is an intentionally public, shared ledger with no account requirement.
  // Anonymous saves are not attributed to an authenticated person.
  const userId='public';
  const url=new URL(request.url);
  if(url.pathname==='/api/session' && request.method==='GET') return json({access:'public'});
  if(url.pathname!=='/api/ledger') return json({error:'Not found.'},404);
  if(!env.DB) return json({error:'The database is not connected yet.'},503);
  if(request.method==='GET') return json(snapshot(await readLedger(env.DB,userId)));
  if(request.method!=='PUT') return json({error:'Method not allowed.'},405);
  if(!allowedOrigin(request) || request.headers.get('x-bandbook-request')!=='1') return json({error:'This request must come from PTO Roaster.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Expected JSON.'},415);
  if(Number(request.headers.get('content-length'))>MAX_BYTES) return json({error:'This ledger is too large to save. Download a backup.'},413);
  // Read a bounded stream rather than buffering an untrusted request in memory.
  const reader=request.body?.getReader();
  if(!reader) return json({error:'Missing ledger data.'},400);
  const chunks=[];let size=0;
  while(true) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'This ledger is too large to save. Download a backup.'},413);}chunks.push(value); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let body;
  try {
    body=JSON.parse(new TextDecoder().decode(bytes));
    if(!Number.isSafeInteger(body.revision)||body.revision<0||typeof body.writeId!=='string'||! /^[0-9a-f-]{36}$/i.test(body.writeId)) throw new Error('Invalid save request.');
    body.data=validateBackup(body.data);
  } catch(error) { return json({error:error.message || 'Invalid ledger data.'},400); }
  const repeated=await env.DB.prepare('SELECT revision FROM ledger_revisions WHERE write_id = ?').bind(body.writeId).first();
  if(repeated) return json(snapshot(await readLedger(env.DB,userId)));
  const current=await readLedger(env.DB,userId);
  if(current.revision!==body.revision) return json({error:'This ledger changed on another device. Reload before saving.',conflict:true},409);
  const document=JSON.stringify(body.data),now=new Date().toISOString(),next=body.revision+1;
  // The compare-and-swap and revision record commit together. No last-write-wins.
  const result=await env.DB.batch([
    env.DB.prepare('UPDATE ledger SET revision = ?, document = ?, updated_at = ?, updated_by = ?, write_id = ? WHERE id = 1 AND revision = ?').bind(next,document,now,userId,body.writeId,body.revision),
    env.DB.prepare('INSERT OR IGNORE INTO ledger_revisions (revision, document, updated_at, updated_by, write_id) SELECT revision, document, updated_at, updated_by, write_id FROM ledger WHERE id = 1 AND revision = ? AND write_id = ?').bind(next,body.writeId),
  ]);
  if(!result[0].meta.changes) return json({error:'This ledger changed on another device. Reload before saving.',conflict:true},409);
  return json({data:body.data,revision:next,updatedAt:now});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
      if(url.pathname.startsWith('/api/')) {
        if(request.method==='OPTIONS') return cors(request,new Response(null,{status:allowedOrigin(request)?204:403}));
        return cors(request,await handleApi(request,env));
      }
      const response=await env.ASSETS.fetch(request);
      const secured=new Response(response.body,response);
      secured.headers.set('X-Content-Type-Options','nosniff');
      secured.headers.set('Referrer-Policy','same-origin');
      secured.headers.set('Cache-Control','private, no-store');
      secured.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'");
      return secured;
    } catch { return cors(request,json({error:'The ledger is temporarily unavailable. Try again shortly.'},503)); }
  },
};
