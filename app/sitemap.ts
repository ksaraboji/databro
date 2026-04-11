import { MetadataRoute } from 'next';
import { SITEMAP_ROUTES } from '../lib/sitemap-routes';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://databro.dev';

  return SITEMAP_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.8,
    images: route === '' ? [`${baseUrl}/favicon.svg`] : undefined,
  }));
}

