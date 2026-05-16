import { createAskDataHandler } from '../_shared/ask-data.ts';

Deno.serve(
  createAskDataHandler({
    functionName: 'ask-data-prod',
    cloudRunBaseUrlEnv: 'CLOUDRUN_BASE_URL_PROD',
  }),
);