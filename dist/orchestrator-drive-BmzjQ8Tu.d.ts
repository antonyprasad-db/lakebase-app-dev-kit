/** The design-lane roles, in the order a story flows through them. */
type DesignRole = "spec-author" | "architect-reviewer" | "dba" | "test-strategist";
/** The single next design-lane action. A later phase maps each to an effect. */
type DriveAction = {
    kind: "invoke-role";
    role: "spec-author";
    mode: "breakdown";
} | {
    kind: "invoke-role";
    role: "ux-designer";
} | {
    kind: "invoke-role";
    role: DesignRole;
    story: string;
} | {
    kind: "invoke-role";
    role: "navigator";
    story: string;
    buildMode: "reflect";
} | {
    kind: "project-architect-notes";
    story: string;
} | {
    kind: "surface-gate";
    story: string;
} | {
    kind: "approve-gate";
    story: string;
} | {
    kind: "design-complete";
};
type WorkflowAction = DriveAction | {
    kind: "invoke-role";
    role: "spec-author";
    mode: "propose";
} | {
    kind: "invoke-role";
    role: "architect-reviewer";
    mode: "estimate";
} | {
    kind: "invoke-role";
    role: "architect-reviewer";
    mode: "estimate-committed";
} | {
    kind: "invoke-role";
    role: "product-owner";
    mode: "author-requests";
} | {
    kind: "approve-plan-gate";
} | {
    kind: "planning-complete";
} | {
    kind: "dispatch";
    story: string;
} | {
    kind: "cut-experiment";
    story: string;
    resetStaleBranch?: boolean;
} | {
    kind: "invoke-role";
    role: "navigator" | "driver";
    story: string;
    buildMode?: "review" | "refactor" | "assess" | "repair" | "assess-deploy" | "refactor-deploy" | "assess-refactor" | "refactor-superseded" | "green-superseded";
    ac?: string;
} | {
    kind: "deploy-verify-heal";
    role: "navigator" | "driver";
    mode: "assess-deploy" | "refactor-deploy";
} | {
    kind: "await-acceptance";
    story: string;
} | {
    kind: "accept";
    story: string;
} | {
    kind: "complete";
    story: string;
} | {
    kind: "feature-complete";
} | {
    kind: "deploy";
} | {
    kind: "approve-deploy-gate";
} | {
    kind: "deploy-complete";
} | {
    kind: "prepare-pr";
} | {
    kind: "wait-ci";
} | {
    kind: "approve-promote-gate";
} | {
    kind: "merge";
} | {
    kind: "raise-to-hil";
    reason: string;
    source: string;
    story?: string;
} | {
    kind: "revise-route";
    story: string;
    role: "spec-author" | "test-strategist" | "architect-reviewer";
    gate: "spec" | "test_list" | "architecture";
    reason: string;
    source: string;
} | {
    kind: "done";
};

export type { WorkflowAction as W };
