interface R2Object {
  key:string;
  size:number;
  etag:string;
  uploaded:Date;
  writeHttpMetadata(headers:Headers):void;
}
interface R2ObjectBody extends R2Object {
  body:ReadableStream<Uint8Array>;
  text():Promise<string>;
  json<T=unknown>():Promise<T>;
}
interface R2Bucket {
  get(key:string):Promise<R2ObjectBody|null>;
  head(key:string):Promise<R2Object|null>;
}
type PagesFunction<Env=unknown> = (context:{request:Request;env:Env})=>Response|Promise<Response>;
