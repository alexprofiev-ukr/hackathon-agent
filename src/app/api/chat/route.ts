import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "You are a helpful AI project assistant for a hackathon team. Be practical, concise, and action-oriented.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reply = response.output_text || "No response";

    return Response.json({ reply });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
