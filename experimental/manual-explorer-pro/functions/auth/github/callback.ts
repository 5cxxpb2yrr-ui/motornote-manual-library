import { clearStateCookie, readStateCookie, setSessionCookie, validateRepository, type GitHubEnv, type GitHubSession } from "../../_lib/github-auth";
interface Env extends GitHubEnv { GITHUB_CALLBACK_URL?:string; }
export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state");
  const headers=new Headers({"Cache-Control":"no-store","Location":new URL("/",request.url).toString()});
  const saved=await readStateCookie(request,env);
  headers.append("Set-Cookie",clearStateCookie());
  if(url.searchParams.has("error") || !code || !state || !saved || state!==saved.state) {
    headers.set("Location",new URL("/?github=authorization_failed",request.url).toString());
    return new Response(null,{status:302,headers});
  }
  try {
    if(!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error("GitHub App OAuth credentials are not configured");
    const callback=env.GITHUB_CALLBACK_URL || new URL("/auth/github/callback",request.url).toString();
    const body=new URLSearchParams({
      client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,
      code,redirect_uri:callback,code_verifier:saved.verifier
    });
    if(env.GITHUB_REPOSITORY_ID) body.set("repository_id",env.GITHUB_REPOSITORY_ID);
    const tokenResponse=await fetch("https://github.com/login/oauth/access_token",{
      method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body
    });
    const tokenData=await tokenResponse.json() as {access_token?:string;refresh_token?:string;expires_in?:number;refresh_token_expires_in?:number;error?:string};
    if(!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error||"GitHub did not issue an access token");
    const userResponse=await fetch("https://api.github.com/user",{
      headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+tokenData.access_token,"X-GitHub-Api-Version":"2026-03-10"}
    });
    if(!userResponse.ok) throw new Error("GitHub user validation failed");
    const user=await userResponse.json() as {login:string};
    const access=await validateRepository(tokenData.access_token);
    const session:GitHubSession={
      token:tokenData.access_token,login:user.login,authType:"github-app-user",
      expiresAt:Date.now()+(tokenData.expires_in||28800)*1000,
      refreshToken:tokenData.refresh_token,
      refreshTokenExpiresAt:Date.now()+(tokenData.refresh_token_expires_in||15897600)*1000,
      canRead:access.canRead,canWrite:access.canWrite
    };
    headers.append("Set-Cookie",await setSessionCookie(session,env));
    headers.set("Location",new URL("/?github=connected",request.url).toString());
  } catch(error) {
    headers.set("Location",new URL("/?github=error&reason="+encodeURIComponent(error instanceof Error?error.message:"unknown"),request.url).toString());
  }
  return new Response(null,{status:302,headers});
};