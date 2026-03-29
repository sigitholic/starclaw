---
description: panduan memanggil agen arsitektur untuk update workflow development sebagai acuan tim
---

## Update Workflow Development via Agen Arsitektur

Gunakan workflow ini saat ada perubahan penting di `main` dan tim perlu menyelaraskan alur dev.

### Tujuan

1. Menjalankan audit arsitektur secara cepat.
2. Menghasilkan checklist update workflow dev yang konsisten.
3. Menjadi acuan implementasi fitur berikutnya.

### Cara Panggil via API

```bash
curl -X POST http://localhost:8080/tasks/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "architecture-workflow-update",
    "message": "sinkronkan workflow dev setelah update main",
    "openclawSnapshot": {
      "modules": ["agent-core", "event-bus", "orchestrator", "basic-tools"],
      "observability": { "tracing": true, "metrics": true },
      "reliability": { "retries": true, "queue": true },
      "memory": { "longTerm": false }
    }
  }'
```

### Output yang Diharapkan

Response `result` akan memuat:

- `architectureAudit`: ringkasan hasil audit (`score`, `gaps`, `recommendations`)
- `workflowUpdate.branchPolicy`: standar branch + commit flow
- `workflowUpdate.deliveryFlow`: urutan implementasi teknis
- `workflowUpdate.architectureChecklist`: checklist berbasis gap arsitektur
- `workflowUpdate.definitionOfDone`: kriteria selesai sebelum merge

### Kapan Digunakan

- Setelah ada update besar di `main`.
- Saat memulai batch fitur baru agar semua developer memakai alur yang sama.
- Saat retrospektif teknis untuk memastikan gap arsitektur tertangani.
