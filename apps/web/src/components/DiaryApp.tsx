"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ShieldAlert,
  Download,
  History,
  Plus,
  Edit3,
  Trash2,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  Link2,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  FileText,
} from "lucide-react";
import type { PlanRecord, ReviewRecord } from "@plandosee/shared/records";
import {
  computeReviewAggregation,
  filterAndSortTasks,
  hasNonEmptyBlockReason,
  getTaskActualMinutesSum,
  SORT_LABELS,
  type PriorityType,
  type TaskRecord,
  type TaskSortBy,
  type TaskQuickFilter,
} from "@plandosee/shared/domain-logic";
import {
  calculateActualMinutes,
  formatDateTimeSeoul,
  formatMinutesWithUnit,
  getSeoulDateString,
  isTaskDelayedInSeoul,
  parseSeoulDateTimeInput,
  toSeoulDateTimeLocalValue,
} from "@plandosee/shared/date-seoul";

interface DiaryAppProps {
  serverSeoulToday: string;
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001").replace(
  /\/$/,
  ""
);
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "local";

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

type EvidenceFocusMetric =
  | "PLANNED"
  | "COMPLETED"
  | "DELAYED"
  | "BLOCKED"
  | "ESTIMATED"
  | "ACTUAL"
  | "DIFF";

const PRIORITY_LABELS: Record<PriorityType, string> = {
  HIGH: "높음 (HIGH)",
  MEDIUM: "보통 (MEDIUM)",
  LOW: "낮음 (LOW)",
};

const PRIORITY_BADGE_STYLES: Record<PriorityType, string> = {
  HIGH: "bg-rose-50 text-rose-700 border-rose-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
};

function generateClientRequestId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function DiaryApp({
  serverSeoulToday,
}: DiaryAppProps) {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- New Plan Creation Form State ---
  const [showNewPlanPanel, setShowNewPlanPanel] = useState<boolean>(
    false
  );
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanStart, setNewPlanStart] = useState(serverSeoulToday);
  const [newPlanEnd, setNewPlanEnd] = useState(serverSeoulToday);
  const [newPlanPriority, setNewPlanPriority] = useState<PriorityType>("MEDIUM");
  const [newPlanCriteria, setNewPlanCriteria] = useState("");
  const [newPlanEstimated, setNewPlanEstimated] = useState("120");
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  // --- Edit Plan Dialog State ---
  const editPlanDialogRef = useRef<HTMLDialogElement | null>(null);
  const [editPlanTitle, setEditPlanTitle] = useState("");
  const [editPlanStart, setEditPlanStart] = useState("");
  const [editPlanEnd, setEditPlanEnd] = useState("");
  const [editPlanPriority, setEditPlanPriority] = useState<PriorityType>("MEDIUM");
  const [editPlanCriteria, setEditPlanCriteria] = useState("");
  const [editPlanEstimated, setEditPlanEstimated] = useState("0");
  const [editPlanImprovement, setEditPlanImprovement] = useState("");
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

  // --- Plan History Dialog State ---
  const historyDialogRef = useRef<HTMLDialogElement | null>(null);

  // --- Task Creation Form State ---
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(serverSeoulToday);
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityType>("MEDIUM");
  const [newTaskTagsInput, setNewTaskTagsInput] = useState("");
  const [newTaskEstimated, setNewTaskEstimated] = useState("60");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // --- Task Edit Dialog State ---
  const editTaskDialogRef = useRef<HTMLDialogElement | null>(null);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<PriorityType>("MEDIUM");
  const [editTaskTags, setEditTaskTags] = useState("");
  const [editTaskEstimated, setEditTaskEstimated] = useState("0");
  const [isSavingTaskEdit, setIsSavingTaskEdit] = useState(false);

  // --- Task Search / Filter / Sort State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "TODO" | "DONE">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | PriorityType>("ALL");
  const [quickFilter, setQuickFilter] = useState<TaskQuickFilter>("ALL");
  const [taskPeriodStart, setTaskPeriodStart] = useState<string>("");
  const [taskPeriodEnd, setTaskPeriodEnd] = useState<string>("");
  const [sortBy, setSortBy] = useState<TaskSortBy>("DUE_DATE_ASC");

  // --- Execution Log Expanded Task & Form State ---
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [logStartInput, setLogStartInput] = useState("");
  const [logEndInput, setLogEndInput] = useState("");
  const [logActualMinutesInput, setLogActualMinutesInput] = useState("30");
  const [logBlockReasonInput, setLogBlockReasonInput] = useState("");
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [busyTaskIds, setBusyTaskIds] = useState<Record<string, boolean>>({});

  // --- Review (See) Period & Form State ---
  const [reviewFilterType, setReviewFilterType] = useState<"ALL" | "PERIOD">("ALL");
  const [reviewStartDate, setReviewStartDate] = useState(serverSeoulToday);
  const [reviewEndDate, setReviewEndDate] = useState(serverSeoulToday);
  const [evidenceMetric, setEvidenceMetric] = useState<EvidenceFocusMetric>("PLANNED");
  const [reflectionNoteInput, setReflectionNoteInput] = useState("");
  const [improvementNoteInput, setImprovementNoteInput] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);

  // --- Next Plan from Review Dialog State ---
  const nextPlanDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeReviewForNextPlan, setActiveReviewForNextPlan] =
    useState<ReviewRecord | null>(null);
  const [nextPlanTitle, setNextPlanTitle] = useState("");
  const [nextPlanStart, setNextPlanStart] = useState(serverSeoulToday);
  const [nextPlanEnd, setNextPlanEnd] = useState(serverSeoulToday);
  const [nextPlanPriority, setNextPlanPriority] = useState<PriorityType>("MEDIUM");
  const [nextPlanCriteria, setNextPlanCriteria] = useState("");
  const [nextPlanEstimated, setNextPlanEstimated] = useState("120");
  const [nextPlanImprovement, setNextPlanImprovement] = useState("");
  const [isCreatingNextPlan, setIsCreatingNextPlan] = useState(false);

  const tasksSectionRef = useRef<HTMLElement | null>(null);
  const evidenceSectionRef = useRef<HTMLDivElement | null>(null);

  // Sync aria-invalid with native :user-invalid state (Modern Web Guidance: validate-input-after-interaction)
  useEffect(() => {
    const syncAria = (target: EventTarget | null) => {
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        try {
          if (target.matches(":user-invalid")) {
            target.setAttribute("aria-invalid", "true");
          } else {
            target.removeAttribute("aria-invalid");
          }
        } catch {
          // ignore if browser does not support :user-invalid
        }
      }
    };
    const onBlur = (e: Event) => syncAria(e.target);
    const onInput = (e: Event) => syncAria(e.target);
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput, true);
    };
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  useEffect(() => {
    if (selectedPlan) {
      if (selectedPlan.id !== selectedPlanId) {
        setSelectedPlanId(selectedPlan.id);
      }
      setReviewStartDate(selectedPlan.startDate);
      setReviewEndDate(selectedPlan.endDate);
      setNewTaskDueDate(selectedPlan.startDate);
    }
  }, [selectedPlan, selectedPlanId]);

  const refreshAllPlans = useCallback(async (targetPlanId?: string) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(apiUrl("/api/plans"), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setGlobalError(data.error || "데이터를 불러오지 못했습니다.");
        return;
      }
      setPlans(data.plans);
      if (data.plans.length === 0) setShowNewPlanPanel(true);
      setGlobalError(null);
      if (targetPlanId) {
        setSelectedPlanId(targetPlanId);
      } else if (data.plans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(data.plans[0].id);
      }
    } catch {
      setGlobalError(
        "서버와 통신할 수 없습니다. 네트워크 또는 데이터베이스 연결을 확인해 주세요."
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    void refreshAllPlans();
    // 최초 마운트에서 서버 DB 자료를 한 번 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All unique tags in the current plan
  const availableTags = useMemo(() => {
    if (!selectedPlan) return [];
    const set = new Set<string>();
    for (const t of selectedPlan.tasks) {
      if (!t.isDeleted) {
        for (const tag of t.tags) set.add(tag);
      }
    }
    return Array.from(set).sort();
  }, [selectedPlan]);

  // Filtered and deterministically sorted tasks for the Do section
  const displayedTasks = useMemo(() => {
    if (!selectedPlan) return [];
    return filterAndSortTasks(selectedPlan.tasks, {
      searchQuery,
      tagFilter,
      statusFilter,
      priorityFilter,
      quickFilter,
      periodStartDate: taskPeriodStart || null,
      periodEndDate: taskPeriodEnd || null,
      sortBy,
    });
  }, [
    selectedPlan,
    searchQuery,
    tagFilter,
    statusFilter,
    priorityFilter,
    quickFilter,
    taskPeriodStart,
    taskPeriodEnd,
    sortBy,
  ]);

  // Review (See) live aggregation
  const reviewAggregation = useMemo(() => {
    if (!selectedPlan) {
      return computeReviewAggregation([], { filterType: "ALL" });
    }
    return computeReviewAggregation(selectedPlan.tasks, {
      filterType: reviewFilterType,
      periodStartDate: reviewFilterType === "PERIOD" ? reviewStartDate : null,
      periodEndDate: reviewFilterType === "PERIOD" ? reviewEndDate : null,
    });
  }, [selectedPlan, reviewFilterType, reviewStartDate, reviewEndDate]);

  // Auto-calculate minutes when logStartInput / logEndInput changes
  const handleLogTimeChange = (nextStart: string, nextEnd: string) => {
    setLogStartInput(nextStart);
    setLogEndInput(nextEnd);
    if (nextStart && nextEnd) {
      try {
        const s = parseSeoulDateTimeInput(nextStart);
        const e = parseSeoulDateTimeInput(nextEnd);
        if (e.getTime() >= s.getTime()) {
          const mins = calculateActualMinutes(s, e);
          setLogActualMinutesInput(String(mins));
        }
      } catch {
        // keep manual value if input is incomplete
      }
    }
  };

  const openTaskExecutionPanel = (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    const now = new Date();
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60000);
    setLogStartInput(toSeoulDateTimeLocalValue(thirtyMinsAgo));
    setLogEndInput(toSeoulDateTimeLocalValue(now));
    setLogActualMinutesInput("30");
    setLogBlockReasonInput("");
  };

  // --- Handlers: Plan ---
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBanner(null);
    setIsCreatingPlan(true);

    try {
      const res = await fetch(apiUrl("/api/plans"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPlanTitle,
          startDate: newPlanStart,
          endDate: newPlanEnd,
          priority: newPlanPriority,
          successCriteria: newPlanCriteria,
          estimatedMinutes: Number(newPlanEstimated),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "계획 저장에 실패했습니다. 입력 내용을 확인해 주세요.",
        });
        return;
      }

      await refreshAllPlans(data.plan.id);
      setNewPlanTitle("");
      setNewPlanCriteria("");
      setShowNewPlanPanel(false);
      setActionBanner({
        type: "success",
        text: `새 계획 "${data.plan.title}" (버전 v1)이 데이터베이스에 저장되었습니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "네트워크 오류로 계획을 저장하지 못했습니다. 입력하신 내용은 유지됩니다.",
      });
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const openEditPlanModal = () => {
    if (!selectedPlan) return;
    setEditPlanTitle(selectedPlan.title);
    setEditPlanStart(selectedPlan.startDate);
    setEditPlanEnd(selectedPlan.endDate);
    setEditPlanPriority(selectedPlan.priority);
    setEditPlanCriteria(selectedPlan.successCriteria);
    setEditPlanEstimated(String(selectedPlan.estimatedMinutes));
    setEditPlanImprovement(selectedPlan.appliedImprovementNote ?? "");
    editPlanDialogRef.current?.showModal();
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsUpdatingPlan(true);
    setActionBanner(null);

    try {
      const res = await fetch(apiUrl(`/api/plans/${selectedPlan.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: selectedPlan.version,
          title: editPlanTitle,
          startDate: editPlanStart,
          endDate: editPlanEnd,
          priority: editPlanPriority,
          successCriteria: editPlanCriteria,
          estimatedMinutes: Number(editPlanEstimated),
          appliedImprovementNote:
            editPlanImprovement.trim().length > 0 ? editPlanImprovement.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "계획 수정에 실패했습니다.",
        });
        return;
      }

      editPlanDialogRef.current?.close();
      await refreshAllPlans(selectedPlan.id);
      setActionBanner({
        type: "success",
        text: `계획이 수정되었습니다 (Plan ID 유지, 이전 버전 보존 및 v${data.plan.version} 스냅샷 추가 완료).`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "서버 통신 오류로 계획을 수정하지 못했습니다. 입력 내용은 유지됩니다.",
      });
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // --- Handlers: Task ---
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsCreatingTask(true);
    setActionBanner(null);

    const parsedTags = newTaskTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const res = await fetch(apiUrl("/api/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          title: newTaskTitle,
          dueDate: newTaskDueDate,
          priority: newTaskPriority,
          tags: parsedTags,
          estimatedMinutes: Number(newTaskEstimated),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "할 일 등록에 실패했습니다.",
        });
        return;
      }

      await refreshAllPlans(selectedPlan.id);
      setNewTaskTitle("");
      setNewTaskTagsInput("");
      setActionBanner({
        type: "success",
        text: `할 일 "${data.task.title}"이 추가되었습니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "할 일 저장 중 통신 오류가 발생했습니다. 입력하신 내용은 그대로 유지됩니다.",
      });
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openEditTaskModal = (task: TaskRecord) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDueDate(task.dueDate);
    setEditTaskPriority(task.priority);
    setEditTaskTags(task.tags.join(", "));
    setEditTaskEstimated(String(task.estimatedMinutes));
    editTaskDialogRef.current?.showModal();
  };

  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !selectedPlan) return;
    setIsSavingTaskEdit(true);
    setActionBanner(null);

    const parsedTags = editTaskTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const res = await fetch(apiUrl(`/api/tasks/${editingTask.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTaskTitle,
          dueDate: editTaskDueDate,
          priority: editTaskPriority,
          tags: parsedTags,
          estimatedMinutes: Number(editTaskEstimated),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "할 일 수정에 실패했습니다.",
        });
        return;
      }

      editTaskDialogRef.current?.close();
      setEditingTask(null);
      await refreshAllPlans(selectedPlan.id);
      setActionBanner({
        type: "success",
        text: `할 일 "${data.task.title}" 정보가 수정되었습니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "할 일 수정 중 통신 오류가 발생했습니다.",
      });
    } finally {
      setIsSavingTaskEdit(false);
    }
  };

  const handleDeleteTask = async (task: TaskRecord) => {
    if (!selectedPlan) return;
    setBusyTaskIds((prev) => ({ ...prev, [task.id]: true }));
    setActionBanner(null);

    try {
      const res = await fetch(apiUrl(`/api/tasks/${task.id}`), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "할 일 삭제에 실패했습니다.",
        });
        return;
      }

      await refreshAllPlans(selectedPlan.id);
      setActionBanner({
        type: "info",
        text: `할 일 "${task.title}"이 목록과 집계에서 제외(논리 삭제)되었습니다. 기존 실행 기록 연결은 DB에 보존됩니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "할 일 삭제 중 오류가 발생했습니다.",
      });
    } finally {
      setBusyTaskIds((prev) => ({ ...prev, [task.id]: false }));
    }
  };

  const handleToggleTaskCompletion = async (task: TaskRecord) => {
    if (!selectedPlan) return;
    setBusyTaskIds((prev) => ({ ...prev, [task.id]: true }));
    setActionBanner(null);

    const isCompleting = task.status === "TODO";
    const endpoint = isCompleting
      ? `/api/tasks/${task.id}/complete`
      : `/api/tasks/${task.id}/uncomplete`;
    const requestId = generateClientRequestId(isCompleting ? "comp" : "uncomp");

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          expectedVersion: task.version,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "상태 변경 요청이 거부되었습니다.",
        });
        await refreshAllPlans(selectedPlan.id);
        return;
      }

      await refreshAllPlans(selectedPlan.id);
      setActionBanner({
        type: "success",
        text: data.message,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "할 일 상태 변경 중 네트워크 오류가 발생했습니다.",
      });
    } finally {
      setBusyTaskIds((prev) => ({ ...prev, [task.id]: false }));
    }
  };

  // --- Handlers: ExecutionLog ---
  const handleAddExecutionLog = async (e: React.FormEvent, task: TaskRecord) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsAddingLog(true);
    setActionBanner(null);

    try {
      const res = await fetch(apiUrl(`/api/tasks/${task.id}/logs`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: logStartInput,
          endedAt: logEndInput,
          actualMinutes: Number(logActualMinutesInput),
          blockReason: logBlockReasonInput.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "실행 기록 저장에 실패했습니다.",
        });
        return;
      }

      await refreshAllPlans(selectedPlan.id);
      setLogBlockReasonInput("");
      setActionBanner({
        type: "success",
        text: `"${task.title}"의 실제 실행 기록(${data.log.actualMinutes}분)이 추가되었습니다. 원래 예상 시간(${task.estimatedMinutes}분)은 변경되지 않고 유지됩니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "실행 기록 저장 중 통신 오류가 발생했습니다. 입력하신 내용은 유지됩니다.",
      });
    } finally {
      setIsAddingLog(false);
    }
  };

  // --- Handlers: Review & Next Plan ---
  const handleMetricCardClick = (
    metric: EvidenceFocusMetric,
    correspondingQuickFilter: TaskQuickFilter
  ) => {
    setEvidenceMetric(metric);
    setQuickFilter(correspondingQuickFilter);
    setStatusFilter("ALL");
    if (reviewFilterType === "PERIOD") {
      setTaskPeriodStart(reviewStartDate);
      setTaskPeriodEnd(reviewEndDate);
    } else {
      setTaskPeriodStart("");
      setTaskPeriodEnd("");
    }
    evidenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const scrollToTasksWithCurrentEvidenceFilter = () => {
    tasksSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsSavingReview(true);
    setActionBanner(null);

    try {
      const res = await fetch(apiUrl("/api/reviews"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          filterType: reviewFilterType,
          periodStartDate: reviewFilterType === "PERIOD" ? reviewStartDate : null,
          periodEndDate: reviewFilterType === "PERIOD" ? reviewEndDate : null,
          reflectionNote: reflectionNoteInput,
          improvementNote: improvementNoteInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "돌아보기 저장에 실패했습니다.",
        });
        return;
      }

      await refreshAllPlans(selectedPlan.id);
      setReflectionNoteInput("");
      setImprovementNoteInput("");
      setActionBanner({
        type: "success",
        text: "돌아보기와 개선점 한 줄이 저장되었습니다. 아래 목록에서 '다음 계획 만들기'로 이어갈 수 있습니다.",
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "돌아보기 저장 중 오류가 발생했습니다. 작성하신 내용은 유지됩니다.",
      });
    } finally {
      setIsSavingReview(false);
    }
  };

  const openNextPlanModal = (review: ReviewRecord) => {
    if (!selectedPlan) return;
    setActiveReviewForNextPlan(review);
    setNextPlanTitle(`${selectedPlan.title} — 다음 단계 계획`);
    setNextPlanStart(serverSeoulToday);
    setNextPlanEnd(serverSeoulToday);
    setNextPlanPriority(selectedPlan.priority);
    setNextPlanCriteria("");
    setNextPlanEstimated(String(selectedPlan.estimatedMinutes));
    setNextPlanImprovement(review.improvementNote);
    nextPlanDialogRef.current?.showModal();
  };

  const handleCreateNextPlanFromReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReviewForNextPlan) return;
    setIsCreatingNextPlan(true);
    setActionBanner(null);

    try {
      const res = await fetch(
        apiUrl(`/api/reviews/${activeReviewForNextPlan.id}/next-plan`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextPlanTitle,
            startDate: nextPlanStart,
            endDate: nextPlanEnd,
            priority: nextPlanPriority,
            successCriteria: nextPlanCriteria,
            estimatedMinutes: Number(nextPlanEstimated),
            improvementNoteOverride: nextPlanImprovement,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionBanner({
          type: "error",
          text: data.error || "다음 계획 생성에 실패했습니다.",
        });
        return;
      }

      nextPlanDialogRef.current?.close();
      setActiveReviewForNextPlan(null);
      await refreshAllPlans(data.nextPlan.id);
      setActionBanner({
        type: "success",
        text: `돌아보기 개선점을 반영한 새 계획 "${data.nextPlan.title}"이 생성되고 이전 회고와 연결되었습니다.`,
      });
    } catch {
      setActionBanner({
        type: "error",
        text: "다음 계획 생성 중 오류가 발생했습니다. 입력하신 내용은 유지됩니다.",
      });
    } finally {
      setIsCreatingNextPlan(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 필수 최상단 공개 안내 문구 (과제 원문 100% 일치) */}
      <div
        role="region"
        aria-label="공개 안내"
        className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center text-sm font-medium text-amber-950"
      >
        지금은 로그인이 없어 링크를 아는 사람은 누구나 볼 수 있습니다. 남이 봐도 괜찮은 내용만 넣으세요
      </div>

      {/* 상단 내비게이션 헤더 */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              P
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                플랜두씨 다이어리
              </h1>
              <p className="text-xs text-slate-500">
                내 계획(Plan)과 실제 실행(Do)을 기록하고 돌아보기(See)로 성장하는 다이어리 · 기준 시간대: Asia/Seoul ({serverSeoulToday})
              </p>
              <p className="text-[10px] text-slate-400" title={BUILD_SHA}>
                배포 기준: {BUILD_SHA === "local" ? "로컬 개발" : BUILD_SHA.slice(0, 12)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshAllPlans(selectedPlan?.id)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>

            <a
              href={apiUrl("/api/export")}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 shadow-sm"
            >
              <Download className="w-4 h-4" />
              전체 자료 JSON 내보내기
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* DB 미연결 또는 전역 서버 오류 표시 (절대 가짜 저장 성공으로 속이지 않음) */}
        {globalError && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">데이터베이스 연결 또는 조회 오류</p>
                <p className="mt-0.5 text-red-800">{globalError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshAllPlans(selectedPlan?.id)}
              className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
            >
              연결 다시 시도
            </button>
          </div>
        )}

        {/* 작업 알림 배너 */}
        {actionBanner && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border p-3.5 text-sm flex items-center justify-between gap-3 ${
              actionBanner.type === "error"
                ? "border-red-300 bg-red-50 text-red-900"
                : actionBanner.type === "info"
                ? "border-slate-300 bg-slate-100 text-slate-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span>{actionBanner.text}</span>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-xs underline font-medium shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {/* ============================================================
            SECTION 1: PLAN (계획 관리 및 수정 이력)
           ============================================================ */}
        <section
          aria-labelledby="section-plan-heading"
          className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center rounded-md bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                1. Plan
              </span>
              <h2
                id="section-plan-heading"
                className="text-base sm:text-lg font-bold text-slate-900"
              >
                나의 계획
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {plans.length > 0 && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="plan-selector"
                    className="text-xs font-medium text-slate-600"
                  >
                    계획 선택:
                  </label>
                  <select
                    id="plan-selector"
                    name="selectedPlanId"
                    value={selectedPlan?.id ?? ""}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.startDate} ~ {p.endDate} · v{p.version})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowNewPlanPanel((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                {showNewPlanPanel ? "새 계획 입력창 닫기" : "새 계획 세우기"}
              </button>
            </div>
          </div>

          {/* 새 계획 작성 폼 */}
          {showNewPlanPanel && (
            <form
              onSubmit={handleCreatePlan}
              className="border-b border-slate-200 bg-blue-50/30 p-5 space-y-4"
            >
              <h3 className="text-sm font-bold text-slate-800">
                새로운 계획 세우기 (생성 시 버전 1 스냅샷 자동 보존)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="new-plan-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    계획 제목 (필수)
                  </label>
                  <input
                    id="new-plan-title"
                    name="title"
                    type="text"
                    required
                    value={newPlanTitle}
                    onChange={(e) => setNewPlanTitle(e.target.value)}
                    placeholder="예: 11월 백엔드 기술 면접 및 포트폴리오 완성"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-plan-start"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    시작일 (필수)
                  </label>
                  <input
                    id="new-plan-start"
                    name="startDate"
                    type="date"
                    required
                    value={newPlanStart}
                    onChange={(e) => setNewPlanStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-plan-end"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    종료일 (필수)
                  </label>
                  <input
                    id="new-plan-end"
                    name="endDate"
                    type="date"
                    required
                    min={newPlanStart}
                    value={newPlanEnd}
                    onChange={(e) => setNewPlanEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-plan-priority"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    우선순위
                  </label>
                  <select
                    id="new-plan-priority"
                    name="priority"
                    value={newPlanPriority}
                    onChange={(e) =>
                      setNewPlanPriority(e.target.value as PriorityType)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="HIGH">높음 (HIGH)</option>
                    <option value="MEDIUM">보통 (MEDIUM)</option>
                    <option value="LOW">낮음 (LOW)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-plan-estimated"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    총 예상 시간 (정수 분 단위, 필수)
                  </label>
                  <div className="relative">
                    <input
                      id="new-plan-estimated"
                      name="estimatedMinutes"
                      type="number"
                      min={0}
                      step={1}
                      required
                      value={newPlanEstimated}
                      onChange={(e) => setNewPlanEstimated(e.target.value)}
                      aria-describedby="new-plan-estimated-help"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">
                      분
                    </span>
                  </div>
                  <p
                    id="new-plan-estimated-help"
                    className="mt-1 text-[11px] text-slate-500"
                  >
                    0 이상의 정수로 입력하세요 (예: 180분)
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="new-plan-criteria"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    성공 기준 (필수)
                  </label>
                  <input
                    id="new-plan-criteria"
                    name="successCriteria"
                    type="text"
                    required
                    value={newPlanCriteria}
                    onChange={(e) => setNewPlanCriteria(e.target.value)}
                    placeholder="예: 핵심 기능 5개 배포 완료 및 모의 면접 질문 30개 답변 정리"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {plans.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNewPlanPanel(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    취소
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isCreatingPlan}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreatingPlan ? "저장 중..." : "계획 저장하기"}
                </button>
              </div>
            </form>
          )}

          {/* 선택된 계획 상세 정보 */}
          {selectedPlan ? (
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                        PRIORITY_BADGE_STYLES[selectedPlan.priority]
                      }`}
                    >
                      우선순위: {PRIORITY_LABELS[selectedPlan.priority]}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      현재 버전: v{selectedPlan.version}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                      Plan ID: {selectedPlan.id}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedPlan.title}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditPlanModal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    계획 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => historyDialogRef.current?.showModal()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <History className="w-3.5 h-3.5" />
                    계획 수정 이력 조회 ({selectedPlan.snapshots.length}개 버전 보존됨)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">
                    계획 기간 (날짜 기준)
                  </span>
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    {selectedPlan.startDate} ~ {selectedPlan.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">
                    계획 예상 총 시간 (단위: 분)
                  </span>
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    {formatMinutesWithUnit(selectedPlan.estimatedMinutes)}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">
                    성공 기준
                  </span>
                  <p className="font-medium text-slate-900 mt-0.5 break-words">
                    {selectedPlan.successCriteria}
                  </p>
                </div>
              </div>

              {/* 이전 돌아보기에서 인계받은 개선점 표시 (성공 기준과 분리 보존) */}
              {(selectedPlan.appliedImprovementNote ||
                selectedPlan.parentPlanId ||
                selectedPlan.sourceReviewId) && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      이전 돌아보기에서 이어받은 개선점 (성공 기준과 별도 보존됨)
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-700">
                      {selectedPlan.sourceReviewId && (
                        <span className="font-mono bg-white/80 px-2 py-0.5 rounded border border-indigo-200">
                          출처 Review ID: {selectedPlan.sourceReviewId}
                        </span>
                      )}
                      {selectedPlan.parentPlanId && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPlanId(selectedPlan.parentPlanId!)
                          }
                          className="inline-flex items-center gap-1 underline font-semibold hover:text-indigo-950"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          이전 계획({selectedPlan.parentPlanTitle || selectedPlan.parentPlanId}) 보기
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-indigo-950 font-medium">
                    {selectedPlan.appliedImprovementNote}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              아직 등록된 계획이 없습니다. 위 폼에서 첫 번째 계획을 세워보세요.
            </div>
          )}
        </section>

        {/* ============================================================
            SECTION 2: DO (할 일 관리 및 실제 실행 기록)
           ============================================================ */}
        {selectedPlan && (
          <section
            ref={tasksSectionRef}
            aria-labelledby="section-do-heading"
            className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                  2. Do
                </span>
                <h2
                  id="section-do-heading"
                  className="text-base sm:text-lg font-bold text-slate-900"
                >
                  할 일 및 실제 실행 기록
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                실행 기록을 여러 번 추가해도 원래 계획과 할 일의 예상 시간은 덮어쓰지 않고 보존됩니다.
              </span>
            </div>

            {/* 할 일 추가 폼 */}
            <form
              onSubmit={handleCreateTask}
              className="border-b border-slate-200 bg-slate-50/40 p-5 space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                새 할 일 추가
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="new-task-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    할 일 제목 (필수)
                  </label>
                  <input
                    id="new-task-title"
                    name="title"
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="예: 데이터베이스 인덱싱 설계 및 쿼리 튜닝"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-task-due"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    마감일 (필수)
                  </label>
                  <input
                    id="new-task-due"
                    name="dueDate"
                    type="date"
                    required
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-task-priority"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    우선순위
                  </label>
                  <select
                    id="new-task-priority"
                    name="priority"
                    value={newTaskPriority}
                    onChange={(e) =>
                      setNewTaskPriority(e.target.value as PriorityType)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="HIGH">높음 (HIGH)</option>
                    <option value="MEDIUM">보통 (MEDIUM)</option>
                    <option value="LOW">낮음 (LOW)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-task-estimated"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    예상 시간 (분)
                  </label>
                  <div className="relative">
                    <input
                      id="new-task-estimated"
                      name="estimatedMinutes"
                      type="number"
                      min={0}
                      step={1}
                      required
                      value={newTaskEstimated}
                      onChange={(e) => setNewTaskEstimated(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-slate-500">
                      분
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-task-tags"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    태그 (쉼표 구분)
                  </label>
                  <input
                    id="new-task-tags"
                    name="tags"
                    type="text"
                    value={newTaskTagsInput}
                    onChange={(e) => setNewTaskTagsInput(e.target.value)}
                    placeholder="예: 설계, 백엔드"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isCreatingTask}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreatingTask ? "추가 중..." : "할 일 추가"}
                </button>
              </div>
            </form>

            {/* 검색 · 필터 · 정렬 결합 컨트롤 바 */}
            <div className="border-b border-slate-200 bg-white p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="task-search-input"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    키워드 검색 (제목 · 태그 · 막혔던 이유)
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="task-search-input"
                      name="searchQuery"
                      type="search"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="검색어 입력..."
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="task-tag-filter"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    태그 필터
                  </label>
                  <select
                    id="task-tag-filter"
                    name="tagFilter"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <option value="ALL">전체 태그</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        #{tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="task-status-filter"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    상태 / 조건 필터
                  </label>
                  <select
                    id="task-status-filter"
                    name="quickFilter"
                    value={quickFilter}
                    onChange={(e) =>
                      setQuickFilter(e.target.value as TaskQuickFilter)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <option value="ALL">전체 할 일</option>
                    <option value="TODO">미완료 (TODO)</option>
                    <option value="DONE">완료됨 (DONE)</option>
                    <option value="DELAYED">지연됨 (미완료 & 마감 경과)</option>
                    <option value="BLOCKED">막힘 기록 있음</option>
                    <option value="HAS_ACTUAL">실행 기록 있음</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="task-sort-select"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    정렬 기준 선택
                  </label>
                  <select
                    id="task-sort-select"
                    name="sortBy"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as TaskSortBy)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium"
                  >
                    <option value="DUE_DATE_ASC">마감일 빠른순</option>
                    <option value="DUE_DATE_DESC">마감일 늦은순</option>
                    <option value="PRIORITY_DESC">우선순위 높은순</option>
                    <option value="PRIORITY_ASC">우선순위 낮은순</option>
                    <option value="ESTIMATED_DESC">예상 시간 많은순</option>
                    <option value="CREATED_ASC">등록순</option>
                  </select>
                </div>
              </div>

              {/* 현재 정렬 기준 및 동률 처리 규칙 명시 */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    <strong>현재 정렬 기준:</strong> {SORT_LABELS[sortBy]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>
                    표시 중: <strong>{displayedTasks.length}건</strong> / 전체{" "}
                    {selectedPlan.tasks.length}건
                  </span>
                  {(searchQuery ||
                    tagFilter !== "ALL" ||
                    statusFilter !== "ALL" ||
                    priorityFilter !== "ALL" ||
                    quickFilter !== "ALL" ||
                    taskPeriodStart ||
                    taskPeriodEnd) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setTagFilter("ALL");
                        setStatusFilter("ALL");
                        setPriorityFilter("ALL");
                        setQuickFilter("ALL");
                        setTaskPeriodStart("");
                        setTaskPeriodEnd("");
                      }}
                      className="text-blue-700 underline font-semibold"
                    >
                      필터 초기화
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 할 일 목록 */}
            <div className="divide-y divide-slate-200">
              {displayedTasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  조건에 해당하는 할 일이 없습니다.
                </div>
              ) : (
                displayedTasks.map((task) => {
                  const isDelayed = isTaskDelayedInSeoul(task);
                  const isBlocked = hasNonEmptyBlockReason(task);
                  const actualMinutesSum = getTaskActualMinutesSum(task);
                  const diffMinutes = actualMinutesSum - task.estimatedMinutes;
                  const isExpanded = expandedTaskId === task.id;
                  const isBusy = Boolean(busyTaskIds[task.id]);

                  return (
                    <div
                      key={task.id}
                      className={`p-5 transition-colors ${
                        task.status === "DONE" ? "bg-slate-50/60" : "bg-white"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleTaskCompletion(task)}
                            aria-label={
                              task.status === "DONE"
                                ? `${task.title} 완료 취소`
                                : `${task.title} 완료 처리`
                            }
                            className="mt-0.5 text-slate-600 hover:text-emerald-600 disabled:opacity-50"
                          >
                            {task.status === "DONE" ? (
                              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                            ) : (
                              <Circle className="w-6 h-6 text-slate-400" />
                            )}
                          </button>

                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-base font-bold ${
                                  task.status === "DONE"
                                    ? "line-through text-slate-500"
                                    : "text-slate-900"
                                }`}
                              >
                                {task.title}
                              </span>

                              <span
                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${
                                  PRIORITY_BADGE_STYLES[task.priority]
                                }`}
                              >
                                {PRIORITY_LABELS[task.priority]}
                              </span>

                              {task.status === "DONE" && (
                                <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                  완료됨 (DONE)
                                </span>
                              )}

                              {isDelayed && (
                                <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                                  <AlertTriangle className="w-3 h-3" />
                                  지연 (서울 기준 오늘 이전 마감)
                                </span>
                              )}

                              {isBlocked && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                  막힘 사유 있음
                                </span>
                              )}

                              <span className="text-[11px] font-mono text-slate-400">
                                ID: {task.id} · 상태버전 v{task.version}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span>
                                <strong>마감일:</strong> {task.dueDate}
                              </span>
                              <span>
                                <strong>원래 예상 시간:</strong>{" "}
                                {formatMinutesWithUnit(task.estimatedMinutes)}
                              </span>
                              <span>
                                <strong>누적 실제 시간:</strong>{" "}
                                {formatMinutesWithUnit(actualMinutesSum)} (실행 기록{" "}
                                {task.executionLogs.length}건)
                              </span>
                              <span
                                className={
                                  diffMinutes > 0
                                    ? "text-rose-700 font-semibold"
                                    : diffMinutes < 0
                                    ? "text-blue-700 font-semibold"
                                    : "text-slate-600"
                                }
                              >
                                <strong>차이(실제-예상):</strong>{" "}
                                {diffMinutes > 0 ? `+${diffMinutes}분` : `${diffMinutes}분`}
                              </span>
                              {task.completedAt && (
                                <span className="text-emerald-700">
                                  <strong>완료 시각(Asia/Seoul):</strong>{" "}
                                  {formatDateTimeSeoul(task.completedAt)}
                                </span>
                              )}
                            </div>

                            {task.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {task.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 우측 액션 버튼들 */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleTaskCompletion(task)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                              task.status === "DONE"
                                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                            } disabled:opacity-50`}
                          >
                            {task.status === "DONE" ? "완료 취소" : "완료 표시"}
                          </button>

                          <button
                            type="button"
                            onClick={() => openTaskExecutionPanel(task.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            실행 기록 ({task.executionLogs.length})
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditTaskModal(task)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            수정
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteTask(task)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            삭제
                          </button>
                        </div>
                      </div>

                      {/* 확장 패널: 실제 실행 기록 입력 및 조회 */}
                      {isExpanded && (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                          <form
                            onSubmit={(e) => handleAddExecutionLog(e, task)}
                            className="space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-bold text-slate-800">
                                실제 실행 기록 추가 (한 할 일에 여러 건 누적 가능 · 원래 예상 시간 {task.estimatedMinutes}분 유지)
                              </h4>
                              <span className="text-[11px] text-slate-500">
                                시각 기준: Asia/Seoul · 반올림 규칙: 시작~종료 차이를 60초로 나누어 반올림(정수 분)
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label
                                  htmlFor={`log-start-${task.id}`}
                                  className="block text-xs font-semibold text-slate-700 mb-1"
                                >
                                  시작 시각 (Asia/Seoul, 필수)
                                </label>
                                <input
                                  id={`log-start-${task.id}`}
                                  name="startedAt"
                                  type="datetime-local"
                                  required
                                  value={logStartInput}
                                  onChange={(e) =>
                                    handleLogTimeChange(e.target.value, logEndInput)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`log-end-${task.id}`}
                                  className="block text-xs font-semibold text-slate-700 mb-1"
                                >
                                  종료 시각 (Asia/Seoul, 필수)
                                </label>
                                <input
                                  id={`log-end-${task.id}`}
                                  name="endedAt"
                                  type="datetime-local"
                                  required
                                  value={logEndInput}
                                  onChange={(e) =>
                                    handleLogTimeChange(logStartInput, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`log-actual-${task.id}`}
                                  className="block text-xs font-semibold text-slate-700 mb-1"
                                >
                                  실제 소요 시간 (정수 분, 필수)
                                </label>
                                <div className="relative">
                                  <input
                                    id={`log-actual-${task.id}`}
                                    name="actualMinutes"
                                    type="number"
                                    min={0}
                                    step={1}
                                    required
                                    value={logActualMinutesInput}
                                    onChange={(e) =>
                                      setLogActualMinutesInput(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 pr-8 text-xs sm:text-sm"
                                  />
                                  <span className="absolute right-2.5 top-1.5 text-xs text-slate-500">
                                    분
                                  </span>
                                </div>
                              </div>

                              <div>
                                <label
                                  htmlFor={`log-block-${task.id}`}
                                  className="block text-xs font-semibold text-slate-700 mb-1"
                                >
                                  막혔던 이유 (선택)
                                </label>
                                <input
                                  id={`log-block-${task.id}`}
                                  name="blockReason"
                                  type="text"
                                  value={logBlockReasonInput}
                                  onChange={(e) =>
                                    setLogBlockReasonInput(e.target.value)
                                  }
                                  placeholder="예: 외부 API 응답 지연으로 재시도 로직 추가"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end">
                              <button
                                type="submit"
                                disabled={isAddingLog}
                                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isAddingLog ? "기록 저장 중..." : "실행 기록 저장"}
                              </button>
                            </div>
                          </form>

                          {/* 누적된 실행 기록 목록 */}
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-slate-700">
                              저장된 실제 실행 기록 ({task.executionLogs.length}건)
                            </h5>
                            {task.executionLogs.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                아직 등록된 실제 실행 기록이 없습니다. (완료 버튼을 눌러도 가짜 실행 기록은 자동 생성되지 않습니다.)
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {task.executionLogs.map((log, idx) => (
                                  <div
                                    key={log.id}
                                    className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="font-bold text-slate-700">
                                        #{idx + 1}
                                      </span>
                                      <span>
                                        <strong>시작:</strong>{" "}
                                        {formatDateTimeSeoul(log.startedAt)}
                                      </span>
                                      <span>
                                        <strong>종료:</strong>{" "}
                                        {formatDateTimeSeoul(log.endedAt)}
                                      </span>
                                      <span className="font-semibold text-blue-700">
                                        실제 소요: {formatMinutesWithUnit(log.actualMinutes)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {log.blockReason && log.blockReason.trim() ? (
                                        <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-900 font-medium">
                                          막힌 이유: {log.blockReason}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">
                                          막힘 없음
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 완료 이벤트 상태 전이 기록 확인 (일반 실행 기록과 분리) */}
                          {task.completionEvents && task.completionEvents.length > 0 && (
                            <div className="pt-2 border-t border-slate-200">
                              <h5 className="text-[11px] font-bold text-slate-600 mb-1">
                                완료/완료취소 상태 전이 이벤트 로그 (현재 활성 완료 기록:{" "}
                                {
                                  task.completionEvents.filter(
                                    (ev) => ev.isActiveCompletion
                                  ).length
                                }
                                건)
                              </h5>
                              <div className="flex flex-wrap gap-1.5">
                                {task.completionEvents.map((ev) => (
                                  <span
                                    key={ev.id}
                                    className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] border ${
                                      ev.isActiveCompletion
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold"
                                        : "bg-white border-slate-200 text-slate-500"
                                    }`}
                                  >
                                    {ev.action === "COMPLETE" ? "완료" : "완료취소"} (v
                                    {ev.fromVersion}→v{ev.toVersion},{" "}
                                    {formatDateTimeSeoul(ev.occurredAt)})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ============================================================
            SECTION 3: SEE (돌아보기 집계 · 근거 조회 · 다음 계획 연결)
           ============================================================ */}
        {selectedPlan && (
          <section
            aria-labelledby="section-see-heading"
            className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center rounded-md bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
                  3. See
                </span>
                <h2
                  id="section-see-heading"
                  className="text-base sm:text-lg font-bold text-slate-900"
                >
                  돌아보기 집계 및 다음 계획 연결
                </h2>
              </div>

              {/* 조회 기간 선택 컨트롤 */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setReviewFilterType("ALL")}
                    className={`rounded-md px-3 py-1 ${
                      reviewFilterType === "ALL"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    전체 기간 (계획 소속 전체)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFilterType("PERIOD")}
                    className={`rounded-md px-3 py-1 ${
                      reviewFilterType === "PERIOD"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    기간 선택 (마감일 기준)
                  </button>
                </div>

                {reviewFilterType === "PERIOD" && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <label htmlFor="review-period-start" className="sr-only">
                      회고 시작일
                    </label>
                    <input
                      id="review-period-start"
                      name="reviewStartDate"
                      type="date"
                      value={reviewStartDate}
                      onChange={(e) => setReviewStartDate(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                    />
                    <span>~</span>
                    <label htmlFor="review-period-end" className="sr-only">
                      회고 종료일
                    </label>
                    <input
                      id="review-period-end"
                      name="reviewEndDate"
                      type="date"
                      min={reviewStartDate}
                      value={reviewEndDate}
                      onChange={(e) => setReviewEndDate(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 space-y-6">
              {/* 집계 기준 및 기간 밖 실행 기록 포함 안내 */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700 space-y-1">
                <p>
                  <strong>집계 기준 안내:</strong>{" "}
                  {reviewFilterType === "ALL"
                    ? "선택한 계획의 삭제되지 않은 모든 할 일을 대상으로 집계합니다."
                    : `선택한 계획의 삭제되지 않은 할 일 중 마감일(dueDate)이 ${reviewStartDate} ~ ${reviewEndDate}에 포함되는 할 일을 대상으로 집계합니다.`}
                </p>
                <p>
                  <strong>실행 기록 및 시간 합산 규칙:</strong> 대상 할 일에 연결된 실제 실행 기록은 실행 시각이 선택 기간 밖이더라도 해당 할 일의 실제 투입 시간으로 모두 포함하여 합산합니다 (현재 기간 밖 실행 기록:{" "}
                  <strong>{reviewAggregation.metrics.outOfPeriodLogCount}건</strong> / 총 실행 기록:{" "}
                  <strong>{reviewAggregation.metrics.totalLogCount}건</strong>). 한 할 일에 여러 실행 기록이 있어도 할 일 수와 예상 시간은 중복 합산되지 않습니다.
                </p>
              </div>

              {/* 7대 핵심 집계 숫자 카드 (클릭 시 해당 근거 목록으로 이동) */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  아래 집계 숫자를 클릭하면 동일한 조건의 근거 기록 목록으로 바로 이동합니다.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("PLANNED", "ALL")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "PLANNED"
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      계획 수
                    </span>
                    <span className="text-2xl font-extrabold text-slate-900 mt-1 block">
                      {reviewAggregation.metrics.plannedCount}
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        건
                      </span>
                    </span>
                    <span className="text-[11px] text-blue-600 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("COMPLETED", "DONE")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "COMPLETED"
                        ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      완료 수 (DONE)
                    </span>
                    <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                      {reviewAggregation.metrics.completedCount}
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        건
                      </span>
                    </span>
                    <span className="text-[11px] text-emerald-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("DELAYED", "DELAYED")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "DELAYED"
                        ? "border-red-600 bg-red-50/60 ring-2 ring-red-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      지연 수 (서울 기준)
                    </span>
                    <span className="text-2xl font-extrabold text-red-700 mt-1 block">
                      {reviewAggregation.metrics.delayedCount}
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        건
                      </span>
                    </span>
                    <span className="text-[11px] text-red-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("BLOCKED", "BLOCKED")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "BLOCKED"
                        ? "border-amber-600 bg-amber-50/60 ring-2 ring-amber-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      막힘 수 (할 일 기준)
                    </span>
                    <span className="text-2xl font-extrabold text-amber-700 mt-1 block">
                      {reviewAggregation.metrics.blockedCount}
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        건
                      </span>
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("ESTIMATED", "ALL")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "ESTIMATED"
                        ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      예상 시간 합
                    </span>
                    <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                      {reviewAggregation.metrics.estimatedMinutes}
                      <span className="text-xs font-normal text-slate-500 ml-0.5">
                        분
                      </span>
                    </span>
                    <span className="text-[11px] text-indigo-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("ACTUAL", "HAS_ACTUAL")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "ACTUAL"
                        ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      실제 시간 합
                    </span>
                    <span className="text-xl font-extrabold text-blue-700 mt-1 block">
                      {reviewAggregation.metrics.actualMinutes}
                      <span className="text-xs font-normal text-slate-500 ml-0.5">
                        분
                      </span>
                    </span>
                    <span className="text-[11px] text-indigo-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMetricCardClick("DIFF", "ALL")}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      evidenceMetric === "DIFF"
                        ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-500 block">
                      차이 (실제 - 예상)
                    </span>
                    <span
                      className={`text-xl font-extrabold mt-1 block ${
                        reviewAggregation.metrics.diffMinutes > 0
                          ? "text-rose-700"
                          : reviewAggregation.metrics.diffMinutes < 0
                          ? "text-blue-700"
                          : "text-slate-900"
                      }`}
                    >
                      {reviewAggregation.metrics.diffMinutes > 0
                        ? `+${reviewAggregation.metrics.diffMinutes}`
                        : reviewAggregation.metrics.diffMinutes}
                      <span className="text-xs font-normal text-slate-500 ml-0.5">
                        분
                      </span>
                    </span>
                    <span className="text-[11px] text-purple-700 font-medium mt-1 block">
                      근거 보기 →
                    </span>
                  </button>
                </div>
              </div>

              {/* 선택한 집계 숫자의 근거 목록 표시 영역 */}
              <div
                ref={evidenceSectionRef}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-700" />
                    <h3 className="text-sm font-bold text-slate-900">
                      {evidenceMetric === "PLANNED" &&
                        `계획 수 근거 목록 (${reviewAggregation.evidence.plannedTasks.length}건)`}
                      {evidenceMetric === "COMPLETED" &&
                        `완료 수 근거 목록 (${reviewAggregation.evidence.completedTasks.length}건)`}
                      {evidenceMetric === "DELAYED" &&
                        `지연 수 근거 목록 — 미완료 & 서울 오늘(${reviewAggregation.referenceSeoulToday}) 이전 마감 (${reviewAggregation.evidence.delayedTasks.length}건)`}
                      {evidenceMetric === "BLOCKED" &&
                        `막힘 수 근거 목록 — 공백 아닌 막힌 이유가 기록된 할 일 (${reviewAggregation.evidence.blockedTasks.length}건)`}
                      {evidenceMetric === "ESTIMATED" &&
                        `예상 시간 합계(${reviewAggregation.metrics.estimatedMinutes}분) 할 일별 산출 근거`}
                      {evidenceMetric === "ACTUAL" &&
                        `실제 시간 합계(${reviewAggregation.metrics.actualMinutes}분) 할 일 및 실행 기록별 산출 근거`}
                      {evidenceMetric === "DIFF" &&
                        `시간 차이(${reviewAggregation.metrics.diffMinutes}분 = 실제 ${reviewAggregation.metrics.actualMinutes}분 - 예상 ${reviewAggregation.metrics.estimatedMinutes}분) 산출 근거`}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={scrollToTasksWithCurrentEvidenceFilter}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    상단 할 일 목록(필터 동기화됨)으로 스크롤 ↑
                  </button>
                </div>

                {(() => {
                  const targetEvidenceList =
                    evidenceMetric === "COMPLETED"
                      ? reviewAggregation.evidence.completedTasks
                      : evidenceMetric === "DELAYED"
                      ? reviewAggregation.evidence.delayedTasks
                      : evidenceMetric === "BLOCKED"
                      ? reviewAggregation.evidence.blockedTasks
                      : reviewAggregation.evidence.plannedTasks;

                  if (targetEvidenceList.length === 0) {
                    return (
                      <p className="text-xs text-slate-500 py-2">
                        해당 집계 항목의 근거에 해당하는 할 일이 없습니다 (집계 값: 0).
                      </p>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs bg-white rounded-lg overflow-hidden border border-slate-200">
                        <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 font-semibold">할 일 제목</th>
                            <th className="py-2 px-3 font-semibold">상태</th>
                            <th className="py-2 px-3 font-semibold">마감일</th>
                            <th className="py-2 px-3 font-semibold">예상 시간(분)</th>
                            <th className="py-2 px-3 font-semibold">실제 시간(분)</th>
                            <th className="py-2 px-3 font-semibold">차이(분)</th>
                            <th className="py-2 px-3 font-semibold">막혔던 이유 / 실행 기록</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {targetEvidenceList.map((t) => {
                            const act = getTaskActualMinutesSum(t);
                            const diff = act - t.estimatedMinutes;
                            const blocks = t.executionLogs
                              .map((l) => l.blockReason?.trim())
                              .filter(Boolean);
                            return (
                              <tr key={t.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-medium text-slate-900">
                                  {t.title}
                                </td>
                                <td className="py-2 px-3">
                                  {t.status === "DONE" ? (
                                    <span className="text-emerald-700 font-semibold">
                                      완료(DONE)
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">
                                      미완료(TODO)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3">{t.dueDate}</td>
                                <td className="py-2 px-3">{t.estimatedMinutes}분</td>
                                <td className="py-2 px-3 font-semibold text-blue-700">
                                  {act}분 ({t.executionLogs.length}회)
                                </td>
                                <td
                                  className={`py-2 px-3 font-semibold ${
                                    diff > 0
                                      ? "text-rose-700"
                                      : diff < 0
                                      ? "text-blue-700"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {diff > 0 ? `+${diff}분` : `${diff}분`}
                                </td>
                                <td className="py-2 px-3">
                                  {blocks.length > 0 ? (
                                    <span className="text-amber-900 font-medium">
                                      {blocks.join(" / ")} (총 {blocks.length}건 기록 → 막힘 할 일 1건 집계)
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* 돌아보기 및 개선점 한 줄 저장 폼 */}
              <form
                onSubmit={handleSaveReview}
                className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  이번 돌아보기 기록 및 개선점 한 줄 남기기
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="review-reflection-note"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      돌아보기 메모 (선택)
                    </label>
                    <input
                      id="review-reflection-note"
                      name="reflectionNote"
                      type="text"
                      value={reflectionNoteInput}
                      onChange={(e) => setReflectionNoteInput(e.target.value)}
                      placeholder="예: 초기 환경 구축과 외부 연동에서 예상보다 40분 더 소요됨"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="review-improvement-note"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      다음 계획에 반영할 개선점 한 줄 (필수)
                    </label>
                    <input
                      id="review-improvement-note"
                      name="improvementNote"
                      type="text"
                      required
                      value={improvementNoteInput}
                      onChange={(e) => setImprovementNoteInput(e.target.value)}
                      placeholder="예: 외부 API 연동 작업은 예상 시간에 버퍼 30분을 미리 배정하기"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingReview}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isSavingReview ? "저장 중..." : "돌아보기 및 개선점 저장"}
                  </button>
                </div>
              </form>

              {/* 저장된 돌아보기 목록 및 [다음 계획 만들기] */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800">
                  저장된 돌아보기 이력 ({selectedPlan.reviews.length}건)
                </h3>
                {selectedPlan.reviews.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    아직 저장된 돌아보기 기록이 없습니다. 위에서 개선점 한 줄을 저장한 뒤 다음 계획을 만들어 보세요.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedPlan.reviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-purple-100 px-2 py-0.5 font-bold text-purple-900">
                              {rev.filterType === "ALL"
                                ? "전체 기간 회고"
                                : `선택 기간 (${rev.periodStartDate} ~ ${rev.periodEndDate})`}
                            </span>
                            <span className="text-slate-500">
                              저장 시각: {formatDateTimeSeoul(rev.createdAt)}
                            </span>
                            <span className="font-mono text-slate-400">
                              Review ID: {rev.id}
                            </span>
                          </div>

                          <p className="text-sm font-bold text-slate-900 pt-1">
                            개선점 한 줄: {rev.improvementNote}
                          </p>
                          {rev.reflectionNote && (
                            <p className="text-slate-600">
                              회고 메모: {rev.reflectionNote}
                            </p>
                          )}

                          <p className="text-slate-500">
                            저장 시점 집계: 계획 {rev.snapshotPlannedCount}건 · 완료{" "}
                            {rev.snapshotCompletedCount}건 · 지연{" "}
                            {rev.snapshotDelayedCount}건 · 막힘{" "}
                            {rev.snapshotBlockedCount}건 · 예상{" "}
                            {rev.snapshotEstimatedMinutes}분 · 실제{" "}
                            {rev.snapshotActualMinutes}분 (차이{" "}
                            {rev.snapshotDiffMinutes > 0
                              ? `+${rev.snapshotDiffMinutes}`
                              : rev.snapshotDiffMinutes}
                            분)
                          </p>
                        </div>

                        <div className="shrink-0">
                          {rev.nextPlanId ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPlanId(rev.nextPlanId!)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                            >
                              <ArrowRight className="w-4 h-4" />
                              연결된 다음 계획({rev.nextPlanTitle || rev.nextPlanId})으로 이동
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openNextPlanModal(rev)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              <Sparkles className="w-4 h-4" />
                              다음 계획 만들기
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ============================================================
          MODAL 1: 계획 수정 (<dialog>)
         ============================================================ */}
      <dialog
        ref={editPlanDialogRef}
        aria-labelledby="edit-plan-dialog-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <form onSubmit={handleUpdatePlan} className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2
              id="edit-plan-dialog-title"
              className="text-base font-bold text-slate-900"
            >
              계획 수정 (현재 v{selectedPlan?.version} → v
              {(selectedPlan?.version ?? 1) + 1} 스냅샷 추가)
            </h2>
            <button
              type="button"
              onClick={() => editPlanDialogRef.current?.close()}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              닫기 (Esc)
            </button>
          </div>

          <p className="text-xs text-slate-600">
            계획을 수정해도 Plan ID({selectedPlan?.id})는 유지되며, 최초 계획과 이전 버전 스냅샷은 수정·삭제되지 않고 그대로 보존됩니다.
          </p>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="edit-plan-title"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                계획 제목 (필수)
              </label>
              <input
                id="edit-plan-title"
                name="title"
                type="text"
                required
                autoFocus
                value={editPlanTitle}
                onChange={(e) => setEditPlanTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="edit-plan-start"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  시작일 (필수)
                </label>
                <input
                  id="edit-plan-start"
                  name="startDate"
                  type="date"
                  required
                  value={editPlanStart}
                  onChange={(e) => setEditPlanStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-plan-end"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  종료일 (필수)
                </label>
                <input
                  id="edit-plan-end"
                  name="endDate"
                  type="date"
                  required
                  min={editPlanStart}
                  value={editPlanEnd}
                  onChange={(e) => setEditPlanEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="edit-plan-priority"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  우선순위
                </label>
                <select
                  id="edit-plan-priority"
                  name="priority"
                  value={editPlanPriority}
                  onChange={(e) =>
                    setEditPlanPriority(e.target.value as PriorityType)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="HIGH">높음 (HIGH)</option>
                  <option value="MEDIUM">보통 (MEDIUM)</option>
                  <option value="LOW">낮음 (LOW)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="edit-plan-estimated"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  예상 시간 (정수 분)
                </label>
                <input
                  id="edit-plan-estimated"
                  name="estimatedMinutes"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={editPlanEstimated}
                  onChange={(e) => setEditPlanEstimated(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-plan-criteria"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                성공 기준 (필수)
              </label>
              <textarea
                id="edit-plan-criteria"
                name="successCriteria"
                required
                rows={2}
                value={editPlanCriteria}
                onChange={(e) => setEditPlanCriteria(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="edit-plan-improvement"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                적용된 개선점 한 줄 (선택 · 성공 기준과 별도 항목)
              </label>
              <input
                id="edit-plan-improvement"
                name="appliedImprovementNote"
                type="text"
                value={editPlanImprovement}
                onChange={(e) => setEditPlanImprovement(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => editPlanDialogRef.current?.close()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isUpdatingPlan}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdatingPlan ? "저장 중..." : "수정 사항 및 새 버전 스냅샷 저장"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ============================================================
          MODAL 2: 계획 버전 스냅샷 이력 조회 (<dialog>)
         ============================================================ */}
      <dialog
        ref={historyDialogRef}
        aria-labelledby="history-dialog-title"
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2
                id="history-dialog-title"
                className="text-base font-bold text-slate-900"
              >
                계획 버전 스냅샷 이력 (Plan ID: {selectedPlan?.id})
              </h2>
              <p className="text-xs text-slate-500">
                최초 생성(v1)부터 모든 수정 상태가 삭제 없이 시간순으로 보존됩니다.
              </p>
            </div>
            <form method="dialog">
              <button
                type="submit"
                autoFocus
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </form>
          </div>

          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            {selectedPlan?.snapshots.map((snap) => (
              <div
                key={snap.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    버전 v{snap.version}{" "}
                    {snap.version === 1
                      ? "(최초 수립 계획)"
                      : `(${snap.version - 1}차 수정본)`}
                  </span>
                  <span className="text-slate-500">
                    기록 시각(Asia/Seoul): {formatDateTimeSeoul(snap.changedAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-800">
                  <div>
                    <strong>제목:</strong> {snap.title}
                  </div>
                  <div>
                    <strong>기간:</strong> {snap.startDate} ~ {snap.endDate}
                  </div>
                  <div>
                    <strong>우선순위:</strong> {PRIORITY_LABELS[snap.priority]}
                  </div>
                  <div>
                    <strong>예상 시간:</strong>{" "}
                    {formatMinutesWithUnit(snap.estimatedMinutes)}
                  </div>
                  <div className="sm:col-span-2">
                    <strong>성공 기준:</strong> {snap.successCriteria}
                  </div>
                  {snap.appliedImprovementNote && (
                    <div className="sm:col-span-2 text-indigo-800">
                      <strong>보존된 개선점 항목:</strong>{" "}
                      {snap.appliedImprovementNote}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </dialog>

      {/* ============================================================
          MODAL 3: 할 일 수정 (<dialog>)
         ============================================================ */}
      <dialog
        ref={editTaskDialogRef}
        aria-labelledby="edit-task-dialog-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <form onSubmit={handleSaveTaskEdit} className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2
              id="edit-task-dialog-title"
              className="text-base font-bold text-slate-900"
            >
              할 일 수정
            </h2>
            <button
              type="button"
              onClick={() => editTaskDialogRef.current?.close()}
              className="text-xs font-medium text-slate-500"
            >
              닫기
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="edit-task-title"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                할 일 제목 (필수)
              </label>
              <input
                id="edit-task-title"
                name="title"
                type="text"
                required
                autoFocus
                value={editTaskTitle}
                onChange={(e) => setEditTaskTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="edit-task-due"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  마감일 (필수)
                </label>
                <input
                  id="edit-task-due"
                  name="dueDate"
                  type="date"
                  required
                  value={editTaskDueDate}
                  onChange={(e) => setEditTaskDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-task-priority"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  우선순위
                </label>
                <select
                  id="edit-task-priority"
                  name="priority"
                  value={editTaskPriority}
                  onChange={(e) =>
                    setEditTaskPriority(e.target.value as PriorityType)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="HIGH">높음 (HIGH)</option>
                  <option value="MEDIUM">보통 (MEDIUM)</option>
                  <option value="LOW">낮음 (LOW)</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-task-estimated"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                예상 시간 (정수 분)
              </label>
              <input
                id="edit-task-estimated"
                name="estimatedMinutes"
                type="number"
                min={0}
                step={1}
                required
                value={editTaskEstimated}
                onChange={(e) => setEditTaskEstimated(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="edit-task-tags"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                태그 (쉼표 구분)
              </label>
              <input
                id="edit-task-tags"
                name="tags"
                type="text"
                value={editTaskTags}
                onChange={(e) => setEditTaskTags(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => editTaskDialogRef.current?.close()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSavingTaskEdit}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSavingTaskEdit ? "저장 중..." : "할 일 수정 저장"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ============================================================
          MODAL 4: 돌아보기 개선점으로 다음 계획 만들기 (<dialog>)
         ============================================================ */}
      <dialog
        ref={nextPlanDialogRef}
        aria-labelledby="next-plan-dialog-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <form onSubmit={handleCreateNextPlanFromReview} className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2
              id="next-plan-dialog-title"
              className="text-base font-bold text-slate-900"
            >
              돌아보기 개선점을 반영한 다음 계획 만들기
            </h2>
            <button
              type="button"
              onClick={() => nextPlanDialogRef.current?.close()}
              className="text-xs font-medium text-slate-500"
            >
              닫기
            </button>
          </div>

          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-950 space-y-1">
            <p className="font-bold">
              출처 돌아보기 ID: {activeReviewForNextPlan?.id}
            </p>
            <p>
              아래 개선점 한 줄은 새 계획의 <strong>성공 기준을 덮어쓰지 않고</strong> 별도의{" "}
              <strong>적용된 개선점(appliedImprovementNote)</strong> 항목으로 보존됩니다.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="next-plan-improvement"
                className="block text-xs font-semibold text-indigo-900 mb-1"
              >
                인계할 개선점 한 줄 (필수 · 별도 항목으로 저장)
              </label>
              <input
                id="next-plan-improvement"
                name="improvementNoteOverride"
                type="text"
                required
                value={nextPlanImprovement}
                onChange={(e) => setNextPlanImprovement(e.target.value)}
                className="w-full rounded-lg border border-indigo-300 bg-indigo-50/40 px-3 py-2 text-sm font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="next-plan-title"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                다음 계획 제목 (필수)
              </label>
              <input
                id="next-plan-title"
                name="title"
                type="text"
                required
                autoFocus
                value={nextPlanTitle}
                onChange={(e) => setNextPlanTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="next-plan-start"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  시작일 (필수)
                </label>
                <input
                  id="next-plan-start"
                  name="startDate"
                  type="date"
                  required
                  value={nextPlanStart}
                  onChange={(e) => setNextPlanStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="next-plan-end"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  종료일 (필수)
                </label>
                <input
                  id="next-plan-end"
                  name="endDate"
                  type="date"
                  required
                  min={nextPlanStart}
                  value={nextPlanEnd}
                  onChange={(e) => setNextPlanEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="next-plan-priority"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  우선순위
                </label>
                <select
                  id="next-plan-priority"
                  name="priority"
                  value={nextPlanPriority}
                  onChange={(e) =>
                    setNextPlanPriority(e.target.value as PriorityType)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="HIGH">높음 (HIGH)</option>
                  <option value="MEDIUM">보통 (MEDIUM)</option>
                  <option value="LOW">낮음 (LOW)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="next-plan-estimated"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  예상 시간 (정수 분)
                </label>
                <input
                  id="next-plan-estimated"
                  name="estimatedMinutes"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={nextPlanEstimated}
                  onChange={(e) => setNextPlanEstimated(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="next-plan-criteria"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                다음 계획의 성공 기준 (필수 · 개선점과 분리 저장됨)
              </label>
              <input
                id="next-plan-criteria"
                name="successCriteria"
                type="text"
                required
                value={nextPlanCriteria}
                onChange={(e) => setNextPlanCriteria(e.target.value)}
                placeholder="예: 모든 핵심 할 일 마감일 내 100% 완료"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => nextPlanDialogRef.current?.close()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isCreatingNextPlan}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isCreatingNextPlan
                ? "생성 중..."
                : "개선점을 반영한 다음 계획 생성"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
