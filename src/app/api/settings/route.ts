import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAiSettings, maskKey, DEFAULT_API_BASE, DEFAULT_MODEL } from "@/lib/bcs-ai";
import { DEFAULT_STUDY_PREFS, parseStudyPrefs } from "@/lib/bcs-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function settingsPayload() {
  const s = await getAiSettings();
  const row = await db.appSetting.findUnique({ where: { id: "app" } });
  return {
    hasKey: !!s.apiKey.trim(),
    keyMasked: maskKey(s.apiKey),
    apiBase: s.apiBase,
    model: s.model,
    defaults: { apiBase: DEFAULT_API_BASE, model: DEFAULT_MODEL },
    studyPrefs: parseStudyPrefs((row as { studyPrefs?: string } | null)?.studyPrefs),
  };
}

// GET /api/settings — never returns the raw key, only a masked hint
export async function GET() {
  try {
    return NextResponse.json(await settingsPayload());
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "সেটিংস লোড করা যায়নি" }, { status: 500 });
  }
}

// PUT /api/settings — save BYOK config (key stays in the local DB only)
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string;
      apiBase?: string;
      model?: string;
      studyPrefs?: { srs?: string; interleave?: boolean; tts?: boolean };
    };
    const data: { apiKey?: string; apiBase?: string; model?: string; studyPrefs?: string } = {};
    if (body.apiKey !== undefined) data.apiKey = body.apiKey.trim();
    if (body.apiBase !== undefined) {
      const base = body.apiBase.trim().replace(/\/+$/, "");
      if (base && !/^https?:\/\//i.test(base)) {
        return NextResponse.json({ error: "Base URL http:// বা https:// দিয়ে শুরু হতে হবে" }, { status: 400 });
      }
      data.apiBase = base || DEFAULT_API_BASE;
    }
    if (body.model !== undefined) data.model = body.model.trim() || DEFAULT_MODEL;
    if (body.studyPrefs !== undefined) {
      data.studyPrefs = JSON.stringify(parseStudyPrefs(JSON.stringify(body.studyPrefs)));
    }

    await db.appSetting.upsert({
      where: { id: "app" },
      update: data,
      create: { id: "app", ...data },
    });
    return NextResponse.json(await settingsPayload());
  } catch (error) {
    console.error("PUT /api/settings error:", error);
    return NextResponse.json({ error: "সেটিংস সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
