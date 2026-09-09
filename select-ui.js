import {uiIcon,revealContent} from './ui-utils.js';

// Keep the original select as the form value and change-event source.
// Enhance new controls after page renders without retaining detached forms.
export function installSelectMenus(root=document.body){
  const controls=new WeakMap();
  let current=null,sequence=0;
  function enhance(select){
    if(controls.has(select)){controls.get(select).sync();return;}
    if(select.multiple||select.size>1)return;
    const labels=[...select.labels],label=select.getAttribute('aria-label')||labels.map(el=>[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim()).filter(Boolean).join(' ')||'Choose an option';
    const id=select.id?`${select.id}-menu`:`select-menu-${++sequence}`;
    const wrapper=document.createElement('span'),trigger=document.createElement('button'),value=document.createElement('span'),panel=document.createElement('div');
    wrapper.className='select-menu';
    trigger.type='button';trigger.className='select-trigger';trigger.id=id;
    trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label',label);
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',`${id}-options`);
    value.className='select-value';trigger.append(value);trigger.insertAdjacentHTML('beforeend',uiIcon('chevron'));
    panel.className='select-options';panel.id=`${id}-options`;panel.setAttribute('role','listbox');panel.setAttribute('aria-label',label);panel.setAttribute('popover','manual');
    select.before(wrapper);wrapper.append(select,trigger,panel);
    select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    labels.forEach(el=>el.htmlFor=trigger.id);
    let opened=false,active=-1,rows=[],options=[],prefix='',lastTyped=0;
    const enabled=option=>!option.disabled&&!option.parentElement?.disabled&&!option.hidden;
    function sync(){
      value.textContent=select.selectedOptions[0]?.label||'Choose an option';
      trigger.disabled=select.matches(':disabled');
      trigger.setAttribute('aria-required',String(select.required));
      if(opened)close();
    }
    function highlight(index){
      active=index;
      rows.forEach((row,i)=>row.classList.toggle('is-active',i===index));
      if(rows[index]){trigger.setAttribute('aria-activedescendant',rows[index].id);rows[index].scrollIntoView({block:'nearest'});}
      else trigger.removeAttribute('aria-activedescendant');
    }
    function position(){
      const rect=trigger.getBoundingClientRect(),viewport=window.visualViewport;
      const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
      const below=top+height-rect.bottom-14,above=rect.top-top-14;
      const upwards=below<Math.min(300,panel.scrollHeight)&&above>below;
      panel.style.width=`${Math.min(Math.max(rect.width,180),width-24)}px`;
      panel.style.maxHeight=`${Math.max(60,Math.min(320,upwards?above:below))}px`;
      panel.style.left=`${Math.max(left+12,Math.min(rect.left,left+width-panel.getBoundingClientRect().width-12))}px`;
      panel.style.top=`${upwards?Math.max(top+12,rect.top-panel.getBoundingClientRect().height-6):rect.bottom+6}px`;
    }
    function show(){
      if(trigger.disabled||opened)return;
      current?.close();
      document.querySelectorAll('.player-picker.is-open').forEach(p=>p.closePicker?.());
      options=[...select.options].filter(option=>!option.hidden);rows=[];panel.replaceChildren();
      options.forEach((option,index)=>{
        const row=document.createElement('div'),text=document.createElement('span'),check=document.createElement('span');
        row.className='select-option';row.id=`${id}-option-${index}`;row.setAttribute('role','option');
        row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(!enabled(option)));
        text.textContent=option.label;check.className='select-check';check.setAttribute('aria-hidden','true');
        if(option.selected)check.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
        row.append(text,check);row.addEventListener('pointerdown',e=>e.preventDefault());
        row.addEventListener('pointermove',()=>{if(enabled(option))highlight(index);});
        row.addEventListener('click',()=>choose(index));rows.push(row);panel.append(row);
      });
      opened=true;current=control;prefix='';wrapper.classList.add('is-open');trigger.setAttribute('aria-expanded','true');
      panel.showPopover();position();
      highlight(options.findIndex(option=>option.selected&&enabled(option))>=0?options.findIndex(option=>option.selected&&enabled(option)):options.findIndex(enabled));
      revealContent(panel);
    }
    function close(){
      if(!opened)return;
      opened=false;panel.hidePopover();wrapper.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');
      if(current===control)current=null;
    }
    function choose(index){
      const option=options[index];if(!option||!enabled(option)||trigger.disabled)return;
      const changed=select.selectedIndex!==option.index;select.selectedIndex=option.index;
      close();sync();trigger.removeAttribute('aria-invalid');trigger.focus({preventScroll:true});
      if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    trigger.addEventListener('click',()=>opened?close():show());
    trigger.addEventListener('keydown',event=>{
      if(event.isComposing||event.ctrlKey||event.metaKey)return;
      const key=event.key;
      if(key==='Escape'&&opened){event.preventDefault();event.stopPropagation();close();return;}
      if(key==='Tab'){close();return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(key)){
        event.preventDefault();const wasOpen=opened;show();
        const indexes=options.map((o,i)=>enabled(o)?i:-1).filter(i=>i>=0);
        if(!indexes.length)return;
        if(key==='Home'||key==='End')highlight(indexes[key==='Home'?0:indexes.length-1]);
        else if(wasOpen){const at=indexes.indexOf(active);highlight(indexes[Math.max(0,Math.min(indexes.length-1,at+(key==='ArrowDown'?1:-1)))]);}
        return;
      }
      if(key==='Enter'||key===' '){event.preventDefault();if(opened)choose(active);else show();return;}
      if(key.length===1&&!event.altKey){
        event.preventDefault();show();const now=Date.now();prefix=now-lastTyped>700?key:prefix+key;lastTyped=now;
        const query=/^(.)\1*$/u.test(prefix)?key:prefix;
        const start=query.length===1?active+1:Math.max(active,0);
        const index=options.map((_,i)=>(start+i)%options.length).find(i=>enabled(options[i])&&options[i].label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase()));
        if(index!==undefined)highlight(index);
      }
    });
    select.addEventListener('change',sync);
    select.addEventListener('invalid',event=>{event.preventDefault();trigger.setAttribute('aria-invalid','true');trigger.focus();});
    const control={sync,close,wrapper,trigger,panel};controls.set(select,control);sync();
  }
  function scan(node){
    if(node.nodeType!==1)return;
    if(node.matches('select'))enhance(node);
    node.querySelectorAll('select').forEach(enhance);
  }
  scan(root);
  new MutationObserver(records=>{
    if(current&&!current.trigger.isConnected)current.close();
    const changed=new Set();
    records.forEach(record=>{
      const select=record.target.closest?.('select');if(select)changed.add(select);
      if(record.type==='attributes'&&record.target.matches?.('fieldset'))record.target.querySelectorAll('select').forEach(s=>changed.add(s));
      record.addedNodes.forEach(node=>{if(node.nodeType===1&&!node.closest('.select-menu'))scan(node);});
    });
    changed.forEach(select=>controls.get(select)?.sync());
  }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','required']});
  document.addEventListener('pointerdown',event=>{if(current&&!current.wrapper.contains(event.target))current.close();});
  document.addEventListener('focusin',event=>{if(current&&!current.wrapper.contains(event.target))current.close();});
  document.addEventListener('scroll',event=>{if(current&&!current.panel.contains(event.target))current.close();},true);
  document.addEventListener('reset',event=>{queueMicrotask(()=>event.target.querySelectorAll('select').forEach(select=>controls.get(select)?.sync()));});
  window.addEventListener('resize',()=>current?.close());
}
