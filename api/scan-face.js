// POST /api/scan-face  multipart form: photo (image file), confirmed=true
// Sends the photo to the FaceCheck.ID face-search API and returns the matching pictures.
// Needs FACECHECK_API_TOKEN in the environment. Each search uses FaceCheck credits.
const SITE = "https://facecheck.id";
const MAX_BYTES = 10 * 1024 * 1024;
const POLL_MS = 2000;
const GIVE_UP_MS = 4 * 60 * 1000;

const json = (body, status = 200) => Response.json(body, { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(request) {
  const token = process.env.FACECHECK_API_TOKEN;
  if (!token) return json({ error: "Face search is not set up on this site yet (no FACECHECK_API_TOKEN)." }, 501);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Send the photo as a form upload." }, 400); }
  const photo = form.get("photo");
  if (form.get("confirmed") !== "true") return json({ error: "Confirm that this is your own photo first." }, 400);
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return json({ error: "Add a JPG or PNG photo of your face." }, 400);
  if (photo.size > MAX_BYTES) return json({ error: "That photo is over 10 MB. Use a smaller one." }, 413);

  const headers = { accept: "application/json", Authorization: token };

  const upload = new FormData();
  upload.append("images", photo, photo.name || "photo.jpg");
  const up = await fetch(`${SITE}/api/upload_pic`, { method: "POST", headers, body: upload }).then((r) => r.json());
  if (up.error) return json({ error: `Face search refused the photo: ${up.error}` }, 502);

  const started = Date.now();
  while (Date.now() - started < GIVE_UP_MS) {
    const res = await fetch(`${SITE}/api/search`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id_search: up.id_search, with_progress: true, status_only: false, demo: false }),
    }).then((r) => r.json());
    if (res.error) return json({ error: `Face search failed: ${res.error}` }, 502);
    if (res.output) {
      const matches = (res.output.items ?? []).map((it) => ({
        image: String(it.base64 ?? "").startsWith("data:") ? it.base64 : `data:image/webp;base64,${it.base64}`,
        url: it.url,
        score: it.score,
      })).filter((m) => m.url && m.image.length > 30);
      return json({ matches });
    }
    await sleep(POLL_MS);
  }
  return json({ error: "Face search took too long. Try again." }, 504);
}
