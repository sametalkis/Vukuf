import { describe, it, expect } from 'vitest';
import {
    formatDuration,
    parseDateRange,
    computeSummary,
    computeStats,
    handleToolCall,
    processMcpRpc,
    MCP_TOOLS,
    seal,
    open,
    gzipCompress,
    gzipDecompress,
} from '../worker/mcp';
import type { McpContext } from '../worker/mcp';
import type { Projection, Operation } from '../shared/sync';
import { project } from '../shared/sync';

describe('MCP Formatting & Calculations', () => {
    it('formats durations correctly in hours, minutes, seconds', () => {
        expect(formatDuration(45)).toBe('45 sn');
        expect(formatDuration(60)).toBe('1 dk');
        expect(formatDuration(125)).toBe('2 dk 5 sn');
        expect(formatDuration(3600)).toBe('1 sa 0 dk');
        expect(formatDuration(3665)).toBe('1 sa 1 dk');
        expect(formatDuration(7325)).toBe('2 sa 2 dk');
    });

    it('calculates date ranges for today, yesterday, week, month, year, all_time', () => {
        const today = parseDateRange('today');
        expect(today.label).toContain('Bugün');
        expect(today.start).toBeLessThan(today.end);

        const yesterday = parseDateRange('yesterday');
        expect(yesterday.label).toContain('Dün');
        expect(yesterday.start).toBeLessThan(yesterday.end);

        const thisWeek = parseDateRange('this_week');
        expect(thisWeek.label).toBe('Bu Hafta');

        const thisMonth = parseDateRange('this_month');
        expect(thisMonth.label).toBe('Bu Ay');

        const thisYear = parseDateRange('this_year');
        expect(thisYear.label).toContain('Bu Yıl');

        const allTime = parseDateRange('all_time');
        expect(allTime.label).toBe('Tüm Zamanlar');
        expect(allTime.start).toBe(0);

        const specificDate = parseDateRange('today', '2026-05-15');
        expect(specificDate.label).toBe('2026-05-15');
    });

    it('computes daily, monthly, yearly, and all-time summaries accurately', () => {
        const projection: Projection = {
            recordTypes: [
                { id: 'act-1', name: 'Kodlama', color: '#3b82f6', icon: '💻' },
                { id: 'act-2', name: 'Ders', color: '#10b981', icon: '📚' },
            ],
            records: [
                {
                    id: 'rec-1',
                    recordTypeId: 'act-1',
                    startTime: new Date(Date.now() - 3600000).toISOString(),
                    endTime: new Date().toISOString(),
                    duration: 3600,
                },
                {
                    id: 'rec-2',
                    recordTypeId: 'act-2',
                    startTime: new Date(Date.now() - 1800000).toISOString(),
                    endTime: new Date().toISOString(),
                    duration: 1800,
                },
            ],
            runningRecord: null,
            conflicts: [],
            activeSessions: [],
        };

        const summary = computeSummary(projection, 'today');
        expect(summary.totalSeconds).toBe(5400); // 1.5 hours
        expect(summary.sessionCount).toBe(2);
        expect(summary.breakdown).toHaveLength(2);
        expect(summary.breakdown[0].activityName).toBe('Kodlama');
        expect(summary.breakdown[0].durationSeconds).toBe(3600);
        expect(summary.breakdown[0].percentage).toBe('66.7%');
        expect(summary.breakdown[1].activityName).toBe('Ders');
        expect(summary.breakdown[1].durationSeconds).toBe(1800);
        expect(summary.breakdown[1].percentage).toBe('33.3%');
    });

    it('computes streaks and day-of-week habits', () => {
        const todayIso = new Date().toISOString();
        const projection: Projection = {
            recordTypes: [{ id: 'act-1', name: 'Spor', color: '#ef4444', icon: '🏃' }],
            records: [
                {
                    id: 'rec-1',
                    recordTypeId: 'act-1',
                    startTime: todayIso,
                    endTime: todayIso,
                    duration: 2400,
                },
            ],
            runningRecord: null,
            conflicts: [],
            activeSessions: [],
        };

        const stats = computeStats(projection);
        expect(stats.totalSessions).toBe(1);
        expect(stats.activeDaysCount).toBe(1);
        expect(stats.currentStreakDays).toBe(1);
        expect(stats.longestStreakDays).toBe(1);
        expect(stats.dayOfWeekDistribution).toHaveLength(7);
    });
});

describe('MCP Gzip & Crypto sealing', () => {
    it('compresses, seals, decrypts and decompresses payload round-trip', async () => {
        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);

        const sampleOps: Operation[] = [
            {
                id: 'op-1',
                entity: 'activity',
                entityId: 'act-1',
                parents: [],
                deviceId: 'dev-1',
                createdAt: new Date().toISOString(),
                value: { id: 'act-1', name: 'Kodlama', color: '#3b82f6', icon: '💻' },
            },
        ];

        const bytes = new TextEncoder().encode(JSON.stringify(sampleOps));
        const compressed = await gzipCompress(bytes);
        const box = await seal(key, compressed, 'data:vault1:1:packet1', 1);

        const decryptedBytes = await open(key, box, 'data:vault1:1:packet1', 1);
        const decompressed = await gzipDecompress(decryptedBytes);
        const recoveredOps = JSON.parse(new TextDecoder().decode(decompressed)) as Operation[];

        expect(recoveredOps).toEqual(sampleOps);
    });
});

describe('MCP Tools Lifecycle & Dispatcher', () => {
    it('has all required MCP tools registered with schemas', () => {
        const toolNames = MCP_TOOLS.map(t => t.name);
        expect(toolNames).toContain('stt_get_running_timer');
        expect(toolNames).toContain('stt_start_timer');
        expect(toolNames).toContain('stt_stop_timer');
        expect(toolNames).toContain('stt_discard_timer');
        expect(toolNames).toContain('stt_list_activities');
        expect(toolNames).toContain('stt_create_activity');
        expect(toolNames).toContain('stt_get_summary');
        expect(toolNames).toContain('stt_get_stats');
        expect(toolNames).toContain('stt_list_records');
        expect(toolNames).toContain('stt_log_session');
        expect(toolNames).toContain('stt_delete_record');
    });

    it('handles full timer flow: create activity, start, check running, stop, summary', async () => {
        const ops: Operation[] = [];
        let currentProjection: Projection = project(ops);

        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);

        const createCtx = (): McpContext => ({
            vaultId: 'test-vault-12345678',
            deviceId: 'test-ai-device-1234',
            keyVersion: 1,
            key,
            allOps: ops,
            projection: currentProjection,
            commitOps: async (newOps: Operation[]) => {
                ops.push(...newOps);
                currentProjection = project(ops);
            },
        });

        // 1. Initially no timer running
        const running1 = JSON.parse(await handleToolCall('stt_get_running_timer', {}, createCtx()));
        expect(running1.isRunning).toBe(false);

        // 2. Start timer for "Araştırma" (auto-creates activity)
        const startRes = JSON.parse(await handleToolCall('stt_start_timer', { activityName: 'Araştırma' }, createCtx()));
        expect(startRes.success).toBe(true);
        expect(startRes.activityName).toBe('Araştırma');
        expect(currentProjection.runningRecord).toBeTruthy();

        // 3. Now get_running_timer returns active timer
        const running2 = JSON.parse(await handleToolCall('stt_get_running_timer', {}, createCtx()));
        expect(running2.isRunning).toBe(true);
        expect(running2.activityName).toBe('Araştırma');

        // 4. Stop timer
        const stopRes = JSON.parse(await handleToolCall('stt_stop_timer', {}, createCtx()));
        expect(stopRes.success).toBe(true);
        expect(currentProjection.runningRecord).toBeNull();
        expect(currentProjection.records).toHaveLength(1);

        // 5. Check summary
        const summary = JSON.parse(await handleToolCall('stt_get_summary', { period: 'today' }, createCtx()));
        expect(summary.sessionCount).toBe(1);
        expect(summary.breakdown[0].activityName).toBe('Araştırma');

        // 6. Log a past session
        const logRes = JSON.parse(
            await handleToolCall(
                'stt_log_session',
                {
                    activityName: 'Kitap Okuma',
                    startTime: '2026-05-10T14:00:00.000Z',
                    endTime: '2026-05-10T15:30:00.000Z',
                    durationMinutes: 90,
                },
                createCtx()
            )
        );
        expect(logRes.success).toBe(true);
        expect(currentProjection.records).toHaveLength(2);

        // 7. Check all_time summary includes both
        const allTimeSummary = JSON.parse(await handleToolCall('stt_get_summary', { period: 'all_time' }, createCtx()));
        expect(allTimeSummary.sessionCount).toBe(2);
    });

    it('processes JSON-RPC protocol methods correctly', async () => {
        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);

        const dummyCtx: McpContext = {
            vaultId: 'test-vault-12345678',
            deviceId: 'test-ai-device-1234',
            keyVersion: 1,
            key,
            allOps: [],
            projection: project([]),
            commitOps: async () => {},
        };

        // initialize
        const initRes = await processMcpRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, dummyCtx);
        expect(initRes?.result).toMatchObject({
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'Simple Time Tracker MCP Server' },
        });

        // tools/list
        const listRes = await processMcpRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, dummyCtx);
        expect(listRes?.result).toHaveProperty('tools');

        // ping
        const pingRes = await processMcpRpc({ jsonrpc: '2.0', id: 3, method: 'ping' }, dummyCtx);
        expect(pingRes?.result).toEqual({});

        // notifications/initialized (returns null, no response)
        const notifRes = await processMcpRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, dummyCtx);
        expect(notifRes).toBeNull();
    });
});
