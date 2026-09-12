import {
    canonical,
    headsFor,
    project,
    PROTOCOL_VERSION,
    SCHEMA_VERSION,
    validateOperation,
} from '../shared/sync';
import type {
    ActivityValue,
    CipherBox,
    Operation,
    Projection,
    SessionValue,
} from '../shared/sync';

// --- Web Crypto & Encoding Helpers ---
const encoder = new TextEncoder();

export function base64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unbase64(value: string): Uint8Array {
    if (!/^[\w-]*$/.test(value)) throw new Error('Geçersiz anahtar biçimi.');
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function importSecretKey(secret: string): Promise<CryptoKey> {
    const raw = unbase64(secret);
    if (raw.length !== 32) throw new Error('Kasa anahtarı uzunluğu geçersiz (32 bayt olmalı).');
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data).body!.pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data).body!.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function aad(box: Omit<CipherBox, 'ciphertext' | 'iv'>) {
    return encoder.encode(canonical(box));
}

export async function seal(
    key: CryptoKey,
    bytes: Uint8Array,
    context: string,
    keyVersion = 1
): Promise<CipherBox> {
    const header = { protocolVersion: PROTOCOL_VERSION, schemaVersion: SCHEMA_VERSION, keyVersion, context };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(header), tagLength: 128 },
        key,
        bytes
    );
    return {
        ...header,
        iv: base64(iv),
        ciphertext: base64(new Uint8Array(ciphertext)),
    };
}

export async function open(
    key: CryptoKey,
    box: CipherBox,
    context: string,
    keyVersion = 1
): Promise<Uint8Array> {
    if (box.protocolVersion !== PROTOCOL_VERSION || box.schemaVersion !== SCHEMA_VERSION) {
        throw new Error('Eski protokol veya şema sürümü.');
    }
    if (box.context !== context || box.keyVersion !== keyVersion || unbase64(box.iv).length !== 12) {
        throw new Error('Şifreli paket bağlamı veya sürümü uyuşmuyor.');
    }
    const header = {
        protocolVersion: box.protocolVersion,
        schemaVersion: box.schemaVersion,
        keyVersion: box.keyVersion,
        context: box.context,
    };
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unbase64(box.iv), additionalData: aad(header), tagLength: 128 },
        key,
        unbase64(box.ciphertext)
    );
    return new Uint8Array(decrypted);
}

export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const remainingSeconds = s % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} sa`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes} dk`);
    if (hours === 0 && (remainingSeconds > 0 || parts.length === 0)) parts.push(`${remainingSeconds} sn`);
    return parts.join(' ');
}

// --- MCP Tools Metadata ---
export const MCP_TOOLS = [
    {
        name: 'stt_get_running_timer',
        description:
            'Şu an aktif çalışan sayacı, ne zaman başladığını, geçen süreyi (saat, dakika, saniye) ve aktivite detaylarını döner.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'stt_start_timer',
        description:
            'Belirtilen aktivite/kategori için sayaç başlatır. Başka bir sayaç çalışıyorsa onu otomatik olarak durdurup kaydeder ve yeni sayacı başlatır. Aktivite henüz kayıtlı değilse otomatik olarak oluşturulur.',
        inputSchema: {
            type: 'object',
            properties: {
                activityName: {
                    type: 'string',
                    description: 'Sayacı başlatılacak aktivitenin adı (örn: "Kodlama", "Ders Çalışma", "Kitap Okuma").',
                },
            },
            required: ['activityName'],
            additionalProperties: false,
        },
    },
    {
        name: 'stt_stop_timer',
        description:
            'Şu an aktif çalışan sayacı durdurur ve geçen süreyi tamamlanmış bir zaman oturumu olarak kasanıza kaydeder.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'stt_discard_timer',
        description:
            'Şu an aktif çalışan sayacı kaydetmeden iptal eder (çöpe atar).',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'stt_list_activities',
        description:
            'Kayıtlı tüm aktiviteleri/kategorileri listeler (isim, renk, simge, toplam kayıtlı oturum sayısı ve toplam süre).',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'stt_create_activity',
        description: 'Yeni bir aktivite/kategori oluşturur.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Yeni aktivitenin adı.' },
                color: {
                    type: 'string',
                    description: 'İsteğe bağlı hex renk kodu (#3b82f6 gibi). Belirtilmezse varsayılan bir renk atanır.',
                },
                icon: {
                    type: 'string',
                    description: 'İsteğe bağlı emoji veya ikon adı (örn: "💻", "📚").',
                },
            },
            required: ['name'],
            additionalProperties: false,
        },
    },
    {
        name: 'stt_get_summary',
        description:
            'Belirtilen dönem (günlük, haftalık, aylık, yıllık veya tüm zamanlar) için toplam çalışma süresi, kategori bazında dağılım (saat ve yüzde), seans sayısı ve günlük ortalama gibi ayrıntılı istatistikleri döner.',
        inputSchema: {
            type: 'object',
            properties: {
                period: {
                    type: 'string',
                    enum: [
                        'today',
                        'yesterday',
                        'this_week',
                        'last_week',
                        'this_month',
                        'last_month',
                        'this_year',
                        'all_time',
                        'custom',
                    ],
                    description: 'Özet çıkarılacak zaman aralığı (varsayılan: today).',
                },
                date: {
                    type: 'string',
                    description: 'Belirli bir günün özeti isteniyorsa YYYY-MM-DD formatında tarih.',
                },
                startDate: {
                    type: 'string',
                    description: 'custom periyodu için başlangıç tarihi (YYYY-MM-DD).',
                },
                endDate: {
                    type: 'string',
                    description: 'custom periyodu için bitiş tarihi (YYYY-MM-DD).',
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'stt_get_stats',
        description:
            'Kullanıcının çalışma serilerini (güncel streak, en uzun streak), toplam oturum/saat verilerini ve haftanın günlerine göre çalışma dağılımını (Pazartesi, Salı vb.) getirir.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'stt_list_records',
        description:
            'Geçmiş zaman oturumu kayıtlarını listeler. Tarih veya aktiviteye göre filtrelenebilir.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Getirilecek maksimum kayıt sayısı (varsayılan: 20).',
                },
                activityName: {
                    type: 'string',
                    description: 'Yalnızca bu aktiviteye ait kayıtları getirmek için isim filtresi.',
                },
                startDate: {
                    type: 'string',
                    description: 'Başlangıç tarihi (YYYY-MM-DD).',
                },
                endDate: {
                    type: 'string',
                    description: 'Bitiş tarihi (YYYY-MM-DD).',
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'stt_log_session',
        description:
            'Geçmişe dönük manuel bir çalışma oturumu kaydeder (örn: "Dün 14:00 - 16:30 arası Ders çalıştım").',
        inputSchema: {
            type: 'object',
            properties: {
                activityName: {
                    type: 'string',
                    description: 'Aktivite adı. Mevcut değilse otomatik oluşturulur.',
                },
                startTime: {
                    type: 'string',
                    description: 'Başlangıç zamanı (ISO 8601 dizesi veya "YYYY-MM-DD HH:mm").',
                },
                endTime: {
                    type: 'string',
                    description: 'Bitiş zamanı (ISO 8601 dizesi veya "YYYY-MM-DD HH:mm").',
                },
                durationMinutes: {
                    type: 'number',
                    description: 'Opsiyonel: Dakika cinsinden süre. Belirtilmezse bitiş ve başlangıç farkından hesaplanır.',
                },
            },
            required: ['activityName', 'startTime', 'endTime'],
            additionalProperties: false,
        },
    },
    {
        name: 'stt_delete_record',
        description: 'Hatalı veya silinmek istenen bir geçmiş zaman kaydını siler.',
        inputSchema: {
            type: 'object',
            properties: {
                recordId: {
                    type: 'string',
                    description: 'Silinecek kaydın benzersiz kimliği (id).',
                },
            },
            required: ['recordId'],
            additionalProperties: false,
        },
    },
];

// --- Date & Period Calculation Helpers ---
interface DateRange {
    start: number;
    end: number;
    label: string;
}

export function parseDateRange(
    period = 'today',
    dateStr?: string,
    startDateStr?: string,
    endDateStr?: string
): DateRange {
    const now = new Date();

    if (dateStr) {
        const parts = dateStr.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
        return { start, end, label: dateStr };
    }

    if (period === 'yesterday') {
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0).getTime();
        const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999).getTime();
        return { start, end, label: `Dün (${y.toISOString().slice(0, 10)})` };
    }

    if (period === 'this_week') {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // Monday as first day
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
        return { start: monday.getTime(), end: now.getTime(), label: 'Bu Hafta' };
    }

    if (period === 'last_week') {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day - 7;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
        return { start: monday.getTime(), end: sunday.getTime(), label: 'Geçen Hafta' };
    }

    if (period === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return { start: firstDay.getTime(), end: now.getTime(), label: 'Bu Ay' };
    }

    if (period === 'last_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start: firstDay.getTime(), end: lastDay.getTime(), label: 'Geçen Ay' };
    }

    if (period === 'this_year') {
        const firstDay = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        return { start: firstDay.getTime(), end: now.getTime(), label: `Bu Yıl (${now.getFullYear()})` };
    }

    if (period === 'all_time') {
        return { start: 0, end: now.getTime() + 86400000, label: 'Tüm Zamanlar' };
    }

    if (period === 'custom' && startDateStr) {
        const sParts = startDateStr.split('-').map(Number);
        const start = new Date(sParts[0], sParts[1] - 1, sParts[2], 0, 0, 0, 0).getTime();
        let end = now.getTime();
        if (endDateStr) {
            const eParts = endDateStr.split('-').map(Number);
            end = new Date(eParts[0], eParts[1] - 1, eParts[2], 23, 59, 59, 999).getTime();
        }
        return { start, end, label: `${startDateStr} - ${endDateStr ?? 'şimdi'}` };
    }

    // Default: 'today'
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return { start, end: now.getTime(), label: `Bugün (${now.toISOString().slice(0, 10)})` };
}

export function computeSummary(
    projection: Projection,
    period = 'today',
    dateStr?: string,
    startDateStr?: string,
    endDateStr?: string
) {
    const range = parseDateRange(period, dateStr, startDateStr, endDateStr);
    const activityMap = new Map(projection.recordTypes.map(a => [a.id, a]));

    const matchingRecords = projection.records.filter(r => {
        const t = Date.parse(r.startTime);
        return t >= range.start && t <= range.end;
    });

    let totalDurationSeconds = 0;
    const perActivitySeconds = new Map<string, number>();

    for (const r of matchingRecords) {
        const dur = r.duration ?? Math.max(0, Math.floor((Date.parse(r.endTime) - Date.parse(r.startTime)) / 1000));
        totalDurationSeconds += dur;
        perActivitySeconds.set(r.recordTypeId, (perActivitySeconds.get(r.recordTypeId) ?? 0) + dur);
    }

    // Include ongoing timer if within range
    let currentRunningDetails: { activityName: string; elapsedSeconds: number } | null = null;
    if (projection.runningRecord) {
        const startT = Date.parse(projection.runningRecord.startTime);
        if (startT <= range.end) {
            const elapsed = Math.max(0, Math.floor((Date.now() - startT) / 1000));
            totalDurationSeconds += elapsed;
            perActivitySeconds.set(
                projection.runningRecord.recordTypeId,
                (perActivitySeconds.get(projection.runningRecord.recordTypeId) ?? 0) + elapsed
            );
            const act = activityMap.get(projection.runningRecord.recordTypeId);
            currentRunningDetails = {
                activityName: act?.name ?? 'Bilinmeyen Aktivite',
                elapsedSeconds: elapsed,
            };
        }
    }

    const breakdown = [...perActivitySeconds.entries()]
        .map(([activityId, seconds]) => {
            const act = activityMap.get(activityId);
            const pct = totalDurationSeconds > 0 ? (seconds / totalDurationSeconds) * 100 : 0;
            return {
                activityId,
                activityName: act?.name ?? 'Bilinmeyen Aktivite',
                color: act?.color ?? '#888888',
                icon: act?.icon ?? '⏱️',
                durationSeconds: seconds,
                durationFormatted: formatDuration(seconds),
                percentage: `${pct.toFixed(1)}%`,
            };
        })
        .sort((a, b) => b.durationSeconds - a.durationSeconds);

    // Calculate days in range for daily average
    const daysInRange = Math.max(1, Math.ceil((range.end - range.start) / 86400000));
    const dailyAverageSeconds = Math.round(totalDurationSeconds / daysInRange);

    return {
        period: range.label,
        totalSeconds: totalDurationSeconds,
        totalFormatted: formatDuration(totalDurationSeconds),
        sessionCount: matchingRecords.length,
        dailyAverageFormatted: formatDuration(dailyAverageSeconds),
        currentlyRunning: currentRunningDetails,
        breakdown,
    };
}

export function computeStats(projection: Projection) {
    const records = projection.records;
    const daysSet = new Set<string>();
    const dayOfWeekSeconds = [0, 0, 0, 0, 0, 0, 0]; // 0=Sunday, 1=Monday...

    let totalDuration = 0;
    for (const r of records) {
        const d = new Date(r.startTime);
        daysSet.add(r.startTime.slice(0, 10));
        const dur = r.duration ?? 0;
        totalDuration += dur;
        dayOfWeekSeconds[d.getDay()] += dur;
    }

    // Calculate Streaks
    const sortedDays = [...daysSet].sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    let prevTime: number | null = null;
    for (const day of sortedDays) {
        const t = new Date(day).getTime();
        if (prevTime !== null && t - prevTime <= 86400000 * 1.5) {
            tempStreak++;
        } else {
            tempStreak = 1;
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        prevTime = t;
    }

    // Current streak validation
    if (daysSet.has(todayStr) || daysSet.has(yesterdayStr)) {
        let checkDate = new Date();
        if (!daysSet.has(todayStr)) {
            checkDate = yesterdayDate;
        }
        while (daysSet.has(checkDate.toISOString().slice(0, 10))) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
        }
    }

    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const weeklyPattern = dayNames.map((name, idx) => ({
        day: name,
        totalFormatted: formatDuration(dayOfWeekSeconds[idx]),
        seconds: dayOfWeekSeconds[idx],
    }));

    return {
        totalTrackedTime: formatDuration(totalDuration),
        totalSessions: records.length,
        activeDaysCount: daysSet.size,
        currentStreakDays: currentStreak,
        longestStreakDays: longestStreak,
        dayOfWeekDistribution: weeklyPattern,
    };
}

// --- Main MCP Protocol Execution ---
export interface McpContext {
    vaultId: string;
    deviceId: string;
    keyVersion: number;
    key: CryptoKey;
    allOps: Operation[];
    projection: Projection;
    commitOps: (newOps: Operation[]) => Promise<void>;
}

export async function handleToolCall(
    name: string,
    args: Record<string, unknown>,
    ctx: McpContext
): Promise<string> {
    const { projection, commitOps, deviceId } = ctx;
    const nowIso = new Date().toISOString();

    if (name === 'stt_get_running_timer') {
        const running = projection.runningRecord;
        if (!running) {
            return JSON.stringify({
                isRunning: false,
                message: 'Şu an çalışan herhangi bir sayaç bulunmuyor.',
            });
        }
        const act = projection.recordTypes.find(a => a.id === running.recordTypeId);
        const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(running.startTime)) / 1000));
        return JSON.stringify({
            isRunning: true,
            activityName: act?.name ?? 'Bilinmeyen Aktivite',
            activityColor: act?.color,
            activityIcon: act?.icon,
            startTime: running.startTime,
            elapsedSeconds: elapsed,
            elapsedFormatted: formatDuration(elapsed),
            message: `Şu an '${act?.name ?? 'Bilinmeyen'}' sayacı çalışıyor. Geçen süre: ${formatDuration(elapsed)}.`,
        });
    }

    if (name === 'stt_start_timer') {
        const activityName = String(args.activityName || '').trim();
        if (!activityName) throw new Error('Aktivite adı zorunludur.');

        const newOps: Operation[] = [];
        let act = projection.recordTypes.find(
            a => a.name.trim().toLowerCase() === activityName.toLowerCase()
        );

        // Auto-create activity if missing
        if (!act) {
            const newActId = crypto.randomUUID();
            const actOp: Operation = {
                id: crypto.randomUUID(),
                entity: 'activity',
                entityId: newActId,
                parents: [],
                deviceId,
                createdAt: nowIso,
                value: {
                    id: newActId,
                    name: activityName,
                    color: '#3b82f6',
                    icon: '⏱️',
                },
            };
            newOps.push(actOp);
            act = actOp.value as ActivityValue;
        }

        // Auto-stop any existing running timer
        let stoppedMessage = '';
        if (projection.runningRecord) {
            const oldRunning = projection.runningRecord;
            const stopNow = new Date().toISOString();
            const dur = Math.max(0, Math.floor((Date.now() - Date.parse(oldRunning.startTime)) / 1000));
            const oldParents = headsFor(ctx.allOps.filter(o => o.entity === 'session' && o.entityId === oldRunning.id)).map(o => o.id);
            const stopOp: Operation = {
                id: crypto.randomUUID(),
                entity: 'session',
                entityId: oldRunning.id,
                parents: oldParents.length ? oldParents : [oldRunning.id],
                deviceId,
                createdAt: stopNow,
                value: {
                    id: oldRunning.id,
                    recordTypeId: oldRunning.recordTypeId,
                    startTime: oldRunning.startTime,
                    endTime: stopNow,
                    duration: dur,
                },
            };
            newOps.push(stopOp);
            const oldAct = projection.recordTypes.find(a => a.id === oldRunning.recordTypeId);
            stoppedMessage = ` (Önceki '${oldAct?.name ?? 'aktivite'}' sayacı ${formatDuration(dur)} süreyle durduruldu ve kaydedildi.)`;
        }

        // Start new timer
        const sessionId = crypto.randomUUID();
        const startOp: Operation = {
            id: crypto.randomUUID(),
            entity: 'session',
            entityId: sessionId,
            parents: [],
            deviceId,
            createdAt: nowIso,
            value: {
                id: sessionId,
                recordTypeId: act.id,
                startTime: nowIso,
            },
        };
        newOps.push(startOp);
        await commitOps(newOps);

        return JSON.stringify({
            success: true,
            activityName: act.name,
            startTime: nowIso,
            message: `'${act.name}' için sayaç başlatıldı.${stoppedMessage}`,
        });
    }

    if (name === 'stt_stop_timer') {
        const running = projection.runningRecord;
        if (!running) {
            return JSON.stringify({
                success: false,
                message: 'Şu an aktif çalışan bir sayaç bulunmuyor.',
            });
        }
        const stopNow = new Date().toISOString();
        const dur = Math.max(0, Math.floor((Date.now() - Date.parse(running.startTime)) / 1000));
        const oldParents = headsFor(ctx.allOps.filter(o => o.entity === 'session' && o.entityId === running.id)).map(o => o.id);

        const stopOp: Operation = {
            id: crypto.randomUUID(),
            entity: 'session',
            entityId: running.id,
            parents: oldParents.length ? oldParents : [running.id],
            deviceId,
            createdAt: stopNow,
            value: {
                id: running.id,
                recordTypeId: running.recordTypeId,
                startTime: running.startTime,
                endTime: stopNow,
                duration: dur,
            },
        };
        await commitOps([stopOp]);
        const act = projection.recordTypes.find(a => a.id === running.recordTypeId);

        return JSON.stringify({
            success: true,
            activityName: act?.name ?? 'Bilinmeyen Aktivite',
            durationSeconds: dur,
            durationFormatted: formatDuration(dur),
            message: `'${act?.name ?? 'Sayaç'}' durduruldu ve ${formatDuration(dur)} süreyle kasanıza kaydedildi.`,
        });
    }

    if (name === 'stt_discard_timer') {
        const running = projection.runningRecord;
        if (!running) {
            return JSON.stringify({
                success: false,
                message: 'Şu an aktif çalışan bir sayaç bulunmuyor.',
            });
        }
        const oldParents = headsFor(ctx.allOps.filter(o => o.entity === 'session' && o.entityId === running.id)).map(o => o.id);
        const discardOp: Operation = {
            id: crypto.randomUUID(),
            entity: 'session',
            entityId: running.id,
            parents: oldParents.length ? oldParents : [running.id],
            deviceId,
            createdAt: nowIso,
            value: null, // Tombstone
        };
        await commitOps([discardOp]);
        const act = projection.recordTypes.find(a => a.id === running.recordTypeId);

        return JSON.stringify({
            success: true,
            message: `'${act?.name ?? 'Sayaç'}' sayacı kaydedilmeden iptal edildi (silindi).`,
        });
    }

    if (name === 'stt_list_activities') {
        const perAct = new Map<string, { count: number; totalSec: number }>();
        for (const r of projection.records) {
            const cur = perAct.get(r.recordTypeId) ?? { count: 0, totalSec: 0 };
            cur.count++;
            cur.totalSec += r.duration ?? 0;
            perAct.set(r.recordTypeId, cur);
        }

        const list = projection.recordTypes.map(a => {
            const stats = perAct.get(a.id) ?? { count: 0, totalSec: 0 };
            return {
                id: a.id,
                name: a.name,
                color: a.color,
                icon: a.icon,
                totalSessions: stats.count,
                totalDurationFormatted: formatDuration(stats.totalSec),
            };
        });

        return JSON.stringify(list, null, 2);
    }

    if (name === 'stt_create_activity') {
        const name = String(args.name || '').trim();
        if (!name) throw new Error('Aktivite adı zorunludur.');
        const color = typeof args.color === 'string' && /^#[\da-f]{6}$/i.test(args.color) ? args.color : '#3b82f6';
        const icon = typeof args.icon === 'string' && args.icon.length > 0 ? args.icon : '⏱️';

        const existing = projection.recordTypes.find(a => a.name.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
            return JSON.stringify({
                success: true,
                activity: existing,
                message: `'${name}' aktivitesi zaten mevcut.`,
            });
        }

        const id = crypto.randomUUID();
        const op: Operation = {
            id: crypto.randomUUID(),
            entity: 'activity',
            entityId: id,
            parents: [],
            deviceId,
            createdAt: nowIso,
            value: { id, name, color, icon },
        };
        await commitOps([op]);

        return JSON.stringify({
            success: true,
            activity: op.value,
            message: `Yeni aktivite başarıyla oluşturuldu: '${name}'.`,
        });
    }

    if (name === 'stt_get_summary') {
        const summary = computeSummary(
            projection,
            (args.period as string) || 'today',
            args.date as string | undefined,
            args.startDate as string | undefined,
            args.endDate as string | undefined
        );
        return JSON.stringify(summary, null, 2);
    }

    if (name === 'stt_get_stats') {
        const stats = computeStats(projection);
        return JSON.stringify(stats, null, 2);
    }

    if (name === 'stt_list_records') {
        const limit = typeof args.limit === 'number' ? Math.min(100, Math.max(1, args.limit)) : 20;
        const actName = typeof args.activityName === 'string' ? args.activityName.trim().toLowerCase() : null;
        const actMap = new Map(projection.recordTypes.map(a => [a.id, a]));

        let filtered = [...projection.records].reverse(); // Most recent first
        if (actName) {
            filtered = filtered.filter(r => {
                const act = actMap.get(r.recordTypeId);
                return act && act.name.trim().toLowerCase() === actName;
            });
        }
        if (args.startDate) {
            const startT = new Date(args.startDate as string).getTime();
            filtered = filtered.filter(r => Date.parse(r.startTime) >= startT);
        }
        if (args.endDate) {
            const endT = new Date(args.endDate as string).getTime() + 86400000;
            filtered = filtered.filter(r => Date.parse(r.startTime) <= endT);
        }

        const results = filtered.slice(0, limit).map(r => {
            const act = actMap.get(r.recordTypeId);
            return {
                id: r.id,
                activityName: act?.name ?? 'Bilinmeyen Aktivite',
                startTime: r.startTime,
                endTime: r.endTime,
                durationFormatted: formatDuration(r.duration ?? 0),
                durationSeconds: r.duration,
            };
        });

        return JSON.stringify(results, null, 2);
    }

    if (name === 'stt_log_session') {
        const activityName = String(args.activityName || '').trim();
        if (!activityName) throw new Error('Aktivite adı zorunludur.');
        const startTimeStr = String(args.startTime || '');
        const endTimeStr = String(args.endTime || '');
        const startT = Date.parse(startTimeStr);
        const endT = Date.parse(endTimeStr);
        if (isNaN(startT) || isNaN(endT) || endT <= startT) {
            throw new Error('Geçersiz başlangıç veya bitiş tarihi.');
        }

        const newOps: Operation[] = [];
        let act = projection.recordTypes.find(
            a => a.name.trim().toLowerCase() === activityName.toLowerCase()
        );
        if (!act) {
            const newActId = crypto.randomUUID();
            const actOp: Operation = {
                id: crypto.randomUUID(),
                entity: 'activity',
                entityId: newActId,
                parents: [],
                deviceId,
                createdAt: nowIso,
                value: { id: newActId, name: activityName, color: '#3b82f6', icon: '⏱️' },
            };
            newOps.push(actOp);
            act = actOp.value as ActivityValue;
        }

        const dur = typeof args.durationMinutes === 'number'
            ? Math.round(args.durationMinutes * 60)
            : Math.max(0, Math.floor((endT - startT) / 1000));

        const sessionId = crypto.randomUUID();
        const sessionOp: Operation = {
            id: crypto.randomUUID(),
            entity: 'session',
            entityId: sessionId,
            parents: [],
            deviceId,
            createdAt: nowIso,
            value: {
                id: sessionId,
                recordTypeId: act.id,
                startTime: new Date(startT).toISOString(),
                endTime: new Date(endT).toISOString(),
                duration: dur,
            },
        };
        newOps.push(sessionOp);
        await commitOps(newOps);

        return JSON.stringify({
            success: true,
            activityName: act.name,
            durationFormatted: formatDuration(dur),
            message: `'${act.name}' için ${formatDuration(dur)} süreli oturum kasanıza kaydedildi.`,
        });
    }

    if (name === 'stt_delete_record') {
        const recordId = String(args.recordId || '').trim();
        if (!recordId) throw new Error('Kayıt ID zorunludur.');

        const existing = projection.records.find(r => r.id === recordId);
        if (!existing) {
            return JSON.stringify({ success: false, message: 'Belirtilen ID ile kayıt bulunamadı.' });
        }

        const parents = headsFor(ctx.allOps.filter(o => o.entity === 'session' && o.entityId === recordId)).map(o => o.id);
        const delOp: Operation = {
            id: crypto.randomUUID(),
            entity: 'session',
            entityId: recordId,
            parents: parents.length ? parents : [recordId],
            deviceId,
            createdAt: nowIso,
            value: null, // Tombstone
        };
        await commitOps([delOp]);

        return JSON.stringify({
            success: true,
            message: 'Zaman kaydı başarıyla silindi.',
        });
    }

    throw new Error(`Bilinmeyen araç çağrısı: ${name}`);
}

// --- JSON-RPC Dispatcher ---
export async function processMcpRpc(
    payload: Record<string, unknown>,
    ctx: McpContext
): Promise<Record<string, unknown> | null> {
    const id = payload.id ?? null;
    const method = payload.method;

    if (method === 'initialize') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: 'Vukuf MCP Server',
                    version: '1.0.0',
                },
            },
        };
    }

    if (method === 'notifications/initialized') {
        // Notification - no response needed
        return null;
    }

    if (method === 'ping') {
        return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools: MCP_TOOLS,
            },
        };
    }

    if (method === 'tools/call') {
        const params = (payload.params || {}) as { name: string; arguments?: Record<string, unknown> };
        const toolName = params.name;
        const toolArgs = params.arguments || {};

        try {
            const text = await handleToolCall(toolName, toolArgs, ctx);
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{ type: 'text', text }],
                },
            };
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    isError: true,
                    content: [{ type: 'text', text: `Hata: ${errorMsg}` }],
                },
            };
        }
    }

    return {
        jsonrpc: '2.0',
        id,
        error: {
            code: -32601,
            message: `Method not found: ${String(method)}`,
        },
    };
}
