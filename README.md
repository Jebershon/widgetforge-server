# WidgetForge Server — Build Orchestration Engine

This is the backend for **WidgetForge**, a system that programmatically scaffolds, builds, and packages Mendix pluggable widgets.

## ✨ Key Features

- **Automated Scaffolding**: Programmatic creation of Mendix widget project structures without manual CLI interaction.
- **AI Build Orchestration**: Integrates with Google Gemini, OpenAI, and Anthropic to convert descriptions into functional XML/TSX/CSS code.
- **Live Build Logs**: Streams terminal output (ANSI-colored) back to the frontend for real-time debugging.
- **MPK Packaging**: Uses `adm-zip` to ensure all assets (including CSS) are correctly injected and manifest-bound in the final `.mpk` archive.
- **Automatic Sanitization**: Corrects common AI code hallucinations (invalid Mendix XML tags, redundant React imports).

## 🛠️ Local Setup

1. **Install Dependencies**:
```bash
npm install
```

2. **Configure Environment Variables**:
Create a `.env` file in the `server` directory:
```env
PORT=8000
AI_PROVIDER=gemini  # gemini, openai, or anthropic
GEMINI_API_KEY=your_key_here
```

3. **Build and Run**:
```bash
npm run build
npm start
```

## 🚀 Deployment Considerations

To use the build orchestration, the server requires:
- **Write access to the filesystem** (for `temp/` build directories).
- **Node.js environment** with the ability to run `npm` and `tsc` as child processes.
- **Vercel Note**: Standard Vercel Serverless Functions are **not** recommended due to the 10-minute build times and read-only filesystem requirements. Consider **Railway**, **Render**, or a traditional **VPS**.

## 📖 API Reference

Detailed endpoint documentation can be found in the root [API_REFERENCE.md](../API_REFERENCE.md).

---
Part of the **WidgetForge** 3-Phase Strategic Plan:
- Phase 1: Web Widgets (Current)
- Phase 2: Native Widgets
- Phase 3: Internal LLM API Integration
