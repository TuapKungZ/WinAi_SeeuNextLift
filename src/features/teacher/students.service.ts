import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';

const STUDENT_PHOTO_REL_DIR = '/uploads/student-photos';
const STUDENT_PHOTO_PUBLIC_DIR = path.join(process.cwd(), 'public', 'uploads', 'student-photos');
const DEFAULT_ADVISOR_EVAL_TOPICS = [
    'ความรับผิดชอบ',
    'วินัยและการตรงต่อเวลา',
    'ความตั้งใจเรียน',
    'การอยู่ร่วมกับผู้อื่น',
    'การปฏิบัติตามกฎระเบียบ',
];

function nextId(maxId?: number | null) {
    return (Number(maxId || 0) || 0) + 1;
}

async function resolveStudentPhotoUrl(student_id: number) {
    if (!student_id) return null;

    const candidates = ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `student-${student_id}.${ext}`);
    for (const filename of candidates) {
        try {
            await fs.access(path.join(STUDENT_PHOTO_PUBLIC_DIR, filename));
            return `${STUDENT_PHOTO_REL_DIR}/${filename}`;
        } catch {
            // continue
        }
    }
    return null;
}

async function getStudentUserId(student_id: number) {
    if (!student_id) return null;
    const student = await prisma.students.findUnique({
        where: { id: student_id },
        select: { user_id: true },
    });
    return student?.user_id ?? null;
}

async function getTeacherUserId(teacher_id: number) {
    if (!teacher_id) return null;
    const teacher = await prisma.teachers.findUnique({
        where: { id: teacher_id },
        select: { user_id: true },
    });
    return teacher?.user_id ?? null;
}

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

async function ensureAdvisorEvaluationForm() {
    const existing = await prisma.evaluation_forms.findFirst({
        where: { type: 'advisor' },
        include: { evaluation_questions: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
    });
    if (existing) return existing;

    return prisma.$transaction(async (tx) => {
        const existingAgain = await tx.evaluation_forms.findFirst({
            where: { type: 'advisor' },
            include: { evaluation_questions: { orderBy: { id: 'asc' } } },
            orderBy: { id: 'asc' },
        });
        if (existingAgain) return existingAgain;

        const [formMax, questionMax] = await Promise.all([
            tx.evaluation_forms.aggregate({ _max: { id: true } }),
            tx.evaluation_questions.aggregate({ _max: { id: true } }),
        ]);

        const formId = nextId(formMax._max.id);
        let questionId = nextId(questionMax._max.id);

        return tx.evaluation_forms.create({
            data: {
                id: formId,
                name: 'ผลประเมินโดยรวม (ครูที่ปรึกษา)',
                type: 'advisor',
                evaluation_questions: {
                    create: DEFAULT_ADVISOR_EVAL_TOPICS.map((question_text) => ({
                        id: questionId++,
                        question_text,
                        question_type: 'rating',
                    })),
                },
            },
            include: { evaluation_questions: { orderBy: { id: 'asc' } } },
        });
    });
}

async function findLatestAdvisorResponseForStudent(form_id: number, student_id: number, period_id?: number | null) {
    if (!form_id || !student_id) return null;
    const pid = period_id ? Number(period_id) : null;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; submitted_at: Date | null }>>(
        `
        SELECT er.id, er.submitted_at
        FROM public.evaluation_responses er
        WHERE er.form_id = ${Number(form_id)}
          AND UPPER(COALESCE(er.target_type, '')) = 'STUDENT'
          AND er.target_id = ${Number(student_id)}
          ${pid ? `AND er.period_id = ${pid}` : ''}
        ORDER BY er.submitted_at DESC NULLS LAST, er.id DESC
        LIMIT 1
        `
    );
    return rows?.[0] ?? null;
}

export const TeacherStudentsService = {
    async canTeacherAccessStudent(teacher_id: number, student_id: number) {
        if (!teacher_id || !student_id) return false;

        const student = await prisma.students.findUnique({
            where: { id: student_id },
            select: { classroom_id: true },
        });

        if (!student?.classroom_id) return false;

        const [advisorLink, taughtLink] = await Promise.all([
            prisma.classroom_advisors.findFirst({
                where: { teacher_id, classroom_id: student.classroom_id },
                select: { id: true },
            }),
            prisma.teaching_assignments.findFirst({
                where: { teacher_id, classroom_id: student.classroom_id },
                select: { id: true },
            }),
        ]);

        return Boolean(advisorLink || taughtLink);
    },

    // Get advisory students from classroom_advisors (homeroom/advisor assignments)
    async getAdvisoryStudents(teacher_id: number, year?: number, semester?: number) {
        // classroom_advisors currently has no year/semester columns.
        // Keep params for API compatibility and future schema changes.
        void year;
        void semester;

        const advisorLinks = await prisma.classroom_advisors.findMany({
            where: { teacher_id },
            select: { classroom_id: true },
            distinct: ['classroom_id'],
        });

        const classroomIds = advisorLinks
            .map(a => a.classroom_id)
            .filter((id): id is number => id !== null);

        if (classroomIds.length === 0) return [];

        const students = await prisma.students.findMany({
            where: { classroom_id: { in: classroomIds } },
            include: {
                name_prefixes: true,
                classrooms: { include: { grade_levels: true } },
                genders: true,
                student_statuses: true,
            },
            orderBy: { student_code: 'asc' }
        });

        return students.map(s => ({
            id: s.id,
            student_code: s.student_code,
            prefix: s.name_prefixes?.prefix_name || '',
            first_name: s.first_name,
            last_name: s.last_name,
            gender: s.genders?.name || '',
            class_level: s.classrooms?.grade_levels?.name || '',
            room: s.classrooms?.room_name || '',
            status: s.student_statuses?.status_name || 'active',
        }));
    },

    // Get student basic profile
    async getStudentProfile(student_id: number) {
        if (!student_id) return null;
        const s = await prisma.students.findUnique({
            where: { id: student_id },
            include: {
                name_prefixes: true,
                classrooms: { include: { grade_levels: true, programs: true } },
                genders: true,
                student_statuses: true,
            }
        });
        if (!s) return null;
        const photo_url = await resolveStudentPhotoUrl(s.id);
        return {
            id: s.id,
            student_code: s.student_code,
            prefix: s.name_prefixes?.prefix_name || '',
            first_name: s.first_name,
            last_name: s.last_name,
            gender: s.genders?.name || '',
            class_level: s.classrooms?.grade_levels?.name || '',
            room: s.classrooms?.room_name || '',
            program: s.classrooms?.programs?.name || '',
            status: s.student_statuses?.status_name || '',
            date_of_birth: s.date_of_birth,
            birthday: s.date_of_birth,
            phone: s.phone || '',
            address: s.address || '',
            photo_url,
        };
    },

    // Get full student profile for teacher view (grades, attendance, conduct, etc.)
    async getStudentProfileForTeacher(teacher_id: number, student_id: number) {
        if (!teacher_id || !student_id) return null;
        const canAccess = await this.canTeacherAccessStudent(teacher_id, student_id);
        if (!canAccess) return null;

        // 1. Basic profile
        const profile = await this.getStudentProfile(student_id);
        if (!profile) return null;

        // 2. Enrollment summary — get all subjects enrolled
        const enrollments = await prisma.enrollments.findMany({
            where: { student_id },
            include: {
                teaching_assignments: {
                    include: {
                        subjects: true,
                        teachers: { include: { name_prefixes: true } },
                        semesters: { include: { academic_years: true } },
                    }
                },
                final_grades: true,
                student_scores: {
                    include: { assessment_items: true }
                }
            }
        });

        // 3. Grades summary
        const grades = enrollments.map(e => {
            const ta = e.teaching_assignments;
            let totalScore = 0;
            let maxPossible = 0;
            e.student_scores.forEach(sc => {
                totalScore += Number(sc.score || 0);
                maxPossible += Number(sc.assessment_items?.max_score || 0);
            });

            return {
                subject_code: ta.subjects?.subject_code || '',
                subject_name: ta.subjects?.subject_name || '',
                credit: ta.subjects?.credit ? Number(ta.subjects.credit) : 0,
                total_score: totalScore,
                max_possible: maxPossible,
                percentage: maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) / 100 : 0,
                grade: e.final_grades?.letter_grade || null,
                year: ta.semesters?.academic_years?.year_name || '',
                semester: ta.semesters?.semester_number || 0,
            };
        });

        // 4. Attendance summary
        const enrollmentIds = enrollments.map(e => e.id);
        const attendanceSummary = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };

        if (enrollmentIds.length > 0) {
            const records = await prisma.attendance_records.findMany({
                where: { enrollment_id: { in: enrollmentIds } }
            });

            records.forEach(r => {
                attendanceSummary.total++;
                const status = r.status?.toLowerCase() || '';
                if (status === 'present' || status === 'มา') attendanceSummary.present++;
                else if (status === 'absent' || status === 'ขาด') attendanceSummary.absent++;
                else if (status === 'late' || status === 'สาย') attendanceSummary.late++;
                else if (status === 'leave' || status === 'ลา') attendanceSummary.leave++;
            });
        }

        // 5. Conduct / behavior summary
        const behaviorRecords = await prisma.behavior_records.findMany({
            where: { student_id },
            include: { behavior_rules: true },
            orderBy: { incident_date: 'desc' },
            take: 20
        });

        let conductScore = 100;
        behaviorRecords.forEach(r => {
            const points = r.behavior_rules?.points || 0;
            const type = r.behavior_rules?.type || '';
            if (type === 'REWARD' || type === 'reward' || points > 0) {
                conductScore += Math.abs(points);
            } else {
                conductScore -= Math.abs(points);
            }
        });

        const conductHistory = behaviorRecords.map(r => ({
            date: r.incident_date,
            rule: r.behavior_rules?.name || '',
            type: r.behavior_rules?.type || '',
            points: r.behavior_rules?.points || 0,
            remark: r.remark || '',
        }));

        return {
            profile,
            grades,
            attendance: attendanceSummary,
            conduct: {
                score: conductScore,
                history: conductHistory,
            },
        };
    },

    async getAdvisorEvaluationTemplateForStudent(teacher_id: number, student_id: number, year: number, semester: number) {
        const canAccess = await this.canTeacherAccessStudent(teacher_id, student_id);
        if (!canAccess) throw new Error('Student not found in advisory list');

        const user_id = await getStudentUserId(student_id);
        if (!user_id) throw new Error('Student user not found');

        const [form, period_id] = await Promise.all([
            prisma.evaluation_forms.findFirst({
                where: { type: 'advisor' },
                include: { evaluation_questions: { orderBy: { id: 'asc' } } },
                orderBy: { id: 'asc' },
            }),
            resolveEvaluationPeriodId(year, semester),
        ]);

        const topics = (form?.evaluation_questions?.length
            ? form.evaluation_questions.map((q) => ({
                id: q.id,
                name: q.question_text || '',
            }))
            : DEFAULT_ADVISOR_EVAL_TOPICS.map((name, idx) => ({ id: idx + 1, name })))
            .filter((q) => q.name);

        if (!form) {
            return {
                form_id: null,
                period_id: period_id ?? null,
                topics,
                current: [],
                feedback: '',
                submitted_at: null,
            };
        }

        const latestResponse = await findLatestAdvisorResponseForStudent(form.id, student_id, period_id ?? null);
        const latestAnswers = latestResponse
            ? await prisma.evaluation_answers.findMany({
                where: { response_id: latestResponse.id },
                include: { evaluation_questions: true },
                orderBy: { id: 'asc' },
            })
            : [];

        const current = latestAnswers
            .map((a) => ({
                name: a.evaluation_questions?.question_text || a.answer_text || '',
                score: a.score != null ? Number(a.score) : null,
            }))
            .filter((a) => a.name && a.score != null);

        const feedback = latestAnswers
            .find((a) => (a.score == null) && a.answer_text)?.answer_text || '';

        return {
            form_id: form.id,
            period_id: period_id ?? null,
            topics,
            current,
            feedback,
            submitted_at: latestResponse?.submitted_at || null,
        };
    },

    async submitAdvisorEvaluationForStudent(
        teacher_id: number,
        student_id: number,
        year: number,
        semester: number,
        data: { name: string; score: number }[],
        feedback?: string
    ) {
        const canAccess = await this.canTeacherAccessStudent(teacher_id, student_id);
        if (!canAccess) throw new Error('Student not found in advisory list');

        const [user_id, teacher_user_id] = await Promise.all([
            getStudentUserId(student_id),
            getTeacherUserId(teacher_id),
        ]);
        if (!user_id) throw new Error('Student user not found');
        if (!teacher_user_id) throw new Error('Teacher user not found');

        const [form, period_id] = await Promise.all([
            ensureAdvisorEvaluationForm(),
            resolveEvaluationPeriodId(year, semester),
        ]);

        const questionByText = new Map<string, number>();
        form.evaluation_questions.forEach((q) => {
            const key = String(q.question_text || '').trim().toLowerCase();
            if (key && !questionByText.has(key)) questionByText.set(key, q.id);
        });

        return prisma.$transaction(async (tx) => {
            const [responseMax, answerMax] = await Promise.all([
                tx.evaluation_responses.aggregate({ _max: { id: true } }),
                tx.evaluation_answers.aggregate({ _max: { id: true } }),
            ]);

            const responseId = nextId(responseMax._max.id);
            let answerId = nextId(answerMax._max.id);

            await tx.$executeRawUnsafe(
                `
                INSERT INTO public.evaluation_responses
                    (id, form_id, evaluator_user_id, submitted_at, period_id, target_type, target_id)
                VALUES
                    (${responseId}, ${Number(form.id)}, ${Number(teacher_user_id)}, NOW(), ${period_id ? Number(period_id) : 'NULL'}, 'STUDENT', ${Number(student_id)})
                `
            );
            const response = { id: responseId };

            for (const item of data || []) {
                const topicName = String(item?.name || '').trim();
                const score = Number(item?.score);
                if (!topicName) continue;

                const question_id = questionByText.get(topicName.toLowerCase()) ?? null;
                await tx.evaluation_answers.create({
                    data: {
                        id: answerId++,
                        response_id: response.id,
                        question_id,
                        answer_text: question_id ? null : topicName,
                        score: Number.isFinite(score) ? score : null,
                    },
                });
            }

            const feedbackText = String(feedback || '').trim();
            if (feedbackText) {
                await tx.evaluation_answers.create({
                    data: {
                        id: answerId++,
                        response_id: response.id,
                        question_id: null,
                        answer_text: feedbackText,
                        score: null,
                    },
                });
            }

            return { response_id: response.id };
        });
    },
};
