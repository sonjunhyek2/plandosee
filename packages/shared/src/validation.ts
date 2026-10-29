import { z } from "zod";
import { isValidDateOnlyString, parseSeoulDateTimeInput, calculateActualMinutes } from "./date-seoul";

export const PrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"], {
  errorMap: () => ({ message: "우선순위는 HIGH, MEDIUM, LOW 중 하나여야 합니다." }),
});

export const TaskStatusSchema = z.enum(["TODO", "DONE"], {
  errorMap: () => ({ message: "상태는 TODO 또는 DONE이어야 합니다." }),
});

export const DateOnlyStringSchema = z
  .string()
  .trim()
  .refine(isValidDateOnlyString, {
    message: "날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.",
  });

export const NonNegativeIntMinutesSchema = z
  .number({ invalid_type_error: "시간(분)은 숫자여야 합니다." })
  .int("시간은 정수 '분' 단위여야 합니다.")
  .min(0, "시간(분)은 0 이상이어야 합니다 (음수 불가).")
  .max(525600, "시간(분)이 허용 범위를 초과했습니다.");

export const CreatePlanSchema = z
  .object({
    title: z.string().trim().min(1, "계획 제목은 필수입니다.").max(200, "계획 제목은 200자 이내여야 합니다."),
    startDate: DateOnlyStringSchema,
    endDate: DateOnlyStringSchema,
    priority: PrioritySchema.default("MEDIUM"),
    successCriteria: z.string().trim().min(1, "성공 기준은 필수입니다.").max(2000, "성공 기준은 2000자 이내여야 합니다."),
    estimatedMinutes: NonNegativeIntMinutesSchema,
    appliedImprovementNote: z.string().trim().max(1000).optional().nullable(),
    parentPlanId: z.string().trim().min(1).optional().nullable(),
    sourceReviewId: z.string().trim().min(1).optional().nullable(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "계획 종료일은 시작일보다 앞설 수 없습니다.",
    path: ["endDate"],
  });

export const UpdatePlanSchema = z
  .object({
    planId: z.string().trim().min(1, "계획 ID는 필수입니다."),
    expectedVersion: z.number().int().min(1, "현재 버전 번호는 1 이상의 정수여야 합니다."),
    title: z.string().trim().min(1, "계획 제목은 필수입니다.").max(200, "계획 제목은 200자 이내여야 합니다."),
    startDate: DateOnlyStringSchema,
    endDate: DateOnlyStringSchema,
    priority: PrioritySchema,
    successCriteria: z.string().trim().min(1, "성공 기준은 필수입니다.").max(2000, "성공 기준은 2000자 이내여야 합니다."),
    estimatedMinutes: NonNegativeIntMinutesSchema,
    appliedImprovementNote: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "계획 종료일은 시작일보다 앞설 수 없습니다.",
    path: ["endDate"],
  });

export const CreateTaskSchema = z.object({
  planId: z.string().trim().min(1, "소속 계획 ID는 필수입니다."),
  title: z.string().trim().min(1, "할 일 제목은 필수입니다.").max(200, "할 일 제목은 200자 이내여야 합니다."),
  dueDate: DateOnlyStringSchema,
  priority: PrioritySchema.default("MEDIUM"),
  tags: z
    .array(z.string().trim())
    .default([])
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    ),
  estimatedMinutes: NonNegativeIntMinutesSchema,
});

export const UpdateTaskSchema = z.object({
  taskId: z.string().trim().min(1, "할 일 ID는 필수입니다."),
  title: z.string().trim().min(1, "할 일 제목은 필수입니다.").max(200, "할 일 제목은 200자 이내여야 합니다."),
  dueDate: DateOnlyStringSchema,
  priority: PrioritySchema,
  tags: z
    .array(z.string().trim())
    .default([])
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    ),
  estimatedMinutes: NonNegativeIntMinutesSchema,
});

export const CreateExecutionLogInputSchema = z
  .object({
    taskId: z.string().trim().min(1, "할 일 ID는 필수입니다."),
    startedAt: z.string().trim().min(1, "시작 시각은 필수입니다."),
    endedAt: z.string().trim().min(1, "종료 시각은 필수입니다."),
    actualMinutes: NonNegativeIntMinutesSchema.optional(),
    blockReason: z.string().max(1000, "막혔던 이유는 1000자 이내여야 합니다.").optional().nullable(),
  })
  .superRefine((data, ctx) => {
    let start: Date;
    let end: Date;
    try {
      start = parseSeoulDateTimeInput(data.startedAt);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : "유효하지 않은 시작 시각입니다.",
        path: ["startedAt"],
      });
      return;
    }
    try {
      end = parseSeoulDateTimeInput(data.endedAt);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : "유효하지 않은 종료 시각입니다.",
        path: ["endedAt"],
      });
      return;
    }
    if (end.getTime() < start.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "종료 시각은 시작 시각보다 빠를 수 없습니다.",
        path: ["endedAt"],
      });
    }
    if (data.actualMinutes !== undefined && data.actualMinutes < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "실제 소요 시간(분)은 0 이상이어야 합니다.",
        path: ["actualMinutes"],
      });
    }
  })
  .transform((data) => {
    const startedAtDate = parseSeoulDateTimeInput(data.startedAt);
    const endedAtDate = parseSeoulDateTimeInput(data.endedAt);
    const computedMinutes =
      data.actualMinutes !== undefined
        ? data.actualMinutes
        : calculateActualMinutes(startedAtDate, endedAtDate);
    const normalizedBlockReason =
      data.blockReason && data.blockReason.trim().length > 0
        ? data.blockReason.trim()
        : null;
    return {
      taskId: data.taskId,
      startedAtDate,
      endedAtDate,
      actualMinutes: computedMinutes,
      blockReason: normalizedBlockReason,
    };
  });

export const CompleteTaskSchema = z.object({
  taskId: z.string().trim().min(1, "할 일 ID는 필수입니다."),
  requestId: z.string().trim().min(1, "완료 요청 식별자(requestId)는 필수입니다.").max(120),
  expectedVersion: z.number().int().min(1, "현재 버전(expectedVersion)은 1 이상의 정수여야 합니다."),
  optionalExecutionLog: z
    .object({
      startedAt: z.string().trim().min(1),
      endedAt: z.string().trim().min(1),
      actualMinutes: NonNegativeIntMinutesSchema.optional(),
      blockReason: z.string().max(1000).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const UncompleteTaskSchema = z.object({
  taskId: z.string().trim().min(1, "할 일 ID는 필수입니다."),
  requestId: z.string().trim().min(1, "완료 취소 요청 식별자(requestId)는 필수입니다.").max(120),
  expectedVersion: z.number().int().min(1, "현재 버전(expectedVersion)은 1 이상의 정수여야 합니다."),
});

export const CreateReviewSchema = z
  .object({
    planId: z.string().trim().min(1, "대상 계획 ID는 필수입니다."),
    filterType: z.enum(["ALL", "PERIOD"]).default("ALL"),
    periodStartDate: DateOnlyStringSchema.optional().nullable(),
    periodEndDate: DateOnlyStringSchema.optional().nullable(),
    reflectionNote: z.string().trim().max(2000).default(""),
    improvementNote: z.string().trim().min(1, "개선점 한 줄은 필수입니다.").max(500, "개선점은 500자 이내여야 합니다."),
  })
  .superRefine((data, ctx) => {
    if (data.filterType === "PERIOD") {
      if (!data.periodStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "선택 기간 조회 시 시작일은 필수입니다.",
          path: ["periodStartDate"],
        });
      }
      if (!data.periodEndDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "선택 기간 조회 시 종료일은 필수입니다.",
          path: ["periodEndDate"],
        });
      }
      if (data.periodStartDate && data.periodEndDate && data.periodEndDate < data.periodStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "회고 종료일은 시작일보다 앞설 수 없습니다.",
          path: ["periodEndDate"],
        });
      }
    }
  });

export const CreateNextPlanFromReviewSchema = z
  .object({
    reviewId: z.string().trim().min(1, "돌아보기(Review) ID는 필수입니다."),
    title: z.string().trim().min(1, "다음 계획 제목은 필수입니다.").max(200),
    startDate: DateOnlyStringSchema,
    endDate: DateOnlyStringSchema,
    priority: PrioritySchema.default("MEDIUM"),
    successCriteria: z.string().trim().min(1, "다음 계획의 성공 기준은 필수입니다.").max(2000),
    estimatedMinutes: NonNegativeIntMinutesSchema,
    improvementNoteOverride: z.string().trim().min(1).max(500).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "다음 계획의 종료일은 시작일보다 앞설 수 없습니다.",
    path: ["endDate"],
  });

