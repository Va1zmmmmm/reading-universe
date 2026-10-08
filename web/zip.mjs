const MAX_TOTAL=40*1024*1024,MAX_FILES=4000;
const table=Array.from({length:256},(_,i)=>{for(let n=0;n<8;n++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
export const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const safe=name=>name.length<500&&!name.includes('\\')&&!name.startsWith('/')&&!name.includes(':')&&!name.split('/').some(p=>p==='..'||p==='.')&&!name.endsWith('.zip');
export async function readZip(buffer) {
  const v=new DataView(buffer),bytes=new Uint8Array(buffer),decoder=new TextDecoder('utf-8',{fatal:true});
  if(buffer.byteLength>20*1024*1024)throw Error('压缩包不能超过 20 MB。');
  let end=-1;for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('压缩包格式不正确。');
  const count=v.getUint16(end+10,true);if(count>MAX_FILES||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('文件过多或不支持分卷压缩包。');
  let offset=v.getUint32(end+16,true),total=0;const files={};
  for(let n=0;n<count;n++) {
    if(offset+46>buffer.byteLength||v.getUint32(offset,true)!==0x02014b50)throw Error('压缩包目录损坏。');
    const flags=v.getUint16(offset+8,true),method=v.getUint16(offset+10,true),crc=v.getUint32(offset+16,true),compressed=v.getUint32(offset+20,true),size=v.getUint32(offset+24,true),nl=v.getUint16(offset+28,true),el=v.getUint16(offset+30,true),cl=v.getUint16(offset+32,true),attrs=v.getUint32(offset+38,true),local=v.getUint32(offset+42,true);
    const name=decoder.decode(bytes.slice(offset+46,offset+46+nl));offset+=46+nl+el+cl;
    if(!safe(name)||((attrs>>>16)&0xf000)===0xa000||flags&1)throw Error('压缩包含不支持的路径、链接或加密文件。');
    if(name.endsWith('/'))continue;
    if(!/\.(json|md)$/i.test(name))throw Error(`只接受 JSON 和 Markdown：${name}`);
    if(Object.hasOwn(files,name))throw Error('压缩包含重复文件。');
    total+=size;if(size>4*1024*1024||total>MAX_TOTAL||size>Math.max(1024*1024,compressed*150))throw Error('解压后的资料超过限制。');
    if(local+30>buffer.byteLength||v.getUint32(local,true)!==0x04034b50)throw Error('压缩条目损坏。');
    const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
    if(start+compressed>buffer.byteLength)throw Error('压缩数据不完整。');
    let content=bytes.slice(start,start+compressed);
    if(method===8) {
      let stream;try{stream=new DecompressionStream('deflate-raw');}catch{throw Error('当前浏览器不支持这个压缩方式，请解压后选择文件夹内的 JSON/Markdown 文件。');}
      const reader=new Blob([content]).stream().pipeThrough(stream).getReader(),chunks=[];let actual=0;
      while(true){const {done,value}=await reader.read();if(done)break;actual+=value.length;if(actual>size||actual>MAX_TOTAL){await reader.cancel();throw Error('解压体积与目录不符。');}chunks.push(value);}
      content=new Uint8Array(actual);let pos=0;for(const c of chunks){content.set(c,pos);pos+=c.length;}
    }else if(method!==0)throw Error('只支持普通 ZIP 压缩。');
    if(content.length!==size||crc32(content)!==crc)throw Error('资料校验失败，文件可能损坏。');
    files[name]=decoder.decode(content);
  }
  return files;
}
export function makeZip(files) {
  const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
  for(const [name,value]of Object.entries(files)) {
    const filename=encoder.encode(name),content=typeof value==='string'?encoder.encode(value):new Uint8Array(value),crc=crc32(content);
    const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,content.length,true);h.setUint32(22,content.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);
    const center=new Uint8Array(46+filename.length),c=new DataView(center.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,content.length,true);c.setUint32(24,content.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);center.set(filename,46);
    parts.push(header,content);directory.push(center);offset+=header.length+content.length;
  }
  const dirSize=directory.reduce((s,b)=>s+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,dirSize,true);v.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}
