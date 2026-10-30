import { ApiError } from "./http";
import { runtimeConfig } from "./runtime";
import { publicSession, ensureAccountWorkspace } from "./public-auth";
import { publicIdentity } from "./identity";
import { applicationStore } from "./applications";
export async function ownedApplication(){
 const config=runtimeConfig();
 if(!config.TALO_PUBLIC_AUTH||!config.DATABASE_URL)throw new ApiError(503,"UNAVAILABLE","Workspace is unavailable.");
 const user=await publicSession(config);if(!user)throw new ApiError(401,"SIGN_IN_REQUIRED","Sign in to continue.");
 if(!user.emailVerified)throw new ApiError(403,"VERIFY_EMAIL","Verify your email first.");
 await ensureAccountWorkspace(config,user);
 const app=await(await applicationStore(config.DATABASE_URL,publicIdentity(user.id))).get();
 if(!app)throw new ApiError(404,"APPLICATION_REQUIRED","Create an application first.");
 return {config,app};
}
