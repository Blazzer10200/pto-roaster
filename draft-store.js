const prefix='pto-draft-v2:';
export function readDraft(userId){
  try{const value=JSON.parse(localStorage.getItem(prefix+userId)||'null');return value&&value.expires>Date.now()&&value.userId===userId?value:null;}catch{return null;}
}
export function saveDraft(userId,value){try{localStorage.setItem(prefix+userId,JSON.stringify({...value,userId,expires:Date.now()+86400000}));return true;}catch{return false;}}
export function clearDraft(userId){try{localStorage.removeItem(prefix+userId);}catch{}}
export function clearAllDrafts(){try{Object.keys(localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>localStorage.removeItem(k));}catch{}}
