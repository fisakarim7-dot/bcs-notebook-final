import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PACK_RE = /^BCS-Tree-Notebook-.+\.zip$/i;

/**
 * GET /api/laptop-pack
 * Serves the CURRENT versioned laptop pack ZIP (e.g. BCS-Tree-Notebook-2026-09-13_0908.zip).
 * The filename carries the build stamp, so every rebuild produces a fresh URL and no
 * browser/gateway cache can ever hand back an old pack. Headers force no-store.
 */
export async function GET() {
  try {
    const pub = path.join(process.cwd(), "public");
    const names = (await fs.readdir(pub)).filter((n) => PACK_RE.test(n)).sort();
    const name = names[names.length - 1];

    if (!name) {
      return Response.json(
        {
          error:
            "ল্যাপটপ প্যাক (ZIP) এখনো তৈরি হয়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।",
        },
        { status: 404 }
      );
    }

    const buf = await fs.readFile(path.join(pub, name));
    const bytes = new Uint8Array(buf);

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Pack-Name": name,
      },
    });
  } catch {
    return Response.json(
      { error: "ZIP ফাইলটি পড়তে সমস্যা হয়েছে — আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}
