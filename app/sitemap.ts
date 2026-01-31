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
    '/tools/base64-converter',
    '/tools/secure-zip',
    '/tools/json-formatter',
    '/tools/sql-formatter',
    '/tools/checksum-calculator',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.8,
  }));
}
