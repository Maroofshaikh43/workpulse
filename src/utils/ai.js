export const askAI = async (prompt, context) => {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        context,
      }),
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    const data = await response.json();
    return data.reply ?? "Sorry I could not process that. Please try again.";
  } catch (error) {
    console.error("AI error:", error);
    return "Sorry I could not process that. Please try again.";
  }
};
