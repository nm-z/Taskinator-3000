# CLAUDE.md - AI Assistant Guide for Taskinator-3000

## Project Overview

Taskinator-3000 is an AI-powered GUI automation system that combines a visual desktop interface (Electron + React) with an intelligent agent (Qwen2.5-VL model) capable of executing computer control tasks through natural language commands.

## Repository Structure

```
Taskinator-3000/
├── electron-app/              # Main desktop application
│   ├── src/
│   │   ├── main.tsx          # React entry point
│   │   ├── App.tsx           # Main UI (Chat + Desktop components)
│   │   └── index.css         # TailwindCSS styles
│   ├── public/js/            # noVNC bundled libraries
│   ├── main.cjs              # Electron main process
│   ├── preload.cjs           # Electron IPC bridge (secure context)
│   ├── webpack.config.mjs    # Webpack bundler config
│   ├── postcss.config.cjs    # PostCSS/Tailwind config
│   └── package.json          # Dependencies & scripts
├── shared/
│   └── qwen_agent.py         # ML model inference service
├── noVNC-1.4.0/              # VNC client library (bundled)
├── docker-cua-starter/       # Desktop container (external build)
├── orchestrator.py           # FastAPI middleware service
├── agent.Dockerfile          # Docker image for Qwen model
├── Dockerfile                # Docker image for orchestrator
├── docker-compose.yml        # Service orchestration (3 containers)
├── rollup.config.mjs         # noVNC RFB library bundler
├── requirements_orchestrator.txt
└── .env                      # Environment variables
```

## Technology Stack

### Frontend (electron-app/)
- **Electron 36.3.1** - Desktop application framework
- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Webpack 5** - Module bundler with Babel transpilation
- **TailwindCSS 4.1.7** - Utility-first CSS
- **noVNC** - VNC client protocol for desktop visualization

### Backend
- **Python 3.11** - Backend language
- **FastAPI** - Web framework for orchestrator
- **uvicorn** - ASGI server
- **httpx** - Async HTTP client

### AI/ML
- **Qwen2.5-VL-7B-Instruct** - Vision-language model for GUI understanding
- **PyTorch with ROCm** - GPU acceleration (AMD)
- **HuggingFace Transformers** - Model framework

## Architecture & Data Flow

```
User Input → Electron App → Orchestrator (FastAPI) → Qwen Agent → Desktop Service
                                  ↓                        ↓
                           Tool Execution ←──── JSON Response
                                  ↓
                           Screenshot/Result → UI Display
```

### Three-Service Architecture
1. **Desktop** (`cua-desktop:14500`) - VNC desktop environment with XPRA
2. **Agent** (`qwen-agent:8000`) - ML model inference service
3. **Orchestrator** (`taskinator-orchestrator:5000`) - FastAPI middleware

## Development Commands

All commands run from `electron-app/` directory:

```bash
# Install dependencies
npm install

# Build React frontend (outputs to dist-renderer/)
npm run build:react

# Watch mode for development
npm run start:react

# Build and launch Electron app
npm start
```

### Docker Commands (from project root)

```bash
# Build and start all services
docker-compose up --build

# Start specific service
docker-compose up desktop    # VNC desktop only
docker-compose up agent      # ML agent only
docker-compose up orchestrator
```

## Key Files for Common Tasks

### UI Changes
- `electron-app/src/App.tsx` - Main UI with Chat and Desktop components
- `electron-app/src/index.css` - Global styles (TailwindCSS)

### Electron Configuration
- `electron-app/main.cjs` - Main process, window creation, IPC config
- `electron-app/preload.cjs` - Secure IPC bridge between processes

### Backend API
- `orchestrator.py` - FastAPI routes, agent/desktop communication
- `shared/qwen_agent.py` - ML model loading and inference

### Build Configuration
- `electron-app/webpack.config.mjs` - Webpack bundler settings
- `electron-app/package.json` - Dependencies and npm scripts
- `docker-compose.yml` - Container orchestration

## API Endpoints

### Orchestrator (port 5000)

**GET /**
- Health check
- Returns: `{"status": "Taskinator-3000 Orchestrator is running."}`

**POST /chat**
- Main chat endpoint
- Request: `{"messages": [{"role": "user", "content": "..."}]}`
- Response: `{"tool_result": ...}` or `{"assistant": "..."}`

## Computer Control Tools

The AI agent can execute these tools via JSON-RPC to the desktop service:

| Tool | Parameters | Description |
|------|------------|-------------|
| `click` | `x`, `y` | Mouse click at coordinates |
| `double_click` | `x`, `y` | Double click |
| `move` | `x`, `y` | Move cursor |
| `drag` | `path` (array of {x,y}) | Drag operation |
| `scroll` | `direction`, `amount` | Mouse scroll |
| `type` | `text` | Type text |
| `keypress` | `key` | Press keyboard key |
| `wait` | `seconds` | Pause execution |
| `screenshot` | - | Capture desktop |

## Environment Variables

```bash
# .env file
XPRA_PASSWORD=pass          # VNC authentication password

# Docker environment
AGENT_URL=http://qwen-agent:8000/v1/chat/completions
DESKTOP_URL=http://cua-desktop:14500/jsonrpc
HF_HOME=/workspace/.hf      # HuggingFace model cache
CUDA_VISIBLE_DEVICES=0      # GPU device
```

## Code Conventions

### TypeScript/React
- Use functional components with hooks
- TailwindCSS for styling (dark theme with slate palette)
- Context isolation enabled for Electron security
- Use `window.electronAPI` for IPC calls from renderer

### Python
- Type hints encouraged but not enforced
- Async/await for HTTP operations
- JSON logging format for structured logs
- FastAPI dependency injection patterns

### File Naming
- `.cjs` for CommonJS modules (Electron main/preload)
- `.mjs` for ES modules (config files)
- `.tsx` for React components with TypeScript

## Testing

Currently no test infrastructure. Consider adding:
- Jest for React components
- pytest for Python services
- Playwright for E2E testing

## Ports Reference

| Service | Port | Protocol |
|---------|------|----------|
| Desktop VNC | 14500 | HTTP/WebSocket |
| Agent | 8000 | HTTP |
| Orchestrator | 5000 | HTTP |

## Git Workflow

- Main branch: `master`
- Feature branches: `claude/*` or descriptive names
- Commit messages: conventional commits preferred

## Common Issues & Solutions

### VNC Connection Failed
- Ensure desktop container is running: `docker-compose up desktop`
- Check XPRA_PASSWORD matches in `.env` and `main.cjs`

### Agent Timeout
- Model download may take time on first run (~14GB)
- Check GPU/ROCm availability: `rocm-smi`
- Verify HF_HOME volume is mounted

### Webpack Build Errors
- Clear `dist-renderer/` and rebuild
- Ensure node_modules installed: `npm install`

## Security Notes

- Electron context isolation is enabled
- nodeIntegration is disabled
- VNC requires password authentication
- All inter-service communication is within Docker network
