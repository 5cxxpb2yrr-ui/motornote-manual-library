import { setSessionCookie, validateRepository, type GitHubEnv, type GitHubSession } from "../../../../_lib/github-auth";
export const onRequestPost: PagesFunction<GitHubEnv> = async ({request,env}) => {
  try {
    const body=await request.json() as {token?:string};
    const token=body.token?.trim();
    if(!token || token.length<20 || token.length>500) return Response.json({error:"Enter a valid GitHub token."},{status:400});
    const userResponse=await fetch("https://api.github.com/user",{
      headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2026-03-10"}
    });
    if(!userResponse.ok) return Response.json({error:"GitHub rejected this token."},{status:401});
    const user=await userResponse.json() as {login:string};
    const access=await validateRepository(token);
    const session:GitHubSession={token,login:user.login,authType:"pat",canRead:access.canRead,canWrite:access.canWrite};
    const headers=new Headers({"Cache-Control":"no-store"});
    headers.append("Set-Cookie",await setSessionCookie(session,env));
    return new Response(JSON.stringify({connected:true,login:user.login,repository:access.repository,canRead:access.canRead,canWrite:access.canWrite}),{headers,status:200});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"Unable to validate token."},{status:403,headers:{"Cache-Control":"no-store"}});
  }
};