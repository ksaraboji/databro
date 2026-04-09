"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, Check, Clock3, Copy, Download, Home, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import CronExpressionParser from "cron-parser";
import { cn } from "@/lib/utils";

const MAX_WINDOW_RUNS = 500;

function toLocalDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function normalizeCronExpression(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length === 5) return `0 ${expression.trim()}`;
  return expression.trim();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default function CronTimeWindowSimulatorPage() {
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const [expression, setExpression] = useState("*/15 * * * *");
  const [timeZone, setTimeZone] = useState(localTimeZone);
  const [nextCount, setNextCount] = useState("10");
  const [windowStart, setWindowStart] = useState(toLocalDateTimeValue(new Date()));
  const [windowEnd, setWindowEnd] = useState(toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [copied, setCopied] = useState(false);

  const simulation = useMemo(() => {
    if (!expression.trim()) {
      return { error: "", nextRuns: [] as Date[], windowRuns: [] as Date[] };
    }

    if (!isValidTimeZone(timeZone)) {
      return { error: "Invalid timezone. Example: UTC or America/New_York", nextRuns: [] as Date[], windowRuns: [] as Date[] };
    }

    const parsedCount = Number.parseInt(nextCount, 10);
    const safeCount = Number.isNaN(parsedCount) ? 10 : Math.min(Math.max(parsedCount, 1), 50);
    const normalizedExpression = normalizeCronExpression(expression);
    const start = new Date(windowStart);
    const end = new Date(windowEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: "Invalid start or end date/time.", nextRuns: [] as Date[], windowRuns: [] as Date[] };
    }

    if (end <= start) {
      return { error: "End time must be after start time.", nextRuns: [] as Date[], windowRuns: [] as Date[] };
    }

    try {
      const nextIterator = CronExpressionParser.parse(normalizedExpression, {
        currentDate: start,
        tz: timeZone,
      });

      const nextRuns: Date[] = [];
      for (let i = 0; i < safeCount; i += 1) {
        nextRuns.push(nextIterator.next().toDate());
      }

      const windowIterator = CronExpressionParser.parse(normalizedExpression, {
        currentDate: start,
        endDate: end,
        tz: timeZone,
      });

      const windowRuns: Date[] = [];
      for (let i = 0; i < MAX_WINDOW_RUNS; i += 1) {
        try {
          const run = windowIterator.next().toDate();
          if (run > end) break;
          windowRuns.push(run);
        } catch {
          break;
        }
      }

      return { error: "", nextRuns, windowRuns };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Invalid cron expression.",
        nextRuns: [] as Date[],
        windowRuns: [] as Date[],
      };
    }
  }, [expression, nextCount, timeZone, windowStart, windowEnd]);

  const outputJson = useMemo(
    () =>
      JSON.stringify(
        {
          expression: expression.trim(),
          normalizedExpression: normalizeCronExpression(expression),
          timeZone,
          nextRuns: simulation.nextRuns.map((date) => date.toISOString()),
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          windowRunCount: simulation.windowRuns.length,
          windowRuns: simulation.windowRuns.map((date) => date.toISOString()),
        },
        null,
        2
      ),
    [expression, simulation.nextRuns, simulation.windowRuns, timeZone, windowStart, windowEnd]
  );

  const handleCopy = async () => {
    if (simulation.error) return;
    try {
      await navigator.clipboard.writeText(outputJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleDownload = () => {
    if (simulation.error) return;
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cron-simulation.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setExpression("*/15 * * * *");
    setTimeZone(localTimeZone);
    setNextCount("10");
    setWindowStart(toLocalDateTimeValue(new Date()));
    setWindowEnd(toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setCopied(false);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <Link href="/tools" className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
                <Clock3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Cron and Time Window Simulator</h1>
                <p className="text-sm text-slate-500">Preview next run times and simulate execution volume inside a time window</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-600"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Inputs</h2>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Cron Expression</span>
              <input
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="*/15 * * * *"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-indigo-400"
              />
              <p className="text-xs text-slate-500">5-field cron is accepted and auto-expanded with seconds.</p>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-semibold text-slate-700">Timezone</span>
                <input
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  placeholder="UTC"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-semibold text-slate-700">Next Runs Count</span>
                <input
                  value={nextCount}
                  onChange={(e) => setNextCount(e.target.value)}
                  type="number"
                  min={1}
                  max={50}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-400"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-semibold text-slate-700">Window Start</span>
                <input
                  type="datetime-local"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-semibold text-slate-700">Window End</span>
                <input
                  type="datetime-local"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-400"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Trash2 className="h-4 w-4" />
                Reset
              </button>
              <button
                onClick={handleDownload}
                disabled={Boolean(simulation.error)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  simulation.error
                    ? "cursor-not-allowed border border-slate-200 text-slate-300"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                )}
              >
                <Download className="h-4 w-4" />
                Download JSON
              </button>
              <button
                onClick={handleCopy}
                disabled={Boolean(simulation.error)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  simulation.error
                    ? "cursor-not-allowed border border-slate-200 text-slate-300"
                    : copied
                      ? "border border-green-200 bg-green-50 text-green-600"
                      : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Simulation Output</h2>
            </div>

            {simulation.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{simulation.error}</div>
            ) : null}

            {!simulation.error ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Next Scheduled Runs</h3>
                  <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <ol className="space-y-1 text-sm text-slate-700">
                      {simulation.nextRuns.map((run, index) => (
                        <li key={`next-${run.getTime()}-${index}`} className="font-mono">
                          {index + 1}. {formatInTimeZone(run, timeZone)}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Runs Inside Window</h3>
                  <p className="text-sm text-slate-600">
                    Total executions in window: <span className="font-bold text-slate-900">{simulation.windowRuns.length}</span>
                  </p>
                  <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {simulation.windowRuns.length > 0 ? (
                      <ol className="space-y-1 text-sm text-slate-700">
                        {simulation.windowRuns.map((run, index) => (
                          <li key={`window-${run.getTime()}-${index}`} className="font-mono">
                            {index + 1}. {formatInTimeZone(run, timeZone)}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-slate-500">No runs found in this time window.</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
