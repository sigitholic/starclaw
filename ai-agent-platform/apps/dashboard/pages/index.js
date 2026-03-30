import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";

const AGENT_ORDER = ["noc-monitor-agent", "noc-analyzer-agent", "noc-executor-agent"];

function buildAgentNodes(agentStatus) {
  return AGENT_ORDER.map((agent, index) => {
    const status = agentStatus[agent] || { active: false };
    return {
      id: agent,
      position: { x: 120 + index * 260, y: 120 },
      data: { label: `${agent}${status.active ? " (active)" : " (idle)"}` },
      style: {
        border: "1px solid #1f2937",
        borderRadius: 8,
        padding: 10,
        background: status.active ? "#dcfce7" : "#f3f4f6",
        width: 220,
      },
    };
  });
}

function buildAgentEdges() {
  return [
    { id: "e-monitor-analyzer", source: "noc-monitor-agent", target: "noc-analyzer-agent", label: "task_created" },
    { id: "e-analyzer-executor", source: "noc-analyzer-agent", target: "noc-executor-agent", label: "task_analyzed" },
  ];
}

const API_HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";
const API_BASE = `http://${API_HOST}:8080`;
const WS_URL = `ws://${API_HOST}:8080/ws`;

export default function Home() {
  const [events, setEvents] = useState([]);
  const [agentStatus, setAgentStatus] = useState({});
  const [wsState, setWsState] = useState("disconnected");

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    setWsState("connecting");

    ws.onopen = () => setWsState("connected");
    ws.onclose = () => setWsState("disconnected");
    ws.onerror = () => setWsState("error");

    ws.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data);
        setEvents((prev) => [parsed, ...prev].slice(0, 100));

        if (parsed.type === "agent_started" && parsed.agent) {
          setAgentStatus((prev) => ({
            ...prev,
            [parsed.agent]: { active: true },
          }));
        }

        if (parsed.type === "agent_finished" && parsed.agent) {
          setAgentStatus((prev) => ({
            ...prev,
            [parsed.agent]: { active: false },
          }));
        }
      } catch (_error) {
        // Ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const nodes = useMemo(() => buildAgentNodes(agentStatus), [agentStatus]);
  const edges = useMemo(() => buildAgentEdges(), []);

  return (
    <main className="container">
      <section className="header">
        <h1>Starclaw Dashboard</h1>
        <p>Realtime agent workflow monitor (WebSocket)</p>
        <p>Status WS: <strong>{wsState}</strong></p>
      </section>

      <section className="layout">
        <div className="graphPanel">
          <h2>Agent Graph</h2>
          <div className="graphWrapper">
            <ReactFlow nodes={nodes} edges={edges} fitView>
              <MiniMap />
              <Controls />
              <Background />
            </ReactFlow>
          </div>
        </div>

        <div className="logPanel">
          <h2>Event Timeline</h2>
          <button
            type="button"
            onClick={async () => {
              await fetch(`${API_BASE}/tasks/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  task: "noc-incident-workflow",
                  taskId: `noc-ui-${Date.now()}`,
                  signal: "latency-spike",
                  severity: "high",
                  action: "reroute-link",
                }),
              });
            }}
          >
            Trigger NOC Workflow
          </button>
          <ul className="timeline">
            {events.map((event, idx) => (
              <li key={`${event.timestamp || "t"}-${event.type || "evt"}-${idx}`}>
                <div><strong>{event.type || "unknown"}</strong></div>
                <div>{event.timestamp || "-"}</div>
                <pre>{JSON.stringify(event.payload || {}, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
