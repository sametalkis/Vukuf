import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { RecordType, Record, RunningRecord } from '../types';
import { DEFAULT_ACCENT_COLOR, applyAccentColor } from '../utils/accentColor';
import { idbStorage } from '../utils/idbStorage';

// ─── Helper ───────────────────────────────────────────────────────────────────
function now() {
    return new Date().toISOString();
}

function durationSeconds(start: string, end: string): number {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

// ─── Store Interface ──────────────────────────────────────────────────────────
interface TimeTrackerStore {
    // State
    recordTypes: RecordType[];
    records: Record[];
    runningRecord: RunningRecord | null;
    showUntrackedTime: boolean;
    accentColor: string;

    // Notification settings
    notificationsEnabled: boolean;
    notificationMinutes: number;
    notificationRepeat: boolean;
    notificationSound: boolean;

    // RecordType actions
    addRecordType: (data: Omit<RecordType, 'id'>) => void;
    updateRecordType: (id: string, data: Partial<Omit<RecordType, 'id'>>) => void;
    deleteRecordType: (id: string) => void;

    // Timer actions
    startTimer: (recordTypeId: string) => void;
    stopTimer: () => void;

    // Record actions
    updateRecord: (id: string, data: Partial<Omit<Record, 'id'>>) => void;
    deleteRecord: (id: string) => void;

    // Data management
    importData: (json: string) => void;
    importCSV: (csv: string) => { imported: number; skipped: number };
    importBackup: (text: string) => { imported: number; activities: number; skipped: number };
    clearAllData: () => void;

    // Settings actions
    toggleUntrackedTime: () => void;
    setAccentColor: (color: string) => void;
    toggleNotifications: () => void;
    setNotificationMinutes: (mins: number) => void;
    toggleNotificationRepeat: () => void;
    toggleNotificationSound: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useStore = create<TimeTrackerStore>()(
    persist(
        (set, get) => ({
            recordTypes: [],
            records: [],
            runningRecord: null,
            showUntrackedTime: true,
            accentColor: DEFAULT_ACCENT_COLOR,
            notificationsEnabled: false,
            notificationMinutes: 30,
            notificationRepeat: true,
            notificationSound: true,

            // ── RecordType CRUD ──
            addRecordType: (data) => {
                const newType: RecordType = { id: uuidv4(), ...data };
                set((s) => ({ recordTypes: [...s.recordTypes, newType] }));
            },

            updateRecordType: (id, data) => {
                set((s) => ({
                    recordTypes: s.recordTypes.map((rt) =>
                        rt.id === id ? { ...rt, ...data } : rt
                    ),
                }));
            },

            deleteRecordType: (id) => {
                set((s) => ({
                    recordTypes: s.recordTypes.filter((rt) => rt.id !== id),
                    // Also remove all records for this type
                    records: s.records.filter((r) => r.recordTypeId !== id),
                    // Stop running record if it was this type
                    runningRecord:
                        s.runningRecord?.recordTypeId === id ? null : s.runningRecord,
                }));
            },

            // ── Timer ──
            startTimer: (recordTypeId) => {
                const { runningRecord } = get();
                const startTime = now();

                // If something is already running, stop it first
                if (runningRecord) {
                    const endTime = startTime;
                    const duration = durationSeconds(runningRecord.startTime, endTime);
                    if (runningRecord.recordTypeId !== 'untracked' || duration >= 60) {
                        if (duration > 0 || runningRecord.recordTypeId !== 'untracked') {
                            const completedRecord: Record = {
                                id: uuidv4(),
                                recordTypeId: runningRecord.recordTypeId,
                                startTime: runningRecord.startTime,
                                endTime,
                                duration,
                            };
                            set((s) => ({ records: [...s.records, completedRecord] }));
                        }
                    }
                }

                // Start the new timer
                const newRunning: RunningRecord = {
                    id: uuidv4(),
                    recordTypeId,
                    startTime,
                };
                set({ runningRecord: newRunning });
            },

            stopTimer: () => {
                const { runningRecord, showUntrackedTime } = get();
                if (!runningRecord) return;

                const endTime = now();
                const duration = durationSeconds(runningRecord.startTime, endTime);

                let updatedRecords = [...get().records];
                if (runningRecord.recordTypeId !== 'untracked' || duration >= 60) {
                    if (duration > 0 || runningRecord.recordTypeId !== 'untracked') {
                        const completedRecord: Record = {
                            id: uuidv4(),
                            recordTypeId: runningRecord.recordTypeId,
                            startTime: runningRecord.startTime,
                            endTime,
                            duration,
                        };
                        updatedRecords.push(completedRecord);
                    }
                }

                let newRunning = null;
                if (showUntrackedTime && runningRecord.recordTypeId !== 'untracked') {
                    newRunning = { id: uuidv4(), recordTypeId: 'untracked', startTime: endTime };
                }

                set({ records: updatedRecords, runningRecord: newRunning });
            },

            // ── Record CRUD ──
            updateRecord: (id, data) => {
                set((s) => {
                    if (s.runningRecord?.id === id) {
                        return { runningRecord: { ...s.runningRecord, ...data } };
                    }
                    const exists = s.records.some((r) => r.id === id);
                    if (!exists && id.startsWith('untracked-')) {
                        const newRecord: Record = {
                            id: uuidv4(),
                            recordTypeId: data.recordTypeId || s.recordTypes[0]?.id || 'untracked',
                            startTime: data.startTime || now(),
                            endTime: data.endTime || now(),
                            duration: durationSeconds(data.startTime || now(), data.endTime || now()),
                        };
                        return { records: [...s.records, newRecord] };
                    }
                    return {
                        records: s.records.map((r) => {
                            if (r.id !== id) return r;
                            const updated = { ...r, ...data };
                            if (data.startTime || data.endTime) {
                                updated.duration = durationSeconds(updated.startTime, updated.endTime!);
                            }
                            return updated;
                        }),
                    };
                });
            },

            deleteRecord: (id) => {
                set((s) => {
                    if (s.runningRecord?.id === id) {
                        return { runningRecord: null };
                    }
                    return { records: s.records.filter((r) => r.id !== id) };
                });
            },

            // ── Data Management ──
            importData: (json) => {
                try {
                    const parsed = JSON.parse(json);
                    if (parsed.recordTypes && parsed.records !== undefined) {
                        set({
                            recordTypes: parsed.recordTypes,
                            records: parsed.records,
                            runningRecord: parsed.runningRecord ?? null,
                        });
                    }
                } catch {
                    console.error('Invalid import JSON');
                }
            },

            importCSV: (csv) => {
                // Palette for auto-assigned colors
                const PALETTE = [
                    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
                    '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
                    '#a855f7', '#ec4899', '#f43f5e', '#14b8a6', '#0ea5e9',
                ];
                let colorIdx = 0;

                // Parse "YYYY-MM-DD HH:mm:ss" → ISO string
                const parseDate = (s: string): string => {
                    // replace space separator with T for ISO compatibility
                    return new Date(s.trim().replace(' ', 'T')).toISOString();
                };

                const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) return { imported: 0, skipped: 0 };

                // Parse header to find column indices
                const headerRaw = lines[0];
                const headers = headerRaw.split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
                const colName = headers.indexOf('activity name');
                const colStart = headers.indexOf('time started');
                const colEnd = headers.indexOf('time ended');

                if (colName === -1 || colStart === -1 || colEnd === -1) {
                    return { imported: 0, skipped: 0 };
                }

                const { recordTypes: existingTypes, records: existingRecords } = get();

                // Build mutable maps from existing state
                const typeMapByName = new Map(existingTypes.map(rt => [rt.name.toLowerCase(), rt]));
                const newTypes: RecordType[] = [];
                const newRecords: Record[] = [];
                let skipped = 0;

                // Helper to parse a CSV line (handles quoted fields)
                const parseLine = (line: string): string[] => {
                    const result: string[] = [];
                    let inQuote = false;
                    let cur = '';
                    for (const ch of line) {
                        if (ch === '"') { inQuote = !inQuote; }
                        else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
                        else { cur += ch; }
                    }
                    result.push(cur);
                    return result;
                };

                for (let i = 1; i < lines.length; i++) {
                    try {
                        const cols = parseLine(lines[i]);
                        const activityName = cols[colName]?.replace(/"/g, '').trim();
                        const startRaw = cols[colStart]?.replace(/"/g, '').trim();
                        const endRaw = cols[colEnd]?.replace(/"/g, '').trim();

                        if (!activityName || !startRaw || !endRaw) { skipped++; continue; }

                        const startTime = parseDate(startRaw);
                        const endTime = parseDate(endRaw);

                        if (isNaN(new Date(startTime).getTime()) || isNaN(new Date(endTime).getTime())) {
                            skipped++; continue;
                        }

                        const duration = Math.round(
                            (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
                        );
                        if (duration < 0) { skipped++; continue; }

                        // Find or create RecordType
                        const key = activityName.toLowerCase();
                        let rt = typeMapByName.get(key);
                        if (!rt) {
                            rt = {
                                id: uuidv4(),
                                name: activityName,
                                color: PALETTE[colorIdx % PALETTE.length],
                                icon: '📌',
                            };
                            colorIdx++;
                            typeMapByName.set(key, rt);
                            newTypes.push(rt);
                        }

                        newRecords.push({
                            id: uuidv4(),
                            recordTypeId: rt.id,
                            startTime,
                            endTime,
                            duration,
                        });
                    } catch {
                        skipped++;
                    }
                }

                set({
                    recordTypes: [...existingTypes, ...newTypes],
                    records: [...existingRecords, ...newRecords],
                });

                return { imported: newRecords.length, skipped };
            },

            importBackup: (text) => {
                // Helper: ARGB int (possibly negative) → #rrggbb
                const argbToHex = (n: number): string => {
                    const unsigned = n >>> 0;
                    const r = (unsigned >> 16) & 0xff;
                    const g = (unsigned >> 8) & 0xff;
                    const b = unsigned & 0xff;
                    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                };

                // colorIndex → Material hex color
                const COLOR_PALETTE: { [key: number]: string } = {
                    0: '#9c27b0', 1: '#f44336', 2: '#e91e63', 3: '#4caf50',
                    4: '#ff5722', 5: '#2196f3', 6: '#00bcd4', 7: '#ff9800',
                    8: '#795548', 9: '#009688', 10: '#3f51b5', 11: '#607d8b',
                    12: '#8bc34a', 13: '#ffc107', 14: '#03a9f4', 15: '#9e9e9e',
                    16: '#673ab7', 17: '#33691e', 18: '#f57f17', 19: '#bf360c',
                };

                // ic_*_24px → Lucide icon name mapping
                const ICON_MAP: { [key: string]: string } = {
                    'ic_headset_24px': 'Headphones',
                    'ic_desktop_windows_24px': 'Monitor',
                    'ic_ondemand_video_24px': 'Video',
                    'ic_fitness_center_24px': 'Dumbbell',
                    'ic_lightbulb_outline_24px': 'Lightbulb',
                    'ic_import_contacts_24px': 'BookOpen',
                    'ic_assignment_24px': 'Briefcase',
                    'ic_delete_24px': 'Trash2',
                    'ic_directions_walk_24px': 'Mountain',
                    'ic_extension_24px': 'Puzzle',
                    'ic_shopping_cart_24px': 'ShoppingCart',
                    'ic_restaurant_menu_24px': 'ChefHat',
                    'ic_free_breakfast_24px': 'Coffee',
                    'ic_restaurant_24px': 'Utensils',
                    'ic_local_bar_24px': 'Utensils',
                    'ic_airline_seat_individual_suite_24px': 'Bed',
                    'ic_airport_shuttle_24px': 'Bus',
                    'ic_business_center_24px': 'GraduationCap',
                    'ic_360_24px': 'RefreshCw',
                    'ic_hotel_24px': 'Moon',
                    'ic_house_24px': 'Home',
                    'ic_code_24px': 'Code',
                    'ic_library_books_24px': 'BookOpen',
                    'ic_camera_alt_24px': 'Camera',
                    'ic_local_cafe_24px': 'Coffee',
                    'ic_airline_seat_flat_angled_24px': 'Bed',
                    'ic_event_seat_24px': 'Scissors',
                    'ic_local_hospital_24px': 'Pill',
                    'ic_search_24px': 'Globe',
                    'ic_sports_football_24px': 'Trophy',
                    'ic_translate_24px': 'Globe',
                    'ic_work_24px': 'Briefcase',
                    'ic_help_24px': 'Lightbulb',
                };

                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                if (!lines[0]?.startsWith('app simple time tracker')) return { imported: 0, activities: 0, skipped: 0 };

                const { recordTypes: existingTypes, records: existingRecords } = get();

                const idMap = new Map<number, RecordType>();
                const newTypes: RecordType[] = [];
                const newRecords: Record[] = [];
                let skipped = 0;

                for (const line of lines.slice(1)) {
                    const parts = line.split('\t');
                    if (!parts[0]) continue;

                    if (parts[0] === 'recordType') {
                        const numId = parseInt(parts[1]);
                        const name = parts[2]?.trim();
                        const rawIcon = parts[3]?.trim() ?? '';
                        const colorIndex = parseInt(parts[4] ?? '0');
                        const argbStr = parts[7]?.trim();

                        if (!name || isNaN(numId)) continue;

                        let color: string;
                        if (argbStr && argbStr !== '' && argbStr !== '0' && !isNaN(parseInt(argbStr))) {
                            color = argbToHex(parseInt(argbStr));
                        } else {
                            color = COLOR_PALETTE[colorIndex] ?? '#6366f1';
                        }

                        const icon = rawIcon.startsWith('ic_') ? (ICON_MAP[rawIcon] ?? 'Activity') : (rawIcon || '📌');

                        const existing = existingTypes.find(rt => rt.name.toLowerCase() === name.toLowerCase());
                        if (existing) {
                            idMap.set(numId, existing);
                        } else {
                            const newRt: RecordType = { id: uuidv4(), name, color, icon };
                            newTypes.push(newRt);
                            idMap.set(numId, newRt);
                        }

                    } else if (parts[0] === 'record') {
                        const typeNumId = parseInt(parts[2]);
                        const startMs = parseInt(parts[3]);
                        const endMs = parseInt(parts[4]);

                        if (isNaN(typeNumId) || isNaN(startMs) || isNaN(endMs)) { skipped++; continue; }
                        const rt = idMap.get(typeNumId);
                        if (!rt) { skipped++; continue; }

                        const duration = Math.round((endMs - startMs) / 1000);
                        if (duration < 0) { skipped++; continue; }

                        newRecords.push({
                            id: uuidv4(),
                            recordTypeId: rt.id,
                            startTime: new Date(startMs).toISOString(),
                            endTime: new Date(endMs).toISOString(),
                            duration,
                        });
                    }
                }

                set({
                    recordTypes: [...existingTypes, ...newTypes],
                    records: [...existingRecords, ...newRecords],
                });

                return { imported: newRecords.length, activities: newTypes.length, skipped };
            },

            clearAllData: () => {
                set({ recordTypes: [], records: [], runningRecord: null });
            },

            // ── Settings ──
            toggleUntrackedTime: () => {
                set((s) => {
                    const newState = !s.showUntrackedTime;
                    let newRunning = s.runningRecord;

                    if (newState && !newRunning) {
                        newRunning = { id: uuidv4(), recordTypeId: 'untracked', startTime: now() };
                    } else if (!newState && newRunning?.recordTypeId === 'untracked') {
                        const duration = durationSeconds(newRunning.startTime, now());
                        const updatedRecords = [...s.records];
                        if (duration >= 60) {
                            updatedRecords.push({
                                id: newRunning.id,
                                recordTypeId: 'untracked',
                                startTime: newRunning.startTime,
                                endTime: now(),
                                duration,
                            });
                        }
                        return { showUntrackedTime: newState, runningRecord: null, records: updatedRecords };
                    }

                    return { showUntrackedTime: newState, runningRecord: newRunning };
                });
            },

            setAccentColor: (color: string) => {
                set({ accentColor: color });
                applyAccentColor(color);
            },

            toggleNotifications: () => {
                set((s) => ({ notificationsEnabled: !s.notificationsEnabled }));
            },

            setNotificationMinutes: (mins: number) => {
                set({ notificationMinutes: Math.max(1, mins) });
            },

            toggleNotificationRepeat: () => {
                set((s) => ({ notificationRepeat: !s.notificationRepeat }));
            },

            toggleNotificationSound: () => {
                set((s) => ({ notificationSound: !s.notificationSound }));
            },

        }),
        {
            name: 'simple-time-tracker',
            storage: createJSONStorage(() => idbStorage),
            onRehydrateStorage: () => (state) => {
                const color = state?.accentColor || DEFAULT_ACCENT_COLOR;
                applyAccentColor(color);
            },
        }
    )
);
