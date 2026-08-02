#!/usr/bin/env node
/**
 * Starts local development infrastructure (PostgreSQL, MinIO, LiveKit).
 *
 * Plenty of machines already run a PostgreSQL on 5432 — a previous
 * `docker run --name tocs-pg`, Homebrew, or another project. Starting a second
 * one just fails with "port is already allocated", which stops the whole
 * compose invocation and leaves streaming and storage down too. So probe the
 * port first and only bring up the services that are actually missing.
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';

const COMPOSE = ['compose', '-f', 'docker-compose.dev.yml'];

/**
 * This machine's LAN address, used for LiveKit's --node-ip.
 *
 * Pinning it in .env goes stale the moment the machine changes network, and the
 * failure is silent: LiveKit keeps advertising an address nothing can reach, so
 * signalling connects and video never arrives. Detecting it per run keeps the
 * advertised address true; HOST_IP still wins when set explicitly.
 */
function detectLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (/^(docker|br-|veth|utun|llw|awdl)/.test(name)) continue;
      candidates.push({ name, address: addr.address });
    }
  }
  // Prefer the usual primary interfaces before anything else present.
  const preferred = candidates.find((c) => /^(en0|eth0|wlan0|en1)$/.test(c.name));
  return (preferred ?? candidates[0])?.address ?? null;
}

function portInUse(port, host = '127.0.0.1', timeout = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function docker(args, env = {}) {
  return spawnSync('docker', args, { stdio: 'inherit', env: { ...process.env, ...env } });
}

const pgPort = Number(process.env.POSTGRES_PORT ?? 5432);
const pgTaken = await portInUse(pgPort);

const services = ['livekit', 'minio'];
if (pgTaken) {
  console.log(`[infra] port ${pgPort} already serving — reusing your existing PostgreSQL`);
  console.log('[infra] starting only: livekit, minio');
} else {
  services.unshift('postgres');
}

const detected = detectLanIp();
const hostIp = process.env.HOST_IP || detected || '127.0.0.1';

const result = docker([...COMPOSE, 'up', '-d', ...services], { HOST_IP: hostIp });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log('');
if (process.env.HOST_IP) {
  console.log(`[infra] LiveKit advertising ${hostIp} (dari HOST_IP)`);
  if (detected && detected !== hostIp) {
    console.log(`[infra] PERINGATAN: alamat LAN mesin ini ${detected} — HOST_IP tampak basi.`);
    console.log('[infra] Streaming akan gagal diam-diam bila klien tidak dapat menjangkau alamat itu.');
  }
} else if (detected) {
  console.log(`[infra] LiveKit advertising ${detected} (terdeteksi otomatis)`);
  console.log(`[infra] Buka aplikasi lewat http://${detected}:5173 agar streaming bekerja`);
  console.log('[infra] dari perangkat lain — localhost tetap bisa untuk browser di mesin ini.');
} else {
  console.log('[infra] Tidak ada alamat LAN terdeteksi — LiveKit memakai 127.0.0.1.');
}

if (pgTaken) {
  console.log('');
  console.log(`[infra] Using the PostgreSQL already on :${pgPort}. If that is not the TOCS`);
  console.log('[infra] database, stop it and re-run, or set POSTGRES_PORT to a free port.');
}
