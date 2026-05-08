// Typed event bridge between React and Phaser.
// React side: import { sceneBus } and call .on() / .emit()
// Phaser side: same singleton — Phaser systems never import React

import mitt from "mitt";

/** Events Phaser emits → React listens */
export type SceneOutEvents = {
  sceneReady: void;
  employeeClick: { employeeId: string };
  taskClick: { taskId: string };
  a2aLineClick: { messageId: string; threadId: string };
  viewChanged: { view: "org" | "task" | "a2a" };
  fps: { value: number };
};

/** Events React emits → Phaser listens */
export type SceneInEvents = {
  orgGraphUpdate: OrgGraphPayload;
  setView: { view: "org" | "task" | "a2a" };
  focusEmployee: { employeeId: string };
  focusTask: { taskId: string };
  replayThread: { threadId: string };
};

export type AllSceneEvents = SceneOutEvents & SceneInEvents;

export interface OrgGraphPayload {
  employees: OrgEmployee[];
  agents: OrgAgent[];
  departments: OrgDepartment[];
  departmentMembers: OrgDeptMember[];
}

export interface OrgEmployee {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
}

export interface OrgAgent {
  id: string;
  ownerEmployeeId: string;
  status: string;
}

export interface OrgDepartment {
  id: string;
  name: string;
}

export interface OrgDeptMember {
  employeeId: string;
  departmentId: string;
}

export const sceneBus = mitt<AllSceneEvents>();
