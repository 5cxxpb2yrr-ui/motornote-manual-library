import { clearSessionCookie } from "../../../_lib/github-auth";
export const onRequestPost: PagesFunction = async () => new Response(JSON.stringify({connected:false}),{
  headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":clearSessionCookie()}
});