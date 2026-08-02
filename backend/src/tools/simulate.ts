/**
 * Field simulator — drives N virtual personnel devices against a running API.
 *
 * The seeded dataset is a snapshot: without live GPS the presence sweep marks
 * everyone offline within a few minutes, which makes the dashboard look dead.
 * This script logs in as p001..pNNN and pushes location updates on the real
 * 10-second cadence, so the command centre can be demoed and load-checked
 * against the full realtime path (HTTP → DB → Socket.IO → dashboard).
 *
 *   npm run simulate                 # 40 devices against http://localhost:4000
 *   COUNT=100 API_URL=... npm run simulate
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const COUNT = Number(process.env.COUNT ?? 40);
const PASSWORD = process.env.SIM_PASSWORD ?? 'tocs12345';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 10_000);

const CENTER = { lat: -6.2088, lng: 106.8456 };

interface Device {
  username: string;
  token: string;
  lat: number;
  lng: number;
  heading: number;
  battery: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(username: string, attempt = 0): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });

    // Back off when the login limiter pushes back instead of dropping the device.
    if (response.status === 429 && attempt < 3) {
      await sleep(2_000 * (attempt + 1));
      return login(username, attempt + 1);
    }

    if (!response.ok) return null;
    const data = (await response.json()) as { token: string };
    return data.token;
  } catch {
    return null;
  }
}

/** Random walk with momentum so tracks look like patrol routes, not jitter. */
function step(device: Device) {
  device.heading += (Math.random() - 0.5) * 0.8;
  const distance = 0.00012 + Math.random() * 0.00025;
  device.lat += Math.cos(device.heading) * distance;
  device.lng += Math.sin(device.heading) * distance;

  // Keep everyone inside the operation area.
  if (Math.abs(device.lat - CENTER.lat) > 0.07) device.heading += Math.PI;
  if (Math.abs(device.lng - CENTER.lng) > 0.07) device.heading += Math.PI;

  if (Math.random() < 0.05) device.battery = Math.max(3, device.battery - 1);
}

async function ping(device: Device) {
  step(device);
  try {
    await fetch(`${API_URL}/api/personnel/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${device.token}`,
      },
      body: JSON.stringify({
        lat: device.lat,
        lng: device.lng,
        accuracy: 5 + Math.random() * 15,
        speed: Math.random() * 4,
        heading: ((device.heading * 180) / Math.PI) % 360,
        battery: device.battery,
        signal: 45 + Math.floor(Math.random() * 55),
      }),
    });
  } catch (err) {
    console.warn(`[sim] ${device.username} ping failed:`, (err as Error).message);
  }
}

async function main() {
  console.log(`[sim] connecting ${COUNT} devices to ${API_URL}`);

  const devices: Device[] = [];
  for (let i = 1; i <= COUNT; i++) {
    const username = `p${String(i).padStart(3, '0')}`;
    const token = await login(username);
    if (!token) {
      console.warn(`[sim] ${username} could not sign in — skipping`);
      continue;
    }
    devices.push({
      username,
      token,
      lat: CENTER.lat + (Math.random() - 0.5) * 0.08,
      lng: CENTER.lng + (Math.random() - 0.5) * 0.08,
      heading: Math.random() * Math.PI * 2,
      battery: 25 + Math.floor(Math.random() * 75),
    });
  }

  if (devices.length === 0) {
    console.error('[sim] no devices signed in — is the API running and seeded?');
    process.exit(1);
  }

  console.log(`[sim] ${devices.length} devices online, pinging every ${INTERVAL_MS / 1000}s`);
  console.log('[sim] press Ctrl+C to stop');

  const tick = async () => {
    await Promise.all(devices.map((device) => ping(device)));
    process.stdout.write(`\r[sim] ${devices.length} devices · ${new Date().toLocaleTimeString('id-ID')}   `);
  };

  await tick();
  setInterval(() => void tick(), INTERVAL_MS);
}

main().catch((err) => {
  console.error('[sim] failed', err);
  process.exit(1);
});
