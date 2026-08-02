import bcrypt from 'bcryptjs';
import { pool } from './pool';
import { ensureRoles } from './roles';

/**
 * Demo dataset — fabricated content for demos, UI work and load checks.
 *
 * NEVER run this against a production database: it TRUNCATEs every table and
 * replaces the contents with invented personnel, reports, missions and
 * incidents, all sharing one well-known password.
 *
 * A clean deployment uses `npm run db:seed` (roles + one commander) instead.
 */

// Deterministic PRNG so re-seeding produces a stable, reviewable dataset.
let seedState = 20260728;
function rnd(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

const CENTER = { lat: -6.2088, lng: 106.8456 }; // Jakarta Pusat

/** Password seragam untuk semua akun demo. Timpa dengan DEMO_PASSWORD. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? '123456';

function nearby(spread = 0.06) {
  return {
    lat: CENTER.lat + (rnd() - 0.5) * spread * 2,
    lng: CENTER.lng + (rnd() - 0.5) * spread * 2,
  };
}

const FIRST = [
  'Adi', 'Bayu', 'Candra', 'Dimas', 'Eka', 'Fajar', 'Galih', 'Hendra', 'Irfan',
  'Joko', 'Krisna', 'Lukman', 'Maulana', 'Nanda', 'Oki', 'Putra', 'Rizky',
  'Satria', 'Taufik', 'Umar', 'Vino', 'Wahyu', 'Yoga', 'Zaki', 'Arif', 'Bagas',
  'Cahyo', 'Denny', 'Erlangga', 'Farhan',
];
const LAST = [
  'Pratama', 'Wijaya', 'Nugroho', 'Santoso', 'Kusuma', 'Hidayat', 'Ramadhan',
  'Saputra', 'Setiawan', 'Purnomo', 'Gunawan', 'Halim', 'Utomo', 'Firmansyah',
  'Maulida', 'Anggara',
];

const UNITS = [
  { code: 'ALPHA', name: 'Unit Alpha', color: '#2563EB' },
  { code: 'BRAVO', name: 'Unit Bravo', color: '#0EA5E9' },
  { code: 'CHARLIE', name: 'Unit Charlie', color: '#10B981' },
  { code: 'DELTA', name: 'Unit Delta', color: '#F59E0B' },
  { code: 'ECHO', name: 'Unit Echo', color: '#8B5CF6' },
  { code: 'FOXTROT', name: 'Unit Foxtrot', color: '#EC4899' },
];

const LOCATION_NAMES = [
  'Jl. MH Thamrin', 'Bundaran HI', 'Stasiun Gambir', 'Monas Sisi Barat',
  'Jl. Sudirman KM 3', 'Pasar Baru', 'Terminal Senen', 'Kawasan Kota Tua',
  'Jl. Gatot Subroto', 'Halte Dukuh Atas', 'Jl. Rasuna Said', 'Tanah Abang Blok A',
];

const REPORT_TEXT = [
  'Situasi terpantau kondusif, arus lalu lintas lancar.',
  'Terjadi penumpukan massa di titik kumpul, perlu penambahan personel.',
  'Ditemukan kendaraan parkir liar menghalangi jalur evakuasi.',
  'Permintaan bantuan medis untuk satu orang yang pingsan.',
  'Genangan air setinggi 20cm di jalur utama, arus diperlambat.',
  'Pengamanan titik A selesai, melanjutkan patroli ke titik B.',
  'Ditemukan barang tidak bertuan, sudah diamankan.',
  'Koordinasi dengan petugas kesehatan sudah dilakukan.',
];

const MISSION_TITLES = [
  'Patroli Sektor Utara', 'Pengamanan Titik Kumpul', 'Pengaturan Lalu Lintas',
  'Penyisiran Jalur Evakuasi', 'Pengawalan Rombongan', 'Pengamanan Panggung Utama',
  'Pemeriksaan Pos Terpadu', 'Pendataan Kerumunan', 'Standby Unit Cadangan',
  'Sterilisasi Area VIP',
];

const INCIDENT_TITLES = [
  'Kericuhan Antar Kelompok', 'Kecelakaan Lalu Lintas Ringan',
  'Kebakaran Kecil di Kios', 'Orang Hilang Dilaporkan',
  'Pohon Tumbang Menutup Jalan', 'Gangguan Ketertiban Umum',
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('[seed:demo] refusing to run with NODE_ENV=production.');
    console.error('[seed:demo] this wipes every table. Set ALLOW_DEMO_SEED=true to override.');
    process.exit(1);
  }

  console.log('[seed:demo] starting — this REPLACES all existing data');

  await pool.query(`
    TRUNCATE system_logs, activity_logs, messages, notifications, streams,
             incidents, mission_assignments, missions, report_media, reports,
             personnel_locations, operations, users, units, roles
    RESTART IDENTITY CASCADE
  `);

  // -- Roles -----------------------------------------------------------------
  const roleId = await ensureRoles(pool);

  // -- Units -----------------------------------------------------------------
  const units = await pool.query<{ id: number }>(
    `INSERT INTO units (code, name, color)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[])
     RETURNING id`,
    [UNITS.map((u) => u.code), UNITS.map((u) => u.name), UNITS.map((u) => u.color)]
  );
  const unitIds = units.rows.map((u) => u.id);

  // -- Operation -------------------------------------------------------------
  const operation = await pool.query<{ id: number }>(
    `INSERT INTO operations (name, code, description, status, center_lat, center_lng)
     VALUES ('Operasi Aman Nusantara', 'OPS-2026-01',
             'Pengamanan terpadu kawasan pusat kota', 'active', $1, $2)
     RETURNING id`,
    [CENTER.lat, CENTER.lng]
  );
  const operationId = operation.rows[0].id;

  // -- Command users ---------------------------------------------------------
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const supers = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, full_name, phone, badge_number, role_id, status, last_seen_at)
     VALUES ('admin',  $1, 'Kolonel Bagus Prawira', '+62811000001', 'SU-001', $2, 'online', NOW()),
            ('admin2', $1, 'Letnan Sari Anggraini', '+62811000002', 'SU-002', $2, 'online', NOW())
     RETURNING id`,
    [hash, roleId.superuser]
  );
  const commanderId = supers.rows[0].id;
  const operatorId = supers.rows[1].id;

  // -- Personnel (100) -------------------------------------------------------
  const personnelIds: number[] = [];
  for (let i = 1; i <= 100; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const username = `p${String(i).padStart(3, '0')}`;
    const unitId = unitIds[i % unitIds.length];
    const pos = nearby();

    // ~85 online, ~9 idle, ~6 offline → matches the "97/100 active" dashboard feel.
    const roll = rnd();
    const status = roll < 0.85 ? 'online' : roll < 0.94 ? 'idle' : 'offline';
    const secondsAgo = status === 'online' ? int(1, 25) : status === 'idle' ? int(70, 160) : int(400, 5000);

    const row = await pool.query<{ id: number }>(
      `INSERT INTO users
         (username, password_hash, full_name, phone, badge_number, role_id, unit_id,
          status, battery, signal, last_lat, last_lng, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() - ($13 || ' seconds')::interval)
       RETURNING id`,
      [
        username, hash, name,
        `+6281${String(int(10000000, 99999999))}`,
        `P-${String(i).padStart(3, '0')}`,
        roleId.personnel, unitId,
        status,
        status === 'offline' ? int(0, 15) : int(12, 100),
        status === 'offline' ? 0 : int(35, 100),
        pos.lat, pos.lng,
        secondsAgo,
      ]
    );
    personnelIds.push(row.rows[0].id);
  }
  console.log(`[seed:demo] ${personnelIds.length} personnel created`);

  // -- Location history (last 6 pings each) ----------------------------------
  for (const uid of personnelIds) {
    const base = nearby();
    for (let k = 5; k >= 0; k--) {
      await pool.query(
        `INSERT INTO personnel_locations (user_id, lat, lng, accuracy, speed, battery, signal, recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - ($8 || ' seconds')::interval)`,
        [
          uid,
          base.lat + (rnd() - 0.5) * 0.004,
          base.lng + (rnd() - 0.5) * 0.004,
          int(4, 20), Number((rnd() * 6).toFixed(1)), int(20, 100), int(40, 100),
          k * 10,
        ]
      );
    }
  }

  // -- Reports ---------------------------------------------------------------
  const reportIds: number[] = [];
  for (let i = 0; i < 134; i++) {
    const uid = pick(personnelIds);
    const pos = nearby();
    const type = pick(['information', 'information', 'incident', 'request_help']);
    const minutesAgo = int(1, 700);
    // Tanpa status/verified_by/verified_at: laporan adalah catatan, bukan
    // kiriman yang menunggu persetujuan, jadi kolom itu sudah hilang dari skema.
    const row = await pool.query<{ id: number }>(
      `INSERT INTO reports (operation_id, user_id, type, title, description, lat, lng, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - ($8 || ' minutes')::interval)
       RETURNING id`,
      [
        operationId, uid, type,
        `Laporan ${pick(LOCATION_NAMES)}`,
        pick(REPORT_TEXT),
        pos.lat, pos.lng,
        minutesAgo,
      ]
    );
    reportIds.push(row.rows[0].id);
  }
  console.log(`[seed:demo] ${reportIds.length} reports created`);

  // -- Missions --------------------------------------------------------------
  const missionIds: number[] = [];
  for (let i = 0; i < 38; i++) {
    const pos = nearby();
    const status = pick(['pending', 'pending', 'running', 'running', 'completed']);
    const row = await pool.query<{ id: number }>(
      `INSERT INTO missions (operation_id, title, description, priority, status, lat, lng,
                             deadline, created_by, completed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + ($8 || ' hours')::interval, $9, $10,
               NOW() - ($11 || ' minutes')::interval)
       RETURNING id`,
      [
        operationId,
        `${pick(MISSION_TITLES)} #${i + 1}`,
        `Laksanakan ${pick(MISSION_TITLES).toLowerCase()} di area ${pick(LOCATION_NAMES)}. Laporkan setiap perkembangan melalui kanal resmi.`,
        pick(['low', 'medium', 'medium', 'high', 'critical']),
        status,
        pos.lat, pos.lng,
        int(1, 12),
        commanderId,
        status === 'completed' ? new Date() : null,
        int(10, 600),
      ]
    );
    missionIds.push(row.rows[0].id);

    // 1–3 personnel per mission
    const assignees = new Set<number>();
    for (let a = 0; a < int(1, 3); a++) assignees.add(pick(personnelIds));
    for (const uid of assignees) {
      await pool.query(
        `INSERT INTO mission_assignments (mission_id, user_id, status, accepted_at, completed_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [
          row.rows[0].id, uid,
          status === 'completed' ? 'completed' : status === 'running' ? 'accepted' : 'assigned',
          status === 'pending' ? null : new Date(),
          status === 'completed' ? new Date() : null,
        ]
      );
    }
  }
  console.log(`[seed:demo] ${missionIds.length} missions created`);

  // -- Incidents -------------------------------------------------------------
  for (let i = 0; i < 7; i++) {
    const pos = nearby();
    const status = i < 2 ? 'open' : pick(['open', 'investigating', 'closed', 'closed']);
    await pool.query(
      `INSERT INTO incidents (operation_id, title, description, priority, status, location, lat, lng,
                              reporter_id, created_by, closed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW() - ($12 || ' minutes')::interval)`,
      [
        operationId,
        pick(INCIDENT_TITLES),
        'Insiden dilaporkan oleh personel di lapangan dan sedang ditindaklanjuti oleh unit terdekat.',
        pick(['medium', 'high', 'high', 'critical']),
        status,
        pick(LOCATION_NAMES),
        pos.lat, pos.lng,
        pick(personnelIds),
        operatorId,
        status === 'closed' ? new Date() : null,
        int(5, 500),
      ]
    );
  }

  // -- Stream history --------------------------------------------------------
  // Seeded as ENDED on purpose. A row with status 'live' makes the dashboard
  // advertise a WebRTC room that has no publisher, so the tile can only ever
  // render a black frame — which reads as "streaming is broken". Live rows are
  // created solely by POST /streams/start, when a real device is publishing.
  const streamers = personnelIds.slice(0, 8);
  for (const uid of streamers) {
    const startedMinutesAgo = int(20, 240);
    await pool.query(
      `INSERT INTO streams (user_id, room_name, status, quality, started_at, ended_at)
       VALUES ($1, $2, 'ended', $3,
               NOW() - ($4 || ' minutes')::interval,
               NOW() - ($5 || ' minutes')::interval)`,
      [
        uid,
        `stream-${uid}-${startedMinutesAgo}`,
        pick(['good', 'good', 'fair', 'poor']),
        startedMinutesAgo,
        startedMinutesAgo - int(5, 15),
      ]
    );
  }

  // -- Activity timeline -----------------------------------------------------
  const activities: Array<[string, string]> = [
    ['report_created', 'mengirim laporan situasi'],
    ['mission_assigned', 'menerima penugasan misi baru'],
    ['stream_started', 'memulai siaran langsung'],
    ['incident_created', 'insiden baru dibuat'],
    ['location_updated', 'berpindah posisi'],
    ['mission_completed', 'menyelesaikan misi'],
    ['user_online', 'terhubung ke sistem'],
  ];
  for (let i = 0; i < 60; i++) {
    const [type, text] = pick(activities);
    const uid = pick(personnelIds);
    const nameRow = await pool.query<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1', [uid]
    );
    await pool.query(
      `INSERT INTO activity_logs (user_id, type, message, created_at)
       VALUES ($1,$2,$3, NOW() - ($4 || ' minutes')::interval)`,
      [uid, type, `${nameRow.rows[0].full_name} ${text}`, i * int(2, 6)]
    );
  }

  // -- Notifications ---------------------------------------------------------
  const notifs: Array<[string, string, string, string]> = [
    ['battery_low', 'Baterai Lemah', 'Perangkat personel di bawah 20%.', 'warning'],
    ['personnel_offline', 'Personel Offline', 'Personel tidak mengirim GPS lebih dari 3 menit.', 'danger'],
    ['mission_completed', 'Misi Selesai', 'Satu misi telah ditandai selesai.', 'success'],
    ['stream_started', 'Siaran Dimulai', 'Personel memulai siaran langsung.', 'info'],
    ['new_report', 'Laporan Baru', 'Laporan baru masuk dari lapangan.', 'info'],
  ];
  for (let i = 0; i < 18; i++) {
    const [type, title, body, severity] = pick(notifs);
    await pool.query(
      `INSERT INTO notifications (audience, type, title, body, severity, created_at)
       VALUES ('command', $1,$2,$3,$4, NOW() - ($5 || ' minutes')::interval)`,
      [type, title, body, severity, i * int(3, 9)]
    );
  }

  // -- Chat sample -----------------------------------------------------------
  const chatPartner = personnelIds[0];
  const chat: Array<[number, number, string]> = [
    [operatorId, chatPartner, 'Selamat pagi, mohon konfirmasi posisi saat ini.'],
    [chatPartner, operatorId, 'Siap, posisi saya di pos 3 dekat Bundaran HI.'],
    [operatorId, chatPartner, 'Diterima. Tetap standby, laporkan bila ada kerumunan.'],
    [chatPartner, operatorId, 'Baik, laporan akan segera saya kirim.'],
  ];
  for (let i = 0; i < chat.length; i++) {
    const [s, r, body] = chat[i];
    await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, body, created_at)
       VALUES ($1,$2,$3, NOW() - ($4 || ' minutes')::interval)`,
      [s, r, body, (chat.length - i) * 4]
    );
  }

  console.log('[seed:demo] done');
  console.log(`[seed:demo] login → admin / admin2 / p001..p100 — password: ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed:demo] failed', err);
  process.exit(1);
});
