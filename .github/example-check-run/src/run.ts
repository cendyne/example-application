import { GitHubClient } from "./github.ts";

for (const [key,value] of Object.entries(Deno.env.toObject())) {
  console.log(`Environment ${key} set with length: ${value.length} and begins with '${value.slice(0, 5)}'`)
}

const client = new GitHubClient(
  Deno.env.get("APP_ID") || "",
  Deno.env.get("APP_PRIVATE_KEY") || "",
);

await client.loadToken();

const runId = await client.createRun();

let conclusion: "success" | "action_required" = "success";
let summary = "All good";
try {
  const _badFile = await Deno.stat("./badfile.txt");

  summary = "`badfile.txt` found! Please remove.";
  conclusion = "action_required";
} catch (_e) {
  // The badfile does not exist.
}

await client.completeRun(runId, conclusion, summary);
