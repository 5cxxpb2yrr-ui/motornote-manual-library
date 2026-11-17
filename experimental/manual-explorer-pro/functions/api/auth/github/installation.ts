import { createInstallationToken, type GitHubEnv } from "../../../../_lib/github-auth";
export const onRequestGet: PagesFunction<GitHubEnv> = async ({env}) => {
  try {
    const result=await createInstallationToken(env);
    return Response.json({
      installed:true,installationId:result.installationId,expiresAt:result.expiresAt,
      permissions:result.permissions,repositories:result.repositories.map(repo=>repo.full_name),
      repositoryAccess:result.access
    },{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return Response.json({installed:false,error:error instanceof Error?error.message:"GitHub App installation is unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
};