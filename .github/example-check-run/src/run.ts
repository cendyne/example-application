import { GitHubClient } from "./github.ts";

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

try {
  const commentFile = await Deno.stat("./comment.md");
  // When commentFile exists, which is asserted true at this point
  const comment = await Deno.readTextFile('./comment.md');
  // Only comment if on an open pull request.
  const pullRequestId = await client.findOpenPullRequest();
  if (pullRequestId) {
    await client.postComment(pullRequestId, comment);
  }
} catch (_e) {
  // comment.md does not exist
}

await client.completeRun(runId, conclusion, summary);
