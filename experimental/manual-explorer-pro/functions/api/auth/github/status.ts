import { getSession, refreshOAuthSession, setSessionCookie, type GitHubEnv } from "../../../../_lib/github-auth";
export const onRequestGet: PagesFunction<GitHubEnv> = async ({request,env}) => {
  try {
    let session=await getSession(request,env);
    if(!session) return Response.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
    const refreshed=await refreshOAuthSession(session,env);
    const headers=new Headers({"Cache-Control":"no-store"});
    if(refreshed!==session) headers.append("Set-Cookie",await setSessionCookie(refreshed,env));
    session=refreshed;
    return new Response(JSON.stringify({
      authenticated:true,login:session.login,authType:session.authType,
      canRead:session.canRead,canWrite:session.canWrite,
      expiresAt:session.expiresAt||null
    }),{headers});
  } catch(error) {
    return Response.json({authenticated:false,error:error instanceof Error?error.message:"Session expired"},{status:401,headers:{"Cache-Control":"no-store"}});
  }
};