type KeyboardTarget = {
  tagName?:string;
  isContentEditable?:boolean;
  getAttribute?:(name:string)=>string|null;
  parentElement?:KeyboardTarget|null;
};

export function isEditableMapTarget(target:unknown):boolean {
  let element=target as KeyboardTarget|null;
  let checkContentEditable=true;
  while(element){
    if(['INPUT','SELECT','TEXTAREA'].includes(element.tagName?.toUpperCase()??''))return true;
    if(['textbox','searchbox'].includes(element.getAttribute?.('role')??''))return true;
    if(checkContentEditable){
      if(element.isContentEditable)return true;
      const editable=element.getAttribute?.('contenteditable')?.toLowerCase();
      if(editable===''||editable==='true'||editable==='plaintext-only')return true;
      if(editable==='false')checkContentEditable=false;
    }
    element=element.parentElement??null;
  }
  return false;
}

type KeyboardInput = {
  key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;defaultPrevented:boolean;
  isComposing?:boolean;keyCode?:number;target?:unknown;
  nativeEvent?:{isComposing?:boolean;keyCode?:number};
};

// Accept native and React events. Shift remains available for '+'; Alt is
// reserved for the map's documented arrow-orbit command. Primary modifiers
// always belong to browser/OS shortcuts, including Ctrl+Alt (AltGr).
export function canHandleMapKey(event:KeyboardInput):boolean {
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.isComposing||event.nativeEvent?.isComposing
    ||event.keyCode===229||event.nativeEvent?.keyCode===229||isEditableMapTarget(event.target))return false;
  return !event.altKey||['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key);
}
