const rateLimit = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) return false;
  timestamps.push(now);
  rateLimit.set(ip, timestamps);
  if (rateLimit.size > 5000) {
    const oldest = [...rateLimit.keys()].slice(0, 1000);
    for (const key of oldest) rateLimit.delete(key);
  }
  return true;
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
  const reqOrigin = req.headers.origin || "";
  const corsOrigin = reqOrigin === allowedOrigin || reqOrigin.endsWith(".vercel.app") ? reqOrigin : allowedOrigin;

  res.setHeader("X-WorkPulse-Proxy-Version", "2026-04-01-model-fix");
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  try {
    const { messages, context } = req.body ?? {};

    if (!process.env.NVIDIA_API_KEY) {
      return res.status(500).json({ error: "Missing NVIDIA_API_KEY on server" });
    }

    const modelNames = ["deepseek-ai/deepseek-v3.1", "deepseek-ai/deepseek-v3.1-terminus"];
    let lastError = "";

    for (const modelName of modelNames) {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "system",
              content: `You are WorkPulse HR Assistant. Help employees and admins with attendance, leaves, and HR queries. Be concise, friendly, professional. User context: ${JSON.stringify(context)}`,
            },
            ...(messages ?? []),
          ],
          max_tokens: 400,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return res.status(200).json({ reply: content, model: modelName });
    }

    return res.status(500).json({ error: "AI service error", details: lastError || "No model succeeded" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
