import { createAskDataHandler } from '../_shared/ask-data.ts';

Deno.serve(
  createAskDataHandler({
    functionName: 'ask-data-dev',
    cloudRunBaseUrlEnv: 'CLOUDRUN_BASE_URL_DEV',
  }),
);