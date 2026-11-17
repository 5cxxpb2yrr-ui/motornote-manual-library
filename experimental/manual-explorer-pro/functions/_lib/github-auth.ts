export interface GitHubEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_PRIVATE_KEY_PATH?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_REPOSITORY_ID?: string;
  SESSION_SECRET?: string;
}
export interface GitHubSession {
  token: string;
  login: string;
  authType: "github-app-user" | "pat";
  expiresAt?: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  canRead: boolean;
  canWrite: boolean;
}
const OWNER = "5cxxpb2yrr-ui";
const REPO = "motornote-manual-library";
const API_VERSION = "2026-03-10";
const encoder = new TextEncoder();
const SESSION_COOKIE = "__Host-lifeos_session";
const STATE_COOKIE = "__Host-lifeos_oauth";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-value.length%4)%4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function encryptionKey(env: GitHubEnv): Promise<CryptoKey> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const material = await crypto.subtle.importKey("raw",encoder.encode(env.SESSION_SECRET),"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey(
    {name:"HKDF",hash:"SHA-256",salt:encoder.encode("lifeos-manual-explorer-v1"),info:encoder.encode("encrypted-session-cookie")},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
  );
}
export async function seal(value: unknown, env: GitHubEnv): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(env),encoder.encode(JSON.stringify(value)));
  return base64url(iv)+"."+base64url(new Uint8Array(cipher));
}
export async function unseal<T>(value: string, env: GitHubEnv): Promise<T|null> {
  try {
    const [ivText,cipherText] = value.split(".");
    if (!ivText || !cipherText) return null;
    const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64url(ivText)},await encryptionKey(env),fromBase64url(cipherText));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch { return null; }
}
function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").map(part=>part.trim()).find(part=>part.startsWith(name+"="))?.slice(name.length+1);
}
function setCookie(name: string, value: string, maxAge: number) {
  return name+"="+value+"; Path=/; Max-Age="+maxAge+"; Secure; HttpOnly; SameSite=Lax";
}
export function clearSessionCookie() { return SESSION_COOKIE+"=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"; }
export function clearStateCookie() { return STATE_COOKIE+"=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"; }
export async function setSessionCookie(session: GitHubSession, env: GitHubEnv) {
  return setCookie(SESSION_COOKIE,await seal(session,env),Math.max(60,Math.min(2592000,Math.floor(((session.refreshTokenExpiresAt || session.expiresAt || Date.now()+86400000)-Date.now())/1000))));
}
export async function setStateCookie(state: {state:string;verifier:string}, env: GitHubEnv) {
  return setCookie(STATE_COOKIE,await seal(state,env),600);
}
export async function readStateCookie(request: Request, env: GitHubEnv) {
  const value=cookieValue(request,STATE_COOKIE);
  return value?unseal<{state:string;verifier:string}>(value,env):null;
}
export async function getSession(request: Request, env: GitHubEnv) {
  const value=cookieValue(request,SESSION_COOKIE);
  return value?unseal<GitHubSession>(value,env):null;
}
export async function githubFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response=await fetch("https://api.github.com"+path,{
    ...init,
    headers:{
      Accept:"application/vnd.github+json",
      Authorization:"Bearer "+token,
      "X-GitHub-Api-Version":API_VERSION,
      "User-Agent":"LifeOS-Manual-Explorer-Pro",
      ...(init.headers||{})
    }
  });
  const body=await response.text();
  let data: unknown;
  try { data=body?JSON.parse(body):{}; } catch { data={message:body}; }
  if(!response.ok) {
    const message=(data as {message?:string})?.message || "GitHub API request failed";
    throw new Error("GitHub "+response.status+": "+message);
  }
  return data as T;
}
export async function validateRepository(token: string) {
  const repo=await githubFetch<{full_name:string;private:boolean;permissions?:{pull?:boolean;push?:boolean;admin?:boolean}}>(
    "/repos/"+OWNER+"/"+REPO,token
  );
  if(repo.full_name.toLowerCase()!==OWNER+"/"+REPO) throw new Error("Authenticated account did not resolve the configured repository");
  if(!repo.permissions?.pull) throw new Error("GitHub account does not have read access to "+OWNER+"/"+REPO);
  return {repository:repo.full_name,private:repo.private,canRead:true,canWrite:Boolean(repo.permissions.push)};
}
export async function refreshOAuthSession(session: GitHubSession, env: GitHubEnv): Promise<GitHubSession> {
  if(session.authType!=="github-app-user" || !session.refreshToken || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return session;
  if(session.expiresAt && session.expiresAt>Date.now()+120000) return session;
  if(session.refreshTokenExpiresAt && session.refreshTokenExpiresAt<Date.now()) throw new Error("GitHub refresh token expired; reconnect GitHub.");
  const body=new URLSearchParams({
    client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,
    grant_type:"refresh_token",refresh_token:session.refreshToken
  });
  const response=await fetch("https://github.com/login/oauth/access_token",{
    method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body
  });
  const data=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;refresh_token_expires_in?:number;error?:string};
  if(!response.ok || !data.access_token) throw new Error(data.error||"Unable to refresh GitHub session");
  return {
    ...session,token:data.access_token,
    refreshToken:data.refresh_token||session.refreshToken,
    expiresAt:Date.now()+(data.expires_in||28800)*1000,
    refreshTokenExpiresAt:Date.now()+(data.refresh_token_expires_in||15897600)*1000
  };
}

function derLength(length:number):Uint8Array {
  if(length<128)return new Uint8Array([length]);
  const bytes:number[]=[];let n=length;while(n>0){bytes.unshift(n&255);n>>=8;}
  return new Uint8Array([0x80|bytes.length,...bytes]);
}
function der(tag:number,content:Uint8Array):Uint8Array {
  const length=derLength(content.length);const out=new Uint8Array(1+length.length+content.length);
  out[0]=tag;out.set(length,1);out.set(content,1+length.length);return out;
}
function concat(...parts:Uint8Array[]):Uint8Array {
  const size=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(size);let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
}
function privateKeyDer(pem:string):Uint8Array {
  const normalized=pem.replace(/\\n/g,"\n").trim();
  const pkcs1=normalized.includes("BEGIN RSA PRIVATE KEY");
  const body=normalized.replace(/-----BEGIN [^-]+-----/g,"").replace(/-----END [^-]+-----/g,"").replace(/\s/g,"");
  const binary=atob(body);const raw=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(!pkcs1)return raw;
  const algorithm=new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);
  return der(0x30,concat(new Uint8Array([0x02,0x01,0x00]),algorithm,der(0x04,raw)));
}
export async function createAppJwt(env: GitHubEnv): Promise<string> {
  if(!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) throw new Error("GitHub App ID and private key are required");
  const header=base64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const now=Math.floor(Date.now()/1000);
  const payload=base64url(encoder.encode(JSON.stringify({iat:now-60,exp:now+540,iss:env.GITHUB_APP_ID})));
  const input=header+"."+payload;
  const key=await crypto.subtle.importKey("pkcs8",privateKeyDer(env.GITHUB_PRIVATE_KEY),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(input));
  return input+"."+base64url(new Uint8Array(signature));
}
export async function createInstallationToken(env: GitHubEnv) {
  const jwt=await createAppJwt(env);
  const installationPath=env.GITHUB_INSTALLATION_ID
    ? "/app/installations/"+env.GITHUB_INSTALLATION_ID
    : "/repos/"+OWNER+"/"+REPO+"/installation";
  const installation=await githubFetch<{id:number}>(installationPath,jwt);
  const token=await githubFetch<{token:string;expires_at:string;permissions:Record<string,string>;repositories?:Array<{full_name:string}>}>(
    "/app/installations/"+installation.id+"/access_tokens",jwt,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        repository_names:[REPO],
        permissions:{contents:"write",metadata:"read"}
      })
    }
  );
  const access=await validateRepository(token.token);
  return {installationId:installation.id,expiresAt:token.expires_at,permissions:token.permissions,repositories:token.repositories||[],access};
}
export { OWNER as GITHUB_OWNER, REPO as GITHUB_REPOSITORY, SESSION_COOKIE };