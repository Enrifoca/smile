# Mirai - AI Project Management Assistant

A lightweight, privacy-focused desktop app that helps project managers monitor Jira projects, generate reports, and manage tasks with AI assistance.

## Features

- **Chat-first Interface** - Simple UI like ChatGPT desktop, everything accessible from chat
- **100% Local** - All data stored locally and encrypted, nothing in the cloud
- **Smart Agent** - Learns your writing style, asks before any Jira changes
- **Multi-Provider AI** - Supports OpenAI, Anthropic (Claude), and Groq
- **Jira Integration** - Full read/write access to your Jira projects
- **Scheduled Tasks** - Set up recurring automated reports and checks
- **Alerts** - Get notified about deadlines, blockers, and status changes

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Jira account with API access
- An API key from OpenAI, Anthropic, or Groq

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev
```

### Building

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac
```

## Configuration

On first launch, the app will guide you through:

1. **Jira Setup** - Enter your Jira URL, email, and API token
2. **AI Provider** - Choose and configure your preferred AI provider
3. **Workspace** - Select a folder for document access and report creation
4. **Communication Style** - Customize how the AI communicates with you

## Usage

### Chat Commands

The AI assistant understands natural language. Here are some examples:

- "Show me all open issues in PROJECT-KEY"
- "What's the sprint progress?"
- "Generate a weekly status report"
- "Create a task: [description]"
- "What blockers do we have?"
- "Summarize the project health"

### Scheduled Tasks

Set up recurring tasks that run automatically:
- Daily standup summaries
- Weekly sprint reports
- Blocker checks
- Deadline reminders

### Important

The AI will **always ask for your approval** before making any changes in Jira. You control what gets modified.

## Security

- All credentials encrypted with AES-256-GCM
- Data stored locally using electron-store
- No telemetry or data sent to external services (except your chosen AI provider)
- File access sandboxed to your selected workspace folder

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **TailwindCSS** - Styling
- **Vercel AI SDK concepts** - AI agent architecture

## License

MIT
