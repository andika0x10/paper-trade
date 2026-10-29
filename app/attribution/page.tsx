export const metadata = { title: "Attribution" };
export default function Page() {
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Third-party attribution</h1>
          <p>Open-source software used by Paper.</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>TradingView Lightweight Charts™</h2>
        <p>Copyright © 2025 TradingView, Inc.</p>
        <p>
          Licensed under the Apache License, Version 2.0. You may obtain a copy
          at{" "}
          <a
            href="https://www.apache.org/licenses/LICENSE-2.0"
            style={{ textDecoration: "underline" }}
          >
            apache.org/licenses/LICENSE-2.0
          </a>
          . Unless required by applicable law or agreed to in writing, software
          distributed under the License is distributed on an “AS IS” BASIS,
          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
        </p>
        <p>
          Charts are provided by{" "}
          <a
            href="https://www.tradingview.com/"
            style={{ textDecoration: "underline" }}
          >
            TradingView
          </a>
          . Market data is supplied independently by Hyperliquid.
        </p>
      </section>
    </div>
  );
}
