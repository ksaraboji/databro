declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

import { createAskPrescriptionHandler } from '../_shared/ask-prescription.ts';

Deno.serve(
  createAskPrescriptionHandler({
    functionName: 'ask-prescription-dev',
    cloudRunBaseUrlEnv: 'CLOUDRUN_BASE_URL_DEV',
    googleServiceAccountKeyJsonEnv: 'GCP_SERVICE_ACCOUNT_KEY_JSON_DEV',
  }),
);
