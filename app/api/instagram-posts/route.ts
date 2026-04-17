import { NextResponse } from "next/server";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
const GRAPH_API = "https://graph.instagram.com/v21.0";

export async function GET() {
  try {
    // Get user's Instagram account ID
    const meRes = await fetch(`${GRAPH_API}/me?fields=id,username&access_token=${ACCESS_TOKEN}`);
    const me = await meRes.json();

    if (me.error) {
      console.error("Error fetching user:", me.error);
      return NextResponse.json({ error: me.error.message }, { status: 400 });
    }

    // Fetch all user's media/posts with pagination
    const allMedia: Record<string, string>[] = [];
    let nextUrl: string | null =
      `${GRAPH_API}/${me.id}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink&limit=100&access_token=${ACCESS_TOKEN}`;

    // Cap at 20 pages (2000 posts) to avoid runaway loops
    for (let page = 0; page < 20 && nextUrl; page++) {
      const mediaRes: Response = await fetch(nextUrl);
      const mediaData: {
        data?: Record<string, string>[];
        paging?: { next?: string };
        error?: { message: string };
      } = await mediaRes.json();

      if (mediaData.error) {
        console.error("Error fetching media:", mediaData.error);
        return NextResponse.json({ error: mediaData.error.message }, { status: 400 });
      }

      if (mediaData.data) allMedia.push(...mediaData.data);
      nextUrl = mediaData.paging?.next || null;
    }

    const posts = allMedia.map((post) => ({
      id: post.id,
      caption: post.caption || "",
      mediaType: post.media_type,
      mediaUrl: post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url,
      timestamp: post.timestamp,
      permalink: post.permalink,
    }));

    return NextResponse.json({
      username: me.username,
      posts,
    });
  } catch (error) {
    console.error("Error fetching Instagram posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
