interface Env { GITHUB_WEBHOOK_SECRET?: string; }
function hex(bytes:Uint8Array) { return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join(""); }
function constantTimeEqual(a:string,b:string) {
  if(a.length!==b.length)return false;
  let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);
  return result===0;
}
export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
  if(!env.GITHUB_WEBHOOK_SECRET)return new Response("Webhook is not configured",{status:503});
  const signature=request.headers.get("X-Hub-Signature-256")||"";
  const event=request.headers.get("X-GitHub-Event")||"unknown";
  const body=await request.text();
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body));
  const expected="sha256="+hex(new Uint8Array(digest));
  if(!constantTimeEqual(signature,expected))return new Response("Invalid webhook signature",{status:401});
  let payload:Record<string,unknown>={};
  try{payload=JSON.parse(body) as Record<string,unknown>;}catch{return new Response("Invalid JSON",{status:400});}
  return Response.json({received:true,event,action:payload.action||null},{headers:{"Cache-Control":"no-store"}});
};