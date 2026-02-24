"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TeacherApiService } from "@/services/teacher-api.service";

type SectionLike = {
    id?: number | string | null;
    class_level?: string | number | null;
    classroom?: string | number | null;
    year?: string | number | null;
    semester?: string | number | null;
    semesters?: {
        academic_years?: {
            year_name?: string | number | null;
        } | null;
    } | null;
    subjects?: {
        id?: number | string | null;
        subject_code?: string | number | null;
        name?: string | null;
    } | null;
} | null | undefined;

function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function txt(v: unknown) {
    return String(v ?? "").trim();
}

function getSubjectKey(section: SectionLike) {
    const subjectId = txt(section?.subjects?.id);
    if (subjectId) return `id:${subjectId}`;
    return `${txt(section?.subjects?.subject_code)}|${txt(section?.subjects?.name)}`;
}

function formatSubjectLabel(section: SectionLike) {
    const code = txt(section?.subjects?.subject_code);
    const name = txt(section?.subjects?.name);
    if (code && name) return `${code} ${name}`;
    return code || name || "-";
}

function getRoomKey(section: SectionLike) {
    return `${txt(section?.class_level)}|${txt(section?.classroom)}`;
}

function getAcademicYearValue(section: SectionLike) {
    return txt(section?.semesters?.academic_years?.year_name) || txt(section?.year);
}

function getYearKey(section: SectionLike) {
    return getAcademicYearValue(section);
}

function formatYearLabel(section: SectionLike) {
    return getAcademicYearValue(section) || "-";
}

function formatRoomLabel(section: SectionLike) {
    const level = txt(section?.class_level);
    const room = txt(section?.classroom);
    if (level && room && room.includes(level)) return room;
    if (level && room) return `${level}/${room}`;
    return room || level || "-";
}

function getTermKey(section: SectionLike) {
    return `${getAcademicYearValue(section)}|${txt(section?.semester)}`;
}

function formatTermLabel(section: SectionLike) {
    return `ปี ${getAcademicYearValue(section) || "-"} ภาค ${txt(section?.semester) || "-"}`;
}

export function ScoreInputFeature({ session }: { session: any }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sectionId = Number(searchParams.get("section_id"));
    const hasSection = Number.isFinite(sectionId) && sectionId > 0;

    /* ─── state ─── */
    const [sections, setSections] = useState<any[]>([]);
    const [sectionInfo, setSectionInfo] = useState<any | null>(null);
    const [headers, setHeaders] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
    const [scoreMap, setScoreMap] = useState<Record<number, string>>({});
    const [originalScoreMap, setOriginalScoreMap] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [scoreLoading, setScoreLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [studentSearch, setStudentSearch] = useState("");
    const [selectedSubjectKey, setSelectedSubjectKey] = useState("");
    const [selectedRoomKey, setSelectedRoomKey] = useState("");
    const [selectedYearKey, setSelectedYearKey] = useState("");
    const [selectedTermKey, setSelectedTermKey] = useState("");

    // header inline add
    const [showAddHeader, setShowAddHeader] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newMax, setNewMax] = useState(100);
    const [addingHeader, setAddingHeader] = useState(false);

    // header inline edit
    const [editingHeaderId, setEditingHeaderId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editMax, setEditMax] = useState(100);
    const [updatingHeader, setUpdatingHeader] = useState(false);
    const scoreInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    const activeHeader = headers.find((h) => h.id === selectedHeaderId) || null;
    const activeMax = toNum(activeHeader?.max_score);

    /* ─── derived ─── */
    const filteredStudents = students.filter((s) => {
        if (!studentSearch.trim()) return true;
        const q = studentSearch.trim().toLowerCase();
        return [s.student_code, s.first_name, s.last_name].some((v) =>
            String(v ?? "").toLowerCase().includes(q)
        );
    });

    const filledCount = students.filter((s) => (scoreMap[s.id] ?? "") !== "").length;
    const invalidCount = students.filter((s) => {
        const raw = scoreMap[s.id];
        if (raw == null || raw === "") return false;
        const n = Number(raw);
        return !Number.isFinite(n) || n < 0 || (activeMax > 0 && n > activeMax);
    }).length;
    const changedCount = students.filter((s) => (scoreMap[s.id] ?? "") !== (originalScoreMap[s.id] ?? "")).length;

    const subjectOptions = useMemo(() => {
        const map = new Map<string, string>();
        sections.forEach((s) => {
            const key = getSubjectKey(s);
            if (!key) return;
            if (!map.has(key)) map.set(key, formatSubjectLabel(s));
        });
        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, "th"));
    }, [sections]);

    const roomOptions = useMemo(() => {
        if (!selectedSubjectKey) return [];
        const map = new Map<string, string>();
        sections
            .filter((s) => getSubjectKey(s) === selectedSubjectKey)
            .forEach((s) => {
                const key = getRoomKey(s);
                if (!key) return;
                if (!map.has(key)) map.set(key, formatRoomLabel(s));
            });
        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => {
                const [aG = "999", aR = "999"] = a.label.split("/");
                const [bG = "999", bR = "999"] = b.label.split("/");
                const gDiff = Number(aG) - Number(bG);
                if (gDiff !== 0) return gDiff;
                return Number(aR) - Number(bR);
            });
    }, [sections, selectedSubjectKey]);

    const yearOptions = useMemo(() => {
        if (!selectedSubjectKey || !selectedRoomKey) return [];
        const map = new Map<string, string>();
        sections
            .filter((s) => getSubjectKey(s) === selectedSubjectKey && getRoomKey(s) === selectedRoomKey)
            .forEach((s) => {
                const key = getYearKey(s);
                if (!key) return;
                if (!map.has(key)) map.set(key, formatYearLabel(s));
            });
        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => Number(b.value) - Number(a.value));
    }, [sections, selectedSubjectKey, selectedRoomKey]);

    const termOptions = useMemo(() => {
        if (!selectedSubjectKey || !selectedRoomKey || !selectedYearKey) return [];
        const map = new Map<string, string>();
        sections
            .filter((s) => getSubjectKey(s) === selectedSubjectKey && getRoomKey(s) === selectedRoomKey && getYearKey(s) === selectedYearKey)
            .forEach((s) => {
                const key = getTermKey(s);
                if (!key) return;
                if (!map.has(key)) map.set(key, formatTermLabel(s));
            });
        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => {
                const [aYear = "0", aSem = "0"] = a.value.split("|");
                const [bYear = "0", bSem = "0"] = b.value.split("|");
                const yearDiff = Number(bYear) - Number(aYear);
                if (yearDiff !== 0) return yearDiff;
                return Number(bSem) - Number(aSem);
            });
    }, [sections, selectedSubjectKey, selectedRoomKey, selectedYearKey]);

    const selectedSubjectLabel = subjectOptions.find((o) => o.value === selectedSubjectKey)?.label || "-";
    const selectedRoomLabel = roomOptions.find((o) => o.value === selectedRoomKey)?.label || "-";
    const selectedYearLabel = yearOptions.find((o) => o.value === selectedYearKey)?.label || "-";
    const selectedTermLabel = termOptions.find((o) => o.value === selectedTermKey)?.label || "-";
    const selectionReady = !!(selectedSubjectKey && selectedRoomKey && selectedYearKey && selectedTermKey);

    /* ─── loaders ─── */
    const loadSections = useCallback(async () => {
        try {
            const data = await TeacherApiService.getTeacherSubjects(session.id);
            setSections(Array.isArray(data) ? data : []);
        } catch { setSections([]); }
    }, [session.id]);

    const loadSectionData = useCallback(async () => {
        if (!hasSection) { setLoading(false); return; }
        setLoading(true);
        try {
            const [headerRows, studentRows] = await Promise.all([
                TeacherApiService.getScoreHeaders(sectionId),
                TeacherApiService.getSectionStudents(sectionId),
            ]);
            const nextHeaders = Array.isArray(headerRows) ? headerRows : [];
            setHeaders(nextHeaders);
            setStudents(Array.isArray(studentRows) ? studentRows : []);
            setSelectedHeaderId((prev) => {
                if (prev && nextHeaders.some((h: any) => h.id === prev)) return prev;
                return nextHeaders[0]?.id ?? null;
            });
        } catch {
            setHeaders([]);
            setStudents([]);
        } finally { setLoading(false); }
    }, [hasSection, sectionId]);

    const loadScores = useCallback(async (headerId: number) => {
        setScoreLoading(true);
        try {
            const rows = await TeacherApiService.getScores(headerId);
            const map: Record<number, string> = {};
            (rows || []).forEach((r: any) => {
                if (r?.student_id) map[r.student_id] = r.score == null ? "" : String(r.score);
            });
            setScoreMap(map);
            setOriginalScoreMap(map);
        } catch { setScoreMap({}); setOriginalScoreMap({}); }
        finally { setScoreLoading(false); }
    }, []);

    useEffect(() => { loadSections(); }, [loadSections]);

    useEffect(() => {
        if (hasSection) {
            const found = sections.find((s) => s.id === sectionId) || null;
            setSectionInfo(found);
            loadSectionData();
        } else {
            setLoading(false);
        }
    }, [hasSection, sectionId, sections, loadSectionData]);

    useEffect(() => {
        if (!selectedHeaderId) { setScoreMap({}); setOriginalScoreMap({}); return; }
        loadScores(selectedHeaderId);
    }, [selectedHeaderId, loadScores]);

    useEffect(() => {
        if (!hasSection) return;
        const found = sections.find((s) => s.id === sectionId);
        if (!found) return;
        setSelectedSubjectKey(getSubjectKey(found));
        setSelectedRoomKey(getRoomKey(found));
        setSelectedYearKey(getYearKey(found));
        setSelectedTermKey(getTermKey(found));
    }, [hasSection, sectionId, sections]);

    useEffect(() => {
        if (!selectedSubjectKey || !selectedRoomKey || !selectedYearKey || !selectedTermKey) return;
        const matched = sections.find(
            (s) =>
                getSubjectKey(s) === selectedSubjectKey &&
                getRoomKey(s) === selectedRoomKey &&
                getYearKey(s) === selectedYearKey &&
                getTermKey(s) === selectedTermKey
        );
        const nextId = Number(matched?.id);
        if (!Number.isFinite(nextId) || nextId <= 0 || nextId === sectionId) return;
        router.push(`/teacher/score_input?section_id=${nextId}`);
    }, [selectedSubjectKey, selectedRoomKey, selectedYearKey, selectedTermKey, sections, sectionId, router]);

    useEffect(() => {
        if (!selectedSubjectKey || selectedRoomKey || roomOptions.length !== 1) return;
        setSelectedRoomKey(roomOptions[0].value);
    }, [selectedSubjectKey, selectedRoomKey, roomOptions]);

    useEffect(() => {
        if (!selectedSubjectKey || !selectedRoomKey || selectedYearKey || yearOptions.length === 0) return;
        setSelectedYearKey(yearOptions[0].value);
    }, [selectedSubjectKey, selectedRoomKey, selectedYearKey, yearOptions]);

    useEffect(() => {
        if (!selectedSubjectKey || !selectedRoomKey || !selectedYearKey || selectedTermKey || termOptions.length === 0) return;
        setSelectedTermKey(termOptions[0].value);
    }, [selectedSubjectKey, selectedRoomKey, selectedYearKey, selectedTermKey, termOptions]);

    /* ─── handlers ─── */
    const handleSubjectSelect = (value: string) => {
        setSelectedSubjectKey(value);
        setSelectedRoomKey("");
        setSelectedYearKey("");
        setSelectedTermKey("");
    };

    const handleRoomSelect = (value: string) => {
        setSelectedRoomKey(value);
        setSelectedYearKey("");
        setSelectedTermKey("");
    };

    const handleYearSelect = (value: string) => {
        setSelectedYearKey(value);
        setSelectedTermKey("");
    };

    const handleAddHeader = async () => {
        const title = newTitle.trim();
        if (!title) return alert("กรุณากรอกชื่อหัวข้อคะแนน");
        if (toNum(newMax) <= 0) return alert("คะแนนเต็มต้องมากกว่า 0");
        setAddingHeader(true);
        try {
            const created = await TeacherApiService.addScoreHeader(sectionId, title, toNum(newMax));
            setNewTitle(""); setNewMax(100); setShowAddHeader(false);
            await loadSectionData();
            if (created?.id) setSelectedHeaderId(created.id);
        } catch { alert("เพิ่มหัวข้อคะแนนไม่สำเร็จ"); }
        finally { setAddingHeader(false); }
    };

    const handleStartEdit = (h: any) => {
        setEditingHeaderId(h.id);
        setEditTitle(String(h.title || ""));
        setEditMax(toNum(h.max_score) || 100);
    };

    const handleUpdateHeader = async () => {
        if (!editingHeaderId) return;
        const title = editTitle.trim();
        if (!title) return alert("กรุณากรอกชื่อหัวข้อ");
        if (toNum(editMax) <= 0) return alert("คะแนนเต็มต้องมากกว่า 0");
        setUpdatingHeader(true);
        try {
            await TeacherApiService.updateScoreHeader(editingHeaderId, title, toNum(editMax));
            setEditingHeaderId(null);
            await loadSectionData();
        } catch { alert("แก้ไขหัวข้อไม่สำเร็จ"); }
        finally { setUpdatingHeader(false); }
    };

    const handleDeleteHeader = async (id: number) => {
        const target = headers.find((h) => h.id === id);
        if (!confirm(`ลบหัวข้อ "${target?.title || "รายการนี้"}" ?`)) return;
        try {
            await TeacherApiService.deleteScoreHeader(id);
            if (selectedHeaderId === id) setSelectedHeaderId(null);
            await loadSectionData();
        } catch { alert("ลบหัวข้อไม่สำเร็จ"); }
    };

    const handleSaveScores = async () => {
        if (!activeHeader) return;
        if (invalidCount > 0) return alert("มีคะแนนไม่ถูกต้อง กรุณาตรวจสอบก่อนบันทึก");
        setSaving(true);
        try {
            await TeacherApiService.saveScores(
                activeHeader.id,
                students.map((s) => {
                    const raw = scoreMap[s.id];
                    const n = raw == null || raw === "" ? 0 : Number(raw);
                    return { student_id: s.id, score: activeMax > 0 ? Math.max(0, Math.min(activeMax, toNum(n))) : Math.max(0, toNum(n)) };
                })
            );
            setOriginalScoreMap({ ...scoreMap });
            alert("บันทึกคะแนนเรียบร้อย ✓");
        } catch { alert("บันทึกคะแนนไม่สำเร็จ"); }
        finally { setSaving(false); }
    };

    const handleFillZero = () => {
        setScoreMap((prev) => {
            const next = { ...prev };
            students.forEach((s) => { if ((next[s.id] ?? "") === "") next[s.id] = "0"; });
            return next;
        });
    };

    const handleScoreInputEnter = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
        if (event.key !== "Enter") return;
        event.preventDefault();

        const nextStudent = filteredStudents[rowIndex + 1];
        if (!nextStudent) return;

        const nextInput = scoreInputRefs.current[nextStudent.id];
        if (!nextInput) return;
        nextInput.focus();
        nextInput.select();
    };


    /* ─── render ─── */
    return (
        <div className="space-y-4 pb-24">
            {/* ── Top Bar: Section selector + info ── */}
            <section className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-5 text-white shadow-lg relative overflow-hidden">
                <div className="absolute inset-y-0 right-[-3rem] w-60 bg-white/10 skew-x-[-18deg]" />
                <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">📝 บันทึกคะแนน</h1>
                        {sectionInfo && (
                            <p className="mt-1 text-orange-50 text-sm">
                                {sectionInfo.subjects?.subject_code} — {sectionInfo.subjects?.name} • ห้อง {formatRoomLabel(sectionInfo)} • {formatTermLabel(sectionInfo)}
                            </p>
                        )}
                    </div>
                    <div className="w-full lg:w-auto lg:min-w-[760px]">
                        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(140px,.7fr)_auto] gap-2 items-end">
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-orange-100/90">วิชา</span>
                                    <select
                                        value={selectedSubjectKey}
                                        onChange={(e) => handleSubjectSelect(e.target.value)}
                                        className="w-full rounded-xl bg-white/20 border border-white/30 text-white px-4 py-2.5 text-sm outline-none [&>option]:text-slate-800"
                                    >
                                        <option value="">เลือกวิชา...</option>
                                        {subjectOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-orange-100/90">ห้อง</span>
                                    <select
                                        value={selectedRoomKey}
                                        onChange={(e) => handleRoomSelect(e.target.value)}
                                        disabled={!selectedSubjectKey}
                                        className="w-full rounded-xl bg-white/20 border border-white/30 text-white px-4 py-2.5 text-sm outline-none [&>option]:text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <option value="">{selectedSubjectKey ? "เลือกห้อง..." : "เลือกวิชาก่อน"}</option>
                                        {roomOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-orange-100/90">ปีการศึกษา</span>
                                    <select
                                        value={selectedYearKey}
                                        onChange={(e) => handleYearSelect(e.target.value)}
                                        disabled={!selectedSubjectKey || !selectedRoomKey}
                                        className="w-full rounded-xl bg-white/20 border border-white/30 text-white px-4 py-2.5 text-sm outline-none [&>option]:text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <option value="">{selectedRoomKey ? "เลือกปีการศึกษา..." : "เลือกห้องก่อน"}</option>
                                        {yearOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="flex items-end">
                                    <Link href={`/teacher/grade_cut${hasSection ? `?section_id=${sectionId}` : ""}`}
                                        className="w-full rounded-xl bg-white/20 border border-white/30 px-4 py-2.5 text-sm font-medium text-center hover:bg-white/30 transition-colors whitespace-nowrap">
                                        ไปหน้าตัดเกรด
                                    </Link>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className={`rounded-full px-2.5 py-1 font-medium border ${selectionReady ? "bg-emerald-500/20 border-emerald-200/40 text-emerald-50" : "bg-white/10 border-white/20 text-orange-50"}`}>
                                    {selectionReady ? "พร้อมใช้งาน" : "เลือกวิชา ห้อง และปีการศึกษา"}
                                </span>
                                <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-1 text-orange-50 max-w-full truncate">
                                    วิชา {selectedSubjectLabel}
                                </span>
                                <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-1 text-orange-50">
                                    ห้อง {selectedRoomLabel}
                                </span>
                                <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-1 text-orange-50">
                                    ปีการศึกษา {selectedYearLabel}
                                </span>
                                <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-1 text-orange-50">
                                    เทอม {selectedTermLabel}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {!hasSection ? (
                /* ── No section selected ── */
                <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <div className="text-5xl mb-4">📋</div>
                    <h2 className="text-xl font-bold text-slate-700">เลือกวิชา ห้อง และปีการศึกษา เพื่อเริ่มบันทึกคะแนน</h2>
                    <p className="mt-2 text-slate-500">ระบบจะเลือกเทอมล่าสุดให้อัตโนมัติภายใต้ปีการศึกษาที่เลือก</p>
                </section>
            ) : loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* ── Header Tabs ── */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">หัวข้อคะแนน</h2>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>{headers.length} หัวข้อ</span>
                                <span>•</span>
                                <span>เต็มรวม {headers.reduce((s, h) => s + toNum(h.max_score), 0)}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {headers.map((h) => {
                                const isActive = selectedHeaderId === h.id;
                                const isEditing = editingHeaderId === h.id;

                                if (isEditing) {
                                    return (
                                        <div key={h.id} className="flex items-center gap-1.5 rounded-xl border-2 border-amber-400 bg-amber-50 px-2 py-1.5 animate-in">
                                            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-28 rounded-lg border border-amber-200 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-amber-400" placeholder="ชื่อ" />
                                            <input type="number" value={editMax} onChange={(e) => setEditMax(Number(e.target.value))} className="w-16 rounded-lg border border-amber-200 px-2 py-1 text-sm text-center outline-none focus:ring-1 focus:ring-amber-400" />
                                            <button onClick={handleUpdateHeader} disabled={updatingHeader} className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">✓</button>
                                            <button onClick={() => setEditingHeaderId(null)} className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-300">✕</button>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={h.id} className={`group flex items-center rounded-xl border transition-all cursor-pointer ${isActive ? "border-amber-400 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                        <button onClick={() => setSelectedHeaderId(h.id)} className={`px-3 py-2 text-sm font-medium ${isActive ? "text-amber-800" : "text-slate-700"}`}>
                                            {h.title} <span className="text-xs opacity-60">({toNum(h.max_score)})</span>
                                        </button>
                                        <div className="hidden group-hover:flex items-center border-l border-slate-200 ml-0.5">
                                            <button onClick={() => handleStartEdit(h)} className="px-1.5 py-1 text-xs text-slate-400 hover:text-amber-600" title="แก้ไข">✏️</button>
                                            <button onClick={() => handleDeleteHeader(h.id)} className="px-1.5 py-1 text-xs text-slate-400 hover:text-red-600" title="ลบ">🗑️</button>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Add button / inline form */}
                            {showAddHeader ? (
                                <div className="flex items-center gap-1.5 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 px-2 py-1.5">
                                    <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-28 rounded-lg border border-emerald-200 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-400" placeholder="ชื่อหัวข้อ" autoFocus />
                                    <input type="number" value={newMax} onChange={(e) => setNewMax(Number(e.target.value))} className="w-16 rounded-lg border border-emerald-200 px-2 py-1 text-sm text-center outline-none focus:ring-1 focus:ring-emerald-400" placeholder="เต็ม" />
                                    <button onClick={handleAddHeader} disabled={addingHeader} className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">เพิ่ม</button>
                                    <button onClick={() => { setShowAddHeader(false); setNewTitle(""); }} className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-300">✕</button>
                                </div>
                            ) : (
                                <button onClick={() => setShowAddHeader(true)} className="rounded-xl border-2 border-dashed border-slate-300 px-4 py-2 text-sm text-slate-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                    + เพิ่มหัวข้อ
                                </button>
                            )}
                        </div>

                        {headers.length === 0 && !showAddHeader && (
                            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                                ยังไม่มีหัวข้อคะแนน — กดปุ่ม "+ เพิ่มหัวข้อ" เพื่อเริ่มต้น
                            </div>
                        )}
                    </section>

                    {/* ── Score Table ── */}
                    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        {/* Compact stat bar */}
                        <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-50/70">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <span className="text-sm text-slate-600">
                                    👤 <span className="font-semibold">{students.length}</span> คน
                                </span>
                                {activeHeader && (
                                    <>
                                        <span className="text-sm text-slate-500">
                                            กรอกแล้ว <span className="font-semibold text-emerald-700">{filledCount}</span>/{students.length}
                                        </span>
                                        {changedCount > 0 && (
                                            <span className="text-sm text-amber-700 font-medium">
                                                ⚡ แก้ไข {changedCount}
                                            </span>
                                        )}
                                        {invalidCount > 0 && (
                                            <span className="text-sm text-red-600 font-medium">
                                                ⚠️ ผิด {invalidCount}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    value={studentSearch}
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                    placeholder="🔍 ค้นหานักเรียน..."
                                    className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                {activeHeader && (
                                    <button onClick={handleFillZero} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap" title="เติม 0 ให้ช่องว่าง">
                                        เติม 0
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Table */}
                        {!activeHeader ? (
                            <div className="p-10 text-center text-slate-400">
                                <div className="text-4xl mb-2">📌</div>
                                <p className="text-sm">เลือกหัวข้อคะแนนด้านบนเพื่อเริ่มกรอก</p>
                            </div>
                        ) : scoreLoading ? (
                            <div className="p-10 text-center text-slate-400">
                                <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto" />
                                <p className="mt-3 text-sm">กำลังโหลดคะแนน...</p>
                            </div>
                        ) : students.length === 0 ? (
                            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบนักเรียนใน Section นี้</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-12">#</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">รหัส</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">ชื่อ-นามสกุล</th>
                                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 w-32">
                                                คะแนน <span className="text-slate-400 font-normal">/ {activeMax}</span>
                                            </th>
                                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 w-20">สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s, i) => {
                                            const raw = scoreMap[s.id] ?? "";
                                            const originalRaw = originalScoreMap[s.id] ?? "";
                                            const n = raw === "" ? null : Number(raw);
                                            const invalid = raw !== "" && (!Number.isFinite(n) || (n as number) < 0 || (activeMax > 0 && (n as number) > activeMax));
                                            const changed = raw !== originalRaw;

                                            return (
                                                <tr key={s.id} className={`border-b border-slate-50 ${invalid ? "bg-red-50/50" : changed ? "bg-amber-50/40" : "hover:bg-slate-50/50"}`}>
                                                    <td className="px-4 py-2 text-xs text-slate-400">{i + 1}</td>
                                                    <td className="px-4 py-2 text-sm font-mono text-slate-600">{s.student_code}</td>
                                                    <td className="px-4 py-2 text-sm text-slate-800">{s.first_name} {s.last_name}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <input
                                                            ref={(el) => {
                                                                scoreInputRefs.current[s.id] = el;
                                                            }}
                                                            type="number"
                                                            min={0}
                                                            max={activeMax || undefined}
                                                            value={raw}
                                                            onChange={(e) => setScoreMap((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                                            onKeyDown={(e) => handleScoreInputEnter(e, i)}
                                                            className={`w-24 rounded-lg border px-3 py-1.5 text-center text-sm outline-none focus:ring-2 ${invalid ? "border-red-300 bg-red-50 text-red-700 focus:ring-red-400"
                                                                    : changed ? "border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-400"
                                                                        : "border-slate-200 focus:ring-amber-400"
                                                                }`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        {invalid ? (
                                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="ไม่ถูกต้อง" />
                                                        ) : raw === "" ? (
                                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" title="ยังไม่กรอก" />
                                                        ) : changed ? (
                                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" title="แก้ไขแล้ว" />
                                                        ) : (
                                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="บันทึกแล้ว" />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}

            {/* ── Sticky Save Bar ── */}
            {hasSection && activeHeader && (
                <div className="fixed bottom-0 left-64 right-0 z-30 px-8 pb-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl px-5 py-3 flex items-center justify-between gap-4">
                        <div className="text-sm text-slate-600 min-w-0">
                            <span className="font-semibold text-amber-700">{activeHeader.title}</span>
                            <span className="text-slate-400 mx-2">•</span>
                            {changedCount > 0
                                ? <span className="text-amber-700">แก้ไข {changedCount} รายการ</span>
                                : <span className="text-emerald-600">ไม่มีการเปลี่ยนแปลง</span>
                            }
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => setScoreMap({ ...originalScoreMap })}
                                disabled={saving || changedCount === 0}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSaveScores}
                                disabled={saving || invalidCount > 0 || changedCount === 0}
                                className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40 shadow-sm"
                            >
                                {saving ? "กำลังบันทึก..." : "💾 บันทึกคะแนน"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

