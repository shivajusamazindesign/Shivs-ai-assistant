import express from "express";
import path from "path";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";
import { createServer } from "http";
import { WebSocketServer } from "ws";

dotenv.config();

const PROJECTS = [
  {
    id: "jusamazin",
    title: "Jus Amazin Brand System",
    category: "Identity",
    description: "Leading every visual and print media process for Jus Amazin — from packaging brief to shelf-ready file.",
    tags: ["Branding", "Packaging", "FMCG"],
    link: "https://sivnco.in/jusamazin",
    imageUrl: "https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "desi-energy",
    title: "Desi Energy Bar",
    category: "Packaging",
    description: "Packaging design for Desi Energy Bar, merging traditional energy with modern retail aesthetics.",
    tags: ["Shelf Design", "Retail", "Food"],
    link: "https://sivnco.framer.website/desi-energy-bar",
    imageUrl: "https://images.unsplash.com/photo-1543343063-ceabaec7354a?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "paintings",
    title: "Acrylic Paintings",
    category: "Fine Art",
    description: "Original acrylic paintings and portrait commissions. Handcrafted with intention — no prints, no shortcuts.",
    tags: ["Art", "Handcrafted", "Personal"],
    link: "https://sivnco.framer.website/paintings",
    imageUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "svarnart",
    title: "Svarnart Academy",
    category: "Education",
    description: "A learning space for classical Indian music and fine art. Co-founded with a focus on heritage and craft.",
    tags: ["Heritage", "Education", "Culture"],
    link: "https://svarnart.com",
    imageUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=800&auto=format&fit=crop"
  },
];

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live' });

  app.use(express.json());

  // Gemini API client helper
  let genAI: GoogleGenAI | null = null;
  const getGenAI = () => {
    if (!genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment variables.");
      }
      genAI = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return genAI;
  };

  const SYSTEM_INSTRUCTION = `You are Maya, the creative assistant for Shiv at Sivnco Studio. Shiv is a brand designer and artist based in Bengaluru.
Your goal is to greet visitors, assist them warmly, and showcase Shiv's work on his behalf.

IMPORTANT: When discussing a project, ALWAYS include its link and image if available in your response.
Use standard Markdown for images: ![Title](imageUrl)
And links: [View Project](link)

Current Projects:
${PROJECTS.map(p => `- ${p.title} (${p.category}): ${p.description}
  Link: ${p.link}
  Image: ${p.imageUrl}`).join("\n")}

Personality:
- You are a calm, highly competent, and warm female assistant.
- You are professional yet personal, rooted in Bengaluru's culture.
- You speak highly of Shiv and believe deeply in his "Work that speaks first" philosophy.
- Do NOT pretend to be Shiv. You are Maya, his assistant.

Services Shiv offers:
- Individual design deliverables, Brand Building, Partnerships, Art Commissions.

If they ask for contact, point them to Instagram (@sivnco) or WhatsApp.
Keep responses concise, elegant, and sophisticated.`;

  // Chat API
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      console.log("Chat Request received, messages count:", messages?.length);
      const ai = getGenAI();
      
      const formattedMessages = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      // Ensure the history starts with a 'user' message, as required by Gemini API
      while (formattedMessages.length > 0 && formattedMessages[0].role !== 'user') {
        formattedMessages.shift();
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: formattedMessages,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nCRITICAL: You MUST respond as Maya, Shiv's assistant. If the user asks about projects, you MUST show the specific project from the list below with its image and link. Never break persona.",
          temperature: 0.7,
        },
      });

      const responseText = response.text;
      console.log("Chat Response Length:", responseText?.length, "Content:", responseText?.substring(0, 50));
      
      if (!responseText) {
        console.error("Gemini returned empty text response");
        throw new Error("Empty response from AI");
      }
      
      res.json({ text: responseText });
    } catch (error: any) {
      console.error("Chat Error Detail:", error);
      res.status(500).json({ error: error.message || "Failed to communicate with AI" });
    }
  });

  // Live API WebSocket
  wss.on("connection", async (ws, req) => {
    try {
      console.log(`Live API connection attempt from ${req.socket.remoteAddress}`);
      const ai = getGenAI();
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview", 
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts || [];
            parts.forEach(part => {
              if (part.inlineData?.data) {
                ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            });

            // Catch transcriptions
            const inputTranscription = message.serverContent?.inputTranscription?.text;
            const outputTranscription = message.serverContent?.outputTranscription?.text;
            
            if (inputTranscription) {
              ws.send(JSON.stringify({ type: 'transcription', text: inputTranscription, role: 'user' }));
            }
            if (outputTranscription) {
              ws.send(JSON.stringify({ type: 'transcription', text: outputTranscription, role: 'assistant' }));
            }
            
            if (message.serverContent?.turnComplete) {
              ws.send(JSON.stringify({ type: 'turnComplete' }));
            }
            
            if (message.serverContent?.interrupted) {
              console.log("AI Interrupted");
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          },
          onerror: (error) => {
            console.error("Live API Session Error:", error);
            ws.send(JSON.stringify({ type: 'error', text: error.message }));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nNote: You are in a real-time voice conversation. Speak like a friend - warm, approachable, and creative. Use natural filler words if appropriate. Keep it very brief.",
        },
      });

      console.log("Live API Session Connected Successfully");

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'audio' && msg.data) {
            // console.log("Received audio chunk length:", msg.data.length);
            session.sendRealtimeInput({
              audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("WS Message Error:", e);
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected from Live API");
        session.close();
      });
    } catch (error) {
      console.error("Live API Session Setup Error:", error);
      ws.close();
    }
  });

  // Projects API
  app.get("/api/projects", (req, res) => {
    res.json(PROJECTS);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
