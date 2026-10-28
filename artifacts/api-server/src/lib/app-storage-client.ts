import { Storage } from "@google-cloud/storage";

// Matches the managed Replit sidecar identity from the Object Storage template.
// This client is server-only; never expose presigned repository URLs to browsers.
const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const appStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
  retryOptions: {
    autoRetry: true,
    maxRetries: 2,
    retryDelayMultiplier: 2,
    maxRetryDelay: 4,
    totalTimeout: 30,
  },
});
