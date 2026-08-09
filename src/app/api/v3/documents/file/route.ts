import { delay, fail, ok } from "@/lib/http";
import { passthrough, proxy, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { addDocument } from "@/lib/store";
import type { Document } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXT_TYPE: Record<string, Document["type"]> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  mp4: "video",
  mov: "video",
  md: "text",
  txt: "text",
};

export async function POST(req: Request) {
  if (wantsRemote(req)) {
    // Forward multipart as-is.
    const form = await req.formData();
    const res = await proxy("/v3/documents/file", { method: "POST", body: form });
    clearTagCache();
    return passthrough(res);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected multipart/form-data with a `file` field.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "`file` is required.");

  const containerTags = String(form.get("containerTags") ?? "sm_personal")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Text-like files are read; binaries get a placeholder body, which is
  // what the extraction stage would replace with real OCR/parse output.
  const isText = ["md", "txt", "json", "csv"].includes(ext);
  const content = isText
    ? await file.text()
    : `[${file.name} — ${(file.size / 1024).toFixed(0)} KB]\n\nBinary upload queued for extraction. A real instance runs OCR for images and a PDF parser for documents before chunking.`;

  await delay(280);
  const doc = addDocument({
    content,
    title: file.name,
    containerTags,
    type: EXT_TYPE[ext] ?? "text",
    metadata: { filename: file.name, bytes: file.size },
  });
  return ok({ id: doc.id, status: doc.status, title: doc.title }, { status: 201 });
}
