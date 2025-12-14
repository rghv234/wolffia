# Wolffia

A self-hosted, end-to-end encrypted note-taking application with real-time sync.

## Features

- **End-to-End Encryption** — Notes are encrypted client-side using AES-256-GCM with PBKDF2 key derivation (600,000 iterations)
- **Real-Time Sync** — Server-Sent Events (SSE) for instant updates across devices
- **Offline Support** — PWA with IndexedDB caching, works without an internet connection
- **Markdown Support** — Live syntax highlighting with preview toggle
- **Multi-Tab Editor** — Split-screen editing with vertical tab mode
- **Data Portability** — Import/export as Markdown files or encrypted JSON backups
- **Desktop Ready** — Tauri support for native Windows/macOS/Linux apps
- **Low Resource** — Backend runs on 64MB RAM minimum

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte 5, Tailwind CSS v4, daisyUI v5 |
| Backend | OpenResty (Nginx + Lua), Lapis Framework |
| Database | SQLite |
| Encryption | Web Crypto API (PBKDF2/AES-GCM) |
| Desktop | Tauri |
| Container | Podman/Docker |

## Quick Start

### Prerequisites

- [Podman](https://podman.io/) or Docker
- Node.js 18+ (for frontend development)

### Run with Podman

```bash
# Clone and start the backend
cd wolffia
podman-compose up -d

# Install frontend dependencies and run dev server
npm install
npm run dev
```

The app will be available at `http://localhost:5173` and the API at `http://localhost:3000`.

### Build for Desktop

```bash
npm run tauri build
```

## Project Structure

```
wolffia/
├── src/                    # Frontend (Svelte)
│   ├── lib/
│   │   ├── components/     # UI components
│   │   ├── stores/         # State management
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

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LAPIS_ENV` | `development` | Set to `production` for production mode |
| `VITE_API_URL` | `http://localhost:3000` | Backend API URL |

### Security Notes

- The server **never** receives plaintext note content
- Password hashes are derived client-side, then hashed again with bcrypt server-side
- Recovery codes are 8-character random strings, generated client-side
- All notes are stored as encrypted blobs in the database

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/params` | Get user salts for key derivation |
| `POST` | `/auth/register` | Register new account |
| `POST` | `/auth/login` | Login and receive JWT |
| `GET/POST` | `/api/folders` | CRUD operations for folders |
| `GET/POST` | `/api/notes` | CRUD operations for notes |
| `GET` | `/events` | SSE endpoint for real-time sync |

## License

MIT

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.
