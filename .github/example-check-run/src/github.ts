import { encodeBase64Url } from "./b64.ts";

// Get standard information available in each run.
const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY") || "";
if (GITHUB_REPOSITORY == "") {
  console.error("GITHUB_REPOSITORY not set");
  Deno.exit(1);
}

const GITHUB_SHA = Deno.env.get("GITHUB_SHA") || "";
if (GITHUB_SHA == "") {
  console.error("GITHUB_SHA not set");
  Deno.exit(1);
}

const GITHUB_REF_NAME = Deno.env.get("GITHUB_REF_NAME") || "";
if (GITHUB_REF_NAME == "") {
  console.error("GITHUB_REF_NAME not set");
  Deno.exit(1);
}

const GITHUB_WORKSPACE = Deno.env.get("GITHUB_WORKSPACE") || "";
if (GITHUB_WORKSPACE == "") {
  console.error("GITHUB_WORKSPACE not set");
  Deno.exit(1);
}

export class GitHubClient {
  private token: string | null;
  private appId: string;
  private privateKey: JsonWebKey;

  constructor(APP_ID: string, APP_PRIVATE_KEY: string) {
    // Get APP_PRIVATE_KEY and APP_ID from the environment.
    let APP_PRIVATE_KEY_TMP: JsonWebKey;
    try {
      APP_PRIVATE_KEY_TMP = JSON.parse(APP_PRIVATE_KEY) as JsonWebKey;
      if (APP_PRIVATE_KEY_TMP.kty != "RS256") {
        throw new Error("APP_PRIVATE_KEY JWK is unsupported, RS256 only.");
      }
    } catch (_e) {
      // Could not parse as JSON
      throw new Error("Could not parse APP_PRIVATE_KEY as JSON");
    }
    this.privateKey = APP_PRIVATE_KEY_TMP;
    if (!APP_ID || APP_ID == "") {
      throw new Error("APP_ID is not set");
    }
    this.appId = APP_ID;
    this.token = null;
  }
  async loadToken(): Promise<void> {
    // Import the RSA private key as a JWK
    const algorithm = { "name": "RSASSA-PKCS1-v1_5", "hash": "SHA-256" };
    const key = await crypto.subtle.importKey(
      "jwk",
      this.privateKey,
      algorithm,
      false,
      ["sign"],
    );
    // We are using RSA Signing with SHA-256
    const header = { alg: "RS256" };

    // Construct the claims:
    // This token was issued a minute ago (for time drift reasons)
    // And will be valid for the next minute
    // (for time drift and execution time reasons)
    const now = Math.floor(new Date().getTime() / 1000);
    const claims = {
      iss: this.appId,
      iat: now - 60,
      exp: now + 60,
    };
    // Compose both into an unsigned JWT
    const unsignedJWT = JSON.stringify(header) + "." + JSON.stringify(claims);
    // Construct a signature with our key
    const signature = await crypto.subtle.sign(
      algorithm,
      key,
      new TextEncoder().encode(unsignedJWT),
    );
    // Encode the signature for a JWT
    const b64Signature = encodeBase64Url(signature);
    // And finally add the signature to the unsigned JWT
    const jwt = `${unsignedJWT}.${b64Signature}`;

    // Find out what the installation ID is, every app that is installed
    // on a repository has one.
    const installationResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/installation`,
      {
        headers: new Headers([
          ["Accept", "application/vnd.github+json"],
          ["Authorization", `Bearer ${jwt}`],
          ["X-GitHub-Api-Version", "2022-11-28"],
        ]),
      },
    );

    // Read the installation info from the endpoint.
    // If the app is not appropriately linked, this will fail and exit.
    const installationJsonText = await installationResponse.text();
    let installationJson: {
      // This structure is incomplete, as this is only an illustrative example
      access_tokens_url: string;
    };
    try {
      installationJson = JSON.parse(installationJsonText);
    } catch (e) {
      console.error(e);
      console.warn(installationJsonText);
      throw new Error(
        `Could not find installation on repo ${GITHUB_REPOSITORY}`,
      );
    }

    // Request an access token for this installation with the same JWT as before.
    const accessTokensResponse = await fetch(
      installationJson.access_tokens_url,
      {
        headers: new Headers([
          ["Accept", "application/vnd.github+json"],
          ["Authorization", `Bearer ${jwt}`],
          ["X-GitHub-Api-Version", "2022-11-28"],
        ]),
        method: "POST",
      },
    );

    // Read the access token response.
    // This can fail if there is a permissions issue.
    const accessTokensText = await accessTokensResponse.text();
    let accessTokensJson: {
      // This structure is incomplete, as this is only an illustrative example
      token: string;
    };
    try {
      accessTokensJson = JSON.parse(accessTokensText);
    } catch (e) {
      console.error(e);
      console.warn(accessTokensText);
      throw new Error(
        `Could not acquire authentication token for ${GITHUB_REPOSITORY}`,
      );
    }
    // Extract the token from the response.
    const token = accessTokensJson.token as string;
    if (!token || typeof token != "string") {
      console.error("Could not get token");
      throw new Error(
        `Could not acquire authentication token for ${GITHUB_REPOSITORY}`,
      );
    }
    // Finally, we have a bearer token for future API calls.
    // A production worthy implementation would return an object which includes
    // an expire time and a method to request a new token.
    this.token = token;
  }

  async createRun(): Promise<number> {
    const started_at = new Date().toISOString();
    const checkRunResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/check-runs`,
      {
        headers: new Headers([
          ["Accept", "application/vnd.github+json"],
          ["Authorization", `Bearer ${this.token}`],
          ["X-GitHub-Api-Version", "2022-11-28"],
          ["Content-Type", "application/json"],
        ]),
        method: "POST",
        body: JSON.stringify({
          name: "Example Check",
          head_sha: GITHUB_SHA,
          status: "in_progress",
          started_at,
        }),
      },
    );

    const checkRunResponseText = await checkRunResponse.text();
    let id: number;
    try {
      id = JSON.parse(checkRunResponseText).id;
    } catch (e) {
      // This can fail if permissions are not granted to this installation.
      console.error(e);
      console.warn(checkRunResponseText);
      throw new Error("Could not create check-run");
    }
    console.log(`Created check-run ${id}`);
    return id;
  }
  async completeRun(
    id: number,
    conclusion: "action_required" | "success",
    summary: string,
  ): Promise<void> {
    const completed_at = new Date().toISOString();
    const checkRunUpdateResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/check-runs/${id}`,
      {
        headers: new Headers([
          ["Accept", "application/vnd.github+json"],
          ["Authorization", `Bearer ${this.token}`],
          ["X-GitHub-Api-Version", "2022-11-28"],
          ["Content-Type", "application/json"],
        ]),
        method: "PATCH",
        body: JSON.stringify({
          name: "Example Check",
          head_sha: GITHUB_SHA,
          status: "completed",
          completed_at,
          conclusion,
          output: {
            title: "Example Check Results",
            summary,
          },
        }),
      },
    );

    if (checkRunUpdateResponse.status != 200) {
      console.warn(await checkRunUpdateResponse.text());
      throw new Error("Could not complete run");
    }
    console.log(`Completed check-run ${id}`);
  }
}
