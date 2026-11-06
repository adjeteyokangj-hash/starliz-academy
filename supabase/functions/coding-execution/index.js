import { createSupabaseExecutionGateway } from "../../../services/coding-runner/supabase-gateway.mjs";

// No Supabase service-role key or database client is used by this gateway.
const handler = createSupabaseExecutionGateway({
  runnerUrl: Deno.env.get("CODING_ISOLATED_RUNNER_URL"),
  secret: Deno.env.get("CODING_RUNNER_SECRET"),
});
Deno.serve(handler);
