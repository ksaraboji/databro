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
        const RSS_URL = "https://medium.com/feed/@sarakuma";
        const res = await fetch(
          `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`
        );
        const data = await res.json();

        if (data.status === "ok") {
          const formattedPosts: BlogPost[] = data.items.map((item: any) => {
             // Clean up the excerpt (strip HTML tags)
             // rss2json returns 'description' which is usually the snippet
             const doc = new DOMParser().parseFromString(item.description, 'text/html');
             const textContent = doc.body.textContent || "";
             const excerpt = textContent.slice(0, 200) + "...";

             // Format Date
             const date = new Date(item.pubDate).toLocaleDateString('en-US', {
               year: 'numeric', month: 'short', day: 'numeric'
             });

             return {
               id: item.guid,
               title: item.title,
               excerpt: excerpt,
               platform: "Medium",
               url: item.link,
               date: date,
               tags: item.categories || [],
             };
          });
          setPosts(formattedPosts);
        }
      } catch (error) {
        console.error("Failed to fetch Medium posts:", error);
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
