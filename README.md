# Cause & Defect

### The System Sandbox

Cause & Defect is a small interactive learning lab about how complex systems behave under pressure. The first playable lab explores cloud reliability during a synthetic traffic surge.

**Live demo:** [Cause & Defect — The System Sandbox](https://sparky7823.github.io/cause-and-defect/)

## The cloud reliability lab

The learner prepares a simple request path—traffic, a web application firewall, app servers, and a database—then predicts latency by drawing a line on the chart. A 60-second simulation plays through the surge. The measured latency curve appears beside the forecast, followed by an explanation of the bottleneck.

The settings let learners change:

- The auto-scaling ceiling, from 5 to 50 app servers
- How much bot-like traffic the WAF filters
- The database connection pool size per app server
- The share of bot-like traffic in the synthetic surge
- Whether auto-scaling and the WAF are enabled

Two additional scenario cards—Sprint Pressure and The Viral Algorithm—show the product direction. They are marked as upcoming and are not playable yet.

## Run it locally

There is no build step or package installation. Open `index.html` in a modern browser, or serve this folder with any static web server. For example, from this folder:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project files

- `index.html` — dashboard and cloud lab markup
- `styles.css` — responsive visual design
- `app.js` — interface state, playback, chart, and explanation
- `sim-engine.js` — independent, deterministic traffic and capacity model

## Model assumptions

The browser simulates a baseline of 10 requests per second that ramps to 1,000 requests per second, holds, then returns to baseline over 60 simulated seconds. Each app server can handle 50 requests per second. When auto-scaling is enabled, the app tier requests more servers above 75% utilization; new servers take 8 simulated seconds to become ready. A share of traffic is labeled bot-like, and the WAF filters the selected fraction of that traffic before it reaches the app tier.

The database model estimates concurrent connection demand from app traffic, limits the shared database to 300 safe connections, and adds queueing pressure when the per-server pools exceed that budget. These assumptions are intentionally simplified to make the relationships visible. They are not an AWS performance forecast, security assessment, or production sizing guide. No real services or network traffic are contacted.

## Publishing

The site is a static bundle hosted from the root of the `main` branch with GitHub Pages.
