export const askAI = async (prompt, context) => {
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-v3-1",
        messages: [
          {
            role: "system",
            content: `You are an HR assistant for WorkPulse. Help employees and admins with attendance, leaves, reports and HR queries. Be concise, friendly, professional. User data: ${JSON.stringify(context)}`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 400,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "Sorry I could not process that. Please try again.";
  } catch (error) {
    console.error("AI error:", error);
    return "Sorry I could not process that. Please try again.";
  }
};
