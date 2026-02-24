"use client";
import { useEffect, useMemo, useState } from "react";
import { TeacherApiService } from "@/services/teacher-api.service";
import { getCurrentAcademicYearBE } from "@/features/student/academic-term";

function latestYearSemester(rows: any[]) {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.semester) - Number(a.semester)));
    const first = sorted[0];
    return { year: Number(first.year), semester: Number(first.semester) };
}

export function AdvisorEvaluationFeature({ session }: { session: any }) {
    const [activeTab, setActiveTab] = useState<"advisor_feedback" | "student_overall">("advisor_feedback");
    const [results, setResults] = useState<any[]>([]);
    const [allResults, setAllResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [studentOverallResults, setStudentOverallResults] = useState<any[]>([]);
    const [allStudentOverallResults, setAllStudentOverallResults] = useState<any[]>([]);
    const [studentOverallLoading, setStudentOverallLoading] = useState(false);
    const [year, setYear] = useState(getCurrentAcademicYearBE());
    const [semester, setSemester] = useState(1);
    const [notice, setNotice] = useState("");
    const [studentOverallNotice, setStudentOverallNotice] = useState("");

    const load = async () => {
        setLoading(true);
        setNotice("");
        try {
            const rows = (await TeacherApiService.getAdvisorEvaluation(session.id, year, semester).catch(() => [])) || [];

            if (rows.length === 0 && year < 2400) {
                const beYear = year + 543;
                const beRows = (await TeacherApiService.getAdvisorEvaluation(session.id, beYear, semester).catch(() => [])) || [];
                if (beRows.length > 0) {
                    setYear(beYear);
                    setResults(beRows);
                    setNotice(`แสดงข้อมูลปี ${beYear} ภาค ${semester} (ปรับจากปี ค.ศ. อัตโนมัติ)`);
                    setLoading(false);
                    return;
                }
            }

            if (rows.length === 0) {
                const allRows = (await TeacherApiService.getAdvisorEvaluation(session.id).catch(() => [])) || [];
                setAllResults(allRows);
                const latest = latestYearSemester(allRows);
                if (latest) {
                    const latestRows = allRows.filter((r) => Number(r.year) === latest.year && Number(r.semester) === latest.semester);
                    setYear(latest.year);
                    setSemester(latest.semester);
                    setResults(latestRows);
                    setNotice("ไม่พบข้อมูลตามปี/ภาคที่เลือก จึงแสดงข้อมูลปี/ภาคล่าสุดให้แทน");
                    setLoading(false);
                    return;
                }
            }

            setResults(rows);
        } finally {
            setLoading(false);
        }
    };

    const loadStudentOverall = async () => {
        setStudentOverallLoading(true);
        setStudentOverallNotice("");
        try {
            const rows = (await TeacherApiService.getAdvisorStudentResults(session.id, year, semester).catch(() => [])) || [];

            if (rows.length === 0 && year < 2400) {
                const beYear = year + 543;
                const beRows = (await TeacherApiService.getAdvisorStudentResults(session.id, beYear, semester).catch(() => [])) || [];
                if (beRows.length > 0) {
                    setYear(beYear);
                    setStudentOverallResults(beRows);
                    setStudentOverallNotice(`แสดงข้อมูลปี ${beYear} ภาค ${semester} (ปรับจากปี ค.ศ. อัตโนมัติ)`);
                    setStudentOverallLoading(false);
                    return;
                }
            }

            if (rows.length === 0) {
                const allRows = (await TeacherApiService.getAdvisorStudentResults(session.id).catch(() => [])) || [];
                setAllStudentOverallResults(allRows);
                const latest = latestYearSemester(allRows);
                if (latest) {
                    const latestRows = allRows.filter((r) => Number(r.year) === latest.year && Number(r.semester) === latest.semester);
                    setYear(latest.year);
                    setSemester(latest.semester);
                    setStudentOverallResults(latestRows);
                    setStudentOverallNotice("ไม่พบข้อมูลตามปี/ภาคที่เลือก จึงแสดงข้อมูลปี/ภาคล่าสุดให้แทน");
                    setStudentOverallLoading(false);
                    return;
                }
            }

            setStudentOverallResults(rows);
        } finally {
            setStudentOverallLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === "student_overall") {
            loadStudentOverall();
            return;
        }
        load();
    }, [session.id, year, semester, activeTab]);

    useEffect(() => {
        TeacherApiService.getAdvisorEvaluation(session.id).then((rows) => setAllResults(rows || [])).catch(() => {});
    }, [session.id]);

    useEffect(() => {
        TeacherApiService.getAdvisorStudentResults(session.id).then((rows) => setAllStudentOverallResults(rows || [])).catch(() => {});
    }, [session.id]);

    const topicSummary = useMemo(() => {
        const topicMap = new Map<string, { total: number; count: number }>();
        results.forEach((r) => {
            const topic = (r.topic || "ไม่ระบุหัวข้อ").toString();
            if (!topicMap.has(topic)) topicMap.set(topic, { total: 0, count: 0 });
            const entry = topicMap.get(topic)!;
            entry.total += Number(r.score || 0);
            entry.count += 1;
        });
        return Array.from(topicMap.entries());
    }, [results]);

    const displayLoading = activeTab === "student_overall" ? studentOverallLoading : loading;
    const displayNotice = activeTab === "student_overall" ? studentOverallNotice : notice;
    const allRowsForOptions = activeTab === "student_overall" ? allStudentOverallResults : allResults;

    const yearOptions = Array.from(new Set([...(allRowsForOptions || []).map((r) => String(r.year ?? "")).filter(Boolean), String(year)]))
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));
    const semesterOptions = Array.from(new Set([...(allRowsForOptions || []).map((r) => String(r.semester ?? "")).filter(Boolean), String(semester), "1", "2"]))
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));

    return (
        <div className="space-y-6">
            <section className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Evaluation Results</div>
                    <h1 className="text-3xl font-bold">ผลการประเมิน</h1>
                    <p className="text-violet-100 mt-2">
                        นักเรียนประเมินที่ปรึกษา ({results.length} รายการ) • ปี {year} / ภาค {semester}
                    </p>
                </div>
            </section>

            <div className="bg-white rounded-2xl p-2 shadow-sm border border-slate-200 inline-flex gap-2">
                <button
                    onClick={() => setActiveTab("advisor_feedback")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === "advisor_feedback" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                    นักเรียนประเมินที่ปรึกษา
                </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">ปีการศึกษา</label>
                    <select className="px-3 py-2 border border-slate-200 rounded-xl" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
                        {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">ภาค</label>
                    <select className="px-3 py-2 border border-slate-200 rounded-xl" value={String(semester)} onChange={(e) => setSemester(Number(e.target.value))}>
                        {semesterOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <button
                    onClick={load}
                    className="px-5 py-2 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
                >
                    โหลด
                </button>
            </div>

            {displayNotice && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm">{displayNotice}</div>}

            {displayLoading ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500">กำลังโหลด...</div>
            ) : activeTab === "advisor_feedback" && results.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500">ยังไม่มีข้อมูลประเมิน</div>
            ) : activeTab === "student_overall" && studentOverallResults.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500">ยังไม่มีผลประเมินนักเรียนจากครูที่ปรึกษา</div>
            ) : activeTab === "advisor_feedback" ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200"><h3 className="font-bold text-slate-800">สรุปคะแนนตามหัวข้อ</h3></div>
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">หัวข้อ</th>
                                <th className="px-6 py-3 text-center text-sm font-semibold text-slate-600">จำนวนผู้ประเมิน</th>
                                <th className="px-6 py-3 text-center text-sm font-semibold text-slate-600">คะแนนรวม</th>
                                <th className="px-6 py-3 text-center text-sm font-semibold text-slate-600">เฉลี่ย</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topicSummary.map(([topic, val], i) => (
                                <tr key={`${topic}-${i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">{topic}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-600">{val.count}</td>
                                    <td className="px-6 py-4 text-sm text-center text-slate-600">{val.total}</td>
                                    <td className="px-6 py-4 text-center"><span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">{(val.total / Math.max(val.count, 1)).toFixed(1)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="space-y-4">
                    {studentOverallResults.map((row, idx) => (
                        <div key={`${row.student_id}-${row.year}-${row.semester}-${row.response_id}-${idx}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <div className="text-sm text-slate-500">{row.student_code} • {row.room_label || row.room || "-"}</div>
                                    <h3 className="font-bold text-slate-800">{row.student_name || "-"}</h3>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                        เฉลี่ย {Number(row.average_score || 0).toFixed(2)}/5
                                    </span>
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200">
                                        {row.topic_count || 0} หัวข้อ
                                    </span>
                                    {row.submitted_at && (
                                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            บันทึกล่าสุด
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 space-y-4">
                                {(row.topics || []).length === 0 ? (
                                    <div className="text-sm text-slate-500">ยังไม่มีหัวข้อคะแนน</div>
                                ) : (
                                    (row.topics || []).map((topic: any, tIdx: number) => {
                                        const score = Number(topic.score || 0);
                                        const percent = Math.max(0, Math.min(100, (score / 5) * 100));
                                        let color = "bg-teal-600";
                                        if (score <= 2) color = "bg-red-500";
                                        else if (score === 3) color = "bg-amber-500";

                                        return (
                                            <div key={`${topic.name}-${tIdx}`}>
                                                <div className="flex justify-between text-sm mb-1 text-slate-700">
                                                    <span className="font-medium">{topic.name}</span>
                                                    <strong>{score}/5</strong>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                                    <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                {String(row.feedback || "").trim() && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="text-xs font-semibold text-slate-500 mb-1">ข้อเสนอแนะ</div>
                                        <div className="text-sm text-slate-800 whitespace-pre-wrap">{row.feedback}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
