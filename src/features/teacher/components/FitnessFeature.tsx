"use client";
import { useState } from "react";
import { TeacherApiService } from "@/services/teacher-api.service";
import { getCurrentAcademicYearBE } from "@/features/student/academic-term";

export function FitnessFeature({ session }: { session: any }) {
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [classLevel, setClassLevel] = useState("ม.1");
    const [room, setRoom] = useState("1");
    const [testName, setTestName] = useState("วิ่ง 50 เมตร");
    const [year, setYear] = useState(getCurrentAcademicYearBE());
    const [semester, setSemester] = useState(1);
    const [results, setResults] = useState<Record<number, { result: string; standard: string; status: string }>>({});
    const [saving, setSaving] = useState(false);

    const loadStudents = async () => {
        setLoading(true);
        setHasSearched(true);
        try {
            const data = await TeacherApiService.getFitnessStudents(session.id, classLevel, room);
            setStudents(data || []);
        } catch (e: any) {
            alert(e?.message || "โหลดข้อมูลนักเรียนไม่สำเร็จ");
            setStudents([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAll = async () => {
        if (!Number.isFinite(year) || year <= 0) {
            alert("ปีการศึกษาไม่ถูกต้อง");
            return;
        }
        if (!Number.isFinite(semester) || ![1, 2].includes(semester)) {
            alert("ภาคเรียนไม่ถูกต้อง");
            return;
        }

        const payloads = students
            .map((s) => ({ student: s, value: results[s.id] }))
            .filter((x) => x.value && ((x.value.result || "").trim() || (x.value.standard || "").trim()))
            .map(({ student: s, value: r }) => ({
                student_id: s.id,
                teacher_id: session.id,
                test_name: testName,
                result_value: (r?.result || "").trim(),
                standard_value: (r?.standard || "").trim(),
                status: (r?.status || "ผ่าน").trim() || "ผ่าน",
                year,
                semester,
            }));

        if (payloads.length === 0) {
            alert("ยังไม่มีข้อมูลผลทดสอบที่พร้อมบันทึก");
            return;
        }

        setSaving(true);
        try {
            await Promise.all(payloads.map((p) => TeacherApiService.saveFitnessTest(p)));
            alert(`บันทึกเรียบร้อย ${payloads.length} รายการ`);
        } catch (e: any) {
            alert(e?.message || "บันทึกข้อมูลไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    const testOptions = ["วิ่ง 50 เมตร", "วิ่ง 1000 เมตร", "ลุก-นั่ง 60 วินาที", "ดันพื้น", "นั่งงอตัว", "ยืนกระโดดไกล"];

    return (
        <div className="space-y-6">
            <section className="bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Fitness Test</div>
                    <h1 className="text-3xl font-bold">บันทึกน้ำหนักส่วนสูง / สมรรถภาพ</h1>
                    <p className="text-orange-100 mt-2">บันทึกผลทดสอบสมรรถภาพทางกายนักเรียน</p>
                </div>
            </section>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">ชั้น</label>
                    <select className="px-4 py-2 border border-slate-200 rounded-xl outline-none" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                        {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((l) => <option key={l}>{l}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">ห้อง</label>
                    <select className="px-4 py-2 border border-slate-200 rounded-xl outline-none" value={room} onChange={(e) => setRoom(e.target.value)}>
                        {["1", "2", "3", "4", "5"].map((r) => <option key={r}>{r}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">ปีการศึกษา</label>
                    <input type="number" className="px-4 py-2 border border-slate-200 rounded-xl outline-none w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">ภาค</label>
                    <select className="px-4 py-2 border border-slate-200 rounded-xl outline-none" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">ชื่อรายการทดสอบ</label>
                    <select className="px-4 py-2 border border-slate-200 rounded-xl outline-none" value={testName} onChange={(e) => setTestName(e.target.value)}>
                        {testOptions.map((t) => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <button onClick={loadStudents} className="px-5 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors">ค้นหา</button>
            </div>

            {loading && <div className="text-center py-8 text-slate-500">กำลังโหลด...</div>}
            {!loading && hasSearched && students.length === 0 && (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">ไม่พบนักเรียนในชั้น/ห้องที่เลือก</div>
            )}

            {!loading && students.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">#</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">ชื่อ-นามสกุล</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">ผลทดสอบ</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">เกณฑ์มาตรฐาน</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((s, i) => (
                                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-3 text-sm text-slate-500">{i + 1}</td>
                                    <td className="px-4 py-3 text-sm text-slate-800 font-medium">{`${s.first_name || ""} ${s.last_name || ""}`.trim()}</td>
                                    <td className="px-4 py-3 text-center">
                                        <input
                                            className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-center"
                                            placeholder="ผล"
                                            value={results[s.id]?.result || ""}
                                            onChange={(e) => setResults({
                                                ...results,
                                                [s.id]: {
                                                    result: e.target.value,
                                                    standard: results[s.id]?.standard || "",
                                                    status: results[s.id]?.status || "ผ่าน",
                                                },
                                            })}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <input
                                            className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-center"
                                            placeholder="เกณฑ์"
                                            value={results[s.id]?.standard || ""}
                                            onChange={(e) => setResults({
                                                ...results,
                                                [s.id]: {
                                                    result: results[s.id]?.result || "",
                                                    standard: e.target.value,
                                                    status: results[s.id]?.status || "ผ่าน",
                                                },
                                            })}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <select
                                            className="px-3 py-1 border border-slate-200 rounded-lg"
                                            value={results[s.id]?.status || "ผ่าน"}
                                            onChange={(e) => setResults({
                                                ...results,
                                                [s.id]: {
                                                    result: results[s.id]?.result || "",
                                                    standard: results[s.id]?.standard || "",
                                                    status: e.target.value,
                                                },
                                            })}
                                        >
                                            <option>ผ่าน</option>
                                            <option>ไม่ผ่าน</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-4 border-t border-slate-200 flex justify-end">
                        <button onClick={handleSaveAll} disabled={saving} className="px-8 py-2.5 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50">
                            {saving ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
