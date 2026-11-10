import { WebSocketServer } from 'ws'
import { createServer } from 'node:http'
import { executeDesktopTool, toolSchemas, answerApproval, workspacePath } from './desktop-tools.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.JARVIS_BRIDGE_PORT || 8787)
const MODEL = process.env.JARVIS_OPENROUTER_MODEL || 'openai/gpt-4o-mini'
const SYSTEM = `You are J.A.R.V.I.S., a capable Windows desktop assistant. You can use the supplied desktop tools to act on this computer. Never claim an action succeeded unless its tool returned success. The user workspace is: ${workspacePath}. Use tools for computer actions; do not merely give instructions when a tool is available. Opening allowlisted apps and websites and read-only workspace operations may be performed directly. File creation and memory writes require a separate user approval dialog; if declined, report that accurately. Never attempt to bypass approval, access files outside the workspace, run shell commands, execute arbitrary code, delete files, or install software. Ask the user to perform unsupported or high-risk actions manually.`
const http = createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'null'});res.end(JSON.stringify({app:'J.A.R.V.I.S.',status:'online',model:MODEL,tools:toolSchemas.map(x=>x.function.name)}))})
const wss = new WebSocketServer({server:http,verifyClient:({origin,req},done)=>{
  const host=req.headers.host||''
  const allowedHost=host==='localhost:'+PORT||host==='127.0.0.1:'+PORT
  const allowedOrigin=!origin||origin==='null'||origin.startsWith('file://')||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  done(allowedHost&&allowedOrigin,allowedHost&&allowedOrigin?undefined:403,'Forbidden')
}})
wss.on('connection',ws=>{
  const history=[]
  const controllers=new Map()
  ws.send(JSON.stringify({type:'ready',servers:['OpenRouter AI','Windows Desktop','Workspace','Memory']}))
  ws.on('message',async raw=>{
    let msg;try{msg=JSON.parse(raw.toString())}catch{return}
    if(msg.type==='approval-result'){answerApproval(msg.id,msg.approved===true);return}
    if(msg.type==='interrupt'){for(const c of controllers.values())c.abort();controllers.clear();return}
    if(msg.type!=='ask'||typeof msg.text!=='string')return
    const id=msg.id
    const send=o=>{if(ws.readyState===1)ws.send(JSON.stringify({...o,ask:id}))}
    const key=process.env.OPENROUTER_API_KEY
    if(!key){send({type:'error',message:'OpenRouter key is not configured.'});return}
    const controller=new AbortController();controllers.set(id,controller)
    history.push({role:'user',content:msg.text})
    let answer=''
    try{
      for(let turn=0;turn<6;turn++){
        const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://github.com/bhaibhantai/jarvis','X-Title':'J.A.R.V.I.S. Desktop'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:SYSTEM},...history.slice(-24)],tools:toolSchemas,tool_choice:'auto',stream:true,temperature:0.3})})
        if(!response.ok){const detail=await response.text();throw new Error('OpenRouter '+response.status+': '+detail.slice(0,500))}
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',calls={}
        while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||''
          for(const line of lines){if(!line.startsWith('data: '))continue;const data=line.slice(6).trim();if(data==='[DONE]')continue;try{const chunk=JSON.parse(data),delta=chunk.choices?.[0]?.delta||{};if(delta.content){content+=delta.content;answer+=delta.content;send({type:'text',delta:delta.content})}for(const call of delta.tool_calls||[]){const i=call.index??0;calls[i]??={id:'',type:'function',function:{name:'',arguments:''}};if(call.id)calls[i].id=call.id;if(call.function?.name)calls[i].function.name+=call.function.name;if(call.function?.arguments)calls[i].function.arguments+=call.function.arguments}}catch{}}
        }
        history.push({role:'assistant',content:content||null,...(Object.keys(calls).length?{tool_calls:Object.values(calls)}:{})})
        const list=Object.values(calls)
        if(!list.length)break
        for(const call of list){
          const name=call.function.name
          send({type:'tool',name})
          let result
          try{const args=JSON.parse(call.function.arguments||'{}');result=await executeDesktopTool(name,args,ws,id,controller.signal)}
          catch(error){result={ok:false,error:error.message||String(error)}}
          history.push({role:'tool',tool_call_id:call.id,name,content:JSON.stringify(result)})
        }
      }
      send({type:'done',text:answer})
    }catch(error){if(error.name!=='AbortError')send({type:'error',message:error.message||'OpenRouter request failed.'})}
    finally{controllers.delete(id)}
  })
})
http.listen(PORT,HOST,()=>console.log('[JARVIS] OpenRouter desktop bridge listening on '+HOST+':'+PORT))
