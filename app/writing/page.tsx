"use client";

import React, { useEffect, useState } from "react";
import BlogList, { BlogPost } from "@/components/writing/blog-list";
import { Loader2 } from "lucide-react";

export default function WritingPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        // Use rss2json to bypass CORS restrictions on the client side
        const MEDIUM_RSS = "https://medium.com/feed/@sarakuma";
        const DEVTO_RSS = "https://dev.to/feed/databro";

        const [mediumRes, devtoRes] = await Promise.allSettled([
          fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(MEDIUM_RSS)}`),
          fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(DEVTO_RSS)}`)
        ]);

        let allPosts: BlogPost[] = [];

        // 1. Process Medium
        if (mediumRes.status === "fulfilled") {
          try {
            const data = await mediumRes.value.json();
            if (data.status === "ok") {
              const mediumPosts = data.items.map((item: any) => {
                // Strip HTML from description for excerpt
                const doc = new DOMParser().parseFromString(item.description, 'text/html');
                const textContent = doc.body.textContent || "";
                const excerpt = textContent.slice(0, 200) + (textContent.length > 200 ? "..." : "");

                return {
                  id: item.guid,
                  title: item.title,
                  excerpt: excerpt,
                  platform: "Medium",
                  url: item.link,
                  date: new Date(item.pubDate).toISOString(), // Standardize for sorting
                  displayDate: new Date(item.pubDate).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                  }),
                  tags: item.categories || [],
                };
              });
              allPosts = [...allPosts, ...mediumPosts];
            }
          } catch (e) {
            console.error("Error parsing Medium feed", e);
          }
        }

        // 2. Process Dev.to
        if (devtoRes.status === "fulfilled") {
          try {
             const data = await devtoRes.value.json();
             if (data.status === "ok") {
               const devtoPosts = data.items
                 .filter((item: any) => {
                   const tags = item.categories || [];
                   const title = (item.title || "").toLowerCase();
                   return !tags.includes('archived') && !title.includes('archived');
                 })
                 .map((item: any) => {
                 // Dev.to RSS content might differ, check description
                 const doc = new DOMParser().parseFromString(item.description, 'text/html');
                 const textContent = doc.body.textContent || "";
                 const excerpt = textContent.slice(0, 200) + (textContent.length > 200 ? "..." : "");

                 return {
                   id: item.guid,
                   title: item.title,
                   excerpt: excerpt,
                   platform: "Dev.to",
                   url: item.link,
                   date: new Date(item.pubDate).toISOString(),
                   displayDate: new Date(item.pubDate).toLocaleDateString('en-US', {
                     year: 'numeric', month: 'short', day: 'numeric'
                   }),
                   tags: item.categories || [],
                 };
               });
               allPosts = [...allPosts, ...devtoPosts];
             }
          } catch (e) {
             console.error("Error parsing Dev.to feed", e);
          }
        }

        // Sort by date descending
        allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Map back to display format (removing ISO date used for sorting if needed, or keeping it)
        // Since we stored displayDate as an extra property, we cast to any to access it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalPosts = allPosts.map((p: any) => ({
            id: p.id,
            title: p.title,
            excerpt: p.excerpt,
            platform: p.platform,
            url: p.url,
            date: p.displayDate, // Use the pre-formatted date
            tags: p.tags
        }));

        setPosts(finalPosts);

      } catch (error) {
        console.error("Failed to fetch posts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
      );
  }

  return <BlogList posts={posts} />;
}
