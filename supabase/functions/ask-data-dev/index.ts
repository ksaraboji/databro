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
  }),
);