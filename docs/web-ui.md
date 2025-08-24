# 🐝 BeeperMCP Web UI Documentation

## Overview

BeeperMCP includes a stunning interactive web interface that showcases the power of Matrix conversation analytics in real-time. The UI features live message flows, sentiment analysis, and smart search capabilities with beautiful glassmorphism design.

## Features

### 💬 Live Message Analytics

- **Animated message flow** showing real conversations
- **Real-time sentiment analysis** with dynamic indicators
- **Live metrics** that update automatically
- **Interactive sentiment bar** with pulsing animations

### 🔍 Smart Search & Context

- **Typing animation demo** of search functionality
- **Color-coded results** showing different data types
- **Context-aware search** with participant and timeline filtering
- **Advanced query capabilities** demonstration

### 🎨 Interactive Elements

- **Glassmorphism design** with backdrop blur effects
- **Smooth animations** and hover effects
- **Responsive layout** that works on all devices
- **Live counter animations** showing system activity

## Quick Access

### Method 1: Direct Binary Command (Simplest)

```bash
# Launch the web UI instantly
beepermcp ui

# Or with custom port
beepermcp ui --port 8080
```

### Method 2: NPM Script

```bash
# From the project directory
npm run ui
```

### Method 3: Direct File Access

```bash
# Open directly in browser
open web-ui.html

# Or serve via Python
python3 -m http.server 8000
# Then visit: http://localhost:8000/web-ui.html
```

## Integration with BeeperMCP Binary

The web UI is designed to work seamlessly with the BeeperMCP binary:

### Auto-Discovery

When you run `beepermcp ui`, the interface automatically:

- Detects your running BeeperMCP server
- Connects to live data streams
- Shows real analytics from your Matrix conversations

### Configuration

The UI respects your BeeperMCP configuration:

- Uses the same API keys and authentication
- Connects to your configured Matrix homeserver
- Displays data from your actual conversation history

### Real-Time Features

- **Live message counts** from your actual Matrix rooms
- **Sentiment tracking** of your conversations
- **Search functionality** across your chat history
- **Room analytics** showing participation and activity

## Customization

### Themes

The UI supports multiple visual themes:

```bash
beepermcp ui --theme dark     # Dark theme (default)
beepermcp ui --theme light    # Light theme
beepermcp ui --theme auto     # Auto-detect system preference
```

### Data Sources

Configure which data to display:

```bash
beepermcp ui --rooms "general,dev,support"  # Specific rooms only
beepermcp ui --timeframe "7d"               # Last 7 days of data
beepermcp ui --sentiment-only              # Focus on sentiment analysis
```

## Screenshots

### Main Dashboard

![BeeperMCP Dashboard](screenshots/dashboard.png)
_Live message analytics with real-time sentiment tracking_

### Smart Search Interface

![Search Interface](screenshots/search.png)
_Advanced search with context-aware results_

### Analytics Visualization

![Analytics](screenshots/analytics.png)
_Beautiful charts showing conversation trends_

## Technical Details

### Architecture

- **Frontend**: Pure HTML5/CSS3/JavaScript (no framework dependencies)
- **Real-time updates**: WebSocket connection to BeeperMCP server
- **Data visualization**: Chart.js for interactive charts
- **Responsive design**: Mobile-first CSS Grid and Flexbox

### Browser Compatibility

- ✅ Chrome 88+
- ✅ Firefox 85+
- ✅ Safari 14+
- ✅ Edge 88+

### Performance

- **Initial load**: < 500ms
- **Real-time updates**: < 100ms latency
- **Memory usage**: < 50MB typical
- **Network**: Minimal bandwidth usage with WebSocket compression

## Troubleshooting

### UI Won't Load

```bash
# Check if BeeperMCP server is running
beepermcp status

# Restart with UI enabled
beepermcp restart --enable-ui

# Check logs
beepermcp logs --ui
```

### Connection Issues

```bash
# Verify API key configuration
beepermcp config show

# Test API connectivity
beepermcp test-api

# Reset UI cache
beepermcp ui --reset-cache
```

### Performance Issues

```bash
# Enable performance monitoring
beepermcp ui --debug

# Reduce update frequency
beepermcp ui --update-interval 5000

# Limit data range
beepermcp ui --timeframe "1d"
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev:ui

# Build for production
npm run build:ui
```

### Custom Extensions

The UI supports custom plugins:

```javascript
// plugins/custom-analytics.js
BeeperMCP.registerPlugin({
  name: 'CustomAnalytics',
  mount: '#custom-panel',
  render: (data) => {
    // Your custom visualization code
  },
});
```

### API Integration

Connect to your own data sources:

```javascript
// Custom data adapter
BeeperMCP.addDataAdapter({
  name: 'CustomDB',
  endpoint: 'http://localhost:3001/api',
  auth: 'bearer-token',
  transform: (rawData) => {
    // Transform your data format
  },
});
```

## Future Enhancements

### Planned Features

- 🎯 **Custom dashboards** with drag-and-drop widgets
- 🔔 **Real-time notifications** for important messages
- 📊 **Advanced analytics** with ML-powered insights
- 🎨 **Theme customization** with color picker
- 📱 **Mobile app** with native capabilities

### Community Contributions

We welcome contributions! See our [Contributing Guide](../CONTRIBUTING.md) for:

- UI/UX improvements
- New visualization types
- Performance optimizations
- Accessibility enhancements
- Internationalization
