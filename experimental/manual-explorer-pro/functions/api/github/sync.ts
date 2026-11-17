import { getSession, githubFetch, refreshOAuthSession, setSessionCookie, type GitHubEnv } from "../../_lib/github-auth";
const OWNER="5cxxpb2yrr-ui", REPO="motornote-manual-library";
const ALLOWED_STORES=["favorites","bookmarks","notes","recents","settings","repairCarts"] as const;
type SyncPayload={schemaVersion:number;owner:string;updatedAt:string;data:Record<string,unknown>};
function encodeBase64(value:string) {
  const bytes=new TextEncoder().encode(value);let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64(value:string) {
  const binary=atob(value.replace(/\s/g,""));
  return new TextDecoder().decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));
}
function userPath(login:string) {
  if(!/^[A-Za-z0-9-]{1,39}$/.test(login))throw new Error("Invalid GitHub login");
  return "data/users/"+login.toLowerCase()+"/manual-explorer.json";
}
async function loadRemote(token:string,path:string):Promise<{sha?:string;data:SyncPayload|null}> {
  try {
    const file=await githubFetch<{content:string;sha:string;encoding:string}>(
      "/repos/"+OWNER+"/"+REPO+"/contents/"+path+"?ref=main",token
    );
    const payload=JSON.parse(decodeBase64(file.content)) as SyncPayload;
    return {sha:file.sha,data:payload};
  } catch(error) {
    if(error instanceof Error && error.message.startsWith("GitHub 404:"))return {data:null};
    throw error;
  }
}
export const onRequestGet: PagesFunction<GitHubEnv> = async ({request,env}) => {
  try {
    let session=await getSession(request,env);
    if(!session)return Response.json({error:"Connect GitHub to sync your repair data."},{status:401,headers:{"Cache-Control":"no-store"}});
    const originalSession=session;
    const refreshed=await refreshOAuthSession(session,env);
    const headers=new Headers({"Cache-Control":"no-store"});
    if(refreshed!==originalSession)headers.append("Set-Cookie",await setSessionCookie(refreshed,env));
    session=refreshed;
    const path=userPath(session.login),remote=await loadRemote(session.token,path);
    return new Response(JSON.stringify({exists:Boolean(remote.data),data:remote.data?.data||{},updatedAt:remote.data?.updatedAt||null}),{headers});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"GitHub sync read failed"},{status:502,headers:{"Cache-Control":"no-store"}});
  }
};
export const onRequestPost: PagesFunction<GitHubEnv> = async ({request,env}) => {
  try {
    let session=await getSession(request,env);
    if(!session)return Response.json({error:"Connect GitHub to sync your repair data."},{status:401});
    const refreshed=await refreshOAuthSession(session,env);
    const originalSession=session;
    session=refreshed;
    if(!session.canWrite)return Response.json({error:"This GitHub connection is read-only. Grant Contents: write or use a write-enabled fine-grained token."},{status:403});
    const input=await request.json() as {data?:Record<string,unknown>};
    if(!input.data || typeof input.data!=="object" || Array.isArray(input.data))return Response.json({error:"Sync data must be an object."},{status:400});
    const safeData:Record<string,unknown>={};
    for(const store of ALLOWED_STORES) {
      const records=input.data[store];
      if(records!==undefined && !Array.isArray(records))return Response.json({error:"Invalid data for store "+store},{status:400});
      safeData[store]=Array.isArray(records)?records.slice(0,10000):[];
    }
    const payload:SyncPayload={schemaVersion:1,owner:session.login,updatedAt:new Date().toISOString(),data:safeData};
    const serialized=JSON.stringify(payload);
    if(serialized.length>2_000_000)return Response.json({error:"Repair data export exceeds the 2 MB sync limit."},{status:413});
    const path=userPath(session.login);
    const remote=await loadRemote(session.token,path);
    const body={message:"Sync LifeOS Manual Explorer data for "+session.login,content:encodeBase64(serialized),branch:"main",...(remote.sha?{sha:remote.sha}:{})};
    await githubFetch("/repos/"+OWNER+"/"+REPO+"/contents/"+path,session.token,{
      method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    });
    const headers=new Headers({"Cache-Control":"no-store"});
    if(refreshed!==originalSession)headers.append("Set-Cookie",await setSessionCookie(refreshed,env));
    return new Response(JSON.stringify({synced:true,owner:session.login,path,updatedAt:payload.updatedAt}),{headers});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"GitHub sync write failed"},{status:502,headers:{"Cache-Control":"no-store"}});
  }
};