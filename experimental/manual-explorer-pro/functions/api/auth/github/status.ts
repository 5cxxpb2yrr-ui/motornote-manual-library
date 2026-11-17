import { createInstallationToken, getSession, refreshOAuthSession, setSessionCookie, type GitHubEnv } from "../../../_lib/github-auth";
export const onRequestGet: PagesFunction<GitHubEnv> = async ({request,env}) => {
  try {
    let session=await getSession(request,env);
    if(!session)return Response.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
    const original=session;
    session=await refreshOAuthSession(session,env);
    let appCanWrite=false;
    try {
      const installation=await createInstallationToken(env);
      appCanWrite=installation.permissions.contents==="write";
    } catch { /* OAuth or PAT write access may still be available */ }
    const headers=new Headers({"Cache-Control":"no-store"});
    if(session!==original)headers.append("Set-Cookie",await setSessionCookie(session,env));
    return new Response(JSON.stringify({
      authenticated:true,login:session.login,authType:session.authType,
      canRead:session.canRead,canWrite:session.canWrite||appCanWrite,
      appInstallationWrite:appCanWrite,expiresAt:session.expiresAt||null
    }),{headers});
  } catch(error) {
    return Response.json({authenticated:false,error:error instanceof Error?error.message:"Session expired"},{status:401,headers:{"Cache-Control":"no-store"}});
  }
};