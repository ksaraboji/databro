declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

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

type AskPrescriptionFunctionConfig = {
  functionName: string;
  cloudRunBaseUrlEnv: string;
  googleServiceAccountKeyJsonEnv: string;
};

type GoogleServiceAccountKey = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

type CachedGoogleToken = {
  token: string;
  expiresAt: number;
};

let cachedGoogleToken: CachedGoogleToken | null = null;

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string) {
  const cleaned = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function getGoogleServiceAccountKey(config: AskPrescriptionFunctionConfig) {
  const rawValue = getRequiredEnv(config.googleServiceAccountKeyJsonEnv);
  const parsed = JSON.parse(rawValue) as Partial<GoogleServiceAccountKey>;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`Missing required fields in ${config.googleServiceAccountKeyJsonEnv}`);
  }

  return parsed as GoogleServiceAccountKey;
}

async function mintCloudRunIdToken(audience: string, serviceAccountKey: GoogleServiceAccountKey) {
  const now = Math.floor(Date.now() / 1000);

  if (cachedGoogleToken && cachedGoogleToken.expiresAt - now > 300) {
    return cachedGoogleToken.token;
  }

  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccountKey.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
    ...(serviceAccountKey.private_key_id ? { kid: serviceAccountKey.private_key_id } : {}),
  };

  const jwtClaims = {
    iss: serviceAccountKey.client_email,
    sub: serviceAccountKey.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    target_audience: audience,
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(jwtHeader))}.${base64UrlEncode(JSON.stringify(jwtClaims))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const idTokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!idTokenResponse.ok) {
    const errorDetails = await idTokenResponse.text();
    throw new Error(`Failed to mint Cloud Run ID token: ${idTokenResponse.status} (${errorDetails || 'no response body'})`);
  }

  const idTokenPayload = await idTokenResponse.json() as { id_token?: string; expires_in?: number };
  const idToken = idTokenPayload.id_token;

  if (!idToken) {
    throw new Error('Cloud Run ID token response did not include id_token.');
  }

  const expiresIn = typeof idTokenPayload.expires_in === 'number' ? idTokenPayload.expires_in : 3600;
  const cacheTtl = Math.max(60, Math.min(expiresIn - 300, 3300));

  cachedGoogleToken = {
    token: idToken,
    expiresAt: now + cacheTtl,
  };

  return idToken;
}

export function createAskPrescriptionHandler(config: AskPrescriptionFunctionConfig) {
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
    const cloudRunAudience = cloudRunBaseUrl.replace(/\/$/, '');
    const serviceAccountKey = getGoogleServiceAccountKey(config);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return jsonResponse(
        { error: 'Expected multipart/form-data.' },
        400,
      );
    }

    const incomingFormData = await request.formData();
    const file = incomingFormData.get('file');
    const userIntent = incomingFormData.get('user_intent');
    const sessionId = incomingFormData.get('session_id');
    const llmProvider = incomingFormData.get('llm_provider');
    const llmModel = incomingFormData.get('llm_model');
    const endSession = incomingFormData.get('end_session');

    if (typeof userIntent !== 'string' || !userIntent.trim()) {
      return jsonResponse({ error: 'user_intent is required.' }, 400);
    }

    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return jsonResponse({ error: 'session_id is required.' }, 400);
    }

    if (file !== null && !(file instanceof File)) {
      return jsonResponse({ error: 'file must be a valid file upload.' }, 400);
    }

    const forwardFormData = new FormData();
    forwardFormData.append('user_intent', userIntent);
    forwardFormData.append('session_id', sessionId);

    if (file instanceof File) {
      forwardFormData.append('file', file, file.name);
    }

    if (typeof llmProvider === 'string' && llmProvider.trim()) {
      forwardFormData.append('llm_provider', llmProvider.trim());
    }
    if (typeof llmModel === 'string' && llmModel.trim()) {
      forwardFormData.append('llm_model', llmModel.trim());
    }
    if (typeof endSession === 'string' && endSession.trim()) {
      forwardFormData.append('end_session', endSession.trim());
    }

    const idToken = await mintCloudRunIdToken(cloudRunAudience, serviceAccountKey);

    const backendResponse = await fetch(`${cloudRunBaseUrl.replace(/\/$/, '')}/v1/prescription-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
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
