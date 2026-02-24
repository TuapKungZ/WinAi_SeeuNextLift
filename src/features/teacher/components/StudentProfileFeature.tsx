"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TeacherApiService } from "@/services/teacher-api.service";
import { getCurrentAcademicYearBE } from "@/features/student/academic-term";

function fmtDate(value: any) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH");
}

function fmtDateTime(value: any) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}

function fmtNum(value: any, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toLocaleString("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtPct(value: any) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return `${fmtNum(n, 2)}%`;
}

function toIntOrNull(value: any) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hasMeaningfulValue(v: any) {
    return v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "-";
}

function formatClassRoomDisplay(classLevel: any, room: any) {
    const level = String(classLevel || "").trim();
    const roomValue = String(room || "").trim();
    if (!level && !roomValue) return "-";
    if (!roomValue) return level || "-";
    if (!level) return roomValue;
    if (roomValue === level || roomValue.startsWith(`${level}/`)) return roomValue;
    return `${level}/${roomValue}`;
}

function normalizeGradeLabel(rawGrade: any) {
    const raw = String(rawGrade ?? "").trim().toUpperCase();
    if (!raw) return null;
    const numericMap: Record<string, string> = {
        "4": "A",
        "3.5": "B+",
        "3": "B",
        "2.5": "C+",
        "2": "C",
        "1.5": "D+",
        "1": "D",
        "0": "F",
    };
    if (raw in numericMap) return numericMap[raw];
    return raw;
}

function normalizeTeacherStudentProfileResponse(raw: any) {
    if (!raw) return null;
    if (!raw.profile) return raw;

    const base = raw.profile || {};
    const gradeRows = Array.isArray(raw.grades) ? raw.grades : [];
    const attendance = raw.attendance || null;
    const conduct = raw.conduct || null;

    const gradePointMap: Record<string, number> = { A: 4, "B+": 3.5, B: 3, "C+": 2.5, C: 2, "D+": 1.5, D: 1, F: 0 };
    const gradedRows = gradeRows.filter((g: any) => normalizeGradeLabel(g?.grade));
    const avgGradePoint = gradedRows.length > 0
        ? gradedRows.reduce((sum: number, g: any) => sum + (gradePointMap[normalizeGradeLabel(g.grade) || "F"] ?? 0), 0) / gradedRows.length
        : null;

    const attendanceRate = attendance && Number(attendance.total) > 0
        ? (Number(attendance.present || 0) / Number(attendance.total || 0)) * 100
        : null;

    const conductHistory = Array.isArray(conduct?.history) ? conduct.history : [];
    const positivePoints = conductHistory.reduce((sum: number, row: any) => sum + Math.max(0, Number(row?.points || 0)), 0);
    const negativePointsAbs = conductHistory.reduce((sum: number, row: any) => sum + Math.abs(Math.min(0, Number(row?.points || 0))), 0);

    return {
        ...base,
        birthday: base.birthday || base.date_of_birth || null,
        extended_profile: {
            attendance: attendance ? {
                ...attendance,
                attendance_rate: attendanceRate,
            } : null,
            grades: {
                count: gradeRows.length,
                average_grade_point: avgGradePoint,
                recent_grades: gradeRows.slice(0, 12).map((g: any, idx: number) => ({
                    id: `${g.subject_code || "sub"}-${g.year || "-"}-${g.semester || "-"}-${idx}`,
                    subject_code: g.subject_code,
                    subject_name: g.subject_name,
                    year: g.year,
                    semester: g.semester,
                    total_score: g.total_score,
                    grade: normalizeGradeLabel(g.grade),
                })),
            },
            conduct: conduct ? {
                total_points: conduct.score,
                count: conductHistory.length,
                positive_points: positivePoints,
                negative_points: negativePointsAbs,
                recent: conductHistory.map((c: any, idx: number) => ({
                    id: idx + 1,
                    event: c.rule,
                    point: Number(c.points || 0),
                    point_type: Number(c.points || 0) >= 0 ? "positive" : "negative",
                    log_date: c.date,
                })),
            } : null,
            alerts: [],
            profile_completion: null,
            advisory: null,
            scores: null,
            registrations: null,
            health: null,
            fitness: null,
            evaluations: null,
            timeline: [],
        },
    };
}

export function StudentProfileFeature({ session }: { session: any }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const studentId = Number(searchParams.get("id") || searchParams.get("student_id"));

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoMessage, setPhotoMessage] = useState("");

    const [advisorEvalYear, setAdvisorEvalYear] = useState<number>(getCurrentAcademicYearBE());
    const [advisorEvalSemester, setAdvisorEvalSemester] = useState<number>(1);
    const [advisorEvalLoading, setAdvisorEvalLoading] = useState(false);
    const [advisorEvalSaving, setAdvisorEvalSaving] = useState(false);
    const [advisorEvalMessage, setAdvisorEvalMessage] = useState("");
    const [advisorEvalTopics, setAdvisorEvalTopics] = useState<{ id?: number; name: string }[]>([]);
    const [advisorEvalScores, setAdvisorEvalScores] = useState<Record<string, number>>({});
    const [advisorEvalFeedback, setAdvisorEvalFeedback] = useState("");
    const [advisorEvalSubmittedAt, setAdvisorEvalSubmittedAt] = useState<any>(null);
    const [learningYear, setLearningYear] = useState<number>(getCurrentAcademicYearBE());
    const [learningSemester, setLearningSemester] = useState<number>(1);

    useEffect(() => {
        const load = async () => {
            if (!studentId || Number.isNaN(studentId)) {
                setProfile(null);
                setError("");
                setLoading(false);
                return;
            }

            setLoading(true);
            setError("");
            try {
                const data = await TeacherApiService.getStudentProfile(studentId, session.id);
                setProfile(normalizeTeacherStudentProfileResponse(data) || null);
            } catch (e: any) {
                setProfile(null);
                setError(e?.message || "โหลดข้อมูลนักเรียนไม่สำเร็จ");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [studentId, session.id]);

    useEffect(() => {
        const loadAdvisorEvaluationTemplate = async () => {
            if (!studentId || Number.isNaN(studentId) || !session?.id) return;

            setAdvisorEvalLoading(true);
            setAdvisorEvalMessage("");
            try {
                const data = await TeacherApiService.getStudentAdvisorEvaluationTemplate(
                    studentId,
                    session.id,
                    advisorEvalYear,
                    advisorEvalSemester
                );

                const topics = Array.isArray(data?.topics) ? data.topics : [];
                const current = Array.isArray(data?.current) ? data.current : [];
                const currentMap: Record<string, number> = {};
                current.forEach((item: any) => {
                    const name = String(item?.name || "").trim();
                    const score = Number(item?.score);
                    if (name && Number.isFinite(score)) currentMap[name] = score;
                });

                const nextScores: Record<string, number> = {};
                topics.forEach((t: any) => {
                    const name = String(t?.name || "").trim();
                    if (!name) return;
                    nextScores[name] = currentMap[name] ?? 3;
                });

                setAdvisorEvalTopics(topics);
                setAdvisorEvalScores(nextScores);
                setAdvisorEvalFeedback(String(data?.feedback || ""));
                setAdvisorEvalSubmittedAt(data?.submitted_at || null);
            } catch (e: any) {
                setAdvisorEvalTopics([]);
                setAdvisorEvalScores({});
                setAdvisorEvalFeedback("");
                setAdvisorEvalSubmittedAt(null);
                setAdvisorEvalMessage(e?.message || "โหลดแบบประเมินไม่สำเร็จ");
            } finally {
                setAdvisorEvalLoading(false);
            }
        };

        loadAdvisorEvaluationTemplate();
    }, [studentId, session?.id, advisorEvalYear, advisorEvalSemester]);

    useEffect(() => {
        if (!studentId || Number.isNaN(studentId)) {
            router.replace("/teacher/students");
        }
    }, [studentId, router]);

    if (!studentId || Number.isNaN(studentId)) {
        return (
            <div className="space-y-6">
                <section className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                    <div className="relative z-10">
                        <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Student Profile</div>
                        <h1 className="text-3xl font-bold">ประวัติส่วนตัวนักเรียน</h1>
                        <p className="text-emerald-100 mt-2">เลือกนักเรียนจากหน้ารายชื่อนักเรียนในที่ปรึกษา</p>
                    </div>
                </section>
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center text-slate-500">
                    <div>กำลังพาไปหน้ารายชื่อนักเรียนในที่ปรึกษา...</div>
                    <Link href="/teacher/students" className="inline-block mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                        กลับไปหน้ารายชื่อนักเรียนในที่ปรึกษา
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center text-slate-500">
                กำลังโหลดข้อมูลนักเรียน...
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="space-y-4">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-red-200 text-center text-red-600">
                    {error || "ไม่พบข้อมูลนักเรียน"}
                </div>
                <div className="text-center">
                    <Link href="/teacher/students" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                        กลับไปหน้ารายชื่อนักเรียนในที่ปรึกษา
                    </Link>
                </div>
            </div>
        );
    }

    const advisorYearOptions = Array.from({ length: 5 }, (_, i) => getCurrentAcademicYearBE() - i);

    const handlePhotoUpload = async (file?: File | null) => {
        if (!file || !studentId || !session?.id) return;
        setPhotoUploading(true);
        setPhotoMessage("");
        try {
            const result = await TeacherApiService.uploadStudentPhoto(studentId, session.id, file);
            const cacheBusted = `${result.photo_url}${result.photo_url.includes("?") ? "&" : "?"}t=${Date.now()}`;
            setProfile((prev: any) => prev ? ({ ...prev, photo_url: cacheBusted }) : prev);
            setPhotoMessage("อัปโหลดรูปเรียบร้อย");
        } catch (e: any) {
            setPhotoMessage(e?.message || "อัปโหลดรูปไม่สำเร็จ");
        } finally {
            setPhotoUploading(false);
        }
    };

    const handleAdvisorEvaluationSave = async () => {
        if (!studentId || !session?.id) return;
        if (advisorEvalTopics.length === 0) {
            setAdvisorEvalMessage("ไม่พบหัวข้อประเมิน");
            return;
        }

        const data = advisorEvalTopics
            .map((t) => {
                const name = String(t?.name || "").trim();
                const score = Number(advisorEvalScores[name]);
                return { name, score };
            })
            .filter((item) => item.name && Number.isFinite(item.score))
            .map((item) => ({ ...item, score: Math.max(1, Math.min(5, Math.round(item.score))) }));

        if (data.length === 0) {
            setAdvisorEvalMessage("กรุณากรอกคะแนนประเมินอย่างน้อย 1 รายการ");
            return;
        }

        setAdvisorEvalSaving(true);
        setAdvisorEvalMessage("");
        try {
            await TeacherApiService.saveStudentAdvisorEvaluation({
                teacher_id: session.id,
                student_id: studentId,
                year: advisorEvalYear,
                semester: advisorEvalSemester,
                data,
                feedback: advisorEvalFeedback,
            });
            setAdvisorEvalMessage("บันทึกผลประเมินแล้ว (นักเรียนจะเห็นในหน้าผลประเมินการเรียน)");

            const refreshed = await TeacherApiService.getStudentAdvisorEvaluationTemplate(
                studentId,
                session.id,
                advisorEvalYear,
                advisorEvalSemester
            );
            setAdvisorEvalSubmittedAt(refreshed?.submitted_at || null);
        } catch (e: any) {
            setAdvisorEvalMessage(e?.message || "บันทึกผลประเมินไม่สำเร็จ");
        } finally {
            setAdvisorEvalSaving(false);
        }
    };

    const personalFields = [
        { label: "รหัสนักเรียน", value: profile.student_code },
        { label: "คำนำหน้า", value: profile.prefix },
        { label: "ชื่อ", value: profile.first_name },
        { label: "นามสกุล", value: profile.last_name },
        { label: "เพศ", value: profile.gender },
        { label: "วันเกิด", value: profile.birthday ? new Date(profile.birthday).toLocaleDateString("th-TH") : "-" },
        { label: "สถานะ", value: profile.status },
    ];

    const schoolFields = [
        { label: "ชั้น", value: profile.class_level },
        { label: "ห้อง", value: profile.room },
        { label: "เบอร์โทร", value: profile.phone },
        { label: "ที่อยู่", value: profile.address },
        { label: "ชื่อผู้ปกครอง", value: profile.parent_name },
        { label: "เบอร์ผู้ปกครอง", value: profile.parent_phone },
    ];

    const extra = profile?.extended_profile || null;
    const alerts: string[] = Array.isArray(extra?.alerts) ? extra.alerts : [];
    const completion = extra?.profile_completion || null;
    const advisory = extra?.advisory || null;
    const attendance = extra?.attendance || null;
    const grades = extra?.grades || null;
    const scoreOverview = extra?.scores || null;
    const registrations = extra?.registrations || null;
    const conduct = extra?.conduct || null;
    const health = extra?.health || null;
    const fitness = extra?.fitness || null;
    const evaluations = extra?.evaluations || null;
    const timeline = Array.isArray(extra?.timeline) ? extra.timeline : [];
    const hasLearningRegistrations = Array.isArray(registrations?.latest_term_registrations) && registrations.latest_term_registrations.length > 0;
    const hasLearningGrades = Array.isArray(grades?.recent_grades) && grades.recent_grades.length > 0;
    const allLearningScoreItems = Array.isArray(scoreOverview?.recent_items) ? scoreOverview.recent_items : [];

    const learningYearSet = new Set<number>();
    if (hasLearningRegistrations) {
        const y = toIntOrNull(registrations?.latest_term?.year);
        if (y) learningYearSet.add(y);
    }
    (grades?.recent_grades || []).forEach((g: any) => {
        const y = toIntOrNull(g?.year);
        if (y) learningYearSet.add(y);
    });
    allLearningScoreItems.forEach((item: any) => {
        const y = toIntOrNull(item?.year);
        if (y) learningYearSet.add(y);
    });
    if (learningYearSet.size === 0) learningYearSet.add(getCurrentAcademicYearBE());
    const learningYearOptions = Array.from(learningYearSet).sort((a, b) => b - a);
    const selectedLearningYear = learningYearOptions.includes(learningYear) ? learningYear : learningYearOptions[0];

    const learningSemesterSet = new Set<number>();
    if (hasLearningRegistrations) {
        const regYear = toIntOrNull(registrations?.latest_term?.year);
        const regSemester = toIntOrNull(registrations?.latest_term?.semester);
        if ((regYear == null || regYear === selectedLearningYear) && regSemester) learningSemesterSet.add(regSemester);
    }
    (grades?.recent_grades || []).forEach((g: any) => {
        const y = toIntOrNull(g?.year);
        const s = toIntOrNull(g?.semester);
        if ((y == null || y === selectedLearningYear) && s) learningSemesterSet.add(s);
    });
    allLearningScoreItems.forEach((item: any) => {
        const y = toIntOrNull(item?.year);
        const s = toIntOrNull(item?.semester);
        if ((y == null || y === selectedLearningYear) && s) learningSemesterSet.add(s);
    });
    if (learningSemesterSet.size === 0) {
        learningSemesterSet.add(1);
        learningSemesterSet.add(2);
    }
    const learningSemesterOptions = Array.from(learningSemesterSet).sort((a, b) => a - b);
    const selectedLearningSemester = learningSemesterOptions.includes(learningSemester) ? learningSemester : learningSemesterOptions[0];

    const matchesLearningTerm = (yearValue: any, semesterValue: any) => {
        const y = toIntOrNull(yearValue);
        const s = toIntOrNull(semesterValue);
        if (y != null && y !== selectedLearningYear) return false;
        if (s != null && s !== selectedLearningSemester) return false;
        return true;
    };

    const filteredLearningRegistrations = hasLearningRegistrations && matchesLearningTerm(registrations?.latest_term?.year, registrations?.latest_term?.semester)
        ? (registrations.latest_term_registrations || [])
        : [];
    const filteredLearningGrades = (grades?.recent_grades || []).filter((g: any) => matchesLearningTerm(g?.year, g?.semester));
    const filteredLearningScoreItems = allLearningScoreItems.filter((item: any) => matchesLearningTerm(item?.year, item?.semester));
    const hasFilteredLearningRegistrations = filteredLearningRegistrations.length > 0;
    const hasFilteredLearningGrades = filteredLearningGrades.length > 0;
    const hasFilteredLearningScores = filteredLearningScoreItems.length > 0;

    const healthFields = [
        { label: "น้ำหนัก (กก.)", value: health?.latest?.weight },
        { label: "ส่วนสูง (ซม.)", value: health?.latest?.height },
        { label: "BMI", value: health?.bmi },
        { label: "ความดัน", value: health?.latest?.blood_pressure },
        { label: "กรุ๊ปเลือด", value: health?.latest?.blood_type },
        { label: "อัปเดตล่าสุด", value: health?.latest?.updated_at ? fmtDateTime(health.latest.updated_at) : null },
    ].filter((f) => hasMeaningfulValue(f.value));

    const riskBadges = [
        alerts.length > 0 ? { label: `แจ้งเตือน ${alerts.length}`, tone: "red" } : null,
        attendance?.attendance_rate != null ? { label: `มาเรียน ${fmtPct(attendance.attendance_rate)}`, tone: "blue" } : null,
        grades?.average_grade_point != null ? { label: `เกรดเฉลี่ย ${fmtNum(grades.average_grade_point, 2)}`, tone: "indigo" } : null,
        health?.has_allergy_or_chronic ? { label: "มีข้อมูลสุขภาพต้องระวัง", tone: "amber" } : null,
    ].filter(Boolean) as { label: string; tone: string }[];

    return (
        <div className="space-y-6">
            <section className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Student Profile</div>
                        <h1 className="text-3xl font-bold">{`${profile.prefix || ""}${profile.first_name || ""} ${profile.last_name || ""}`.trim()}</h1>
                        <p className="text-emerald-100 mt-2">ข้อมูลส่วนตัวนักเรียน • {profile.student_code}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-sm">
                            <span className="rounded-full bg-white/15 px-3 py-1">ชั้น/ห้อง {formatClassRoomDisplay(profile.class_level, profile.room)}</span>
                            {advisory?.current && (
                                <span className="rounded-full bg-white/15 px-3 py-1">
                                    ที่ปรึกษา ปี {advisory.current.year || "-"} ภาค {advisory.current.semester || "-"}
                                </span>
                            )}
                            {riskBadges.map((b, idx) => (
                                <span key={idx} className="rounded-full bg-white/15 px-3 py-1">{b.label}</span>
                            ))}
                        </div>
                    </div>
                    <Link href="/teacher/students" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white text-emerald-700 font-medium hover:bg-emerald-50">
                        กลับหน้ารายชื่อนักเรียน
                    </Link>
                </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <div className="mb-5 rounded-2xl border border-slate-200 p-4 bg-slate-50">
                        <div className="flex items-start gap-4">
                            {profile.photo_url ? (
                                <img
                                    src={profile.photo_url}
                                    alt="student photo"
                                    className="h-24 w-24 rounded-2xl object-cover border border-slate-200 bg-white"
                                />
                            ) : (
                                <div className="h-24 w-24 rounded-2xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 text-xs text-center px-2">
                                    ไม่มีรูปนักเรียน
                                </div>
                            )}
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-slate-800">รูปนักเรียน</div>
                                <div className="text-xs text-slate-500 mt-1">อัปโหลดจากหน้านี้ได้ (jpg/png/webp สูงสุด 5MB)</div>
                                <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                                    {photoUploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        disabled={photoUploading}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            void handlePhotoUpload(file);
                                            e.currentTarget.value = "";
                                        }}
                                    />
                                </label>
                                {photoMessage && (
                                    <div className={`mt-2 text-xs ${photoMessage.includes("สำเร็จ") ? "text-emerald-700" : "text-rose-600"}`}>
                                        {photoMessage}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-sm font-bold text-slate-800 mb-4">สรุป</div>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                            <span className="text-slate-500">ชั้น/ห้อง</span>
                            <span className="font-semibold text-slate-800">{formatClassRoomDisplay(profile.class_level, profile.room)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                            <span className="text-slate-500">เพศ</span>
                            <span className="font-semibold text-slate-800">{profile.gender || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                            <span className="text-slate-500">สถานะ</span>
                            <span className="font-semibold text-slate-800">{profile.status || "-"}</span>
                        </div>
                        {completion && (
                            <div className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">ความครบถ้วนข้อมูล</span>
                                    <span className="font-semibold text-slate-800">{completion.percent}%</span>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-white overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${completion.percent || 0}%` }} />
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{completion.filled}/{completion.total} ช่องข้อมูล</div>
                            </div>
                        )}
                        {attendance && (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-blue-50 px-3 py-2 border border-blue-100">
                                    <div className="text-xs text-blue-600">มาเรียน</div>
                                    <div className="text-sm font-bold text-blue-800">{fmtPct(attendance.attendance_rate)}</div>
                                </div>
                                <div className="rounded-xl bg-indigo-50 px-3 py-2 border border-indigo-100">
                                    <div className="text-xs text-indigo-600">เกรดเฉลี่ย</div>
                                    <div className="text-sm font-bold text-indigo-800">{grades?.average_grade_point != null ? fmtNum(grades.average_grade_point, 2) : "-"}</div>
                                </div>
                            </div>
                        )}
                        {alerts.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                <div className="text-xs font-semibold text-amber-700 mb-2">ประเด็นที่ควรติดตาม</div>
                                <div className="flex flex-wrap gap-2">
                                    {alerts.map((a, i) => (
                                        <span key={i} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-700">{a}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">ข้อมูลส่วนตัว</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {personalFields.map((f, i) => (
                                <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="text-xs text-slate-500 font-medium mb-1">{f.label}</div>
                                    <div className="text-sm text-slate-800 font-medium break-words">{f.value || "-"}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">ข้อมูลการติดต่อ / ผู้ปกครอง</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {schoolFields.map((f, i) => (
                                <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="text-xs text-slate-500 font-medium mb-1">{f.label}</div>
                                    <div className="text-sm text-slate-800 font-medium break-words">{f.value || "-"}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">ครูประเมินนักเรียน (ผลประเมินโดยรวม)</h3>
                        <p className="text-sm text-slate-500">บันทึกจากหน้านี้แล้วจะไปแสดงในหน้าผลประเมินการเรียนของนักเรียนคนนั้น</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">ปีการศึกษา</label>
                            <select
                                className="px-3 py-2 border border-slate-200 rounded-xl bg-white"
                                value={advisorEvalYear}
                                onChange={(e) => setAdvisorEvalYear(Number(e.target.value))}
                            >
                                {advisorYearOptions.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">ภาค</label>
                            <select
                                className="px-3 py-2 border border-slate-200 rounded-xl bg-white"
                                value={advisorEvalSemester}
                                onChange={(e) => setAdvisorEvalSemester(Number(e.target.value))}
                            >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                            </select>
                        </div>
                    </div>
                </div>

                {advisorEvalMessage && (
                    <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${advisorEvalMessage.includes("สำเร็จ") || advisorEvalMessage.includes("บันทึก") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                        {advisorEvalMessage}
                    </div>
                )}

                {advisorEvalSubmittedAt && (
                    <div className="mt-4 text-xs text-slate-500">
                        บันทึกล่าสุด: {fmtDateTime(advisorEvalSubmittedAt)}
                    </div>
                )}

                {advisorEvalLoading ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
                        กำลังโหลดหัวข้อประเมิน...
                    </div>
                ) : advisorEvalTopics.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-slate-500">
                        ไม่พบหัวข้อประเมินที่ปรึกษาในระบบ
                    </div>
                ) : (
                    <div className="mt-4 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {advisorEvalTopics.map((topic, idx) => {
                                const topicName = String(topic?.name || "").trim();
                                const score = advisorEvalScores[topicName] ?? 3;
                                return (
                                    <div key={`${topic.id || idx}-${topicName}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-sm font-medium text-slate-800">{topicName}</div>
                                        <div className="mt-3 flex items-center gap-3">
                                            <input
                                                type="range"
                                                min={1}
                                                max={5}
                                                step={1}
                                                value={score}
                                                onChange={(e) =>
                                                    setAdvisorEvalScores((prev) => ({ ...prev, [topicName]: Number(e.target.value) }))
                                                }
                                                className="w-full accent-emerald-600"
                                            />
                                            <select
                                                value={score}
                                                onChange={(e) =>
                                                    setAdvisorEvalScores((prev) => ({ ...prev, [topicName]: Number(e.target.value) }))
                                                }
                                                className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-sm font-semibold text-slate-700"
                                            >
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <option key={n} value={n}>{n}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">ข้อเสนอแนะ (ถ้ามี)</label>
                            <textarea
                                value={advisorEvalFeedback}
                                onChange={(e) => setAdvisorEvalFeedback(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                placeholder="บันทึกข้อเสนอแนะเพิ่มเติมสำหรับนักเรียน"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleAdvisorEvaluationSave}
                                disabled={advisorEvalSaving}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {advisorEvalSaving ? "กำลังบันทึก..." : "บันทึกผลประเมิน"}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {extra && (
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                        <div className="text-sm text-slate-500">การมาเรียน</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{attendance?.attendance_rate != null ? fmtPct(attendance.attendance_rate) : "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                            ขาด {attendance?.absent ?? 0} • สาย {attendance?.late ?? 0} • ลา {attendance?.leave ?? 0}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                        <div className="text-sm text-slate-500">ผลการเรียน (เกรดเฉลี่ย)</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{grades?.average_grade_point != null ? fmtNum(grades.average_grade_point, 2) : "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                            ผลเกรดทั้งหมด {grades?.count ?? 0} รายวิชา
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                        <div className="text-sm text-slate-500">พฤติกรรมสะสม</div>
                        <div className={`mt-2 text-3xl font-bold ${Number(conduct?.total_points ?? 0) < 0 ? "text-red-600" : "text-slate-900"}`}>
                            {conduct ? fmtNum(conduct.total_points, 0) : "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                            บันทึก {conduct?.count ?? 0} รายการ
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                        <div className="text-sm text-slate-500">สมรรถภาพ / สุขภาพ</div>
                        <div className="mt-2 text-3xl font-bold text-slate-900">{fitness?.count ?? 0}</div>
                        <div className="mt-1 text-xs text-slate-500">
                            BMI {health?.bmi != null ? fmtNum(health.bmi, 2) : "-"} • วัคซีน {(health?.vaccinations || []).length}
                        </div>
                    </div>
                </section>
            )}

            {(registrations?.count > 0 || grades?.count > 0 || scoreOverview?.count > 0) && (
                <section className="space-y-6">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">ข้อมูลการเรียน / ผลการเรียน</h3>
                                <p className="text-sm text-slate-500">สรุปรายวิชาที่ลงเรียน คะแนนรายหัวข้อ และผลเกรดที่มีในระบบ</p>
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <div>
                                    <label className="block text-[11px] text-slate-500 mb-1">ปีการศึกษา</label>
                                    <select
                                        className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm"
                                        value={selectedLearningYear}
                                        onChange={(e) => setLearningYear(Number(e.target.value))}
                                    >
                                        {learningYearOptions.map((y) => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] text-slate-500 mb-1">ภาค</label>
                                    <select
                                        className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm"
                                        value={selectedLearningSemester}
                                        onChange={(e) => setLearningSemester(Number(e.target.value))}
                                    >
                                        {learningSemesterOptions.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                {registrations?.latest_term && (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                                        ลงทะเบียนล่าสุด ปี {registrations.latest_term.year} ภาค {registrations.latest_term.semester}
                                    </span>
                                )}
                                {grades?.latest_term && (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700">
                                        เกรดล่าสุด ปี {grades.latest_term.year} ภาค {grades.latest_term.semester}
                                    </span>
                                )}
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-6">
                            {hasFilteredLearningRegistrations && (
                                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <div className="font-semibold text-slate-800">รายวิชาที่ลงทะเบียน (เทอมล่าสุด)</div>
                                        <div className="text-xs text-slate-500">{filteredLearningRegistrations.length} รายการ</div>
                                    </div>
                                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                        {filteredLearningRegistrations.map((r: any) => (
                                            <div key={r.id} className="px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700">{r.subject_code || "-"}</span>
                                                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">Section #{r.section_id || "-"}</span>
                                                    {r.status && <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{r.status}</span>}
                                                </div>
                                                <div className="mt-2 text-sm font-semibold text-slate-800">{r.subject_name || "-"}</div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    ชั้น {r.class_level || "-"} / ห้อง {r.classroom || "-"} • ห้องเรียน {r.room || "-"}
                                                </div>
                                                {r.teacher_name && <div className="mt-1 text-xs text-slate-500">ผู้สอน: {r.teacher_name}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {hasFilteredLearningGrades && (
                                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <div className="font-semibold text-slate-800">ผลเกรดล่าสุด</div>
                                        <div className="text-xs text-slate-500">{filteredLearningGrades.length} รายการในเทอมที่เลือก</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[620px]">
                                            <thead>
                                                <tr className="bg-white border-b border-slate-200">
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">วิชา</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">ปี/ภาค</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">คะแนนรวม</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">เกรด</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredLearningGrades.slice(0, 12).map((g: any, idx: number) => (
                                                    <tr key={`${g.id}-${idx}`} className="border-b border-slate-100">
                                                        <td className="px-4 py-3 text-sm">
                                                            <div className="font-medium text-slate-800">{g.subject_name || "-"}</div>
                                                            <div className="text-xs text-slate-500">{g.subject_code || "-"}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm text-slate-700">
                                                            {g.year || "-"} / {g.semester || "-"}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm text-slate-700">{fmtNum(g.total_score, 2)}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                                                {g.grade || "-"}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!hasFilteredLearningRegistrations && !hasFilteredLearningGrades && !hasFilteredLearningScores && (
                            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-slate-500">
                                ไม่พบข้อมูลการเรียน/ผลการเรียนในปีการศึกษา {selectedLearningYear} ภาค {selectedLearningSemester}
                            </div>
                        )}

                        {hasFilteredLearningScores && (
                            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="font-semibold text-slate-800">คะแนนรายหัวข้อล่าสุด</div>
                                        <div className="text-xs text-slate-500">ใช้ดูภาพรวมคะแนนที่ถูกบันทึกในระบบล่าสุด</div>
                                    </div>
                                    <div className="text-xs text-slate-500">{filteredLearningScoreItems.length} รายการในเทอมที่เลือก</div>
                                </div>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {filteredLearningScoreItems.slice(0, 9).map((item: any, idx: number) => (
                                        <div key={`${item.id}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-mono text-slate-700 border border-slate-200">{item.subject_code || "-"}</span>
                                                <span className="text-xs text-slate-500">{item.year || "-"} / {item.semester || "-"}</span>
                                            </div>
                                            <div className="mt-2 text-sm font-semibold text-slate-800 line-clamp-1">{item.title || "-"}</div>
                                            <div className="mt-1 text-xs text-slate-500 line-clamp-1">{item.subject_name || "-"}</div>
                                            <div className="mt-2 text-sm text-slate-700">
                                                คะแนน <span className="font-bold text-emerald-700">{fmtNum(item.score, 2)}</span> / {fmtNum(item.max_score, 2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {attendance && (attendance.total > 0 || attendance.recent?.length > 0) && (
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">การเข้าเรียน</h3>
                            <p className="text-sm text-slate-500">สรุปการเช็คชื่อและรายการล่าสุดของนักเรียนคนนี้</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">มา {attendance.present ?? 0}</span>
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">ขาด {attendance.absent ?? 0}</span>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">สาย {attendance.late ?? 0}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">ลา {attendance.leave ?? 0}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
                        {attendance.monthly?.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <div className="font-semibold text-slate-800 mb-3">สรุปรายเดือน (ล่าสุด)</div>
                                <div className="space-y-3">
                                    {attendance.monthly.map((m: any, idx: number) => {
                                        const rate = m.total ? Math.round((Number(m.present || 0) / Number(m.total || 1)) * 100) : 0;
                                        return (
                                            <div key={`${m.month}-${idx}`} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="font-medium text-slate-800">{m.month}</span>
                                                    <span className="text-slate-500">{rate}%</span>
                                                </div>
                                                <div className="mt-2 h-2 rounded-full bg-white overflow-hidden">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
                                                </div>
                                                <div className="mt-2 text-xs text-slate-500">
                                                    มา {m.present || 0} • ขาด {m.absent || 0} • สาย {m.late || 0} • ลา {m.leave || 0}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {attendance.recent?.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                    <div className="font-semibold text-slate-800">ประวัติการเช็คชื่อล่าสุด</div>
                                    <div className="text-xs text-slate-500">{attendance.recent.length} รายการ</div>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                                    {attendance.recent.slice(0, 20).map((a: any, idx: number) => (
                                        <div key={`${a.id}-${idx}`} className="px-4 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-slate-800">{fmtDate(a.date)}</div>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
                                                    a.normalized_status === "present" ? "border-blue-200 bg-blue-50 text-blue-700" :
                                                    a.normalized_status === "absent" ? "border-red-200 bg-red-50 text-red-700" :
                                                    a.normalized_status === "late" ? "border-amber-200 bg-amber-50 text-amber-700" :
                                                    a.normalized_status === "leave" ? "border-slate-300 bg-slate-50 text-slate-700" :
                                                    "border-slate-200 bg-white text-slate-700"
                                                }`}>
                                                    {a.status || "-"}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-sm text-slate-700">{a.subject_name || "-"}</div>
                                            <div className="mt-0.5 text-xs text-slate-500">{a.subject_code || "-"} • Section #{a.section_id || "-"}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {(healthFields.length > 0 || (health?.vaccinations || []).length > 0 || fitness?.count > 0) && (
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">สุขภาพและสมรรถภาพ</h3>
                        <p className="text-sm text-slate-500">ดึงข้อมูลจากประวัติสุขภาพ, วัคซีน และผลทดสอบสมรรถภาพที่มีอยู่ในระบบ</p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {healthFields.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <div className="font-semibold text-slate-800 mb-3">ข้อมูลสุขภาพล่าสุด</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {healthFields.map((f, idx) => (
                                        <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div className="text-xs text-slate-500">{f.label}</div>
                                            <div className="mt-1 text-sm font-medium text-slate-800 break-words">
                                                {typeof f.value === "number" ? fmtNum(f.value, 2) : String(f.value)}
                                            </div>
                                        </div>
                                    ))}
                                    {hasMeaningfulValue(health?.latest?.allergies) && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
                                            <div className="text-xs text-amber-700 font-semibold">การแพ้ยา / แพ้อาหาร</div>
                                            <div className="mt-1 text-sm text-slate-800 break-words">{health.latest.allergies}</div>
                                        </div>
                                    )}
                                    {hasMeaningfulValue(health?.latest?.chronic_illness) && (
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 md:col-span-2">
                                            <div className="text-xs text-rose-700 font-semibold">โรคประจำตัว</div>
                                            <div className="mt-1 text-sm text-slate-800 break-words">{health.latest.chronic_illness}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {fitness?.latest_by_test?.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="font-semibold text-slate-800">ผลทดสอบสมรรถภาพล่าสุด</div>
                                        <div className="text-xs text-slate-500">
                                            {fitness.latest_term ? `ปี ${fitness.latest_term.year} ภาค ${fitness.latest_term.semester}` : "รายการล่าสุด"}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500">{fitness.latest_by_test.length} รายการ</div>
                                </div>
                                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                                    {fitness.latest_by_test.slice(0, 12).map((f: any, idx: number) => (
                                        <div key={`${f.id}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-slate-800">{f.test_name || "-"}</div>
                                                {f.status && (
                                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">{f.status}</span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                ผล {f.result_value || "-"} {f.standard_value ? `• เกณฑ์ ${f.standard_value}` : ""}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {(health?.vaccinations || []).length > 0 && (
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="font-semibold text-slate-800 mb-3">ประวัติวัคซีน</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {(health.vaccinations || []).slice(0, 12).map((v: any, idx: number) => (
                                    <div key={`${v.id || idx}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                        <div className="text-sm font-medium text-slate-800">{v.vaccine_name || v.name || "-"}</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            วันที่ {fmtDate(v.vaccine_date || v.date)} {v.status ? `• ${v.status}` : ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {evaluations && (
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">ผลการประเมินและสมรรถนะ</h3>
                        <p className="text-sm text-slate-500">สรุปคะแนนประเมินที่ปรึกษา, ประเมินรายวิชา และผลสมรรถนะที่มีในระบบ</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="text-sm text-slate-500">ประเมินที่ปรึกษา</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">
                                {evaluations.advisor?.latest_term_average_score != null ? fmtNum(evaluations.advisor.latest_term_average_score, 2) : "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                                เฉลี่ยเทอมล่าสุด • ทั้งหมด {evaluations.advisor?.count ?? 0} รายการ
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="text-sm text-slate-500">ประเมินรายวิชา</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">
                                {evaluations.subject?.latest_term_average_score != null ? fmtNum(evaluations.subject.latest_term_average_score, 2) : "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                                เฉลี่ยเทอมล่าสุด • ทั้งหมด {evaluations.subject?.count ?? 0} รายการ
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="text-sm text-slate-500">สมรรถนะ (Competency)</div>
                            <div className="mt-2 text-2xl font-bold text-slate-900">
                                {evaluations.competency?.latest_term_average_score != null ? fmtNum(evaluations.competency.latest_term_average_score, 2) : "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                                ผลล่าสุด {evaluations.competency?.result_count ?? 0} รายการ • Feedback {evaluations.competency?.feedback_count ?? 0}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        {evaluations.advisor?.recent?.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                    <div className="font-semibold text-slate-800">ประเมินที่ปรึกษา (ล่าสุด)</div>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                    {evaluations.advisor.recent.slice(0, 10).map((r: any, idx: number) => (
                                        <div key={`${r.id}-${idx}`} className="px-4 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-slate-800">{r.topic || "-"}</div>
                                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{r.score ?? "-"}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">ปี {r.year || "-"} ภาค {r.semester || "-"} • {fmtDateTime(r.created_at)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {evaluations.subject?.recent?.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                    <div className="font-semibold text-slate-800">ประเมินรายวิชา (ล่าสุด)</div>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                    {evaluations.subject.recent.slice(0, 10).map((r: any, idx: number) => (
                                        <div key={`${r.id}-${idx}`} className="px-4 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-slate-800">{r.topic || "-"}</div>
                                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{r.score ?? "-"}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">{r.subject_code || "-"} • {r.subject_name || "-"}</div>
                                            <div className="mt-1 text-xs text-slate-500">ปี {r.year || "-"} ภาค {r.semester || "-"} • {fmtDateTime(r.created_at)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(evaluations.competency?.latest_term_results?.length > 0 || evaluations.competency?.latest_term_feedback?.length > 0) && (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                    <div className="font-semibold text-slate-800">สมรรถนะ / ข้อเสนอแนะ</div>
                                </div>
                                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                                    {(evaluations.competency?.latest_term_results || []).slice(0, 8).map((r: any, idx: number) => (
                                        <div key={`${r.id}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium text-slate-800">{r.name || "-"}</div>
                                                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{r.score ?? "-"}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {(evaluations.competency?.latest_term_feedback || []).slice(0, 3).map((f: any, idx: number) => (
                                        <div key={`${f.id}-${idx}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                            <div className="text-xs font-semibold text-amber-700">ข้อเสนอแนะ</div>
                                            <div className="mt-1 text-sm text-slate-800 whitespace-pre-wrap break-words">{f.feedback || "-"}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {(conduct?.recent?.length > 0 || timeline.length > 0) && (
                <section className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
                    {conduct?.recent?.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">พฤติกรรม / วินัย</h3>
                                    <p className="text-sm text-slate-500">ประวัติคะแนนพฤติกรรมและเหตุการณ์ที่บันทึกไว้</p>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">สะสม</div>
                                    <div className={`mt-1 text-lg font-bold ${Number(conduct.total_points) < 0 ? "text-red-600" : "text-slate-900"}`}>{fmtNum(conduct.total_points, 0)}</div>
                                </div>
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                    <div className="text-xs text-emerald-700">บวก</div>
                                    <div className="mt-1 text-lg font-bold text-emerald-800">{fmtNum(conduct.positive_points, 0)}</div>
                                </div>
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                                    <div className="text-xs text-rose-700">ลบ</div>
                                    <div className="mt-1 text-lg font-bold text-rose-800">{fmtNum(conduct.negative_points, 0)}</div>
                                </div>
                            </div>
                            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                                {conduct.recent.slice(0, 15).map((c: any, idx: number) => (
                                    <div key={`${c.id}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm font-medium text-slate-800">{c.event || "-"}</div>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
                                                c.point_type === "positive" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                                                c.point_type === "negative" ? "border-rose-200 bg-rose-50 text-rose-700" :
                                                "border-slate-200 bg-white text-slate-700"
                                            }`}>
                                                {Number(c.point || 0) > 0 ? "+" : ""}{c.point ?? 0}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">{fmtDate(c.log_date)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {timeline.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800">ไทม์ไลน์ข้อมูลนักเรียน</h3>
                            <p className="text-sm text-slate-500">รวมเหตุการณ์สำคัญจากหลายโมดูลในระบบ (ล่าสุดก่อน)</p>
                            <div className="mt-4 space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                {timeline.slice(0, 24).map((t: any, idx: number) => (
                                    <div key={`${t.type}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="text-sm font-semibold text-slate-800">{t.title || "-"}</div>
                                            <span className="text-xs text-slate-500">{fmtDateTime(t.date)}</span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">{t.type}</span>
                                        </div>
                                        {t.detail && <div className="mt-2 text-sm text-slate-600 break-words">{t.detail}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
