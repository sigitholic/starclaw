---
name: server-ops
description: Monitoring server, manage service, deploy aplikasi, konfigurasi infrastruktur
requires.env: []
---

# Skill: Server Operations & DevOps

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Monitoring server (CPU, memory, disk, network)
- Manage service (start, stop, restart, status)
- Deploy aplikasi
- Konfigurasi nginx, SSL, firewall
- Docker container management
- Backup dan restore
- Troubleshooting server

## Tools yang Tersedia

| Tool | Kapan Digunakan |
|------|----------------|
| `shell-tool` | Semua operasi server (UTAMA) |
| `docker-tool` | Manage container Docker |
| `fs-tool` | Edit config file, baca log |
| `http-tool` | Health check endpoint, API call |
| `doctor-tool` | Diagnostik platform Starclaw sendiri |

## Command Monitoring Penting

```bash
# CPU & Memory
top -bn1 | head -20
htop                           # interaktif (jika tersedia)
free -h                        # memory usage
vmstat 1 5                     # CPU/mem stats 5 kali per detik

# Disk
df -h                          # disk usage semua mount
du -sh /path/*                 # ukuran folder
lsblk                          # block devices

# Network
ss -tulnp                      # port yang listening
netstat -tulnp                 # alternatif netstat
iftop                          # traffic real-time (jika ada)
ip addr                        # alamat IP semua interface

# Process
ps aux | grep <nama>           # cari proses
pgrep -a node                  # semua proses node
kill -9 <PID>                  # force kill

# Log
journalctl -u <service> -n 100 --no-pager   # log systemd service
tail -f /var/log/syslog        # syslog real-time
tail -f /var/log/nginx/error.log
```

## Manage Service (systemd)

```bash
systemctl status <service>
systemctl start <service>
systemctl stop <service>
systemctl restart <service>
systemctl enable <service>     # auto-start saat boot
systemctl disable <service>
journalctl -u <service> -f    # live log
```

## Nginx

```bash
nginx -t                       # test konfigurasi
systemctl reload nginx         # reload tanpa downtime
nginx -s reload                # alternatif

# Config locations
/etc/nginx/nginx.conf
/etc/nginx/sites-available/
/etc/nginx/sites-enabled/
```

## SSL/TLS dengan Certbot

```bash
certbot --nginx -d domain.com
certbot renew --dry-run
certbot certificates
```

## Docker

```bash
docker ps -a                   # semua container
docker logs <container> -f    # live logs
docker exec -it <container> bash  # masuk container
docker-compose up -d          # start compose services
docker-compose down           # stop compose services
docker system prune -f        # bersihkan resource tidak terpakai
```

## Firewall (UFW)

```bash
ufw status verbose
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny <port>
ufw reload
```

## Workflow Troubleshooting Server

1. **Identifikasi gejala** — tanya user: service apa yang bermasalah, error apa
2. **Cek status service** — `systemctl status <service>`
3. **Cek log** — `journalctl -u <service> -n 50`
4. **Cek resource** — CPU, memory, disk penuh?
5. **Cek koneksi** — port terbuka? koneksi berhasil?
6. **Tindakan** — restart service, clear space, kill proses zombie
7. **Verifikasi** — konfirmasi service kembali normal
8. **Report** — laporkan apa yang ditemukan dan dilakukan

## Workflow Deploy Aplikasi Node.js

```bash
# Pull kode terbaru
cd /app && git pull origin main

# Install dependency
npm install --production

# Restart service
systemctl restart nama-service
# ATAU via PM2:
pm2 restart nama-app

# Verifikasi
curl http://localhost:PORT/health
systemctl status nama-service
```

## Keamanan — Hal yang WAJIB Diperhatikan

- **JANGAN** jalankan command destruktif tanpa konfirmasi user (`rm -rf`, `dd`, format)
- **JANGAN** expose credentials di log atau output
- Selalu backup sebelum perubahan konfigurasi besar
- Gunakan `--dry-run` jika tersedia sebelum eksekusi nyata
- Double-check path sebelum delete file
