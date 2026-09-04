# DigniSafe: Review 1 Demonstration & Evaluation Checklist

This checklist provides a reproducible, step-by-step procedure to evaluate the **Phase 1 (Review 1, ~35% milestone)** working prototype of DigniSafe.

---

### Prerequisites
- Python 3.10+ (with virtual environment in `backend/venv`)
- Node.js 18+ and npm (in `frontend/`)
- Web browser (Google Chrome, Firefox, or Edge)

---

### Step-by-Step Demonstration Script (26 Steps)

#### 1. Start Backend API Server
Open Terminal 1:
```powershell
cd backend
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```
*Expected Output:* Server starts on `http://127.0.0.1:8000`. Swagger API docs available at `http://127.0.0.1:8000/docs`.

#### 2. Start Frontend Application
Open Terminal 2:
```powershell
cd frontend
npm run dev
```
*Expected Output:* Vite dev server running on `http://localhost:5173`.

#### 3. Open Dashboard
Open browser to `http://localhost:5173`.
*Verify:* The Staff Dashboard loads showing live facility metrics: Total Residents (3), Open Alerts, Verified Incidents, and Intrusiveness score.

#### 4. Show Residents
Navigate to the **Residents** tab (or inspect the Resident States panel on Dashboard).
*Verify:* Profiles for `R001` (Resident A, High Independence), `R002` (Resident B, Moderate), and `R003` (Resident C, Assisted Living) are displayed with current risk score $0/100$ and status `NORMAL`.

#### 5. Show Privacy Settings
Click on **Resident Profiles & Consent** tab, select **R001**, and view the consent toggles.
*Verify:* Independent switches for **Movement Tracking**, **Door Sensor**, and **Emergency Call Button** are present and editable.

#### 6. Show Camera / Audio / Location are Permanently OFF
Inspect the **Intrusive Sensory Channels (Dignity Guard)** panel under Resident Profiles.
*Verify:* **Continuous Video Camera**, **Audio Microphone**, and **Precise Location (GPS)** are displayed as permanently disabled (`OFF`), with a dignity preservation notice explaining optical/acoustic surveillance is blocked by design.

#### 7. Simulate Normal Events (Journey A)
Click on the **Simulator** tab.
Click the **Journey A: Low Urgency** button (or click *Movement Detected* and *Door Open/Close* for R001).
*Verify:* Console logs: `Posting movement_detected for Resident A... Event processed successfully by backend`.

#### 8. Demonstrate No Unnecessary Alert
After running Journey A, check Resident A's risk score and the Alerts tab.
*Verify:* Risk score remains `0/100`, status is `NORMAL`, and **no alert is generated** because 20 minutes of inactivity is well below the 60-minute threshold for a resident with High independence.

#### 9. Simulate Emergency Call (Journey B)
In the **Simulator** tab:
Select **R003 (Resident C, Assisted Living)**.
Click **🚨 Emergency Call** (or click the **Journey B: High Urgency** preset).
*Verify:* Live simulation console logs the emergency call telemetry.

#### 10. Simulate No Movement
Click **⏳ No Movement** for R003.
*Verify:* The event is processed by the risk engine.

#### 11. Show Risk Score Escalation
Return to **Dashboard** or **Residents** tab and inspect R003.
*Verify:* R003's current risk score has escalated to $\ge 70/100$, and status has updated to `REVIEW REQUIRED` or `HIGH PRIORITY`.

#### 12. Show Generated Alert
Click the **Alerts** tab.
*Verify:* Alert card appears in the feed with `OPEN` status, risk score $\ge 70$, and transparent explanation items (e.g. `Emergency call active: 70`).

#### 13. Perform Human Review
Select the open alert card in the **Alerts** tab.
*Verify:* The triage panel displays 5 caregiver review action buttons: `Call Resident`, `Check Room`, `Verify Incident`, `False Alarm`, and `Dismiss`.

#### 14. Verify Incident
Click **Verify Incident** with clinical notes (e.g., *"Intercom check confirmed resident fell near bedside"*).
*Verify:* Alert status updates to `VERIFIED_INCIDENT`, an official record is added to the `incidents` table, and Dashboard reflects $1$ Verified Incident ($100\%$ precision).

#### 15. Demonstrate Noisy Sensor Filtering (Debouncing)
In the **Simulator** tab:
Rapidly click *Movement Detected* followed immediately by *No Movement* (<10 seconds apart), or click **🔌 Noisy Sensor (Toggling)**.
*Verify:* The sensor status transitions to `NOISY`. The rapid flap is debounced and suppressed; no bogus fall alert is created.

#### 16. Demonstrate Missing Sensor Handling
In the **Simulator** tab:
Click **🔋 Sensor Missing** for R002.
*Verify:* Sensor status displays `MISSING`. The system raises a minor hardware status notice (+10 pts) rather than erroneously declaring resident immobility (+60 pts).

#### 17. Demonstrate Network Offline Mode
In the top navigation header, click the **Network Online** button to switch to **Offline (Store-and-Forward)**.
*Verify:* Header banner shows `Network: Offline (Store-and-Forward Active)`.

#### 18. Demonstrate Queued Event
In the **Simulator** tab, post any event while offline (e.g. *Door Open*).
*Verify:* Console logs: `Store-and-forward queued event locally (Offline Mode)`. The event is held in client storage and not lost.

#### 19. Restore Network Link
In the header, click the **Network Offline** toggle button to switch back to **Online**.
*Verify:* Toast notification appears: `Network restored. Queued events synchronized!`.

#### 20. Show Synchronization
Check the **Live Simulation Console** or the resident's event log.
*Verify:* Queued event was automatically replayed to the backend with `network_delayed=True` and successfully integrated.

#### 21. Run Comparative Experiment
Click the **Experiment Evaluation** tab.
*Verify:* The system queries `GET /api/experiment`, executing the deterministic 500-event benchmark comparing naive baseline telecare against DigniSafe.

#### 22. Show Baseline vs DigniSafe Comparison
Inspect the comparative Bar Charts on the Experiment page.
*Verify:* DigniSafe achieves higher precision and dramatic reduction in false alarm count compared to the naive baseline.

#### 23. Show Full Confusion Matrix
Inspect the **Complete Experiment Grid** table.
*Verify:* Raw confusion matrix counts are displayed:
- True Positives (TP): Baseline $29$, DigniSafe $28$
- True Negatives (TN): Baseline $383$, DigniSafe $416$
- False Positives (FP): Baseline $86$, DigniSafe $53$ (33 fewer false alarms!)
- False Negatives (FN): Baseline $2$, DigniSafe $3$
- Precision: Baseline $25.2\%$, DigniSafe $34.6\%$
- Recall: Baseline $93.5\%$, DigniSafe $90.3\%$
- False-Positive Rate: Baseline $18.3\%$, DigniSafe $11.3\%$
- Missed Incident Rate: Baseline $6.5\%$, DigniSafe $9.7\%$

#### 24. Show Intrusiveness Metric
Inspect the Intrusiveness Index row in the Experiment Grid:
*Verify:* Intrusiveness is dynamically computed from active monitoring channels out of 6 possible:
- Baseline: $50.0\%$ (all 3 channels forced continuously without consent)
- DigniSafe: $49.3\%$ (reflects dynamic consent revocations in the dataset)

#### 25. Show Error Analysis Matrix
Click the **Error Analysis** tab.
*Verify:* Empirical breakdown of failure modes (False Positives, False Negatives, Sensor Noise, Missing Data, Consent Blocks, Network Delays) with counts, percentages, and technical mitigations.

#### 26. Show Limitations & Honest Scope Statement
Inspect the bottom of the Error Analysis or Review 1 Report.
*Verify:* Explicit declaration: *"This is a synthetic, software-only prototype intended to demonstrate the safety-monitoring workflow. Real clinical validation and physical IoT gateway integration are scheduled for Reviews 2 & 3."*
