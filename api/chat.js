export default async function handler(req, res) {
  res.setHeader("X-WorkPulse-Proxy-Version", "2026-04-01-model-fix");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, context } = req.body ?? {};
    const modelNames = [
      "deepseek-ai/deepseek-v3.1",
      "deepseek-ai/deepseek-v3.1-terminus",
    ];
    let lastError = "";

    if (!process.env.NVIDIA_API_KEY) {
      return res.status(500).json({ error: "Missing NVIDIA_API_KEY on server" });
    }

    console.log("API Key first 10 chars:", process.env.NVIDIA_API_KEY?.substring(0, 10));

    for (const modelName of modelNames) {
      console.log("Trying model:", modelName);

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
        console.error("NVIDIA error:", lastError);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";

      return res.status(200).json({ reply: content, model: modelName });
    }

    return res.status(500).json({
      error: "AI service error",
      details: lastError || "No model succeeded",
      triedModels: modelNames,
    });
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
