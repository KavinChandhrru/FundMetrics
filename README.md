# FundMetrics — Indian Mutual Fund Analyzer

FundMetrics is a client-side mutual fund analytics dashboard designed for Indian mutual funds. It processes historical Net Asset Value (NAV) records entirely in-browser to compute performance, rolling distributions, risk-adjusted returns, and portfolio simulations.

**Live Demo**: [https://kavinchandhrru.github.io/FundMetrics/](https://kavinchandhrru.github.io/FundMetrics/)

---

## Key Features

*   **NAV History & Rebased Comparison**: View complete historical NAV timelines and rebase multiple schemes to 100 to compare performance on equal footing.
*   **SIP & Lumpsum Simulator**: Simulate dual investments with customizable durations and **daily-compounded expense ratio modeling** to see the real impact of fund fees on your returns.
*   **Rolling CAGR Returns**: Analyze rolling return distributions (1Y, 3Y, 5Y, etc.) with statistics (Average, Minimum, Maximum, Median, % Positive) to assess return consistency.
*   **MPT Risk Metrics**: Calculate Annualized Volatility, Sharpe Ratio, Sortino Ratio, Beta, Alpha, and Information Ratio relative to standard benchmarks.
*   **Ranking Engine**: Ranks the entire mutual fund universe using real-time AMFI data based on XIRR and CAGR.
*   **Custom Portfolio Backtesting**: Allocate weights across multiple schemes and backtest the combined portfolio's aggregate performance and risk factors.

---

## Technical Stack & Data Ingestion

*   **Frontend**: React, Radix UI, Tailwind CSS, Recharts
*   **State & Cache Management**: TanStack Query (React Query)
*   **Data API**: Real-time NAV series fetched directly from the public AMFI feed at `https://api.mfapi.in`
*   **Financial Math Engine**: Fully client-side JavaScript solvers for CAGR, XIRR (using bisection root-finding), and covariance/linear regressions.

---

## Local Development & Build

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Start development server**:
   ```bash
   npm run dev
   ```
3. **Build production bundle**:
   ```bash
   npm run build
   ```

---

## Deployment to GitHub Pages

Since the app runs entirely in the browser with no backend, it is hosted on GitHub Pages:
1. Ensure your repository is public on GitHub.
2. Go to your repository's **Settings** -> **Pages**.
3. Under **Build and deployment**, set the Source to **GitHub Actions**.
4. Configure a static web build or deployment workflow to deploy the built assets to GitHub Pages.

