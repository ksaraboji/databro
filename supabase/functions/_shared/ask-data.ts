const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

type AskDataFunctionConfig = {
  functionName: string;
  cloudRunBaseUrlEnv: string;
};

export function createAskDataHandler(config: AskDataFunctionConfig) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method === 'GET') {
      return jsonResponse({
        status: 'ok',
        service: config.functionName,
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const cloudRunBaseUrl = getRequiredEnv(config.cloudRunBaseUrlEnv);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return jsonResponse(
        { error: 'Expected multipart/form-data with file and user_intent fields.' },
        400,
      );
    }

    const incomingFormData = await request.formData();
    const file = incomingFormData.get('file');
    const userIntent = incomingFormData.get('user_intent');

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'file is required.' }, 400);
    }

    if (typeof userIntent !== 'string' || !userIntent.trim()) {
      return jsonResponse({ error: 'user_intent is required.' }, 400);
    }

    const forwardFormData = new FormData();
    forwardFormData.append('file', file, file.name);
    forwardFormData.append('user_intent', userIntent);

    const backendResponse = await fetch(`${cloudRunBaseUrl.replace(/\/$/, '')}/v1/ask-data`, {
      method: 'POST',
      body: forwardFormData,
    });

    const responseText = await backendResponse.text();
    const responseContentType = backendResponse.headers.get('content-type') ?? 'application/json; charset=utf-8';

    return new Response(responseText, {
      status: backendResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': responseContentType,
      },
    });
  };
}