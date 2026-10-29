import type { TaskRecord } from "./domain-logic";

export interface PlanSnapshotRecord {
  id: string;
  planId: string;
  version: number;
  title: string;
  startDate: string;
  endDate: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  successCriteria: string;
  estimatedMinutes: number;
  appliedImprovementNote: string | null;
  changedAt: string;
}

export interface ReviewRecord {
  id: string;
  planId: string;
  filterType: "ALL" | "PERIOD";
  periodStartDate: string | null;
  periodEndDate: string | null;
  aggregationRule: string;
  reflectionNote: string;
  improvementNote: string;
  snapshotPlannedCount: number;
  snapshotCompletedCount: number;
  snapshotDelayedCount: number;
  snapshotBlockedCount: number;
  snapshotEstimatedMinutes: number;
  snapshotActualMinutes: number;
  snapshotDiffMinutes: number;
  nextPlanId: string | null;
  nextPlanTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRecord {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  successCriteria: string;
  estimatedMinutes: number;
  appliedImprovementNote: string | null;
  version: number;
  parentPlanId: string | null;
  parentPlanTitle: string | null;
  sourceReviewId: string | null;
  createdAt: string;
  updatedAt: string;
  snapshots: PlanSnapshotRecord[];
  tasks: TaskRecord[];
  reviews: ReviewRecord[];
}
