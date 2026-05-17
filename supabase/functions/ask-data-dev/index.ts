declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

import { createAskDataHandler } from '../_shared/ask-data.ts';

Deno.serve(
  createAskDataHandler({
    functionName: 'ask-data-dev',
    cloudRunBaseUrlEnv: 'CLOUDRUN_BASE_URL_DEV',
    googleServiceAccountKeyJsonEnv: 'GCP_SERVICE_ACCOUNT_KEY_JSON_DEV',
  }),
);