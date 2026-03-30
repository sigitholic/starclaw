"use strict";

/**
 * GenieACS Tool — Manage perangkat CPE/ONT via GenieACS REST API (TR-069/CWMP).
 *
 * Environment variables:
 *   GENIEACS_URL  — Base URL ACS server (default: http://localhost:7557)
 *   GENIEACS_USER — Username (opsional, jika auth diaktifkan)
 *   GENIEACS_PASS — Password (opsional)
 */
function createGenieAcsTool() {
  function getBaseUrl() {
    return (process.env.GENIEACS_URL || "http://localhost:7557").replace(/\/$/, "");
  }

  function getHeaders() {
    const headers = { "Content-Type": "application/json" };
    const user = process.env.GENIEACS_USER;
    const pass = process.env.GENIEACS_PASS;
    if (user && pass) {
      headers["Authorization"] = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
    }
    return headers;
  }

  async function apiCall(method, path, body) {
    const url = `${getBaseUrl()}${path}`;
    const opts = {
      method,
      headers: getHeaders(),
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(`GenieACS API error ${res.status}: ${text.slice(0, 300)}`);
    return data;
  }

  return {
    name: "genieacs-tool",
    description: "Kelola perangkat CPE/ONT/Router via GenieACS ACS server (TR-069). Bisa list device, get info, kirim task (reboot, set parameter, factory reset), lihat fault, dan manage preset.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'list-devices' | 'get-device' | 'task' | 'set-parameter' | 'get-parameter' | 'list-faults' | 'clear-fault' | 'list-presets' | 'delete-device' | 'reboot' | 'factory-reset'"
        },
        deviceId: {
          type: "string",
          description: "ID/Serial perangkat (diperlukan untuk task, get-device, set-parameter, reboot, factory-reset)"
        },
        taskName: {
          type: "string",
          description: "(untuk action 'task') Nama task: 'getParameterValues', 'setParameterValues', 'reboot', 'factoryReset', 'download'"
        },
        taskBody: {
          type: "object",
          description: "(untuk action 'task') Body task lengkap sesuai GenieACS API"
        },
        parameter: {
          type: "string",
          description: "(untuk set-parameter/get-parameter) Nama parameter TR-069 lengkap"
        },
        value: {
          type: "string",
          description: "(untuk set-parameter) Nilai yang ingin di-set"
        },
        valueType: {
          type: "string",
          description: "(untuk set-parameter) Tipe xsd: 'xsd:string', 'xsd:unsignedInt', 'xsd:boolean' (default: xsd:string)"
        },
        query: {
          type: "object",
          description: "(untuk list-devices) MongoDB-style query filter, contoh: {\"DeviceID.Manufacturer\": \"Huawei\"}"
        },
        limit: {
          type: "number",
          description: "(untuk list-devices) Batas jumlah device yang dikembalikan (default: 20)"
        },
        faultId: {
          type: "string",
          description: "(untuk clear-fault) ID fault yang ingin dihapus"
        },
      },
      required: ["action"],
    },

    async run(input) {
      try {
        switch (input.action) {

          case "list-devices": {
            const limit = input.limit || 20;
            const queryStr = input.query ? `&query=${encodeURIComponent(JSON.stringify(input.query))}` : "";
            const devices = await apiCall("GET", `/devices?limit=${limit}${queryStr}`);
            const list = Array.isArray(devices) ? devices : [];
            return {
              success: true,
              total: list.length,
              devices: list.map(d => ({
                id: d._id,
                manufacturer: d["DeviceID.Manufacturer"] ? d["DeviceID.Manufacturer"]._value : null,
                productClass: d["DeviceID.ProductClass"] ? d["DeviceID.ProductClass"]._value : null,
                serialNumber: d["DeviceID.SerialNumber"] ? d["DeviceID.SerialNumber"]._value : null,
                softwareVersion: d["InternetGatewayDevice.DeviceInfo.SoftwareVersion"] ? d["InternetGatewayDevice.DeviceInfo.SoftwareVersion"]._value : null,
                lastInform: d._lastInform,
              })),
            };
          }

          case "get-device": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            const encoded = encodeURIComponent(input.deviceId);
            const devices = await apiCall("GET", `/devices?query=${encodeURIComponent(JSON.stringify({ _id: input.deviceId }))}`);
            const device = Array.isArray(devices) && devices.length > 0 ? devices[0] : null;
            if (!device) return { success: false, error: `Device '${input.deviceId}' tidak ditemukan` };
            return { success: true, device };
          }

          case "reboot": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            const result = await apiCall("POST", `/devices/${encodeURIComponent(input.deviceId)}/tasks?timeout=10000`, { name: "reboot" });
            return { success: true, message: `Perintah reboot dikirim ke ${input.deviceId}`, result };
          }

          case "factory-reset": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            const result = await apiCall("POST", `/devices/${encodeURIComponent(input.deviceId)}/tasks?timeout=10000`, { name: "factoryReset" });
            return { success: true, message: `Factory reset dikirim ke ${input.deviceId}`, result };
          }

          case "task": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            if (!input.taskBody && !input.taskName) return { success: false, error: "taskBody atau taskName wajib" };
            const body = input.taskBody || { name: input.taskName };
            const result = await apiCall("POST", `/devices/${encodeURIComponent(input.deviceId)}/tasks?timeout=10000`, body);
            return { success: true, message: `Task dikirim ke ${input.deviceId}`, result };
          }

          case "set-parameter": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            if (!input.parameter || input.value === undefined) return { success: false, error: "parameter dan value wajib" };
            const valueType = input.valueType || "xsd:string";
            const body = {
              name: "setParameterValues",
              parameterValues: [[input.parameter, input.value, valueType]],
            };
            const result = await apiCall("POST", `/devices/${encodeURIComponent(input.deviceId)}/tasks?timeout=10000`, body);
            return { success: true, message: `Parameter ${input.parameter} diset ke '${input.value}'`, result };
          }

          case "get-parameter": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            if (!input.parameter) return { success: false, error: "parameter wajib" };
            const body = {
              name: "getParameterValues",
              parameterNames: [input.parameter],
            };
            const result = await apiCall("POST", `/devices/${encodeURIComponent(input.deviceId)}/tasks?timeout=10000`, body);
            return { success: true, parameter: input.parameter, result };
          }

          case "list-faults": {
            const queryStr = input.deviceId
              ? `?query=${encodeURIComponent(JSON.stringify({ device: input.deviceId }))}`
              : "";
            const faults = await apiCall("GET", `/faults${queryStr}`);
            return {
              success: true,
              total: Array.isArray(faults) ? faults.length : 0,
              faults: Array.isArray(faults) ? faults : [],
            };
          }

          case "clear-fault": {
            if (!input.faultId) return { success: false, error: "faultId wajib" };
            await apiCall("DELETE", `/faults/${encodeURIComponent(input.faultId)}`);
            return { success: true, message: `Fault ${input.faultId} dihapus` };
          }

          case "list-presets": {
            const presets = await apiCall("GET", "/presets");
            return { success: true, total: Array.isArray(presets) ? presets.length : 0, presets };
          }

          case "delete-device": {
            if (!input.deviceId) return { success: false, error: "deviceId wajib" };
            await apiCall("DELETE", `/devices/${encodeURIComponent(input.deviceId)}`);
            return { success: true, message: `Device ${input.deviceId} dihapus dari ACS` };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: list-devices, get-device, reboot, factory-reset, task, set-parameter, get-parameter, list-faults, clear-fault, list-presets, delete-device` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createGenieAcsTool };
