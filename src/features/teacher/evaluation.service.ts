import { prisma } from '@/lib/prisma';
import { TeacherStudentsService } from '@/features/teacher/students.service';

async function resolveEvaluationPeriodId(year?: number, semester?: number) {
    if (!year || !semester) return null;
    const period = await prisma.evaluation_periods.findFirst({
        where: {
            semesters: {
                semester_number: semester,
                academic_years: { year_name: String(year) },
            },
        },
        select: { id: true },
        orderBy: { id: 'desc' },
    });
    return period?.id ?? null;
}

function toNum(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function formatRoomLabel(classLevel?: string | null, room?: string | null) {
    const level = String(classLevel || '').trim();
    const roomValue = String(room || '').trim();
    if (!level && !roomValue) return '-';
    if (!roomValue) return level || '-';
    if (!level) return roomValue;
    if (roomValue === level || roomValue.startsWith(`${level}/`)) return roomValue;
    return `${level}/${roomValue}`;
}

export const TeacherEvaluationService = {
    async getTeachingEvaluation(teacher_id: number, year?: number, semester?: number) {
        // Get teaching assignments for this teacher
        const where: any = { teacher_id };
        if (year || semester) {
            where.semesters = {
                ...(year ? { academic_years: { year_name: String(year) } } : {}),
                ...(semester ? { semester_number: semester } : {}),
            };
        }

        const assignments = await prisma.teaching_assignments.findMany({
            where,
            include: {
                subjects: true,
                classrooms: { include: { grade_levels: true } },
                semesters: { include: { academic_years: true } },
            }
        });

        // For each assignment, get evaluation responses
        const results: any[] = [];
        for (const ta of assignments) {
            // Find evaluation forms of type 'teaching'
            const responses = await prisma.evaluation_responses.findMany({
                where: {
                    evaluation_forms: { type: 'teaching' }
                },
                include: {
                    evaluation_answers: {
                        include: { evaluation_questions: true }
                    }
                },
                orderBy: { submitted_at: 'desc' }
            });

            results.push({
                teaching_assignment_id: ta.id,
                subject_code: ta.subjects?.subject_code || '',
                subject_name: ta.subjects?.subject_name || '',
                class_level: ta.classrooms?.grade_levels?.name || '',
                room: ta.classrooms?.room_name || '',
                year: ta.semesters?.academic_years?.year_name || '',
                semester: ta.semesters?.semester_number || 0,
                evaluations_count: responses.length,
            });
        }

        return results;
    },

    async getAdvisorEvaluation(teacher_id: number, year?: number, semester?: number) {
        const teacher = await prisma.teachers.findUnique({
            where: { id: teacher_id },
            select: { user_id: true },
        });
        if (!teacher) return [];

        const period_id = await resolveEvaluationPeriodId(year, semester);
        const teacherUserId = teacher.user_id ? Number(teacher.user_id) : 0;
        const targetIds = [teacher_id, teacherUserId].filter((n) => Number.isFinite(n) && n > 0);
        if (targetIds.length === 0) return [];

        const responseIdRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
            `
            SELECT er.id
            FROM public.evaluation_responses er
            INNER JOIN public.evaluation_forms ef ON ef.id = er.form_id
            WHERE LOWER(COALESCE(ef.type, '')) = 'advisor'
              AND UPPER(COALESCE(er.target_type, '')) = 'TEACHER'
              AND er.target_id IN (${targetIds.join(',')})
              ${period_id ? `AND er.period_id = ${Number(period_id)}` : ''}
            ORDER BY er.submitted_at DESC NULLS LAST, er.id DESC
            `
        );

        const responseIds = (responseIdRows || []).map((r) => Number(r.id)).filter((n) => n > 0);
        if (responseIds.length === 0) return [];

        const responses = await prisma.evaluation_responses.findMany({
            where: { id: { in: responseIds } },
            include: {
                evaluation_answers: {
                    include: { evaluation_questions: true },
                    orderBy: { id: 'asc' },
                },
                users: { select: { username: true } },
                evaluation_periods: {
                    include: {
                        semesters: { include: { academic_years: true } },
                    },
                },
            },
            orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
        });

        const rows: any[] = [];
        for (const r of responses) {
            const yearName = r.evaluation_periods?.semesters?.academic_years?.year_name || '';
            const semesterNo = r.evaluation_periods?.semesters?.semester_number || 0;
            for (const a of r.evaluation_answers || []) {
                if (a.score == null) continue;
                rows.push({
                    response_id: r.id,
                    topic: a.evaluation_questions?.question_text || a.answer_text || 'ไม่ระบุหัวข้อ',
                    score: Number(a.score),
                    submitted_at: r.submitted_at,
                    submitted_by: r.users?.username || '',
                    year: yearName ? Number(yearName) || yearName : '',
                    semester: semesterNo ? Number(semesterNo) : '',
                });
            }
        }

        return rows;
    },

    async getAdvisorStudentEvaluationResults(teacher_id: number, year?: number, semester?: number) {
        const [teacher, advisoryStudents, period_id] = await Promise.all([
            prisma.teachers.findUnique({
                where: { id: teacher_id },
                select: { user_id: true },
            }),
            TeacherStudentsService.getAdvisoryStudents(teacher_id),
            resolveEvaluationPeriodId(year, semester),
        ]);

        const teacherUserId = Number(teacher?.user_id || 0);
        if (!teacherUserId || !advisoryStudents.length) return [];

        const studentMap = new Map<number, any>();
        const studentIds = advisoryStudents
            .map((s: any) => {
                const id = Number(s.id);
                if (id > 0) studentMap.set(id, s);
                return id;
            })
            .filter((id: number) => id > 0);

        if (!studentIds.length) return [];

        const responseRows = await prisma.$queryRawUnsafe<Array<{
            id: number;
            target_id: number | null;
            submitted_at: Date | null;
            year: string | null;
            semester: number | null;
        }>>(
            `
            SELECT
                er.id,
                er.target_id,
                er.submitted_at,
                ay.year_name AS year,
                sem.semester_number AS semester
            FROM public.evaluation_responses er
            INNER JOIN public.evaluation_forms ef ON ef.id = er.form_id
            LEFT JOIN public.evaluation_periods ep ON ep.id = er.period_id
            LEFT JOIN public.semesters sem ON sem.id = ep.semester_id
            LEFT JOIN public.academic_years ay ON ay.id = sem.academic_year_id
            WHERE LOWER(COALESCE(ef.type, '')) = 'advisor'
              AND UPPER(COALESCE(er.target_type, '')) = 'STUDENT'
              AND er.evaluator_user_id = ${teacherUserId}
              AND er.target_id IN (${studentIds.join(',')})
              ${period_id ? `AND er.period_id = ${Number(period_id)}` : ''}
            ORDER BY er.submitted_at DESC NULLS LAST, er.id DESC
            `
        );

        const latestByKey = new Map<string, typeof responseRows[number]>();
        for (const row of responseRows || []) {
            const studentId = Number(row.target_id || 0);
            if (!studentId) continue;
            const rowYear = String(row.year || year || '').trim();
            const rowSemester = Number(row.semester || semester || 0) || 0;
            const key = period_id
                ? `${studentId}`
                : `${studentId}:${rowYear || '-'}:${rowSemester || 0}`;
            if (!latestByKey.has(key)) latestByKey.set(key, row);
        }

        const latestResponses = Array.from(latestByKey.values());
        const responseIds = latestResponses.map((r) => Number(r.id)).filter((n) => n > 0);
        if (!responseIds.length) return [];

        const answers = await prisma.evaluation_answers.findMany({
            where: { response_id: { in: responseIds } },
            include: { evaluation_questions: true },
            orderBy: [{ response_id: 'asc' }, { id: 'asc' }],
        });

        const answersByResponse = new Map<number, any[]>();
        for (const answer of answers) {
            const rid = Number(answer.response_id || 0);
            if (!rid) continue;
            if (!answersByResponse.has(rid)) answersByResponse.set(rid, []);
            answersByResponse.get(rid)!.push(answer);
        }

        return latestResponses
            .map((row) => {
                const studentId = Number(row.target_id || 0);
                const student = studentMap.get(studentId);
                if (!student) return null;

                const responseAnswers = answersByResponse.get(Number(row.id)) || [];
                const topics = responseAnswers
                    .filter((a) => a.score != null)
                    .map((a) => ({
                        name: a.evaluation_questions?.question_text || a.answer_text || 'ไม่ระบุหัวข้อ',
                        score: Number(a.score),
                    }))
                    .filter((a) => a.name && Number.isFinite(a.score));

                const feedback = responseAnswers.find((a) => a.score == null && String(a.answer_text || '').trim())?.answer_text || '';
                const totalScore = topics.reduce((sum, t) => sum + Number(t.score || 0), 0);
                const averageScore = topics.length ? Number((totalScore / topics.length).toFixed(2)) : 0;

                return {
                    response_id: Number(row.id),
                    student_id: studentId,
                    student_code: student.student_code || '',
                    student_name: `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim(),
                    class_level: student.class_level || '',
                    room: student.room || '',
                    room_label: formatRoomLabel(student.class_level || '', student.room || ''),
                    year: row.year ? (Number(row.year) || row.year) : (year ?? ''),
                    semester: Number(row.semester || semester || 0) || '',
                    submitted_at: row.submitted_at || null,
                    topics,
                    feedback: String(feedback || ''),
                    topic_count: topics.length,
                    average_score: averageScore,
                    total_score: totalScore,
                };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => {
                const byYear = toNum(b.year) - toNum(a.year);
                if (byYear !== 0) return byYear;
                const bySemester = toNum(b.semester) - toNum(a.semester);
                if (bySemester !== 0) return bySemester;
                return String(a.student_code || '').localeCompare(String(b.student_code || ''));
            });
    },
};
