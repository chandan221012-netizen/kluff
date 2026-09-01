# 🔗 Useful Links & Development Notes

This file contains all the active portal URLs, test routes, local LAN testing configurations, terminal layouts, and the development roadmap/checklist from the project's original notes.

---

## 🌐 Active Portal & Application Links

| Portal / Route | URL | Notes |
|---|---|---|
| **MongoDB Service** | `net start MongoDB` | Run in Windows CMD/PowerShell to start local MongoDB |
| **Customer QR Landing / Upload** | `http://localhost:5173/print/:token` | Dynamic customer scan link (where `:token` is shop `qrToken`) |
| **Default Test Shop QR Landing** | `http://localhost:5173/print/test-shop-token-123` | Pre-configured test shop landing page |
| **Customer Test Route** | `http://localhost:5173/test` | Quick test route for default test shop |
| **Mobile / LAN Testing Link** | `http://10.192.119.121:5173/print/test-shop-token-123` | Replace IP with your PC's Wi-Fi LAN IP to test on mobile |
| **Shop Owner Login** | `http://localhost:5173/login` | Default test credentials: `test@shop.com` / `123456` |
| **Shop Owner Registration** | `http://localhost:5173/register` | Register a new shopkeeper account |
| **Shop Owner Dashboard** | `http://localhost:5173/dashboard` | Main owner management portal (live queue, revenue, pricing) |
| **Local Print Agent Dashboard** | `http://localhost:5050` | Embedded operator UI inside the Windows print agent |
| **Public HTTPS Tunnel (LocalTunnel)** | `lt --port 5000` | Generates public URL (e.g. `https://funny-cats-swim.loca.lt`) to test online payments |

---

## 🖥️ Terminal Layout & Running Services

### One-Click Start (All 3 Services)
```bash
npm run dev
```
*(Or double-click `start-autoprint.bat` in the project root)*

---

### Running in Separate Terminals

#### Terminal 1 (Backend Server):
* **Directory:** `kluff/server`
* **Command:**
  ```bash
  npm run dev
  ```
* **Status:** Running on port `5000` with MongoDB connected.

#### Terminal 2 (Tunnel to Internet — Optional for Remote Mobile Testing):
* **Directory:** Project root (`kluff`)
* **Command:**
  ```bash
  lt --port 5000
  ```
* **Status:** Generates your public HTTPS URL.

#### Terminal 3 (Frontend React App):
* **Directory:** `kluff/client`
* **Command:**
  ```bash
  npm run dev
  ```
* **Status:** Running Vite on `http://localhost:5173`.

#### Terminal 4 (Desktop Print Agent):
* **Directory:** `kluff/print-agent`
* **Command:**
  ```bash
  npm start
  ```
* **Status:** Connects to backend WebSocket and serves operator UI on `http://localhost:5050`.

---

## 📋 Roadmap & Task Checklist (From Original Notes)

### 1. //under qr done
* [x] Customer QR Landing & Session Generation
* [x] Multi-step print order wizard (Upload, Edit, Preview, Pay)
* [x] Direct native UPI Intent trigger (`upi://pay`) & cash counter option
* [x] IndexedDB client file persistence

### 2. Print Agent Work
* [x] **a. UI Work:** Dedicated embedded web operator dashboard on `http://localhost:5050`.
* [x] **b. Number of Printers Connected:** Owner has the option to select which printer is responsible for which sort of print (B&W, Color, Photo, Large Format).
* [x] **c. Default Fallback:** Connects default to the available printer or the printers present in computer's default.
* [x] **d. Enterprise Service:** Windows Task Scheduler startup (`install-service.bat`) + background watchdog (`watchdog.vbs`).

### 3. Main Website Work
* [x] **a. UI and UX:** Responsive customer layout, touch sliders, PDF preview canvas, and live status bar.

### 4. Work Left in Shopkeeper Dashboard
* [x] **g. Show the exe file / software to download:** Download button and API for `KluffPrintAgent.exe`.
* [x] **f. Show connectivity status:** Real-time socket connectivity indicator with print agent.
* [ ] **a. Payment integration:** Direct payment gateway integration with webhook confirmation.
* [ ] **b. Connect through founder dashboard:** Connect shopkeeper nodes through super-admin/founder portal.
* [ ] **c. Owner pricing list & plan:** Owner can view subscription pricing list and select the plan.
* [ ] **d. Unique code login:** Rather than logging in through Gmail, allow login through a unique shop code.
* [ ] **e. Founder remote management:** Owner dashboard can be controlled/monitored by founder dashboard.
* [ ] **f. Session termination:** Option for shopkeeper to terminate active customer sessions remotely.
* [ ] **g. Phone number option:** Remove Gmail option and add phone number authentication.
* [ ] **h. Duplicate phone prevention:** Authenticate and validate so that the same phone number cannot be registered twice.
