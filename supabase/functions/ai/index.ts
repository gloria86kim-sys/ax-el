// LUMI AI 코파일럿 프록시: 브라우저 요청을 받아 OpenAI Chat Completions(스트리밍)로 전달함
// 필요한 Secrets: OPENAI_API_KEY, WORKSHOP_CODE, (선택) OPENAI_MODEL, OPENAI_MODEL_QUICK
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ws-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const code = Deno.env.get("WORKSHOP_CODE");
  if (code && req.headers.get("x-ws-code") !== code) return json({ error: "forbidden" }, 403);

  let body: { prompt?: unknown; tier?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt || prompt.length > 60000) return json({ error: "bad_request" }, 400);

  const model = (body.tier === "quick" && Deno.env.get("OPENAI_MODEL_QUICK")) || Deno.env.get("OPENAI_MODEL");
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || !model) return json({ error: "server_not_configured" }, 500);

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: "당신은 단국대학교 교수 대상 AX 평가 워크숍을 돕는 AI 코파일럿 LUMI임. 항상 한국어로 답하고, 요청한 출력 형식을 정확히 지킴. 근거 없는 통계나 문헌을 지어내지 않음." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!upstream.ok || !upstream.body) {
    return json({ error: "upstream", status: upstream.status }, upstream.status === 429 ? 429 : 502);
  }
  return new Response(upstream.body, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
