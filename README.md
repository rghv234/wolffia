<div id="wolffia-logo" align="center">
    <br />
    <img src="./static/favicon.svg" alt="Wolffia Logo" width="120"/>
    <h1>Wolffia</h1>
    <h3>End-to-End Encrypted Note-Taking Workspace</h3>
    <p><i>Your thoughts, your keys, your control.</i></p>
</div>

<div id="badges" align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)](https://tauri.app)

</div>

---

**Wolffia** is a self-hosted, privacy-first note-taking app. All notes are encrypted client-side before leaving your device — the server never sees your plaintext content. Sync across devices in real-time while maintaining full control of your data.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
  - [Web (Self-Hosted)](#web-self-hosted)
  - [Desktop App](#desktop-app)
  - [PWA Installation](#pwa-installation)
- [Tech Stack](#tech-stack)
- [Security](#security)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## <a id="features"></a>Features

| Feature | Description |
|---------|-------------|
| 🔐 **End-to-End Encryption** | AES-256-GCM encryption with PBKDF2 key derivation (600k iterations) |
| 🔄 **Real-Time Sync** | Server-Sent Events (SSE) for instant updates across all devices |
| 📴 **Offline Support** | PWA with IndexedDB caching — works without internet |
| ✏️ **Markdown Editor** | Live syntax highlighting with split-screen preview |
| 📑 **Multi-Tab Interface** | Open multiple notes, vertical tabs, split-screen editing |
| 📁 **Folder Organization** | Nested folders with drag-and-drop |
| 🎨 **Themeable** | Light/Dark/OLED modes with custom accent colors |
| 💾 **Data Portability** | Export as Markdown or encrypted JSON backups |
| 🖥️ **Cross-Platform** | Web, PWA, Windows, macOS, Linux via Tauri |
| ⚡ **Lightweight** | Backend runs on just 64MB RAM |

## <a id="quick-start"></a>Quick Start

### <a id="web-self-hosted"></a>Web (Self-Hosted)

**Prerequisites:** [Podman](https://podman.io/) or Docker, Node.js 18+

```bash
# Clone the repository
git clone https://github.com/yourusername/wolffia.git
cd wolffia

# Start the backend
podman-compose up -d

# Install and run frontend
npm install
npm run dev
```

Open `http://localhost:5173` — API runs at `http://localhost:3000`

### <a id="desktop-app"></a>Desktop App

```bash
# Build for your platform
npm run tauri build
```

### <a id="pwa-installation"></a>PWA Installation

Visit the deployed web app and click "Install" in your browser's address bar.

## <a id="tech-stack"></a>Tech Stack

<table>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>Svelte 5, Tailwind CSS v4, daisyUI v5, TypeScript</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>OpenResty (Nginx + Lua), Lapis Framework</td>
  </tr>
  <tr>
    <td><strong>Database</strong></td>
    <td>SQLite</td>
  </tr>
  <tr>
    <td><strong>Encryption</strong></td>
    <td>Web Crypto API (PBKDF2 / AES-GCM)</td>
  </tr>
  <tr>
    <td><strong>Desktop</strong></td>
    <td>Tauri 2</td>
  </tr>
  <tr>
    <td><strong>Container</strong></td>
    <td>Podman / Docker</td>
  </tr>
</table>

## <a id="security"></a>Security

Wolffia is designed with a **zero-knowledge architecture**:

- ✅ Notes are encrypted **before** leaving your device
- ✅ The server stores only encrypted blobs — it cannot read your content
- ✅ Password is hashed client-side (PBKDF2), then bcrypt'd server-side
- ✅ Recovery codes are generated client-side
- ✅ No telemetry, no tracking

> **Your encryption key never touches the server.**

## <a id="project-structure"></a>Project Structure

```
wolffia/
├── src/                    # Frontend (Svelte)
│   ├── lib/
│   │   ├── components/     # UI components
│   │   ├── stores/         # State management (Svelte 5 runes)
│   │   ├── api.ts          # API client
│   │   ├── crypto.ts       # E2EE implementation
│   │   └── sync.ts         # Real-time sync
│   └── routes/             # SvelteKit routes
├── backend/                # Backend (Lapis/Lua)
│   ├── app.lua             # Main application
│   ├── models/             # Database models
│   └── migrations/         # Schema migrations
├── src-tauri/              # Desktop app (Tauri)
├── Dockerfile              # Container image
└── docker-compose.yml      # Compose configuration
```

## <a id="configuration"></a>Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LAPIS_ENV` | `development` | Set to `production` for production mode |
| `VITE_API_URL` | `http://localhost:3000` | Backend API URL |

## <a id="api-reference"></a>API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/params` | Get user salts for key derivation |
| `POST` | `/auth/register` | Register new account |
| `POST` | `/auth/login` | Login and receive JWT |
| `GET/POST/PUT/DELETE` | `/api/folders` | CRUD for folders |
| `GET/POST/PUT/DELETE` | `/api/notes` | CRUD for notes |
| `GET` | `/events` | SSE endpoint for real-time sync |

## <a id="contributing"></a>Contributing

Contributions are welcome! Please open an issue first to discuss proposed changes.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## <a id="license"></a>License

[MIT](LICENSE)

---

<div align="center">
    <sub>Built with ❤️ for privacy enthusiasts</sub>
</div>
