import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://databro.dev';
  
  const routes = [
    '',
    '/tools',
    '/learning',
    '/writing',
    '/visualizations',
    '/tools/universal-converter',
    '/tools/pdf-merger',
    '/tools/pdf-splitter',
    '/tools/doc-to-markdown',
    '/tools/base64-converter',
    '/tools/secure-zip',
    '/tools/json-formatter',
    '/tools/sql-formatter',
    '/tools/checksum-calculator',
    '/tools/credit-card-validator',
    '/tools/jwt-debugger',
    '/tools/upc-validator',
    '/tools/aadhaar-validator',
    '/tools/qr-code-generator',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.8,
    images: route === '' ? [`${baseUrl}/favicon.svg`] : undefined,
  }));
}
