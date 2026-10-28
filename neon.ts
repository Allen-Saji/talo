import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Postgres is included in every Neon project. Keep existing branch settings.
  // Auth, Functions, Storage, and AI Gateway are not managed by this app.
  branch: () => ({}),
});
