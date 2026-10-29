import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Postgres is included in every Neon project. Keep existing branch settings.
  // Managed Auth handles public sign-in; keep other branch settings unchanged.
  auth: true,
  branch: () => ({}),
});
