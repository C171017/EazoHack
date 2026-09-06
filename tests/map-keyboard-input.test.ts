import test from 'node:test';
import assert from 'node:assert/strict';
import {canHandleMapKey,isEditableMapTarget} from '../src/features/book-graph/keyboard-input';

const key={key:'+',ctrlKey:false,metaKey:false,altKey:false,defaultPrevented:false};
const element=(tagName:string,attributes:Record<string,string>={},parentElement:unknown=null)=>({tagName,getAttribute:(name:string)=>attributes[name]??null,parentElement});

test('browser primary-modifier shortcuts pass through; plain zoom/projection and Alt-arrow orbit remain available',()=>{
  for(const value of ['+','=','-','1','2','3','4','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ']){
    assert.equal(canHandleMapKey({...key,key:value}),true,value);
    for(const modifier of [{ctrlKey:true},{metaKey:true},{ctrlKey:true,altKey:true},{metaKey:true,altKey:true}]){
      assert.equal(canHandleMapKey({...key,key:value,...modifier}),false,JSON.stringify({value,modifier}));
    }
  }
  for(const value of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])assert.equal(canHandleMapKey({...key,key:value,altKey:true}),true);
  for(const value of ['+','-','1','4','Enter'])assert.equal(canHandleMapKey({...key,key:value,altKey:true}),false);
  assert.equal(canHandleMapKey({...key,...{shiftKey:true}}),true);
});

test('native and React composition, IME fallback and already-handled events cannot trigger map actions',()=>{
  for(const value of ['+','1','ArrowLeft','Enter',' '])for(const patch of [
    {defaultPrevented:true},{isComposing:true},{nativeEvent:{isComposing:true}},
    {keyCode:229},{nativeEvent:{keyCode:229}},
  ])assert.equal(canHandleMapKey({...key,key:value,...patch}),false);
  assert.equal(canHandleMapKey({...key,nativeEvent:{isComposing:false}}),true);
});

test('editable descendants and form controls retain keyboard input; non-editable map targets still work',()=>{
  const editable=[
    element('input'),element('SELECT'),element('textarea'),
    element('SPAN',{},element('DIV',{contenteditable:''})),
    element('SPAN',{},element('DIV',{contenteditable:'true'})),
    element('SPAN',{},element('DIV',{contenteditable:'plaintext-only'})),
    element('SPAN',{},element('DIV',{role:'textbox'})),
    element('DIV',{role:'searchbox'}),{isContentEditable:true},
  ];
  for(const target of editable){
    assert.equal(isEditableMapTarget(target),true);
    for(const value of ['+','1','ArrowLeft','Enter'])assert.equal(canHandleMapKey({...key,key:value,target}),false);
  }
  for(const target of [null,element('svg'),element('g',{role:'button'}),
    element('SPAN',{},element('DIV',{contenteditable:'false'},element('DIV',{contenteditable:'true'})))]){
    assert.equal(isEditableMapTarget(target),false);
    assert.equal(canHandleMapKey({...key,target}),true);
  }
});
