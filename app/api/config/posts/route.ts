import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig, generateId, PostConfig } from "@/lib/config";

// GET - List all post configs
export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config.posts);
}

// POST - Add a new post config
export async function POST(request: NextRequest) {
  const body: Omit<PostConfig, "id"> = await request.json();
  const config = await getConfig();
  const newPost: PostConfig = { id: generateId(), ...body };
  config.posts.push(newPost);
  await saveConfig(config);
  return NextResponse.json(newPost, { status: 201 });
}

// PUT - Update a post config
export async function PUT(request: NextRequest) {
  const body: PostConfig = await request.json();
  const config = await getConfig();
  const index = config.posts.findIndex((p) => p.id === body.id);
  if (index === -1) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  config.posts[index] = body;
  await saveConfig(config);
  return NextResponse.json(body);
}

// DELETE - Remove a post config
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const config = await getConfig();
  config.posts = config.posts.filter((p) => p.id !== id);
  await saveConfig(config);
  return NextResponse.json({ success: true });
}
