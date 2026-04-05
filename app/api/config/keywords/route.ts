import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig, generateId, KeywordTrigger } from "@/lib/config";

// GET - List all keyword triggers
export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config.keywordTriggers);
}

// POST - Add a new keyword trigger
export async function POST(request: NextRequest) {
  const body: Omit<KeywordTrigger, "id"> = await request.json();
  const config = await getConfig();
  const newTrigger: KeywordTrigger = { id: generateId(), ...body };
  config.keywordTriggers.push(newTrigger);
  await saveConfig(config);
  return NextResponse.json(newTrigger, { status: 201 });
}

// PUT - Update a keyword trigger
export async function PUT(request: NextRequest) {
  const body: KeywordTrigger = await request.json();
  const config = await getConfig();
  const index = config.keywordTriggers.findIndex((k) => k.id === body.id);
  if (index === -1) {
    return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
  }
  config.keywordTriggers[index] = body;
  await saveConfig(config);
  return NextResponse.json(body);
}

// DELETE - Remove a keyword trigger
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const config = await getConfig();
  config.keywordTriggers = config.keywordTriggers.filter((k) => k.id !== id);
  await saveConfig(config);
  return NextResponse.json({ success: true });
}
