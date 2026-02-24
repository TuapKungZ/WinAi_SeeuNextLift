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

export function TeachingEvaluationFeature({ session }: { session: any }) {
    const [results, setResults] = useState<any[]>([]);
    const [allResults, setAllResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(getCurrentAcademicYearBE());
    const [semester, setSemester] = useState(1);
    const [notice, setNotice] = useState("");

    const load = async () => {
        setLoading(true);
        setNotice("");
        try {
            let rows = (await TeacherApiService.getTeachingEvaluation(session.id, year, semester).catch(() => [])) || [];

            if (rows.length === 0 && year < 2400) {
                const beYear = year + 543;
                const beRows = (await TeacherApiService.getTeachingEvaluation(session.id, beYear, semester).catch(() => [])) || [];
                if (beRows.length > 0) {
                    setYear(beYear);
                    setResults(beRows);
                    setNotice(`แสดงข้อมูลปี ${beYear} ภาค ${semester} (ปรับจากปี ค.ศ. อัตโนมัติ)`);
                    setLoading(false);
                    return;
                }
            }

            if (rows.length === 0) {
                const allRows = (await TeacherApiService.getTeachingEvaluation(session.id).catch(() => [])) || [];
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

    useEffect(() => {
        load();
    }, [session.id, year, semester]);

    useEffect(() => {
        TeacherApiService.getTeachingEvaluation(session.id).then((rows) => setAllResults(rows || [])).catch(() => {});
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

    const yearOptions = Array.from(new Set([...(allResults || []).map((r) => String(r.year ?? "")).filter(Boolean), String(year)]))
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));
    const semesterOptions = Array.from(new Set([...(allResults || []).map((r) => String(r.semester ?? "")).filter(Boolean), String(semester), "1", "2"]))
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));

    return (
        <div className="space-y-6">
            <section className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Teaching Evaluation</div>
                    <h1 className="text-3xl font-bold">ผลประเมินการสอน</h1>
                    <p className="text-amber-100 mt-2">ผลจากนักเรียน ({results.length} รายการ) • ปี {year} / ภาค {semester}</p>
                </div>
            </section>

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
                <button onClick={load} className="px-5 py-2 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors">โหลด</button>
            </div>

            {notice && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm">{notice}</div>}

            {loading ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500">กำลังโหลด...</div>
            ) : results.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500">ยังไม่มีข้อมูลประเมิน</div>
            ) : (
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
                                    <td className="px-6 py-4 text-center"><span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">{(val.total / Math.max(val.count, 1)).toFixed(1)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
