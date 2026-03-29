// ─── Record Type (Activity Definition) ───────────────────────────────────────
export interface RecordType {
    id: string;
    name: string;
    color: string;   // hex e.g. "#ef4444"
    icon: string;    // lucide icon name e.g. "Code", "Coffee", "Dumbbell"
}

// ─── Record (Completed Session) ───────────────────────────────────────────────
export interface Record {
    id: string;
    recordTypeId: string;
    startTime: string;   // ISO 8601
    endTime: string;     // ISO 8601
    duration: number;    // seconds
}

// ─── Running Record (Active Session) ─────────────────────────────────────────
export interface RunningRecord {
    id: string;
    recordTypeId: string;
    startTime: string;   // ISO 8601
}

// ─── App State ────────────────────────────────────────────────────────────────
export interface AppState {
    recordTypes: RecordType[];
    records: Record[];
    runningRecord: RunningRecord | null;
}
