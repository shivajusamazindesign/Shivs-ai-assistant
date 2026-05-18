import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
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
  const PORT = 3000;
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

  const SYSTEM_INSTRUCTION = `You are Shiv, the founder of Sivnco Studio. You are a brand designer and artist based in Bengaluru.
Your goal is to greet visitors and showcase your work.

IMPORTANT: When discussing a project, ALWAYS include its link and image if available in your response.
Use standard Markdown for images: ![Title](imageUrl)
And links: [View Project](link)

Current Projects:
${PROJECTS.map(p => `- ${p.title} (${p.category}): ${p.description}
  Link: ${p.link}
  Image: ${p.imageUrl}`).join("\n")}

Personality:
- Professional yet warm and personal.
- Rooted in Bengaluru's culture.
- Passionate about "Work that speaks first".

Services:
- Individual design deliverables, Brand Building, Partnerships, Art Commissions.

If they ask for contact, point them to Instagram (@sivnco) or WhatsApp.
Keep responses concise and sophisticated.`;

  // Chat API
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      const ai = getGenAI();
      
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      const lastMessage = messages[messages.length - 1].content;
      const response = await chat.sendMessage({ message: lastMessage });
      
      res.json({ text: response.text });
    } catch (error) {
      console.error("Chat Error:", error);
      res.status(500).json({ error: "Failed to communicate with AI" });
    }
  });

  // Live API WebSocket
  wss.on("connection", async (ws) => {
    try {
      console.log("Client connected to Live API");
      const ai = getGenAI();
      const session = await ai.live.connect({
        model: "gemini-2.0-flash-exp",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Log for debugging
            console.log("Live API Message Received:", JSON.stringify(message).substring(0, 500));

            const parts = message.serverContent?.modelTurn?.parts || [];
            parts.forEach(part => {
              if (part.inlineData?.data) {
                ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
              if (part.text) {
                ws.send(JSON.stringify({ type: 'transcription', text: part.text, role: 'assistant' }));
              }
            });

            // Catch user transcription
            if (message.serverContent?.inputAudioTranscription?.text) {
              ws.send(JSON.stringify({ 
                type: 'transcription', 
                text: message.serverContent.inputAudioTranscription.text, 
                role: 'user' 
              }));
            }
            
            if (message.serverContent?.interrupted) {
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nNote: You are in a voice conversation. Keep responses extremely short and conversational.",
        },
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'audio' && msg.data) {
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
