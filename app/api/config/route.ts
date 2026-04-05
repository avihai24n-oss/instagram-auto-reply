import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/config";

// GET - Read full config
export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config);
}

// PUT - Update global settings
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const config = await getConfig();
  if (body.globalSettings) {
    config.globalSettings = { ...config.globalSettings, ...body.globalSettings };
  }
  if (body.welcomeMessage !== undefined) {
    config.welcomeMessage = { ...config.welcomeMessage, ...body.welcomeMessage };
  }
  if (body.quickReplies !== undefined) {
    config.quickReplies = { ...config.quickReplies, ...body.quickReplies };
  }
  await saveConfig(config);
  return NextResponse.json(config);
}
