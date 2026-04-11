import { SITEMAP_ROUTES } from '../../lib/sitemap-routes';

export const dynamic = 'force-static';

export async function GET() {
  const baseUrl = 'https://data-bro.com';
  const now = new Date().toISOString();

  const urls = SITEMAP_ROUTES.map((route) => {
    const loc = `${baseUrl}${route}`;
    const changefreq = route === '' ? 'weekly' : 'monthly';
    const priority = route === '' ? '1.0' : '0.8';

    return [
      '<url>',
      `<loc>${loc}</loc>`,
      `<lastmod>${now}</lastmod>`,
      `<changefreq>${changefreq}</changefreq>`,
      `<priority>${priority}</priority>`,
      '</url>',
    ].join('');
  }).join('');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  });
}
