# Skill: Networking & Network Operations

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Diagnosa masalah jaringan (koneksi, latency, packet loss)
- Konfigurasi MikroTik, switch, router
- Monitoring bandwidth dan traffic
- VLAN, BGP, OSPF troubleshooting
- GenieACS dan perangkat ISP

## Tools yang Tersedia

| Tool | Kapan Digunakan |
|------|----------------|
| `shell-tool` | ping, traceroute, nmap, ip commands |
| `genieacs-tool` | Manage CPE/ONT via TR-069 |
| `http-tool` | API MikroTik REST, SNMP via HTTP |

## Diagnosa Dasar

```bash
# Konektivitas
ping -c 4 8.8.8.8              # test ke internet
ping -c 4 <gateway>            # test ke gateway
traceroute 8.8.8.8             # trace rute
mtr 8.8.8.8                    # traceroute real-time (jika ada)

# DNS
nslookup domain.com
dig domain.com A
dig @8.8.8.8 domain.com       # test DNS spesifik

# Port & Koneksi
nc -zv <host> <port>           # test port terbuka
telnet <host> <port>           # alternatif
ss -s                          # statistik socket
nmap -sn 192.168.1.0/24        # scan host aktif di subnet
```

## MikroTik REST API

Base URL: `http://<mikrotik-ip>/rest`
Auth: Basic Auth (admin:password)

```bash
# List interface
GET /rest/interface

# List IP Address
GET /rest/ip/address

# Cek ARP table
GET /rest/ip/arp

# Cek DHCP leases
GET /rest/ip/dhcp-server/lease

# Cek bandwidth (traffic monitor)
GET /rest/interface/monitor-traffic?interface=ether1&once=

# Firewall rules
GET /rest/ip/firewall/filter
```

## Workflow Troubleshooting Network

### User Tidak Bisa Internet
1. Ping gateway lokal — apakah ada koneksi ke router?
2. Ping 8.8.8.8 — apakah ada koneksi ke internet?
3. Ping 8.8.8.8 tapi tidak bisa domain — masalah DNS
4. Cek `ip route` — apakah default route ada?
5. Cek firewall — apakah ada rule yang block?

### Latency Tinggi
1. `traceroute` — identifikasi hop mana yang lambat
2. Cek bandwidth utilization di interface
3. Cek queue/QoS di router
4. Cek interferensi WiFi (jika wireless)

### CPE Tidak Terkoneksi ke ACS (GenieACS)
1. Ping CPE dari ACS server — apakah reachable?
2. Cek konfigurasi ACS URL di CPE
3. Cek firewall — port 7547 (CWMP) terbuka?
4. Cek log GenieACS untuk error
5. Coba factory reset dan provisioning ulang

## Parameter MikroTik Penting

```
# Cek resource
GET /rest/system/resource

# Reboot
POST /rest/system/reboot

# Backup config
POST /rest/system/backup/save

# Log
GET /rest/log
```

## SNMP Monitoring

```bash
# Test SNMP v2c
snmpwalk -v2c -c public <host> 1.3.6.1.2.1.1.1.0    # sysDescr

# Interface traffic (ifInOctets, ifOutOctets)
snmpget -v2c -c public <host> 1.3.6.1.2.1.2.2.1.10.1  # ifInOctets if.1
snmpget -v2c -c public <host> 1.3.6.1.2.1.2.2.1.16.1  # ifOutOctets if.1

# CPU load
snmpget -v2c -c public <host> 1.3.6.1.4.1.14988.1.1.3.14.0  # MikroTik CPU
```
