import { WebSocketServer } from 'ws'
import { createServer } from 'node:http'

const HOST = '127.0.0.1'
const PORT = Number(process.env.JARVIS_BRIDGE_PORT || 8787)
const MODEL = process.env.JARVIS_OPENROUTER_MODEL || 'openai/gpt-4o-mini'
const SYSTEM = `You are J.A.R.V.I.S., a capable, concise desktop AI assistant. Speak naturally and clearly. You are running inside a Windows desktop application. You cannot claim to have controlled files, apps, devices, or the operating system unless a connected tool actually performed that action. Ask for confirmation before destructive or externally visible actions.`
const http = createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'null'});res.end(JSON.stringify({app:'J.A.R.V.I.S.',status:'online'}))})
const wss = new WebSocketServer({server:http,verifyClient:({origin,req},done)=>{
  const host=req.headers.host||''
  const allowedHost=host==='localhost:'+PORT||host==='127.0.0.1:'+PORT
  const allowedOrigin=!origin||origin==='null'||origin.startsWith('file://')||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  done(allowedHost&&allowedOrigin,allowedHost&&allowedOrigin?undefined:403,'Forbidden')
}})
wss.on('connection',ws=>{
  const history=[]
  ws.send(JSON.stringify({type:'ready',servers:['OpenRouter AI']}))
  ws.on('message',async raw=>{
    let msg;try{msg=JSON.parse(raw.toString())}catch{return}
    if(msg.type==='interrupt')return
    if(msg.type!=='ask'||typeof msg.text!=='string')return
    const id=msg.id
    const send=o=>{if(ws.readyState===1)ws.send(JSON.stringify({...o,ask:id}))}
    const key=process.env.OPENROUTER_API_KEY
    if(!key){send({type:'error',message:'OpenRouter key is not configured.'});return}
    history.push({role:'user',content:msg.text})
    try{
      const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/bhaibhantai/jarvis','X-Title':'J.A.R.V.I.S. Desktop'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:SYSTEM},...history.slice(-20)],stream:true,temperature:0.7})})
      if(!response.ok){const detail=await response.text();throw new Error('OpenRouter '+response.status+': '+detail.slice(0,500))}
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',answer=''
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||''
        for(const line of lines){if(!line.startsWith('data: '))continue;const data=line.slice(6).trim();if(data==='[DONE]')continue;try{const chunk=JSON.parse(data),delta=chunk.choices?.[0]?.delta?.content||'';if(delta){answer+=delta;send({type:'text',delta})}}catch{}}
      }
      history.push({role:'assistant',content:answer})
      send({type:'done',text:answer})
    }catch(error){history.pop();send({type:'error',message:error.message||'OpenRouter request failed.'})}
  })
})
http.listen(PORT,HOST,()=>console.log('[JARVIS] OpenRouter bridge listening on '+HOST+':'+PORT))
