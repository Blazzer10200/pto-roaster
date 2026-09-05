export class CloudLedger {
  revision = 0;
  async request(path, options={}) {
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
    if(response.status===401) throw new Error('Your session expired. Reload to sign in again.');
    let payload;try{payload=await response.json();}catch{throw new Error('Could not connect to the ledger. Reload to try again.');}
    if(!response.ok) { const error=new Error(payload.error||'Could not save the ledger.');error.conflict=response.status===409;throw error; }
    return payload;
  }
  async load() {
    const result=await this.request('/api/ledger');this.revision=result.revision;return result.data;
  }
  async save(data) {
    const result=await this.request('/api/ledger',{method:'PUT',headers:{'Content-Type':'application/json','X-Bandbook-Request':'1'},body:JSON.stringify({data,revision:this.revision,writeId:crypto.randomUUID()})});
    this.revision=result.revision;return result.data;
  }
}
