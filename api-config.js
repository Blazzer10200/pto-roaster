// Public API origin, not a secret. Local development keeps its own browser data.
export const apiOrigin = globalThis.location?.hostname === 'blazzer10200.github.io'
  ? 'https://bandbook-blazzer10200.rebelwarrior2004.chatgpt.site' : '';
export const apiUrl = path => apiOrigin + path;
// HttpOnly cookies restore sessions after reload; Pages uses a partitioned cookie.
// The current-page bearer fallback stays in memory, never in localStorage or URLs.
let sessionToken='';
export async function apiFetch(path,options={}){
  const headers=new Headers(options.headers);
  if(apiOrigin&&sessionToken)headers.set('Authorization','Bearer '+sessionToken);
  const response=await fetch(apiUrl(path),{credentials:apiOrigin?'include':'same-origin',cache:'no-store',...options,headers});
  if(apiOrigin){const token=response.headers.get('X-PTO-Session');if(token)sessionToken=token==='signed-out'?'':token;if(response.status===401&&!path.startsWith('/api/auth/'))sessionToken='';}
  return response;
}
