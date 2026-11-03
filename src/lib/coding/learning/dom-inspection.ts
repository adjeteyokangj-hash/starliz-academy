// Fixed inspection code runs in its own pinned container. HTML and CSS are
// parsed as data; learner JavaScript is never evaluated by this inspector.
// Foundation cascade metrics cover simple selectors and explicit pixel/colour
// declarations. They are not browser geometry or full accessibility evidence.
import { z } from "zod";
export const domAssetSchema = z.object({ id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,60}\.png$/), uri: z.string().max(20000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/) }).strict();
export const domAssetsSchema = z.array(domAssetSchema).max(8).refine((assets) => new Set(assets.map((asset) => asset.id)).size === assets.length && JSON.stringify(assets).length <= 49152, "Use unique supplied PNG filenames within the provided-media limit.");
export type DomAsset = z.infer<typeof domAssetSchema>;
const inspector = String.raw`
const {parseHTML}=require('linkedom');
const {createHash}=require('node:crypto');
const {document}=parseHTML(/<html(?:\s|>)/i.test(suppliedHTML)?suppliedHTML:'<!doctype html><html><head><title>Project</title></head><body>'+suppliedHTML+'</body></html>');
for(const image of document.querySelectorAll('img')){const asset=suppliedAssets.find(asset=>asset.id===image.getAttribute('src'));if(asset){image.setAttribute('src',asset.uri);image.setAttribute('data-starliz-asset',asset.id);}}
if(suppliedCSS){const style=document.createElement('style');style.textContent=suppliedCSS;document.head.appendChild(style);}
const all=[...document.querySelectorAll('*')];
if(all.length>1500)throw new Error('Keep this page within 1500 elements.');
const errors=[],rules=[];
const permitted=new Set('color background-color font-size line-height font-weight text-align padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left display visibility'.split(' '));
const supportedSelector=selector=>Boolean(selector.trim())&&!selector.replace(/#[A-Za-z_][\w-]*|\.[A-Za-z_][\w-]*|[A-Za-z][\w-]*|\*|\s+|[>+~]/g,'');
const specificity=selector=>[0,(selector.match(/#[A-Za-z_][\w-]*/g)||[]).length,(selector.match(/\.[A-Za-z_][\w-]*/g)||[]).length,(selector.replace(/[#.][A-Za-z_][\w-]*/g,'').match(/[A-Za-z][\w-]*/g)||[]).length];
function declarations(style){const values=[];for(let i=0;i<Math.min(style.length,60);i++){const property=style[i];if(!permitted.has(property))errors.push('Unsupported foundation property: '+property);values.push({property,value:style.getPropertyValue(property),important:style.getPropertyPriority(property)==='important'});}return values;}
for(const style of document.querySelectorAll('style')){
 try{for(const rule of style.sheet.cssRules){
  if(rules.length>=100)throw new Error('Keep foundation CSS within 100 rules.');
  if(typeof rule.selectorText!=='string'||!rule.style){errors.push('At-rules need separate browser verification.');continue;}
  const values=declarations(rule.style);
  for(const selector of rule.selectorText.split(',')){
   if(!supportedSelector(selector)){errors.push('Unsupported foundation selector: '+selector.slice(0,100));continue;}
   try{rules.push({selector:selector.trim(),specificity:specificity(selector),values,targets:[...document.querySelectorAll(selector)]});}catch{errors.push('Invalid selector.');}
  }
 }}catch{errors.push('The stylesheet could not be parsed for foundation inspection.');}
}
const inherited=new Set(['color','font-size','line-height','font-weight','text-align']),cache=new Map();
function stronger(candidate,previous){if(!previous)return true;if(candidate.important!==previous.important)return candidate.important;for(let i=0;i<4;i++)if(candidate.specificity[i]!==previous.specificity[i])return candidate.specificity[i]>previous.specificity[i];return candidate.order>=previous.order;}
function resolved(element,depth=0){
 if(cache.has(element))return cache.get(element);
 if(depth>32)throw new Error('Keep the page nesting within 32 levels.');
 const parent=element.parentElement?resolved(element.parentElement,depth+1):{properties:{color:'#000000','font-size':'18px','background-color':'#ffffff'},visible:true};
 const winners=Object.create(null);
 const apply=(values,specificity,order,selector)=>{for(const declaration of values){const candidate={...declaration,specificity,order,selector};if(stronger(candidate,winners[declaration.property]))winners[declaration.property]=candidate;}};
 rules.forEach((rule,index)=>{if(rule.targets.includes(element))apply(rule.values,rule.specificity,index,rule.selector);});
 if(element.hasAttribute('style')){const probe=document.createElement('style');probe.textContent='x{'+element.getAttribute('style')+'}';try{apply(declarations(probe.sheet.cssRules[0].style),[1,0,0,0],rules.length,'<inline>');}catch{errors.push('Invalid inline declaration.');}}
 const properties=Object.create(null);
 for(const property of inherited)properties[property]=parent.properties[property];
 properties['background-color']=parent.properties['background-color'];
 for(const [property,winner]of Object.entries(winners)){if(winner.value==='inherit')properties[property]=parent.properties[property]??'';else if(winner.value!=='transparent'&&winner.value!=='rgba(0, 0, 0, 0)')properties[property]=winner.value;}
 const origins=Object.fromEntries(Object.entries(winners).map(([property,winner])=>[property,winner.selector])); const value={properties,origins,visible:parent.visible&&!element.hasAttribute('hidden')&&element.getAttribute('aria-hidden')!=='true'&&properties.display!=='none'&&properties.visibility!=='hidden'};
 cache.set(element,value);return value;
}
function rgb(value){const names={black:'#000000',white:'#ffffff',navy:'#000080'};value=names[value]||value||'';if(/^#[a-f\d]{3}$/i.test(value))value='#'+[...value.slice(1)].map(char=>char+char).join('');if(/^#[a-f\d]{6}$/i.test(value))return[1,3,5].map(index=>parseInt(value.slice(index,index+2),16));const match=/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value);return match&&match.slice(1).every(value=>Number(value)<=255)?match.slice(1).map(Number):null;}
function contrast(first,second){const a=rgb(first),b=rgb(second);if(!a||!b)return null;const luminance=colour=>colour.map(value=>value/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);const left=luminance(a),right=luminance(b);return(Math.max(left,right)+0.05)/(Math.min(left,right)+0.05);}
const pixels=value=>typeof value==='string'&&/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(value)?parseFloat(value):null;
const stylesById=Object.create(null);
for(const element of all.filter(element=>element.id&&/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(element.id)&&!['constructor','prototype','__proto__'].includes(element.id)).slice(0,150)){
 const value=resolved(element),padding=['top','right','bottom','left'].map(side=>pixels(value.properties['padding-'+side]??'0px'));
 stylesById[element.id]={properties:value.properties,origins:value.origins,fontSizePx:pixels(value.properties['font-size']),minimumPaddingPx:padding.every(value=>value!==null)?Math.min(...padding):null,contrast:contrast(value.properties.color,value.properties['background-color']),visible:value.visible};
}
const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].slice(0,100).map(element=>({level:Number(element.tagName.slice(1)),text:element.textContent.trim(),id:element.id}));
const links=[...document.querySelectorAll('a')].slice(0,100).map(element=>{const href=element.getAttribute('href')||'';return{id:element.id,text:element.textContent.trim(),href,safe:/^#[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(href)&&Boolean(document.getElementById(href.slice(1)))};});
const elements=[...document.querySelectorAll('[id],h1,h2,h3,h4,h5,h6,button,input,label,a,img')].slice(0,150).map(element=>({tag:element.tagName.toLowerCase(),id:element.id,text:element.textContent.trim(),value:element.value??null,role:element.getAttribute('role'),label:element.getAttribute('aria-label'),for:element.getAttribute('for'),href:element.getAttribute('href'),alt:element.getAttribute('alt')}));
const images=[...document.querySelectorAll('img')].slice(0,30).map(image=>{const src=image.getAttribute('src')||'';return{id:image.id,assetId:image.getAttribute('data-starliz-asset')||'',alt:image.getAttribute('alt')||'',sourceHash:createHash('sha256').update(src).digest('hex'),safe:src.length<=20000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src)};});
const textsById=Object.create(null),textLengthsById=Object.create(null);
for(const element of all.filter(element=>/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(element.id)&&!['constructor','prototype','__proto__'].includes(element.id)).slice(0,150)){textsById[element.id]=element.textContent.trim().slice(0,4000);textLengthsById[element.id]=element.textContent.trim().length;}
const ids=all.filter(element=>element.id).map(element=>element.id),duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
const inputLabels=[...document.querySelectorAll('input:not([type=hidden]),textarea,select')].slice(0,100).map(element=>{
 const aria=element.getAttribute('aria-label')||'',references=(element.getAttribute('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean);
 const referenced=references.length&&references.every(id=>ids.filter(candidate=>candidate===id).length===1)?references.map(id=>document.getElementById(id).textContent.trim()).join(' '):'';
 const labels=[...document.querySelectorAll('label')].filter(label=>label.contains(element)||element.id&&label.getAttribute('for')===element.id&&ids.filter(id=>id===element.id).length===1);
 const name=aria.trim()||referenced||labels.map(label=>label.textContent.trim()).join(' ').trim();
 return{id:element.id,tag:element.tagName.toLowerCase(),name,labelled:Boolean(name)};
});
const controlValuesById=Object.create(null);for(const item of inputLabels){if(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(item.id)&&!['constructor','prototype','__proto__'].includes(item.id))controlValuesById[item.id]=String(document.getElementById(item.id).value??'').slice(0,1000);}
const result={html:document.toString(),elements,images,textsById,textLengthsById,safeImages:images.every(image=>image.safe),bodyText:document.body.textContent.trim().slice(0,8000),headingCount:document.querySelectorAll('h1').length,headingOutline:headings,headingOutlineValid:headings.length>0&&headings[0].level===1&&headings.filter(heading=>heading.level===1).length===1&&headings.every((heading,index)=>heading.text&&(index===0||heading.level<=headings[index-1].level+1)),mainCount:document.querySelectorAll('main').length,links,safeLinks:links.every(link=>link.safe),lists:[...document.querySelectorAll('ul,ol')].slice(0,30).map(element=>({tag:element.tagName.toLowerCase(),items:[...element.children].filter(child=>child.tagName==='LI').map(child=>child.textContent.trim())})),labelsValid:[...document.querySelectorAll('input:not([type=hidden])')].every(element=>element.hasAttribute('aria-label')||[...document.querySelectorAll('label')].some(label=>label.htmlFor===element.id||label.contains(element))),scripts:document.querySelectorAll('script').length,styleInspection:{supported:errors.length===0,errors:[...new Set(errors)].slice(0,40),scope:'Static foundation cascade; no browser layout claim',rules:rules.map(rule=>({selector:rule.selector,targets:rule.targets.map(element=>element.id).filter(Boolean),declarations:Object.fromEntries(rule.values.map(value=>[value.property,value.value]))})),stylesById},logs:[]};
result.labelsValid=inputLabels.every(input=>input.labelled);result.inputLabels=inputLabels;result.controlValuesById=controlValuesById;result.idsUnique=duplicateIds.length===0;result.duplicateIds=duplicateIds.slice(0,100);
const keyboardCandidates=all.filter(element=>{
 const native=['BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(element.tagName)||element.tagName==='A'&&element.hasAttribute('href');
 const tab=element.getAttribute('tabindex');
 return(native||tab!==null)&&!element.hasAttribute('disabled')&&!element.closest('[inert],fieldset[disabled]')&&element.getAttribute('type')!=='hidden'&&resolved(element).visible&&(tab===null||/^-?\d+$/.test(tab)&&Number(tab)>=0);
});
result.focusOrder=keyboardCandidates.slice(0,100).map(element=>element.id);
result.positiveTabIndexes=all.filter(element=>Number(element.getAttribute('tabindex'))>0).length;
result.controlSemantics=all.filter(element=>element.id&&(/^(INPUT|SELECT|TEXTAREA|BUTTON|OUTPUT)$/.test(element.tagName)||element.hasAttribute('role')||element.hasAttribute('aria-live'))).slice(0,100).map(element=>({id:element.id,role:element.getAttribute('role')||'',live:element.getAttribute('aria-live')||'',invalid:element.getAttribute('aria-invalid')||'',describedBy:element.getAttribute('aria-describedby')||''}));
result.evidenceAnchors=[...document.querySelectorAll('a[data-starliz-evidence]')].slice(0,100).map(anchor=>{const slot=(anchor.getAttribute('data-starliz-evidence')||'').slice(0,20),href=(anchor.getAttribute('href')||'').slice(0,1000),target=all.filter(element=>element.id===href.slice(1)),caption=all.filter(element=>element.id==='caption-'+slot);return{id:anchor.id.slice(0,80),slot,text:anchor.textContent.trim().slice(0,1000),href,targetExists:/^#saved-(first|second)$/.test(href)&&target.length===1&&caption.length===1,caption:caption.length===1?caption[0].textContent.trim().slice(0,1000):''};});
console.log('__STARLIZ_RESULT__'+JSON.stringify({result,files:{}}));
`;

export function domInspectionSource(html: string, css: string, assets: DomAsset[] = []) {
  return `const suppliedHTML=${JSON.stringify(html)};const suppliedCSS=${JSON.stringify(css)};const suppliedAssets=${JSON.stringify(assets)};\n${inspector}`;
}
