import { setStateCookie, type GitHubEnv } from "../../../_lib/github-auth";
interface Env extends GitHubEnv { GITHUB_CALLBACK_URL?: string; }
function base64url(bytes:Uint8Array) {
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  if(!env.GITHUB_CLIENT_ID) return new Response("GitHub App client ID is not configured",{status:503});
  const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier=base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
  const challenge=base64url(new Uint8Array(digest));
  const callback=env.GITHUB_CALLBACK_URL || new URL("/auth/github/callback",request.url).toString();
  const url=new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id",env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri",callback);
  url.searchParams.set("state",state);
  url.searchParams.set("code_challenge",challenge);
  url.searchParams.set("code_challenge_method","S256");
  url.searchParams.set("scope","offline_access");
  const headers=new Headers({Location:url.toString(),"Cache-Control":"no-store"});
  headers.append("Set-Cookie",await setStateCookie({state,verifier},env));
  return new Response(null,{status:302,headers});
};