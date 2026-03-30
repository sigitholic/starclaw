---
name: genieacs
description: Manajemen perangkat CPE/ONT ISP via GenieACS ACS server (TR-069/CWMP)
requires.env: []
plugin: genieacs-monitor
---

# Skill: GenieACS & TR-069 Device Management

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta sesuatu yang berhubungan dengan:
- GenieACS (ACS server, CWMP, TR-069)
- Manajemen CPE/ONT/ONU/Router via ACS
- Provisioning perangkat ISP
- Monitoring device (GenieACS fault, task, preset)

## GenieACS REST API — Endpoint Penting

Base URL default: `http://localhost:7557` (atau sesuai env `GENIEACS_URL`)
Auth: Basic Auth (`GENIEACS_USER` / `GENIEACS_PASS`) atau tanpa auth jika lokal.

### Devices

```
GET  /devices                                    → List semua device
GET  /devices?query={"_id":"<serial>"}           → Cari device by serial
GET  /devices/<device-id>                        → Detail 1 device
DELETE /devices/<device-id>                      → Hapus device dari ACS
```

### Tasks (Perintah ke CPE)

```
POST /devices/<device-id>/tasks                  → Buat task baru
Body contoh refresh parameter:
  { "name": "getParameterValues", "parameterNames": ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress"] }

Body contoh set parameter:
  { "name": "setParameterValues", "parameterValues": [["InternetGatewayDevice.ManagementServer.PeriodicInformInterval", "300", "xsd:unsignedInt"]] }

Body contoh reboot:
  { "name": "reboot" }

Body contoh factory reset:
  { "name": "factoryReset" }

POST /devices/<device-id>/tasks?timeout=3000      → Dengan timeout (ms)
```

### Faults

```
GET  /faults                                     → Semua fault
GET  /faults?query={"device":"<device-id>"}      → Fault by device
DELETE /faults/<fault-id>                        → Clear fault
```

### Presets

```
GET  /presets                                    → List semua preset
PUT  /presets/<preset-name>                      → Create/update preset
DELETE /presets/<preset-name>                    → Hapus preset
```

### Files (Firmware, Config)

```
GET  /files                                      → List file tersedia
POST /files/<filename>                           → Upload file
  Header: fileType=1 Firmware Upgrade Image | fileType=3 Vendor Configuration File
```

## Panduan Menggunakan genieacs-tool

Tool yang tersedia: `genieacs-tool` (dari plugin genieacs-monitor yang sudah disempurnakan)

### Contoh Tugas Umum

**Cari semua device online:**
```json
{ "action": "list-devices", "limit": 50 }
```

**Cek status device tertentu:**
```json
{ "action": "get-device", "deviceId": "SERIAL_NUMBER_CPE" }
```

**Reboot CPE:**
```json
{ "action": "task", "deviceId": "SERIAL_NUMBER_CPE", "taskName": "reboot" }
```

**Set parameter (misal ubah DNS):**
```json
{ "action": "set-parameter", "deviceId": "SERIAL_NUMBER", "parameter": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers", "value": "8.8.8.8,8.8.4.4" }
```

**Lihat fault:**
```json
{ "action": "list-faults" }
```

**Clear fault:**
```json
{ "action": "clear-fault", "faultId": "<id>" }
```

## Parameter TR-069 Umum

| Parameter | Keterangan |
|-----------|------------|
| `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress` | IP publik CPE |
| `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers` | DNS server |
| `InternetGatewayDevice.ManagementServer.PeriodicInformInterval` | Interval inform (detik) |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID` | SSID WiFi |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase` | Password WiFi |
| `InternetGatewayDevice.DeviceInfo.SoftwareVersion` | Versi firmware |
| `InternetGatewayDevice.DeviceInfo.SerialNumber` | Serial number |

## Workflow Umum

### Provisioning Device Baru
1. Device register ke ACS → cek di `list-devices`
2. Verifikasi parameter dasar (`get-device`)
3. Set parameter provisioning (DNS, inform interval)
4. Verifikasi dengan `getParameterValues`

### Troubleshooting Device Offline
1. Cek fault: `list-faults` filter by deviceId
2. Cek last inform time dari detail device
3. Coba trigger refresh: task `getParameterValues`
4. Jika tidak respon: escalate ke teknisi lapangan

### Mass Provisioning
- Gunakan preset GenieACS untuk set parameter ke banyak device sekaligus
- Buat preset dengan kondisi filter, GenieACS akan apply otomatis saat device inform
