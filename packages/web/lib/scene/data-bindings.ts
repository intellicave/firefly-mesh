"use client";

// React-side bridge: pipes TanStack Query cache → SceneEventBus.
// Phaser systems subscribe to bus events; they never import React or TQ.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { sceneBus, type OrgGraphPayload } from "./event-bus";
import { QUERY_KEYS } from "./query-keys";

/** Mount inside <ScenePage>. Bridges TQ cache → sceneBus. */
export function useSceneDataBridge() {
  const qc = useQueryClient();

  const orgQuery = useQuery({
    queryKey: QUERY_KEYS.orgGraph,
    queryFn: () => api<OrgGraphPayload>("/api/org/graph"),
  });

  // Push org graph to scene whenever it changes.
  useEffect(() => {
    if (!orgQuery.data) return;
    sceneBus.emit("orgGraphUpdate", orgQuery.data);
  }, [orgQuery.data]);

  // Background reconciliation every 30s.
  useEffect(() => {
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.orgGraph });
    }, 30_000);
    return () => clearInterval(interval);
  }, [qc]);

  return {
    orgData: orgQuery.data ?? null,
    isLoading: orgQuery.isLoading,
    isError: orgQuery.isError,
    refetch: orgQuery.refetch,
  };
}
